"""Unit tests for Stage 2.1 — simplification pass (cheaper alternative detection).

Tests cover:
  * suggest_simpler_cores identifies cheaper alternatives for a stack
  * Pass cost savings meet the minimum threshold
  * Fidelity tolerance is respected
  * Edge cases: empty stack, single layer, all-cheap stacks
"""

from __future__ import annotations

import pytest

from app.models import FeatureVector
from app.pareto import suggest_simpler_cores


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def expensive_features() -> FeatureVector:
    """Features that match expensive cores (high edge density, etc.)."""
    return FeatureVector(
        palette=[(220, 50, 30), (240, 180, 20)],
        edges={"magnitude": 55.0, "direction": 0.0, "edge_density": 0.35},
        frequency={"low": 0.2, "mid": 0.3, "high": 0.5},
        tone={"mean": 200.0, "std": 75.0, "histogram": [0.0] * 256},
    )


@pytest.fixture
def expensive_stack() -> list[dict]:
    """A stack with expensive cores (gaussian-blur=3, bevel-emboss=2, etc.)."""
    return [
        {"core": "gaussian-blur", "params": {"radius": 2.0}, "opacity": 1.0, "blend": "normal", "mask": None, "enabled": True},
        {"core": "bevel-emboss", "params": {"depth": 0.5}, "opacity": 1.0, "blend": "normal", "mask": None, "enabled": True},
        {"core": "noise-grain", "params": {"intensity": 0.3}, "opacity": 1.0, "blend": "normal", "mask": None, "enabled": True},
    ]


# ---------------------------------------------------------------------------
# suggest_simpler_cores tests
# ---------------------------------------------------------------------------

class TestSuggestSimplerCores:
    """Tests for the suggest_simpler_cores function."""

    def test_empty_stack_returns_empty(self, expensive_features: FeatureVector):
        """An empty stack should return no suggestions."""
        result = suggest_simpler_cores([], expensive_features)
        assert result == []

    def test_single_layer_stack_returns_empty(self, expensive_features: FeatureVector):
        """A single-layer stack has nothing to simplify into."""
        stack = [
            {"core": "gaussian-blur", "params": {"radius": 2.0}, "opacity": 1.0, "blend": "normal", "mask": None, "enabled": True},
        ]
        result = suggest_simpler_cores(stack, expensive_features)
        assert result == []

    def test_suggestions_have_required_keys(
        self, expensive_stack: list[dict], expensive_features: FeatureVector
    ):
        """Each suggestion should have the required keys."""
        result = suggest_simpler_cores(expensive_stack, expensive_features)
        for sugg in result:
            assert "original_core" in sugg
            assert "alternative_core" in sugg
            assert "original_passes" in sugg
            assert "alternative_passes" in sugg
            assert "savings" in sugg
            assert "fidelity_delta" in sugg
            assert "layer_index" in sugg

    def test_suggestions_reduce_passes(
        self, expensive_stack: list[dict], expensive_features: FeatureVector
    ):
        """Each suggestion should have alternative_passes < original_passes."""
        result = suggest_suggestions = suggest_simpler_cores(expensive_stack, expensive_features)
        for sugg in result:
            assert sugg["alternative_passes"] < sugg["original_passes"]
            assert sugg["savings"] > 0

    def test_suggestions_respect_fidelity_tolerance(
        self, expensive_stack: list[dict], expensive_features: FeatureVector
    ):
        """Fidelity delta should be within the default tolerance (0.02)."""
        result = suggest_simpler_cores(expensive_stack, expensive_features)
        for sugg in result:
            assert sugg["fidelity_delta"] <= 0.02

    def test_no_suggestions_for_all_cheap_stack(
        self, expensive_features: FeatureVector
    ):
        """A stack with all cheap cores (pass cost 1) should have no suggestions."""
        stack = [
            {"core": "color-adjust", "params": {"brightness": 0.1}, "opacity": 1.0, "blend": "normal", "mask": None, "enabled": True},
            {"core": "blur", "params": {"radius": 1.0}, "opacity": 1.0, "blend": "normal", "mask": None, "enabled": True},
        ]
        result = suggest_simpler_cores(stack, expensive_features)
        # Both are already cheapest (1 pass each) — no cheaper alternative
        assert result == []

    def test_suggestions_sorted_by_savings_desc(
        self, expensive_stack: list[dict], expensive_features: FeatureVector
    ):
        """Suggestions should be sorted by savings descending."""
        result = suggest_simpler_cores(expensive_stack, expensive_features)
        if len(result) > 1:
            savings = [s["savings"] for s in result]
            assert savings == sorted(savings, reverse=True)

    def test_suggestion_alternative_is_cheaper_core_type(
        self, expensive_stack: list[dict], expensive_features: FeatureVector
    ):
        """The alternative core type should be cheaper than the original."""
        from app.search import _core_pass_cost
        result = suggest_simpler_cores(expensive_stack, expensive_features)
        for sugg in result:
            orig_cost = _core_pass_cost(sugg["original_core"])
            alt_cost = _core_pass_cost(sugg["alternative_core"])
            assert alt_cost < orig_cost

    def test_fidelity_tolerance_parameter(
        self, expensive_stack: list[dict], expensive_features: FeatureVector
    ):
        """A stricter tolerance should yield fewer or equal suggestions."""
        loose = suggest_simpler_cores(expensive_stack, expensive_features, fidelity_tolerance=0.05)
        strict = suggest_simpler_cores(expensive_stack, expensive_features, fidelity_tolerance=0.01)
        assert len(strict) <= len(loose)

    def test_min_savings_parameter(
        self, expensive_stack: list[dict], expensive_features: FeatureVector
    ):
        """min_savings should filter out small savings."""
        result = suggest_simpler_cores(expensive_stack, expensive_features, min_savings=1)
        for sugg in result:
            assert sugg["savings"] >= 1

    def test_suggestion_has_params_for_alternative(
        self, expensive_stack: list[dict], expensive_features: FeatureVector
    ):
        """Each suggestion should include params for the alternative core."""
        result = suggest_simpler_cores(expensive_stack, expensive_features)
        for sugg in result:
            assert "alternative_params" in sugg
            assert isinstance(sugg["alternative_params"], dict)
            assert len(sugg["alternative_params"]) > 0


# ---------------------------------------------------------------------------
# Simplification integration tests
# ---------------------------------------------------------------------------

class TestSimplificationIntegration:
    """Integration tests for the simplification pass."""

    def test_simplify_gaussian_blur_to_blur(self, expensive_features: FeatureVector):
        """gaussian-blur (3 passes) should be simplifiable to blur (1 pass)."""
        stack = [
            {"core": "gaussian-blur", "params": {"radius": 2.0}, "opacity": 1.0, "blend": "normal", "mask": None, "enabled": True},
            {"core": "color-adjust", "params": {"brightness": 0.1}, "opacity": 1.0, "blend": "normal", "mask": None, "enabled": True},
        ]
        result = suggest_simpler_cores(stack, expensive_features)
        # At least one suggestion should be for gaussian-blur → blur
        gaussian_suggs = [s for s in result if s["original_core"] == "gaussian-blur"]
        assert len(gaussian_suggs) > 0
        assert gaussian_suggs[0]["alternative_core"] == "blur"

    def test_simplify_bevel_emboss(self, expensive_features: FeatureVector):
        """bevel-emboss (2 passes) should have a cheaper alternative."""
        stack = [
            {"core": "bevel-emboss", "params": {"depth": 0.5}, "opacity": 1.0, "blend": "normal", "mask": None, "enabled": True},
            {"core": "color-adjust", "params": {"brightness": 0.1}, "opacity": 1.0, "blend": "normal", "mask": None, "enabled": True},
        ]
        result = suggest_suggestions = suggest_simpler_cores(stack, expensive_features)
        bevel_suggs = [s for s in result if s["original_core"] == "bevel-emboss"]
        assert len(bevel_suggs) > 0

    def test_simplify_pattern_dither(self, expensive_features: FeatureVector):
        """pattern-dither (2 passes) should have a cheaper alternative."""
        stack = [
            {"core": "pattern-dither", "params": {"scale": 1.0}, "opacity": 1.0, "blend": "normal", "mask": None, "enabled": True},
            {"core": "color-adjust", "params": {"brightness": 0.1}, "opacity": 1.0, "blend": "normal", "mask": None, "enabled": True},
        ]
        result = suggest_simpler_cores(stack, expensive_features)
        dither_suggs = [s for s in result if s["original_core"] == "pattern-dither"]
        assert len(dither_suggs) > 0

    def test_simplify_noise_grain(self, expensive_features: FeatureVector):
        """noise-grain (2 passes) should have a cheaper alternative."""
        stack = [
            {"core": "noise-grain", "params": {"intensity": 0.3}, "opacity": 1.0, "blend": "normal", "mask": None, "enabled": True},
            {"core": "color-adjust", "params": {"brightness": 0.1}, "opacity": 1.0, "blend": "normal", "mask": None, "enabled": True},
        ]
        result = suggest_simpler_cores(stack, expensive_features)
        grain_suggs = [s for s in result if s["original_core"] == "noise-grain"]
        assert len(grain_suggs) > 0

    def test_simplify_displacement(self, expensive_features: FeatureVector):
        """displacement (2 passes) should have a cheaper alternative."""
        stack = [
            {"core": "displacement", "params": {"scale": 0.5}, "opacity": 1.0, "blend": "normal", "mask": None, "enabled": True},
            {"core": "color-adjust", "params": {"brightness": 0.1}, "opacity": 1.0, "blend": "normal", "mask": None, "enabled": True},
        ]
        result = suggest_simpler_cores(stack, expensive_features)
        disp_suggs = [s for s in result if s["original_core"] == "displacement"]
        assert len(disp_suggs) > 0
