"""Pareto frontier analysis and stack pruning.

This module provides utilities for:
- Computing stack metrics (fidelity, passes, params_count).
- Identifying the Pareto-optimal subset of candidates (maximize fidelity,
  minimize passes, minimize params_count).
- Greedily pruning layers from an effect stack while keeping fidelity loss
  within a configurable threshold (ablation-based pruning).

All scoring uses *proxy fidelity* (see :mod:`app.search`) — no rendering.
"""

from __future__ import annotations

import copy
from typing import Any

from app.models import FeatureVector
from app.search import (
    MAX_PASSES,
    _stack_passes,
    _stack_params_count,
    _proxy_fidelity,
)

__all__ = [
    "stack_metrics",
    "pareto_frontier",
    "prune_layer",
    "prune_stack",
]


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

def stack_metrics(stack: list[dict[str, Any]], features: FeatureVector) -> dict[str, Any]:
    """Compute normalised metrics for a stack.

    Returns a dict with:
        fidelity: float in [0, 1]  — proxy fidelity normalised via (f+1)/2.
        passes: int                — total GPU pass cost.
        params_count: int          — total number of parameter key-values.
    """
    proxy = _proxy_fidelity(stack, features)
    fidelity = max(0.0, min(1.0, (proxy + 1.0) / 2.0))
    return {
        "fidelity": fidelity,
        "passes": _stack_passes(stack),
        "params_count": _stack_params_count(stack),
    }


# ---------------------------------------------------------------------------
# Pareto frontier
# ---------------------------------------------------------------------------

def _candidate_dict(c: Any) -> dict[str, Any]:
    """Normalise a candidate (dict or RankedStack) into a plain dict."""
    if isinstance(c, dict):
        return c
    # Support RankedStack (has to_dict)
    if hasattr(c, "to_dict"):
        d = c.to_dict()
        if "fidelity" not in d:
            d["fidelity"] = float(getattr(c, "fidelity", 0.0))
        if "passes" not in d:
            d["passes"] = int(getattr(c, "passes", 0))
        if "params_count" not in d:
            d["params_count"] = int(getattr(c, "params_count", 0))
        return d
    raise TypeError(f"Cannot convert candidate of type {type(c)} to dict")


def pareto_frontier(candidates: list[Any]) -> list[dict[str, Any]]:
    """Return the non-dominated subset of *candidates*.

    Each candidate is either a dict with keys ``stack``, ``fidelity``,
    ``passes``, ``params_count`` or a :class:`~app.search.RankedStack`.

    Dominance: candidate A *dominates* B when A is at least as good in every
    objective (fidelity >=, passes <=, params_count <=) and strictly better in
    at least one.  The returned list contains all candidates that are **not**
    dominated by any other candidate.
    """
    if not candidates:
        return []

    normalised = [_candidate_dict(c) for c in candidates]

    def _dominates(a: dict[str, Any], b: dict[str, Any]) -> bool:
        fid_a = float(a.get("fidelity", 0.0))
        fid_b = float(b.get("fidelity", 0.0))
        pass_a = int(a.get("passes", 0))
        pass_b = int(b.get("passes", 0))
        par_a = int(a.get("params_count", 0))
        par_b = int(b.get("params_count", 0))
        at_least_as_good = (
            fid_a >= fid_b and pass_a <= pass_b and par_a <= par_b
        )
        strictly_better = (
            fid_a > fid_b or pass_a < pass_b or par_a < par_b
        )
        return at_least_as_good and strictly_better

    frontier: list[dict[str, Any]] = []
    for i, c in enumerate(normalised):
        dominated = False
        for j, other in enumerate(normalised):
            if i == j:
                continue
            if _dominates(other, c):
                dominated = True
                break
        if not dominated:
            frontier.append(dict(c))
    return frontier


# ---------------------------------------------------------------------------
# Pruning
# ---------------------------------------------------------------------------

def prune_layer(
    stack: list[dict[str, Any]], index: int
) -> dict[str, Any]:
    """Remove the layer at *index* from *stack* (does not mutate the input).

    Returns a dict with::
        stack: the new stack with the layer removed.
        removed_index: the index that was removed.
        layers_before: original layer count.
        layers_after: new layer count.
    """
    if not stack:
        return {"stack": [], "removed_index": -1, "layers_before": 0, "layers_after": 0}
    idx = max(0, min(index, len(stack) - 1))
    new_stack = copy.deepcopy(stack[:idx] + stack[idx + 1:])
    return {
        "stack": new_stack,
        "removed_index": idx,
        "layers_before": len(stack),
        "layers_after": len(new_stack),
    }


def prune_stack(
    stack: list[dict[str, Any]],
    features: FeatureVector,
    max_loss_pct: float = 0.02,
) -> dict[str, Any]:
    """Greedily prune layers from *stack* while keeping fidelity loss bounded.

    Algorithm (greedy ablation, repeated):
        For each layer (tried in order of original index), compute the fidelity
        loss that would result from removing it.  If the loss is <=
        ``max_loss_pct`` (an absolute fraction in [0, 1] on normalised
        fidelity), remove that layer and repeat the sweep.  Continue until no
        further layer can be removed without exceeding the loss threshold.

    The stack never drops below 1 layer.

    Returns a dict with::
        pruned_stack: list of layer dicts (the pruned result).
        removed_indices: list[int] — original indices removed.
        fidelity_before: float — normalised [0, 1] fidelity before pruning.
        fidelity_after: float  — normalised [0, 1] fidelity after pruning.
        passes_before: int
        passes_after: int
        params_before: int
        params_after: int
        layers_removed_pct: float — fraction of layers removed (0.0–1.0).
    """
    if len(stack) <= 1:
        return {
            "pruned_stack": copy.deepcopy(stack),
            "removed_indices": [],
            "fidelity_before": stack_metrics(stack, features)["fidelity"],
            "fidelity_after": stack_metrics(stack, features)["fidelity"],
            "passes_before": _stack_passes(stack),
            "passes_after": _stack_passes(stack),
            "params_before": _stack_params_count(stack),
            "params_after": _stack_params_count(stack),
            "layers_removed_pct": 0.0,
        }

    working = copy.deepcopy(stack)
    original_len = len(working)

    metrics_before = stack_metrics(working, features)
    fidelity_before = metrics_before["fidelity"]
    passes_before = metrics_before["passes"]
    params_before = metrics_before["params_count"]

    removed_indices: list[int] = []

    # Track which original indices have been removed so we can report them.
    # We work on a mutable list and shrink it; original indices shift, so we
    # track removals by content identity via a parallel list of original indices.
    # Simpler: keep a list of (original_index, layer) and remove entries.
    indexed_layers = list(enumerate(working))  # [(orig_idx, layer), ...]

    # Greedy ablation: at each step remove the single layer whose removal
    # costs the least fidelity, provided the TOTAL loss from the original
    # stack stays within ``max_loss_pct``.  This differs from a naive
    # first-removable sweep: every removal is judged against the ORIGINAL
    # fidelity, so cumulative loss can never exceed the threshold (a sweep
    # that compares each trial against ``fidelity_before`` allows losses to
    # compound past the bound).
    changed = True
    while changed and len(indexed_layers) > 1:
        changed = False
        best_i = -1
        best_loss = float("inf")
        best_fidelity = None
        for i in range(len(indexed_layers)):
            trial = [layer for j, layer in indexed_layers if j != i]
            trial_fidelity = stack_metrics(trial, features)["fidelity"]
            loss = fidelity_before - trial_fidelity
            if loss <= max_loss_pct and loss < best_loss:
                best_loss = loss
                best_i = i
                best_fidelity = trial_fidelity
        if best_i >= 0:
            removed_indices.append(indexed_layers[best_i][0])
            indexed_layers.pop(best_i)
            changed = True

    pruned_stack = [layer for _, layer in indexed_layers]
    metrics_after = stack_metrics(pruned_stack, features)

    layers_removed_pct = (original_len - len(pruned_stack)) / original_len if original_len > 0 else 0.0

    return {
        "pruned_stack": pruned_stack,
        "removed_indices": sorted(removed_indices),
        "fidelity_before": fidelity_before,
        "fidelity_after": metrics_after["fidelity"],
        "passes_before": passes_before,
        "passes_after": metrics_after["passes"],
        "params_before": params_before,
        "params_after": metrics_after["params_count"],
        "layers_removed_pct": layers_removed_pct,
    }
