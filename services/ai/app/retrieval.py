"""Retrieval weighting engine and acceptance-rate dashboard for LAYERS Stage 1.6.

This module provides:

* :class:`WeightedRetrieval` — given a target :class:`~app.models.FeatureVector`,
  retrieve the most relevant stacks from an event log, scored by a weighted
  combination of cosine similarity, acceptance rate, recency, and user rating.
* :class:`AcceptanceRateTracker` — tracks per-core-type acceptance rates
  (``applied / suggested``) per style cluster, and exposes dashboard data via
  :meth:`get_acceptance_rates`.

Weighting formula
-----------------
For each candidate stack drawn from the event log, the composite retrieval
score is::

    score = 0.40 * cosine_sim(target, stack.features)
          + 0.30 * acceptance_rate[core_type][cluster]
          + 0.20 * recency_weight(stack.age)
          + 0.10 * user_rating(stack.metadata.rating)

where ``recency_weight`` is a half-life decay function and ``user_rating``
is normalised from the raw rating stored in stack metadata.

Style clusters
--------------
Stacks are grouped into one of four style clusters derived from the dominant
palette hue and edge characteristics:

``geometric``  — high edge density and strong magnitude → sharp, architectural.
``organic``    — low edge density and low magnitude → soft, blurry, natural.
``texture``    — high-frequency energy dominance → fine detail, grain, noise.
``smooth``     — low-frequency energy dominance → smooth gradients, flat colour.
"""

from __future__ import annotations

import json
import math
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import numpy as np
from pydantic import BaseModel, Field

from app.models import FeatureVector
from app.events import EventStore, anonymize_user_id, _ANON_SALT  # noqa: F401
from app.consistency import _vectorize, _cosine_similarity
from app.hypothesis import _rgb_to_hsv

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Weighting factors (must sum to 1.0).
WEIGHT_COSINE = 0.40
WEIGHT_ACCEPTANCE = 0.30
WEIGHT_RECENCY = 0.20
WEIGHT_RATING = 0.10

# Recency half-life in seconds (7 days).
RECENCY_HALF_LIFE = 7 * 24 * 3600

# Thresholds for style-cluster classification.  These mirror the rule
# boundaries in :mod:`app.hypothesis` so that the cluster assignment is
# consistent with the core-generation logic.
_EDGE_DENSITY_HIGH = 0.15
_EDGE_MAGNITUDE_HIGH = 30.0
_EDGE_DENSITY_LOW = 0.05
_EDGE_MAGNITUDE_LOW = 15.0
_FREQ_HIGH = 0.4
_FREQ_LOW = 0.5

# Core types that the frontend/backend recognises.  Used as the first axis of
# the acceptance-rate dashboard.
CORE_TYPES = (
    "color_warm_core",
    "color_cool_core",
    "color_vibrant_core",
    "color_muted_core",
    "color_monochrome_core",
    "tone_high_contrast_core",
    "tone_low_contrast_core",
    "tone_balanced_core",
    "tone_bright_core",
    "tone_dark_core",
    "edge_geometric_core",
    "edge_soft_core",
    "edge_directional_core",
    "edge_diagonal_core",
    "texture_fine_core",
    "texture_smooth_core",
    "texture_mixed_complexity_core",
)

# Cluster names (order matters for deterministic output).
STYLE_CLUSTERS = ("geometric", "organic", "texture", "smooth")


# ---------------------------------------------------------------------------
# Style clustering
# ---------------------------------------------------------------------------

def assign_cluster(stack: list[dict[str, Any]]) -> str:
    """Classify an effect-stack into a style cluster.

    The classification is based on the *dominant characteristics* of the cores
    and their parameters found in the stack.  When a stack contains cores from
    multiple cluster families the first matching cluster (in priority order:
    geometric → texture → organic → smooth) is returned.

    Args:
        stack: A list of effect-stack layer dicts.  Each layer may have a
            ``params`` dict that can contain ``edge_density``, ``magnitude``,
            ``direction``, ``low_freq_ratio``, ``high_freq_ratio``, etc.

    Returns:
        One of the four cluster names: ``"geometric"``, ``"organic"``,
        ``"texture"``, or ``"smooth"``.

    Edge cases:
        - Empty stack → ``"smooth"`` (neutral fallback).
        - Stack with no recognisable parameters → ``"smooth"``.
    """
    if not stack:
        return "smooth"

    # Aggregate the dominant traits from the stack's parameters.
    max_edge_density = 0.0
    max_edge_magnitude = 0.0
    max_high_freq = 0.0
    max_low_freq = 0.0
    max_dir_strength = 0.0
    has_edge_params = False  # whether any layer had edge-related params

    for layer in stack:
        params = layer.get("params", {})
        if not isinstance(params, dict):
            continue

        if "edge_density" in params or "magnitude" in params:
            has_edge_params = True

        edge_density = float(params.get("edge_density", 0.0))
        edge_magnitude = float(params.get("magnitude", 0.0))
        high_freq = float(params.get("high_freq_ratio", 0.0))
        low_freq = float(params.get("low_freq_ratio", 0.0))
        # Also check generic 'direction' strength.
        direction = float(params.get("direction", 0.0))

        max_edge_density = max(max_edge_density, edge_density)
        max_edge_magnitude = max(max_edge_magnitude, edge_magnitude)
        max_high_freq = max(max_high_freq, high_freq)
        max_low_freq = max(max_low_freq, low_freq)
        max_dir_strength = max(max_dir_strength, direction)

    # --- Cluster classification (priority order) ---------------------------
    # 1. Geometric: strong, sharp edges.
    if max_edge_density >= _EDGE_DENSITY_HIGH and max_edge_magnitude >= _EDGE_MAGNITUDE_HIGH:
        return "geometric"

    # 2. Texture: high-frequency energy dominance.
    if max_high_freq >= _FREQ_HIGH:
        return "texture"

    # 3. Organic: very low edge density and magnitude → soft/blurry.
    # Only classify as organic if the stack actually carries edge params and
    # they are genuinely low (not merely absent).
    if has_edge_params and max_edge_density < _EDGE_DENSITY_LOW and max_edge_magnitude < _EDGE_MAGNITUDE_LOW:
        return "organic"

    # 4. Smooth: low-frequency energy dominance, fallback.
    if max_low_freq >= _FREQ_LOW:
        return "smooth"

    # Fallback: if we have directional but not geometric edges, classify as
    # geometric (directional edges are a form of geometric structure).
    if max_dir_strength > 0 and max_edge_density >= _EDGE_DENSITY_HIGH:
        return "geometric"

    # Everything else defaults to smooth.
    return "smooth"


def assign_cluster_from_features(features: FeatureVector) -> str:
    """Classify a :class:`FeatureVector` directly into a style cluster.

    This is used when classifying a *target* feature vector or a stack whose
    underlying features are known.

    Classification logic:
        - ``geometric`` — edge_density > 0.15 and edge magnitude > 30.0.
        - ``texture``   — high-frequency ratio > 0.4.
        - ``organic``   — edge_density < 0.05 and edge magnitude < 15.0.
        - ``smooth``    — low-frequency ratio > 0.5, or fallback.
    """
    edges = features.edges or {}
    freq = features.frequency or {}

    density = float(edges.get("edge_density", 0.0))
    magnitude = float(edges.get("magnitude", 0.0))
    high_freq = float(freq.get("high", 0.0))
    low_freq = float(freq.get("low", 0.0))

    # Geometric: strong, sharp edges.
    if density >= _EDGE_DENSITY_HIGH and magnitude >= _EDGE_MAGNITUDE_HIGH:
        return "geometric"

    # Texture: high-frequency dominance.
    if high_freq >= _FREQ_HIGH:
        return "texture"

    # Organic: very low edge content.
    if density < _EDGE_DENSITY_LOW and magnitude < _EDGE_MAGNITUDE_LOW:
        return "organic"

    # Smooth: low-frequency dominance.
    if low_freq >= _FREQ_LOW:
        return "smooth"

    # Fallback.
    return "smooth"


def get_style_clusters() -> list[str]:
    """Return the canonical list of style-cluster names.

    Returns a deterministic, ordered list of the four cluster names:
    ``["geometric", "organic", "texture", "smooth"]``.
    """
    return list(STYLE_CLUSTERS)


# ---------------------------------------------------------------------------
# Domain models
# ---------------------------------------------------------------------------

@dataclass
class StackRecord:
    """A stack entry extracted from the event log.

    Attributes:
        stack: The effect-stack layer dicts.
        core_type: The primary core type of the stack (first layer's ``core``).
        cluster: The style cluster this stack belongs to.
        features: Optional feature vector metadata stored with the stack.
        rating: User rating (0–10) if available, else 0.0.
        created_at: ISO-8601 timestamp of when the stack was recorded.
        age: Seconds elapsed since ``created_at``.
    """

    stack: list[dict[str, Any]]
    core_type: str
    cluster: str
    features: dict[str, Any] = field(default_factory=dict)
    rating: float = 0.0
    created_at: str = ""
    age: float = 0.0


# ---------------------------------------------------------------------------
# Acceptance-rate tracker
# ---------------------------------------------------------------------------

@dataclass
class _ClusterStats:
    """Mutable accumulator for acceptance counts per (core_type, cluster)."""

    suggested: int = 0
    applied: int = 0


class AcceptanceRateTracker:
    """Track per-core-type acceptance rate per style cluster.

    Acceptance rate is defined as ``applied / suggested`` — i.e. of all the
    stacks suggested for a given ``(core_type, cluster)`` pair, how many were
    actually applied by the user.

    The tracker reads from an :class:`~app.events.EventStore` event log,
    specifically ``stack_created`` (suggested) and ``stack_applied``
    (applied) events.  When the event has no cluster/core metadata the
    fallback classification from :func:`assign_cluster` is used.
    """

    def __init__(self, event_store: EventStore | None = None) -> None:
        self._store: EventStore = event_store or EventStore()
        # Nested dict: core_type -> cluster -> _ClusterStats
        self._stats: dict[str, dict[str, _ClusterStats]] = {}

    # ------------------------------------------------------------------ helpers

    @staticmethod
    def _parse_stack_layers(metadata: dict[str, Any] | None) -> list[dict[str, Any]]:
        """Extract the ``stack`` list from event metadata."""
        if not metadata:
            return []
        stack = metadata.get("stack")
        if isinstance(stack, list):
            return stack
        # Some events store it as a serialised JSON string.
        if isinstance(stack, str):
            try:
                parsed = json.loads(stack)
                if isinstance(parsed, list):
                    return parsed
            except (json.JSONDecodeError, TypeError):
                pass
        return []

    @staticmethod
    def _core_type_from_stack(stack: list[dict[str, Any]]) -> str:
        """Derive the primary core type from the first enabled layer."""
        for layer in stack:
            core = layer.get("core")
            if core and isinstance(core, str):
                return core
        return "unknown"

    # ------------------------------------------------------------------ public

    def record_suggested(
        self,
        core_type: str,
        cluster: str,
    ) -> None:
        """Record that a stack with ``core_type`` in ``cluster`` was suggested."""
        if core_type not in self._stats:
            self._stats[core_type] = {}
        if cluster not in self._stats[core_type]:
            self._stats[core_type][cluster] = _ClusterStats()
        self._stats[core_type][cluster].suggested += 1

    def record_applied(
        self,
        core_type: str,
        cluster: str,
    ) -> None:
        """Record that a stack with ``core_type`` in ``cluster`` was applied."""
        if core_type not in self._stats:
            self._stats[core_type] = {}
        if cluster not in self._stats[core_type]:
            self._stats[core_type][cluster] = _ClusterStats()
        self._stats[core_type][cluster].applied += 1
        # Ensure at least one suggestion is counted.
        if self._stats[core_type][cluster].suggested == 0:
            self._stats[core_type][cluster].suggested = 1

    def refresh_from_events(self) -> None:
        """Rebuild the acceptance statistics from the event log.

        Parses all ``stack_created`` and ``stack_applied`` events from the
        :class:`~app.events.EventStore`, classifies each stack into a style
        cluster, and updates the internal counters.
        """
        self._stats = {}

        for event in self._store.get_all_events():
            if event.event_type not in ("stack_created", "stack_applied"):
                continue

            stack = AcceptanceRateTracker._parse_stack_layers(event.metadata)
            if not stack:
                continue

            core_type = AcceptanceRateTracker._core_type_from_stack(stack)
            cluster = assign_cluster(stack)

            if event.event_type == "stack_created":
                self.record_suggested(core_type, cluster)
            elif event.event_type == "stack_applied":
                self.record_applied(core_type, cluster)

    def acceptance_rate(self, core_type: str, cluster: str) -> float:
        """Return the acceptance rate for ``(core_type, cluster)``.

        Rate = ``applied / suggested``.  If no suggestions have been recorded
        for this pair the rate is ``0.0``.
        """
        stats = self._stats.get(core_type, {}).get(cluster)
        if stats is None or stats.suggested == 0:
            return 0.0
        return stats.applied / stats.suggested

    def get_acceptance_rates(self) -> dict[str, dict[str, float]]:
        """Return acceptance rates for all core types and clusters.

        Returns:
            A dict keyed by ``core_type``.  Each value is a dict keyed by
            cluster name with the acceptance rate (float in ``[0, 1]``).
            Only core-type/cluster pairs that have at least one suggestion
            appear in the output.  If the tracker has not been refreshed from
            events, the result is empty.
        """
        result: dict[str, dict[str, float]] = {}
        for core_type, clusters in self._stats.items():
            cluster_rates: dict[str, float] = {}
            for cluster_name, stats in clusters.items():
                if stats.suggested > 0:
                    cluster_rates[cluster_name] = stats.applied / stats.suggested
            if cluster_rates:
                result[core_type] = cluster_rates
        return result

    def get_all_acceptance_rates(self) -> dict[str, dict[str, float]]:
        """Return acceptance rates for *all* core types × all clusters.

        This is the dashboard-friendly view: every known core type appears as
        a key, and each value contains all four cluster names (with rate 0.0
        for pairs that have no data).
        """
        result: dict[str, dict[str, float]] = {}
        for core_type in CORE_TYPES:
            rates: dict[str, float] = {}
            for cluster_name in STYLE_CLUSTERS:
                rates[cluster_name] = self.acceptance_rate(core_type, cluster_name)
            result[core_type] = rates
        return result


# ---------------------------------------------------------------------------
# Weighted retrieval
# ---------------------------------------------------------------------------

class WeightedRetrieval:
    """Retrieve the most relevant stacks for a target :class:`FeatureVector`.

    The retrieval score combines four factors:

    1. **Cosine similarity** (40 %) — semantic/feature similarity between the
       target feature vector and the candidate stack's feature metadata.
    2. **Acceptance rate** (30 %) — historical ``applied / suggested`` rate
       for the stack's core type and style cluster.
    3. **Recency** (20 %) — half-life decay so that recent stacks score higher.
    4. **User rating** (10 %) — rating stored in stack metadata (normalised
       to ``[0, 1]``).

    Usage::

        retr = WeightedRetrieval(event_store)
        results = retr.retrieve(target_features, k=10)
        for rec, score in results:
            ...
    """

    def __init__(self, event_store: EventStore | None = None) -> None:
        """Initialise the retrieval engine.

        Args:
            event_store: Optional :class:`~app.events.EventStore` instance.
                If ``None``, a default store is used.
        """
        self._store: EventStore = event_store or EventStore()
        self._tracker: AcceptanceRateTracker = AcceptanceRateTracker(self._store)
        # Refresh acceptance statistics from the event log.
        self._tracker.refresh_from_events()

    # ------------------------------------------------------------------ helpers

    @staticmethod
    def _recency_weight(age: float) -> float:
        """Half-life decay: ``0.5 ** (age / half_life)``.

        A stack from "now" gets weight 1.0; one from one half-life ago gets
        0.5; one from two half-lives ago gets 0.25, etc.
        """
        if age <= 0:
            return 1.0
        return max(0.0, 0.5 ** (age / RECENCY_HALF_LIFE))

    @staticmethod
    def _normalise_rating(rating: float | None) -> float:
        """Normalise a raw rating (0–10 scale) to ``[0, 1]``."""
        if rating is None:
            return 0.0
        raw = float(rating)
        return max(0.0, min(1.0, raw / 10.0))

    @staticmethod
    def _stack_features(stack: list[dict[str, Any]], metadata: dict[str, Any] | None) -> FeatureVector | None:
        """Reconstruct a :class:`FeatureVector` from stack metadata if present.

        The event log may store a serialized ``features`` dict in the event
        metadata.  If it is present and well-formed we rebuild a FeatureVector;
        otherwise we return ``None`` and fall back to parameter-based similarity.
        """
        if not metadata:
            return None
        raw = metadata.get("features")
        if not raw or not isinstance(raw, dict):
            return None
        try:
            palette = raw.get("palette", [])
            # Ensure palette entries are tuples of ints.
            if palette and isinstance(palette[0], (list, tuple)):
                palette = [
                    tuple(int(c) for c in colour) for colour in palette
                ]
            edges = raw.get("edges", {})
            frequency = raw.get("frequency", {})
            tone = raw.get("tone", {})
            clip = raw.get("clip_embedding")
            return FeatureVector(
                palette=palette,
                edges=edges,
                frequency=frequency,
                tone=tone,
                clip_embedding=clip,
            )
        except (TypeError, ValueError, KeyError):
            return None

    @staticmethod
    def _param_based_similarity(
        target: FeatureVector, stack: list[dict[str, Any]]
    ) -> float:
        """Compute a rough cosine similarity from stack parameters alone.

        When no stored feature vector is available, we extract the numeric
        parameters from the stack's layers (edge density, magnitude, frequency
        ratios, tone mean/std, RGB values) and compare them to the target
        feature vector using a lightweight vectorised comparison.

        Returns a value in ``[-1, 1]``.
        """
        # Build a synthetic feature vector from the stack params.
        palette_rgb: list[float] = []
        tone_vals: list[float] = []
        edge_vals: list[float] = []
        freq_vals: list[float] = []

        for layer in stack:
            params = layer.get("params", {})
            if not isinstance(params, dict):
                continue
            rgb = params.get("rgb")
            if isinstance(rgb, list) and len(rgb) == 3:
                palette_rgb.extend(float(v) for v in rgb)
            if "mean" in params:
                tone_vals.append(float(params["mean"]))
            if "std" in params:
                tone_vals.append(float(params["std"]))
            if "std_threshold" in params:
                tone_vals.append(float(params["std_threshold"]))
            if "edge_density" in params:
                edge_vals.append(float(params["edge_density"]))
            if "magnitude" in params:
                edge_vals.append(float(params["magnitude"]))
            if "direction" in params:
                edge_vals.append(float(params["direction"]))
            for freq_key in ("low", "mid", "high", "low_freq_ratio",
                             "mid_freq_ratio", "high_freq_ratio"):
                if freq_key in params:
                    freq_vals.append(float(params[freq_key]))

        def _pad(vals: list[float], size: int) -> list[float]:
            return vals[:size] + [0.0] * max(0, size - len(vals))

        synthetic_vec = (
            _pad(palette_rgb, 4)
            + _pad(tone_vals, 2)
            + _pad(edge_vals, 4)
            + _pad(freq_vals, 4)
        )
        synthetic = np.asarray(synthetic_vec, dtype=np.float64)

        # Build target vector of matching dimensionality (14).
        target_palette = list(target.palette[0]) if target.palette else [0.0, 0.0, 0.0]
        target_edges = target.edges or {}
        target_freq = target.frequency or {}
        target_tone = target.tone or {}

        target_vec = (
            _pad([float(c) for c in target_palette], 4)
            + [float(target_tone.get("mean", 0.0)), float(target_tone.get("std", 0.0))]
            + _pad([
                float(target_edges.get("edge_density", 0.0)),
                float(target_edges.get("magnitude", 0.0)),
                float(target_edges.get("direction", 0.0)),
            ], 4)
            + _pad([
                float(target_freq.get("low", 0.0)),
                float(target_freq.get("mid", 0.0)),
                float(target_freq.get("high", 0.0)),
            ], 4)
        )
        tgt = np.asarray(target_vec, dtype=np.float64)

        return _cosine_similarity(synthetic, tgt)

    # ------------------------------------------------------------------ public

    def _score_stack(
        self,
        target: FeatureVector,
        record: StackRecord,
    ) -> float:
        """Compute the composite retrieval score for a single stack record.

        See :class:`WeightedRetrieval` docstring for the weighting formula.
        """
        # 1. Cosine similarity (40 %).
        fv = self._stack_features(record.stack, record.features)
        if fv is not None:
            target_vec = _vectorize(target)
            stack_vec = _vectorize(fv)
            cosine_sim = _cosine_similarity(target_vec, stack_vec)
        else:
            cosine_sim = self._param_based_similarity(target, record.stack)

        # Normalise cosine to [0, 1] (cosine ranges [-1, 1]).
        cosine_norm = max(0.0, min(1.0, (cosine_sim + 1.0) / 2.0))

        # 2. Acceptance rate (30 %).
        acc_rate = self._tracker.acceptance_rate(record.core_type, record.cluster)

        # 3. Recency (20 %).
        recency = self._recency_weight(record.age)

        # 4. User rating (10 %).
        rating = self._normalise_rating(record.rating)

        score = (
            WEIGHT_COSINE * cosine_norm
            + WEIGHT_ACCEPTANCE * acc_rate
            + WEIGHT_RECENCY * recency
            + WEIGHT_RATING * rating
        )
        # The weight sum is exactly 1.0, so no additional normalisation needed.
        return score

    def _record_from_event(self, event) -> StackRecord | None:
        """Build a :class:`StackRecord` from a ``stack_created`` event."""
        metadata = event.metadata or {}
        stack = AcceptanceRateTracker._parse_stack_layers(metadata)
        if not stack:
            return None

        core_type = AcceptanceRateTracker._core_type_from_stack(stack)
        cluster = assign_cluster(stack)

        # Extract rating from metadata.
        rating = float(metadata.get("rating", 0.0))

        # Extract stored features dict (may be absent).
        features_dict = metadata.get("features", {})

        # Parse timestamp for recency.
        age = self._compute_age(event.timestamp)

        return StackRecord(
            stack=stack,
            core_type=core_type,
            cluster=cluster,
            features=features_dict if isinstance(features_dict, dict) else {},
            rating=rating,
            created_at=event.timestamp,
            age=age,
        )

    @staticmethod
    def _compute_age(timestamp: str) -> float:
        """Compute seconds elapsed since the given ISO-8601 timestamp."""
        try:
            ts = timestamp
            if ts.endswith("Z"):
                ts = ts[:-1] + "+00:00"
            dt = datetime.fromisoformat(ts)
            now = datetime.now(timezone.utc)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return max(0.0, (now - dt).total_seconds())
        except (ValueError, TypeError):
            return float("inf")  # Unknown timestamp → oldest possible.

    def _load_candidate_stacks(self) -> list[StackRecord]:
        """Load all ``stack_created`` events from the event log as records."""
        records: list[StackRecord] = []
        for event in self._store.get_all_events():
            if event.event_type != "stack_created":
                continue
            record = self._record_from_event(event)
            if record is not None:
                records.append(record)
        return records

    def retrieve(
        self,
        target: FeatureVector,
        k: int = 10,
    ) -> list[tuple[StackRecord, float]]:
        """Retrieve the top-``k`` most relevant stacks for ``target``.

        Args:
            target: The query :class:`FeatureVector`.
            k: Maximum number of results to return.

        Returns:
            A list of ``(StackRecord, score)`` tuples sorted by descending
            score.  If the event log is empty or contains no stack records,
            an empty list is returned.
        """
        records = self._load_candidate_stacks()
        if not records:
            return []

        scored = [
            (record, self._score_stack(target, record))
            for record in records
        ]
        scored.sort(key=lambda pair: pair[1], reverse=True)
        return scored[:k]

    @property
    def acceptance_tracker(self) -> AcceptanceRateTracker:
        """Return the :class:`AcceptanceRateTracker` used by this engine."""
        return self._tracker


__all__ = [
    "WEIGHT_COSINE",
    "WEIGHT_ACCEPTANCE",
    "WEIGHT_RECENCY",
    "WEIGHT_RATING",
    "RECENCY_HALF_LIFE",
    "CORE_TYPES",
    "STYLE_CLUSTERS",
    "assign_cluster",
    "assign_cluster_from_features",
    "get_style_clusters",
    "StackRecord",
    "AcceptanceRateTracker",
    "WeightedRetrieval",
]
