"""Mock AI server for Stage 1.5 frontend integration.

Provides a simulated VLM (Vision-Language Model) backend that the frontend can
exercise against without a real on-device model.  The mock returns deterministic,
rule-based refinements of candidate cores so that the "regenerate layer",
"suggest alternatives", and "re-optimize" flows can be developed and tested
end-to-end.

The mock is intentionally simple: it inspects the incoming feature vector and
candidate cores, then applies a small set of heuristics to produce *refined*
candidates, a confidence score, and a human-readable summary.  When the real
on-device CLIP/VLM model is integrated, swapping this for the real backend is a
single function call (see :class:`MockAIServer`).

Endpoints
---------
| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/vlm/refine` | Given features + candidates, return VLMRefinedOutput |
| POST | `/v1/vlm/regenerate` | Regenerate a single layer in a stack |
| POST | `/v1/vlm/suggest` | Suggest alternative cores for a stack |
| POST | `/v1/vlm/optimize` | Re-optimize a stack against target features |

All endpoints are mounted under `/v1/vlm` and do NOT require network access —
they are pure-Python rule engines.
"""

from __future__ import annotations

import copy
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.models import FeatureVector
from app.hypothesis import CandidateCore, RulesEngine, generate_hypotheses
from app.search import (
    MAX_PASSES,
    _stack_passes,
    _stack_params_count,
    _proxy_fidelity,
    score_stack,
    beam_search_stacks,
    RankedStack,
)
from app.optimize import optimize_stack, _inject_params
from app.pareto import prune_stack
from app.retrieval import assign_cluster_from_features, get_style_clusters

router = APIRouter(prefix="/v1/vlm", tags=["vlm"])

# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class RefineRequest(BaseModel):
    """Request body for /v1/vlm/refine."""
    feature: FeatureVector
    candidates: list[CandidateCore] = Field(default_factory=list)


class RegenerateRequest(BaseModel):
    """Request body for /v1/vlm/regenerate — regenerate a single layer."""
    feature: FeatureVector
    stack: list[dict[str, Any]]
    layer_index: int = 0
    max_trials: int = 50


class SuggestRequest(BaseModel):
    """Request body for /v1/vlm/suggest — suggest alternative cores."""
    feature: FeatureVector
    stack: list[dict[str, Any]]
    max_suggestions: int = 5


class OptimizeRequest(BaseModel):
    """Request body for /v1/vlm/optimize — re-optimize a stack."""
    feature: FeatureVector
    stack: list[dict[str, Any]]
    max_trials: int = 200


# ---------------------------------------------------------------------------
# Core mock logic
# ---------------------------------------------------------------------------

class MockAIServer:
    """Deterministic, rule-based mock for the on-device VLM.

    When the real model is integrated, replace the methods of this class
    (or swap the router) — the API contract stays the same.
    """

    def __init__(self) -> None:
        self._engine = RulesEngine()

    # -- refine ------------------------------------------------------------
    @staticmethod
    def _feature_summary(feature: FeatureVector) -> dict[str, Any]:
        edges = feature.edges or {}
        freq = feature.frequency or {}
        tone = feature.tone or {}
        dominant = feature.palette[0] if feature.palette else (0, 0, 0)
        return {
            "dominant_rgb": list(dominant),
            "n_colours": len(feature.palette),
            "edge_magnitude": edges.get("magnitude", 0.0),
            "edge_density": edges.get("edge_density", 0.0),
            "edge_direction": edges.get("direction", 0.0),
            "freq_low": freq.get("low", 0.0),
            "freq_high": freq.get("high", 0.0),
            "tone_mean": tone.get("mean", 0.0),
            "tone_std": tone.get("std", 0.0),
        }

    def refine(
        self, feature: FeatureVector, candidates: list[CandidateCore]
    ) -> dict[str, Any]:
        """Simulate VLM refinement of candidate cores.

        For each candidate, the mock:
        1. Validates the candidate against the feature summary.
        2. May adjust its confidence based on how well its parameters
           align with the feature vector.
        3. Keeps accepted candidates and rejects those that are clearly
           mismatched.

        Returns a dict with ``refined_candidates``, ``overall_confidence``,
        ``vlm_summary``, and ``image_description``.
        """
        summary = self._feature_summary(feature)
        cluster = assign_cluster_from_features(feature)

        # Auto-generate candidates if none provided.
        if not candidates:
            candidates = generate_hypotheses(feature)

        refined: list[dict[str, Any]] = []
        confidences: list[float] = []

        for cand in candidates:
            accepted = True
            new_confidence = cand.confidence
            notes = ""

            # Heuristic: edge cores should match edge stats.
            if "edge" in cand.core_type:
                mag = summary["edge_magnitude"]
                density = summary["edge_density"]
                if "geometric" in cand.core_type and density < 0.1:
                    accepted = False
                    notes = "No strong edges detected; geometric core rejected."
                    new_confidence = 0.1
                elif "soft" in cand.core_type and density > 0.3:
                    accepted = False
                    notes = "High edge density detected; soft core rejected."
                    new_confidence = 0.1
                else:
                    new_confidence = min(1.0, cand.confidence + 0.1)
                    notes = "Edge characteristics align with image."

            # Heuristic: color cores should match palette.
            if "color" in cand.core_type:
                rgb = summary["dominant_rgb"]
                if "warm" in cand.core_type:
                    r, g, b = rgb
                    if r + g > b + 20:
                        new_confidence = min(1.0, cand.confidence + 0.15)
                        notes = "Warm palette confirmed."
                    else:
                        new_confidence = max(0.0, cand.confidence - 0.1)
                        notes = "Palette does not strongly favour warm hues."
                elif "cool" in cand.core_type:
                    r, g, b = rgb
                    if b > r and b > g:
                        new_confidence = min(1.0, cand.confidence + 0.15)
                        notes = "Cool palette confirmed."
                    else:
                        new_confidence = max(0.0, cand.confidence - 0.1)
                        notes = "Palette does not strongly favour cool hues."

            # Heuristic: texture cores should match frequency.
            if "texture" in cand.core_type:
                high_freq = summary["freq_high"]
                if "fine" in cand.core_type and high_freq > 0.4:
                    new_confidence = min(1.0, cand.confidence + 0.15)
                    notes = "High-frequency content matches fine texture."
                elif "smooth" in cand.core_type and high_freq < 0.2:
                    new_confidence = min(1.0, cand.confidence + 0.1)
                    notes = "Low-frequency content matches smooth texture."
                else:
                    new_confidence = max(0.0, cand.confidence - 0.05)

            # Heuristic: tone cores should match tone stats.
            if "tone" in cand.core_type:
                mean = summary["tone_mean"]
                std = summary["tone_std"]
                if "bright" in cand.core_type and mean < 150:
                    new_confidence = max(0.0, cand.confidence - 0.2)
                    notes = "Tone mean too low for bright core."
                elif "dark" in cand.core_type and mean > 100:
                    new_confidence = max(0.0, cand.confidence - 0.2)
                    notes = "Tone mean too high for dark core."
                elif "high_contrast" in cand.core_type and std < 40:
                    new_confidence = max(0.0, cand.confidence - 0.1)
                    notes = "Tone std too low for high-contrast core."
                else:
                    new_confidence = min(1.0, cand.confidence + 0.05)

            confidences.append(new_confidence)
            refined.append({
                "core_type": cand.core_type,
                "parameters": dict(cand.parameters),
                "confidence": round(new_confidence, 4),
                "reasoning": cand.reasoning,
                "accepted": accepted,
                "vlm_notes": notes or None,
            })

        overall = sum(confidences) / len(confidences) if confidences else 0.0
        return {
            "refined_candidates": refined,
            "overall_confidence": round(overall, 4),
            "vlm_summary": (
                f"Analysed features: {summary['n_colours']} colours, "
                f"cluster={cluster}. "
                f"Generated {len(refined)} refined candidates."
            ),
            "image_description": None,
            "feature_summary": summary,
            "style_cluster": cluster,
        }

    # -- regenerate layer --------------------------------------------------
    def regenerate_layer(
        self,
        feature: FeatureVector,
        stack: list[dict[str, Any]],
        layer_index: int,
        max_trials: int = 50,
    ) -> dict[str, Any]:
        """Regenerate a single layer in a stack.

        The layer at *layer_index* is removed and replaced with fresh
        candidate cores generated from the feature vector via the rules
        engine.  The best replacement (by proxy fidelity) is chosen.
        """
        if not stack:
            raise ValueError("stack must not be empty")
        if layer_index < 0 or layer_index >= len(stack):
            raise ValueError(f"layer_index {layer_index} out of range for stack of length {len(stack)}")

        # Generate fresh candidates for this feature vector.
        fresh_candidates = generate_hypotheses(feature)
        if not fresh_candidates:
            fresh_candidates = self._engine.generate_candidates(feature)

        original_layer = stack[layer_index]
        original_core = original_layer.get("core", "unknown")

        # Try replacing the layer with each candidate, pick the best by
        # proxy fidelity of the resulting stack.
        best_candidate: CandidateCore | None = None
        best_score: float = -float("inf")
        best_stack: list[dict[str, Any]] = []

        from app.search import _candidate_to_layer

        for cand in fresh_candidates:
            trial_stack = copy.deepcopy(stack)
            trial_stack[layer_index] = _candidate_to_layer(cand)
            score = score_stack(trial_stack, feature)
            if score > best_score:
                best_score = score
                best_candidate = cand
                best_stack = trial_stack

        if best_candidate is None:
            # No candidates — keep the original layer.
            return {
                "original_core": original_core,
                "regenerated_core": original_core,
                "stack": stack,
                "score": 0.0,
                "confidence": original_layer.get("confidence", 0.8),
                "reasoning": "No alternative candidates generated; layer unchanged.",
                "passes": _stack_passes(stack),
            }

        return {
            "original_core": original_core,
            "original_params": original_layer.get("params", {}),
            "regenerated_core": best_candidate.core_type,
            "regenerated_params": dict(best_candidate.parameters),
            "stack": best_stack,
            "score": round(best_score, 4),
            "confidence": best_candidate.confidence,
            "reasoning": best_candidate.reasoning,
            "passes": _stack_passes(best_stack),
        }

    # -- suggest alternatives ------------------------------------------------
    def suggest_alternatives(
        self,
        feature: FeatureVector,
        stack: list[dict[str, Any]],
        max_suggestions: int = 5,
    ) -> dict[str, Any]:
        """Suggest alternative stacks for the given feature vector.

        Returns a list of alternative stacks (each within the pass budget)
        ranked by proxy fidelity.  These are alternatives to the current stack,
        not modifications of it.
        """
        # Get the cluster of the target features.
        cluster = assign_cluster_from_features(feature)

        # Generate fresh beam search candidates as alternatives.
        alternatives = beam_search_stacks(
            feature,
            beam_width=max_suggestions,
            max_layers=min(5, len(stack) + 1),
        )

        # Also try regenerating each layer of the existing stack and collect
        # those as alternatives.
        from app.search import _candidate_to_layer

        layer_alternatives: list[dict[str, Any]] = []
        for i, layer in enumerate(stack):
            if i >= max_suggestions:
                break
            candidates = generate_hypotheses(feature)
            for cand in candidates[:3]:
                trial = copy.deepcopy(stack)
                trial[i] = _candidate_to_layer(cand)
                if _stack_passes(trial) <= MAX_PASSES:
                    fidelity = _proxy_fidelity(trial, feature)
                    fidelity_norm = max(0.0, min(1.0, (fidelity + 1.0) / 2.0))
                    layer_alternatives.append({
                        "stack": trial,
                        "score": round(fidelity_norm, 4),
                        "passes": _stack_passes(trial),
                        "params_count": _stack_params_count(trial),
                        "modified_layer": i,
                        "suggested_core": cand.core_type,
                        "confidence": cand.confidence,
                    })

        # Merge and rank all alternatives.
        all_alts: list[dict[str, Any]] = []

        for alt in alternatives[:max_suggestions]:
            from app.search import _stack_confidence
            all_alts.append({
                "stack": alt.stack,
                "score": round(alt.fidelity, 4),
                "passes": alt.passes,
                "params_count": alt.params_count,
                "confidence": alt.confidence,
                "source": "beam_search",
            })

        for la in layer_alternatives:
            all_alts.append(la)

        # Sort by score descending and dedupe by stack signature.
        seen: set[str] = set()
        unique: list[dict[str, Any]] = []
        for a in sorted(all_alts, key=lambda x: x["score"], reverse=True):
            sig = str(a["stack"])
            if sig in seen:
                continue
            seen.add(sig)
            unique.append(a)

        # Cap to max_suggestions.
        unique = unique[:max_suggestions]

        return {
            "alternatives": unique,
            "count": len(unique),
            "current_stack_passes": _stack_passes(stack),
            "current_stack_score": max(0.0, min(1.0, (_proxy_fidelity(stack, feature) + 1.0) / 2.0)),
            "target_cluster": cluster,
            "style_clusters": get_style_clusters(),
        }

    # -- re-optimize -------------------------------------------------------
    def reoptimize(
        self,
        feature: FeatureVector,
        stack: list[dict[str, Any]],
        max_trials: int = 200,
    ) -> dict[str, Any]:
        """Re-optimize a stack against target features.

        Runs the CMA-ES optimizer (optuna if available, else numpy fallback)
        to tune the parameters of every layer in the stack.
        """
        result = optimize_stack(stack, feature, max_trials=max_trials, seed=42)
        optimized_stack = _inject_params(stack, result.optimized_params)

        # Also compute a pruned version for comparison.
        prune_report = prune_stack(optimized_stack, feature, max_loss_pct=0.02)

        return {
            "optimized_stack": optimized_stack,
            "score": round(result.score, 4),
            "trace": result.trace,
            "passes": _stack_passes(optimized_stack),
            "params_count": _stack_params_count(optimized_stack),
            "pruned_stack": prune_report["pruned_stack"],
            "pruned_passes": prune_report["passes_after"],
            "pruned_fidelity": prune_report["fidelity_after"],
            "layers_removed_pct": prune_report["layers_removed_pct"],
            "mobile_ok": _stack_passes(optimized_stack) <= MAX_PASSES,
        }


# ---------------------------------------------------------------------------
# Router endpoints
# ---------------------------------------------------------------------------

_server = MockAIServer()


@router.post("/refine")
def vlm_refine(request: RefineRequest) -> dict[str, Any]:
    """Simulate VLM refinement of candidate cores against a feature vector.

    Returns a dict with ``refined_candidates`` (each with ``accepted``,
    ``confidence``, ``reasoning``, and ``vlm_notes``), ``overall_confidence``,
    ``vlm_summary``, ``image_description``, ``feature_summary``, and
    ``style_cluster``.
    """
    if not request.candidates:
        # Auto-generate candidates if none provided.
        request.candidates = generate_hypotheses(request.feature)
    return _server.refine(request.feature, request.candidates)


@router.post("/regenerate")
def vlm_regenerate(request: RegenerateRequest) -> dict[str, Any]:
    """Regenerate a single layer in a stack.

    Replaces the layer at ``layer_index`` with the best-matching candidate
    core from the rules engine, scored by proxy fidelity.
    """
    try:
        return _server.regenerate_layer(
            request.feature, request.stack, request.layer_index,
            max_trials=request.max_trials,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/suggest")
def vlm_suggest(request: SuggestRequest) -> dict[str, Any]:
    """Suggest alternative stacks for the given feature vector.

    Returns a list of alternative stacks (each within the 8-pass budget)
    ranked by proxy-fidelity score, plus metadata about the current stack.
    """
    if not request.stack:
        # If no stack provided, suggest from scratch via beam search.
        alternatives = beam_search_stacks(
            request.feature, beam_width=request.max_suggestions, max_layers=5
        )
        alts = [{
            "stack": a.stack,
            "score": round(a.fidelity, 4),
            "passes": a.passes,
            "params_count": a.params_count,
            "confidence": a.confidence,
            "source": "beam_search",
        } for a in alternatives[:request.max_suggestions]]
        return {
            "alternatives": alts,
            "count": len(alts),
            "current_stack_passes": 0,
            "current_stack_score": 0.0,
            "target_cluster": assign_cluster_from_features(request.feature),
            "style_clusters": get_style_clusters(),
        }
    return _server.suggest_alternatives(
        request.feature, request.stack, max_suggestions=request.max_suggestions,
    )


@router.post("/optimize")
def vlm_optimize(request: OptimizeRequest) -> dict[str, Any]:
    """Re-optimize a stack against target features.

    Runs parameter optimization (CMA-ES) and also computes a pruned variant
    for comparison.  Returns the optimized stack, score, trace, pass count,
    and pruning report.
    """
    return _server.reoptimize(
        request.feature, request.stack, max_trials=request.max_trials,
    )


__all__ = [
    "router",
    "MockAIServer",
    "RefineRequest",
    "RegenerateRequest",
    "SuggestRequest",
    "OptimizeRequest",
]
