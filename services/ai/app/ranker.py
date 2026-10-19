"""Learned ranker: scores and ranks hypotheses using acceptance history.

This module provides :class:`AcceptanceRateRanker` which combines a
hypothesis's base confidence with historical acceptance rates from the
event log to produce a *combined score*.  The acceptance rate for a
``(core_type, cluster)`` pair is computed by
:class:`~app.retrieval.AcceptanceRateTracker` from ``stack_created`` and
``stack_applied`` events.

Combined score formula::

    combined = base_weight * base_confidence + acceptance_weight * acceptance_rate

where ``base_weight + acceptance_weight = 1.0`` (default 0.5 / 0.5).

When no history exists for a hypothesis's ``(core_type, cluster)`` pair the
acceptance rate defaults to ``0.0`` and the combined score falls back to
``base_confidence * base_weight`` (cold-start behaviour).

The ranker depends on :mod:`app.events`, :mod:`app.retrieval`, and
:mod:`app.hypothesis` — it is still pure Python (no rendering) and can be
unit-tested without an HTTP server.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.models import FeatureVector
from app.events import EventStore
from app.retrieval import AcceptanceRateTracker, assign_cluster_from_features
from app.hypothesis import CandidateCore


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_BASE_WEIGHT = 0.5
DEFAULT_ACCEPTANCE_WEIGHT = 0.5


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------


@dataclass
class RankScore:
    """The result of ranking a single hypothesis.

    Attributes:
        hypothesis: The original :class:`CandidateCore` that was ranked.
        base_confidence: The candidate's own confidence score (``[0, 1]``).
        acceptance_rate: Historical acceptance rate for the candidate's
            ``(core_type, cluster)`` pair (``[0, 1]``).
        combined_score: The final score used for ranking (``[0, 1]``).
        rank: 1-based rank (1 = best).
    """

    hypothesis: CandidateCore
    base_confidence: float
    acceptance_rate: float
    combined_score: float
    rank: int = 0


# ---------------------------------------------------------------------------
# Ranker
# ---------------------------------------------------------------------------


class AcceptanceRateRanker:
    """Rank hypotheses using historical acceptance data.

    The ranker reads from an :class:`~app.events.EventStore` via
    :class:`~app.retrieval.AcceptanceRateTracker` to obtain per-``(core_type,
    cluster)`` acceptance rates, then combines each hypothesis's base
    confidence with its acceptance rate to produce a ranking.

    Usage::

        ranker = AcceptanceRateRanker(event_store)
        results = ranker.rank(hypotheses)
        for rs in results:
            print(rs.rank, rs.hypothesis.core_type, rs.combined_score)
    """

    def __init__(
        self,
        event_store: EventStore | None = None,
        base_weight: float = DEFAULT_BASE_WEIGHT,
        acceptance_weight: float = DEFAULT_ACCEPTANCE_WEIGHT,
    ) -> None:
        """Initialise the ranker.

        Args:
            event_store: Optional event store.  If ``None``, a default
                :class:`~app.events.EventStore` is created.
            base_weight: Weight for the hypothesis's own confidence
                (default 0.5).
            acceptance_weight: Weight for the historical acceptance rate
                (default 0.5).
        """
        if abs(base_weight + acceptance_weight - 1.0) > 1e-6:
            raise ValueError(
                f"base_weight + acceptance_weight must sum to 1.0, "
                f"got {base_weight} + {acceptance_weight} = {base_weight + acceptance_weight}"
            )
        self._store: EventStore = event_store or EventStore()
        self._tracker: AcceptanceRateTracker = AcceptanceRateTracker(self._store)
        self._tracker.refresh_from_events()
        self._base_weight = base_weight
        self._acceptance_weight = acceptance_weight

    # ------------------------------------------------------------------ helpers

    def _cluster_for_hypothesis(
        self,
        hypothesis: CandidateCore,
        features: FeatureVector | None = None,
    ) -> str:
        """Determine the style cluster for a hypothesis.

        If *features* is provided, the cluster is derived from the feature
        vector via :func:`~app.retrieval.assign_cluster_from_features`.
        Otherwise, the cluster is derived from the hypothesis's parameters
        using :func:`~app.retrieval.assign_cluster`.
        """
        if features is not None:
            return assign_cluster_from_features(features)
        # Build a minimal stack layer from the hypothesis parameters to
        # classify via assign_cluster.
        layer = {
            "core": hypothesis.core_type,
            "params": dict(hypothesis.parameters),
            "opacity": 1.0,
            "blend": "normal",
            "mask": None,
            "enabled": True,
        }
        from app.retrieval import assign_cluster
        return assign_cluster([layer])

    def _acceptance_rate_for(
        self,
        hypothesis: CandidateCore,
        features: FeatureVector | None = None,
    ) -> float:
        """Look up the acceptance rate for the hypothesis's (core_type, cluster)."""
        cluster = self._cluster_for_hypothesis(hypothesis, features)
        return self._tracker.acceptance_rate(hypothesis.core_type, cluster)

    # ------------------------------------------------------------------ public

    def rank(
        self,
        hypotheses: list[CandidateCore],
        features: FeatureVector | None = None,
    ) -> list[RankScore]:
        """Rank *hypotheses* by combined confidence + acceptance rate.

        Args:
            hypotheses: The candidate cores to rank.
            features: Optional feature vector used for cluster classification.
                If ``None``, cluster is derived from the hypothesis parameters.

        Returns:
            A list of :class:`RankScore` sorted by ``combined_score``
            descending, with ``rank`` assigned from 1.
        """
        if not hypotheses:
            return []

        results: list[RankScore] = []
        for h in hypotheses:
            base_conf = h.confidence
            acc_rate = self._acceptance_rate_for(h, features)
            combined = (
                self._base_weight * base_conf
                + self._acceptance_weight * acc_rate
            )
            # Clamp to [0, 1]
            combined = max(0.0, min(1.0, combined))
            results.append(RankScore(
                hypothesis=h,
                base_confidence=base_conf,
                acceptance_rate=acc_rate,
                combined_score=combined,
            ))

        # Sort by combined_score descending, tie-break by core_type for determinism.
        results.sort(key=lambda r: (-r.combined_score, r.hypothesis.core_type))

        # Assign ranks
        for i, rs in enumerate(results, start=1):
            rs.rank = i

        return results

    @property
    def acceptance_tracker(self) -> AcceptanceRateTracker:
        """Return the underlying :class:`AcceptanceRateTracker`."""
        return self._tracker


# ---------------------------------------------------------------------------
# Convenience function
# ---------------------------------------------------------------------------


def rank_hypotheses(
    hypotheses: list[CandidateCore],
    event_store: EventStore | None = None,
    features: FeatureVector | None = None,
) -> list[RankScore]:
    """Convenience wrapper around :class:`AcceptanceRateRanker`.

    This is the primary public entry point for ranking hypotheses with
    acceptance history.
    """
    ranker = AcceptanceRateRanker(event_store)
    return ranker.rank(hypotheses, features=features)


__all__ = [
    "DEFAULT_BASE_WEIGHT",
    "DEFAULT_ACCEPTANCE_WEIGHT",
    "RankScore",
    "AcceptanceRateRanker",
    "rank_hypotheses",
]
