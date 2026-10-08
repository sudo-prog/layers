"""Beam search over ordered effect-stack cores.

This module implements a beam search that combines candidate cores from
:func:`app.hypothesis.generate_hypotheses` into ordered *effect stacks* —
sequences of visual cores that approximate a target image's style.

NO RENDERING: scoring is a pure proxy based on feature-vector similarity and
pass-budget compliance.  Actual rendering happens downstream in the
frontend / stack packages.  Do not call these scores "render fidelity" —
they are *proxy fidelity* estimates computed without drawing anything.

Pass-budget table (mirrors ``packages/stack/src/index.ts`` ``estimatePasses``):
    bevel-emboss: 2, gradient-overlay: 1, pattern-dither: 2, noise-grain: 2,
    gaussian-blur: 3, displacement: 2, color-adjust: 1, color-blend: 1,
    blur: 1, lighting: 1, outline: 2, default: 1

Mobile budget: <= 8 passes is acceptable; <= 6 passes gets a confidence bonus.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from typing import Any

from app.models import FeatureVector
from app.hypothesis import CandidateCore, generate_hypotheses
from app.consistency import _vectorize, _cosine_similarity

# ---------------------------------------------------------------------------
# Pass-cost table (mirrors packages/stack/src/index.ts)
# ---------------------------------------------------------------------------

PASS_COSTS: dict[str, int] = {
    "bevel-emboss": 2,
    "gradient-overlay": 1,
    "pattern-dither": 2,
    "noise-grain": 2,
    "gaussian-blur": 3,
    "displacement": 2,
    "color-adjust": 1,
    "color-blend": 1,
    "blur": 1,
    "lighting": 1,
    "outline": 2,
}
_DEFAULT_PASS_COST = 1
MAX_PASSES = 8
_MAX_PASSES = MAX_PASSES
OPTIMAL_PASSES = 6
_OPTIMAL_PASSES = OPTIMAL_PASSES
_PASS_COSTS = PASS_COSTS


def _core_pass_cost(core_type: str) -> int:
    """Return the GPU pass cost for a core type (default 1)."""
    return _PASS_COSTS.get(core_type, _DEFAULT_PASS_COST)


def _stack_passes(stack: list[dict[str, Any]]) -> int:
    """Total pass cost of an effect stack."""
    return sum(_core_pass_cost(layer["core"]) for layer in stack)


def _stack_params_count(stack: list[dict[str, Any]]) -> int:
    """Count total parameter key-values across all layers."""
    return sum(len(layer.get("params", {})) for layer in stack)


def _stack_confidence(stack: list[dict[str, Any]]) -> float:
    """Average confidence of cores in the stack (0-1)."""
    confs = [layer.get("confidence", 0.0) for layer in stack]
    return float(sum(confs) / len(confs)) if confs else 0.0


def _candidate_to_layer(core: CandidateCore) -> dict[str, Any]:
    """Convert a CandidateCore to an effect-stack-layer dict."""
    return {
        "core": core.core_type,
        "params": dict(core.parameters),
        "opacity": 1.0,
        "blend": "normal",
        "mask": None,
        "enabled": True,
    }


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def _proxy_fidelity(stack: list[dict[str, Any]], features: FeatureVector) -> float:
    """Proxy fidelity: cosine similarity between aggregated candidate features
    and the target feature vector (no rendering).

    We build a synthetic aggregate from the parameters embedded in each core
    (tone mean/std, edge density/magnitude, frequency ratios, palette rgb)
    and compare it against the target FeatureVector via cosine similarity.
    """
    # Build a synthetic feature-like dict from the stack's parameters.
    palette_rgb: list[float] = []
    tone_vals: list[float] = []
    edge_vals: list[float] = []
    freq_vals: list[float] = []

    for layer in stack:
        params = layer.get("params", {})
        if "rgb" in params:
            rgb = params["rgb"]
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

    # Normalise vectors to equal-ish dimensionality for cosine similarity.
    # We use a fixed-size vector of 8 dims.
    def _pad(vals: list[float], size: int = 4) -> list[float]:
        v = vals[:size] + [0.0] * max(0, size - len(vals))
        return v

    palette_v = _pad(palette_rgb, 4)
    tone_v = _pad(tone_vals, 2)
    edge_v = _pad(edge_vals, 4)
    freq_v = _pad(freq_vals, 4)
    synthetic_vec = palette_v + tone_v + edge_v + freq_v  # 14 dims

    # Build target vector from the FeatureVector, padded/truncated to 14 dims.
    target_palette = list(features.palette[0]) if features.palette else [0.0, 0.0, 0.0]
    target_tone = features.tone or {}
    target_edges = features.edges or {}
    target_freq = features.frequency or {}

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

    import numpy as np
    a = np.asarray(synthetic_vec, dtype=np.float64)
    b = np.asarray(target_vec, dtype=np.float64)
    return _cosine_similarity(a, b)


def score_stack(stack: list[dict[str, Any]], features: FeatureVector) -> float:
    """Score a stack: proxy fidelity × pass-budget penalty × avg confidence.

    - Stacks with > ``_MAX_PASSES`` get a steep penalty (effectively pruned).
    - Stacks with <= ``_OPTIMAL_PASSES`` get a small bonus.
    """
    passes = _stack_passes(stack)
    if passes > _MAX_PASSES:
        return -1.0  # pruned

    fidelity = _proxy_fidelity(stack, features)
    # Normalize to [0, 1]
    fidelity = max(0.0, min(1.0, (fidelity + 1.0) / 2.0))

    confidence = _stack_confidence(stack)

    # Pass-budget multiplier
    if passes <= _OPTIMAL_PASSES:
        budget_bonus = 1.2
    else:
        # Linear decay from 1.0 (at 7) to 0.7 (at 8)
        budget_bonus = 1.0 - (passes - _OPTIMAL_PASSES) * 0.15
        budget_bonus = max(0.7, budget_bonus)

    score = fidelity * 0.6 + confidence * 0.4
    return score * budget_bonus


# ---------------------------------------------------------------------------
# Public result types
# ---------------------------------------------------------------------------

@dataclass
class RankedStack:
    """A ranked effect-stack candidate."""
    stack: list[dict[str, Any]]
    fidelity: float
    passes: int
    params_count: int
    confidence: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "stack": self.stack,
            "fidelity": self.fidelity,
            "passes": self.passes,
            "params_count": self.params_count,
            "confidence": self.confidence,
        }


# ---------------------------------------------------------------------------
# Beam search
# ---------------------------------------------------------------------------

def beam_search_stacks(
    features: FeatureVector,
    beam_width: int = 8,
    max_layers: int = 5,
    seed: int | None = None,
) -> list[RankedStack]:
    """Beam search over ordered effect stacks.

    Args:
        features: Target :class:`FeatureVector` to approximate.
        beam_width: Number of candidates to keep at each beam step (default 8).
        max_layers: Maximum stack depth (default 5).
        seed: Optional seed for deterministic behaviour (candidates are
            sorted deterministically regardless, but seed stabilises any
            ties broken by random ordering).

    Returns:
        Ranked list of :class:`RankedStack` (best first), all within the
        8-pass mobile budget.
    """
    # Generate candidate cores from the hypothesis engine.
    candidates = generate_hypotheses(features)
    if not candidates:
        return []

    # Sort candidates by confidence descending for deterministic ordering.
    # If seed is provided, use it to shuffle ties.
    if seed is not None:
        import random
        rng = random.Random(seed)
        # Stable sort by confidence desc, then shuffle same-confidence groups.
        candidates_sorted = sorted(candidates, key=lambda c: (-c.confidence, c.core_type))
        # Group by confidence and shuffle within groups.
        from itertools import groupby
        result: list[CandidateCore] = []
        for conf_key, group in groupby(candidates_sorted, key=lambda c: c.confidence):
            group_list = list(group)
            rng.shuffle(group_list)
            result.extend(group_list)
        candidates = result
    else:
        candidates = sorted(candidates, key=lambda c: (-c.confidence, c.core_type))

    # Convert to layer dicts.
    layer_pool = [_candidate_to_layer(c) for c in candidates]

    # Beam: list of (stack, score). Start with empty stack.
    # We build stacks by appending one layer at a time.
    beam: list[tuple[list[dict[str, Any]], float]] = [([], 0.0)]

    for step in range(max_layers):
        new_beam: list[tuple[list[dict[str, Any]], float]] = []
        for stack, _prev_score in beam:
            for layer in layer_pool:
                new_stack = stack + [copy.deepcopy(layer)]
                score = score_stack(new_stack, features)
                if score >= 0.0:  # only keep non-pruned
                    new_beam.append((new_stack, score))
        if not new_beam:
            break
        # Keep top-K by score (descending), tie-break by fewer passes then fewer params.
        new_beam.sort(key=lambda s: (-s[1], _stack_passes(s[0]), _stack_params_count(s[0])))
        beam = new_beam[:beam_width]

    # Final scoring and ranking.
    ranked = []
    for stack, score in beam:
        passes = _stack_passes(stack)
        if passes > _MAX_PASSES:
            continue
        final_score = score_stack(stack, features)
        ranked.append(RankedStack(
            stack=stack,
            fidelity=final_score,
            passes=passes,
            params_count=_stack_params_count(stack),
            confidence=_stack_confidence(stack),
        ))

    ranked.sort(key=lambda r: (-r.fidelity, r.passes, r.params_count))
    return ranked


def search_stacks(
    features: FeatureVector,
    beam_width: int = 8,
    max_layers: int = 5,
    seed: int | None = None,
) -> list[RankedStack]:
    """Public alias for :func:`beam_search_stacks`."""
    return beam_search_stacks(features, beam_width=beam_width, max_layers=max_layers, seed=seed)


__all__ = [
    "PASS_COSTS",
    "MAX_PASSES",
    "OPTIMAL_PASSES",
    "RankedStack",
    "beam_search_stacks",
    "search_stacks",
    "score_stack",
]
