"""Tests for Stage 1.4 — beam search, optimization, pruning, and Pareto frontier.

All FeatureVectors are constructed directly (no image I/O) for speed and
determinism.  Stacks are built as lists of layer dicts:
    {"core": str, "params": dict, "opacity": float, "blend": str, "mask": None, "enabled": bool}
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.models import FeatureVector
from app.search import (
    MAX_PASSES,
    beam_search_stacks,
    search_stacks,
    score_stack,
    _proxy_fidelity,
    _stack_passes,
)
from app.optimize import optimize_stack, OptimizationResult, _inject_params
from app.pareto import stack_metrics, pareto_frontier, prune_layer, prune_stack
from app.main import app


# ---------------------------------------------------------------------------
# Fixtures — synthetic FeatureVectors built directly
# ---------------------------------------------------------------------------

@pytest.fixture
def base_feature_vector() -> FeatureVector:
    return FeatureVector(
        palette=[(120, 30, 200), (10, 10, 10), (240, 240, 240)],
        edges={"magnitude": 0.4, "direction": 1.2, "edge_density": 0.15},
        frequency={"low": 0.6, "mid": 0.3, "high": 0.1},
        tone={"mean": 110.0, "std": 45.0, "histogram": [0.0] * 256},
        clip_embedding=None,
    )


@pytest.fixture
def warm_bright_features() -> FeatureVector:
    return FeatureVector(
        palette=[(220, 80, 40), (200, 60, 30), (180, 50, 20)],
        edges={"magnitude": 0.7, "direction": 0.8, "edge_density": 0.3},
        frequency={"low": 0.2, "mid": 0.2, "high": 0.6},
        tone={"mean": 200.0, "std": 75.0, "histogram": [0.0] * 256},
        clip_embedding=None,
    )


def _make_layer(core: str, params: dict | None = None) -> dict:
    """Build a standard layer dict with sensible defaults."""
    return {
        "core": core,
        "params": params or {},
        "opacity": 1.0,
        "blend": "normal",
        "mask": None,
        "enabled": True,
    }


# ---------------------------------------------------------------------------
# Beam search tests
# ---------------------------------------------------------------------------

class TestBeamSearch:
    """Tests for beam_search_stacks / search_stacks."""

    def test_beam_search_returns_non_empty(self, base_feature_vector: FeatureVector):
        """Beam search with valid features should return a non-empty list."""
        results = beam_search_stacks(base_feature_vector, beam_width=4, max_layers=3)
        assert len(results) > 0

    def test_all_candidates_within_pass_budget(self, base_feature_vector: FeatureVector):
        """Every candidate must have passes <= MAX_PASSES (8)."""
        results = beam_search_stacks(base_feature_vector, beam_width=8, max_layers=5)
        for r in results:
            assert r.passes <= MAX_PASSES

    def test_deterministic_with_same_seed(self, base_feature_vector: FeatureVector):
        """Same seed → identical results (to_dict equal)."""
        r1 = beam_search_stacks(base_feature_vector, beam_width=4, max_layers=3, seed=42)
        r2 = beam_search_stacks(base_feature_vector, beam_width=4, max_layers=3, seed=42)
        assert [r.to_dict() for r in r1] == [r.to_dict() for r in r2]

    def test_candidates_sorted_by_fidelity_desc(self, base_feature_vector: FeatureVector):
        """Candidates must be sorted by fidelity descending."""
        results = beam_search_stacks(base_feature_vector, beam_width=8, max_layers=5)
        for i in range(len(results) - 1):
            assert results[i].fidelity >= results[i + 1].fidelity

    def test_search_stacks_alias(self, base_feature_vector: FeatureVector):
        """search_stacks should be an alias returning the same type."""
        results = search_stacks(base_feature_vector, beam_width=4, max_layers=3)
        assert all(hasattr(r, "to_dict") for r in results)

    def test_ranked_stack_to_dict(self, base_feature_vector: FeatureVector):
        """RankedStack.to_dict() returns dict with expected keys."""
        from app.search import RankedStack
        rs = RankedStack(stack=[], fidelity=0.5, passes=2, params_count=3, confidence=0.8)
        d = rs.to_dict()
        assert "stack" in d and "fidelity" in d and "passes" in d
        assert "params_count" in d and "confidence" in d
        assert d["fidelity"] == 0.5
        assert d["passes"] == 2
        assert d["params_count"] == 3
        assert d["confidence"] == 0.8


# ---------------------------------------------------------------------------
# Optimize tests
# ---------------------------------------------------------------------------

class TestOptimize:
    """Tests for optimize_stack."""

    def test_optimize_returns_result(self, base_feature_vector: FeatureVector):
        """optimize_stack returns an OptimizationResult."""
        stack = [
            _make_layer("color_warm_core", {"rgb": [220, 80, 40], "hue": "warm"}),
            _make_layer("tone_high_contrast_core", {"std_threshold": 75.0, "tone_mean": 200.0}),
        ]
        result = optimize_stack(stack, base_feature_vector, max_trials=50, seed=42)
        assert isinstance(result, OptimizationResult)

    def test_optimize_score_improves_or_matches(self, base_feature_vector: FeatureVector):
        """Optimized score should be >= baseline proxy fidelity of original stack."""
        # Use params far from target so CMA-ES has room to improve
        stack = [
            _make_layer("color_warm_core", {"rgb": [10, 10, 10]}),
            _make_layer("tone_balanced_core", {"mean": 10.0, "std": 5.0}),
        ]
        # Baseline: normalized proxy fidelity of original stack
        baseline_fid = max(0.0, min(1.0, (_proxy_fidelity(stack, base_feature_vector) + 1.0) / 2.0))
        result = optimize_stack(stack, base_feature_vector, max_trials=200, seed=42)
        assert result.score >= baseline_fid - 0.01  # allow tiny tolerance

    def test_optimize_trace_length(self, base_feature_vector: FeatureVector):
        """Trace length should equal max_trials (CMA-ES runs all trials)."""
        stack = [
            _make_layer("color_warm_core", {"rgb": [220, 80, 40]}),
            _make_layer("tone_balanced_core", {"mean": 120.0, "std": 50.0}),
        ]
        result = optimize_stack(stack, base_feature_vector, max_trials=30, seed=42)
        assert len(result.trace) == 30

    def test_optimize_passes_within_budget(self, base_feature_vector: FeatureVector):
        """Final stack after optimization must respect the 8-pass budget."""
        stack = [
            _make_layer("color_warm_core", {"rgb": [220, 80, 40]}),
            _make_layer("tone_balanced_core", {"mean": 120.0, "std": 50.0}),
            _make_layer("edge_geometric_core", {"edge_density": 0.3, "magnitude": 40.0, "direction": 1.2}),
        ]
        result = optimize_stack(stack, base_feature_vector, max_trials=50, seed=42)
        optimized = _inject_params(stack, result.optimized_params)
        assert _stack_passes(optimized) <= MAX_PASSES

    def test_optimize_empty_stack(self, base_feature_vector: FeatureVector):
        """Optimizing an empty stack returns score 0.0 and empty trace."""
        result = optimize_stack([], base_feature_vector, max_trials=10)
        assert result.score == 0.0
        assert result.optimized_params == {}


# ---------------------------------------------------------------------------
# Prune tests
# ---------------------------------------------------------------------------

class TestPrune:
    """Tests for prune_layer and prune_stack."""

    def test_prune_layer_removes_correct_index(self):
        """prune_layer removes the layer at the given index."""
        stack = [_make_layer("a"), _make_layer("b"), _make_layer("c")]
        result = prune_layer(stack, 1)
        assert len(result["stack"]) == 2
        assert result["stack"][0]["core"] == "a"
        assert result["stack"][1]["core"] == "c"
        assert result["removed_index"] == 1

    def test_prune_layer_does_not_mutate_input(self):
        """prune_layer must not mutate the original stack."""
        stack = [_make_layer("a"), _make_layer("b")]
        original_len = len(stack)
        prune_layer(stack, 0)
        assert len(stack) == original_len

    def test_prune_layer_empty_stack(self):
        """prune_layer on empty stack returns empty."""
        result = prune_layer([], 0)
        assert result["stack"] == []
        assert result["layers_before"] == 0

    def test_prune_stack_removes_percentage(self, base_feature_vector: FeatureVector):
        """Prune a 6-layer stack: removes >= 15% layers with fidelity loss <= 2%."""
        # Build a 6-layer stack where some layers are redundant (params that
        # don't meaningfully contribute to the proxy fidelity for this feature
        # vector).  Layers with only "hue" (string) or empty params don't
        # contribute to the synthetic feature vector, so removing them costs
        # ~0 fidelity.
        stack = [
            _make_layer("color_warm_core", {"rgb": [120, 30, 200], "hue": "cool"}),
            _make_layer("tone_balanced_core", {"mean": 110.0, "std": 45.0}),
            _make_layer("color_muted_core", {"avg_saturation": 0.3, "rgb": [100, 50, 180]}),
            _make_layer("tone_balanced_core", {"mean": 105.0, "std": 40.0}),
            _make_layer("color_vibrant_core", {"avg_saturation": 0.35, "rgb": [110, 35, 190]}),
            _make_layer("tone_balanced_core", {"mean": 108.0, "std": 42.0}),
        ]
        report = prune_stack(stack, base_feature_vector, max_loss_pct=0.02)
        layers_removed_pct = report["layers_removed_pct"]
        assert layers_removed_pct >= 0.15
        # Fidelity loss should be <= 2% (normalized)
        fidelity_loss = report["fidelity_before"] - report["fidelity_after"]
        assert fidelity_loss <= 0.02 + 1e-9

    def test_prune_stack_never_below_one_layer(self, base_feature_vector: FeatureVector):
        """Prune must never return fewer than 1 layer."""
        stack = [_make_layer("color_warm_core", {"rgb": [220, 80, 40]})]
        report = prune_stack(stack, base_feature_vector, max_loss_pct=0.02)
        assert len(report["pruned_stack"]) >= 1

    def test_prune_stack_passes_after_leq_before(self, base_feature_vector: FeatureVector):
        """Passes after pruning must be <= passes before."""
        stack = [
            _make_layer("bevel-emboss"),  # 2 passes
            _make_layer("gradient-overlay"),  # 1 pass
            _make_layer("pattern-dither"),  # 2 passes
            _make_layer("noise-grain"),  # 2 passes
            _make_layer("gaussian-blur"),  # 3 passes
            _make_layer("color-adjust"),  # 1 pass
        ]
        report = prune_stack(stack, base_feature_vector, max_loss_pct=0.02)
        assert report["passes_after"] <= report["passes_before"]

    def test_prune_stack_report_keys(self, base_feature_vector: FeatureVector):
        """Report dict has all expected keys."""
        stack = [
            _make_layer("color_warm_core", {"rgb": [220, 80, 40]}),
            _make_layer("tone_balanced_core", {"mean": 120.0, "std": 50.0}),
        ]
        report = prune_stack(stack, base_feature_vector, max_loss_pct=0.02)
        expected_keys = {
            "pruned_stack", "removed_indices", "fidelity_before", "fidelity_after",
            "passes_before", "passes_after", "params_before", "params_after",
            "layers_removed_pct",
        }
        assert expected_keys.issubset(set(report.keys()))


# ---------------------------------------------------------------------------
# Pareto frontier tests
# ---------------------------------------------------------------------------

class TestParetoFrontier:
    """Tests for pareto_frontier and stack_metrics."""

    def test_pareto_returns_subset(self):
        """Pareto frontier must be a subset of the input."""
        candidates = [
            {"stack": [], "fidelity": 0.5, "passes": 3, "params_count": 2},
            {"stack": [], "fidelity": 0.8, "passes": 5, "params_count": 4},
            {"stack": [], "fidelity": 0.3, "passes": 2, "params_count": 1},
        ]
        frontier = pareto_frontier(candidates)
        assert len(frontier) <= len(candidates)
        assert len(frontier) >= 1

    def test_pareto_excludes_dominated(self):
        """A candidate dominated by another must be excluded."""
        # B dominates A: A has lower fidelity, more passes, more params
        candidates = [
            {"stack": [], "fidelity": 0.5, "passes": 3, "params_count": 2},   # dominated
            {"stack": [], "fidelity": 0.8, "passes": 2, "params_count": 1},   # dominates A
        ]
        frontier = pareto_frontier(candidates)
        assert len(frontier) == 1
        assert frontier[0]["fidelity"] == 0.8

    def test_pareto_empty_input(self):
        """Empty input returns empty frontier."""
        assert pareto_frontier([]) == []

    def test_pareto_undominated_present(self):
        """Candidates that are mutually non-dominating all appear."""
        candidates = [
            {"stack": [], "fidelity": 0.9, "passes": 6, "params_count": 5},   # high fid, more passes
            {"stack": [], "fidelity": 0.7, "passes": 2, "params_count": 1},   # low passes
            {"stack": [], "fidelity": 0.6, "passes": 1, "params_count": 3},   # minimal passes
        ]
        frontier = pareto_frontier(candidates)
        # None of these dominates another (each is better in at least one metric
        # where another is worse)
        assert len(frontier) == 3

    def test_stack_metrics_normalized(self, base_feature_vector: FeatureVector):
        """stack_metrics returns fidelity in [0, 1]."""
        stack = [_make_layer("color_warm_core", {"rgb": [220, 80, 40]})]
        m = stack_metrics(stack, base_feature_vector)
        assert 0.0 <= m["fidelity"] <= 1.0
        assert isinstance(m["passes"], int)
        assert isinstance(m["params_count"], int)


# ---------------------------------------------------------------------------
# Endpoint tests via TestClient
# ---------------------------------------------------------------------------

class TestEndpoints:
    """Tests for the three new Stage 1.4 endpoints."""

    def test_search_endpoint_200(self, base_feature_vector: FeatureVector):
        """POST /v1/stacks/search returns 200 with candidates list."""
        client = TestClient(app, headers={"Authorization": "Bearer dev-token"})
        response = client.post(
            "/v1/stacks/search",
            json={
                "feature": base_feature_vector.model_dump(),
                "beam_width": 4,
                "levels": 1,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "candidates" in data
        assert isinstance(data["candidates"], list)
        assert "count" in data

    def test_optimize_endpoint_200(self, base_feature_vector: FeatureVector):
        """POST /v1/stacks/optimize returns 200 with optimized_stack and score."""
        client = TestClient(app, headers={"Authorization": "Bearer dev-token"})
        stack = [
            _make_layer("color_warm_core", {"rgb": [220, 80, 40]}),
            _make_layer("tone_balanced_core", {"mean": 120.0, "std": 50.0}),
        ]
        response = client.post(
            "/v1/stacks/optimize",
            json={
                "feature": base_feature_vector.model_dump(),
                "stack": stack,
                "max_trials": 20,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "optimized_stack" in data
        assert "score" in data
        assert "trace" in data
        assert "passes" in data

    def test_prune_endpoint_200(self, base_feature_vector: FeatureVector):
        """POST /v1/stacks/prune returns 200 with report containing layers_removed_pct."""
        client = TestClient(app, headers={"Authorization": "Bearer dev-token"})
        stack = [
            _make_layer("color_warm_core", {"rgb": [220, 80, 40]}),
            _make_layer("tone_balanced_core", {"mean": 120.0, "std": 50.0}),
            _make_layer("edge_geometric_core", {"edge_density": 0.3}),
            _make_layer("texture_fine_core", {"high_freq_ratio": 0.6}),
            _make_layer("color_vibrant_core", {"avg_saturation": 0.6}),
            _make_layer("tone_high_contrast_core", {"std_threshold": 85.0}),
        ]
        response = client.post(
            "/v1/stacks/prune",
            json={
                "feature": base_feature_vector.model_dump(),
                "stack": stack,
                "max_loss_pct": 0.02,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "report" in data
        report = data["report"]
        assert "layers_removed_pct" in report
        assert "pruned_stack" in report
        assert "fidelity_before" in report
        assert "fidelity_after" in report
