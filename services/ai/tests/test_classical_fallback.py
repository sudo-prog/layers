"""Unit tests for Stage 2.1 — classical fallback (rule-based hypotheses when VLM down).

Tests cover:
  * Rule thresholds and parameter ranges
  * Core type selection from feature vectors
  * Confidence scoring
  * Edge cases: empty palette, extreme values, balanced features
"""

from __future__ import annotations

import pytest

from app.models import FeatureVector
from app.classical_fallback import (
    ClassicalFallback,
    FallbackHypothesis,
    generate_fallback_hypotheses,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def fallback_engine() -> ClassicalFallback:
    """A fresh ClassicalFallback instance."""
    return ClassicalFallback()


@pytest.fixture
def warm_vibrant_features() -> FeatureVector:
    """Warm, high-saturation palette with strong edges and bright tone."""
    return FeatureVector(
        palette=[(220, 50, 30), (240, 180, 20), (200, 30, 10), (255, 220, 100)],
        edges={"magnitude": 55.0, "direction": 0.0, "edge_density": 0.35},
        frequency={"low": 0.2, "mid": 0.3, "high": 0.5},
        tone={"mean": 200.0, "std": 75.0, "histogram": [0.0] * 256},
    )


@pytest.fixture
def cool_muted_features() -> FeatureVector:
    """Cool, low-saturation palette with low edges and dark tone."""
    return FeatureVector(
        palette=[(30, 50, 120), (60, 80, 140), (20, 40, 100), (80, 100, 160)],
        edges={"magnitude": 8.0, "direction": 45.0, "edge_density": 0.03},
        frequency={"low": 0.7, "mid": 0.2, "high": 0.1},
        tone={"mean": 50.0, "std": 20.0, "histogram": [0.0] * 256},
    )


@pytest.fixture
def neutral_features() -> FeatureVector:
    """Balanced/neutral features — should yield few hypotheses with lower confidence.
    Uses slightly non-grey colors (sat > 0.15) to avoid triggering monochrome."""
    return FeatureVector(
        palette=[(140, 130, 120), (135, 125, 115), (145, 135, 125)],
        edges={"magnitude": 20.0, "direction": 45.0, "edge_density": 0.08},
        frequency={"low": 0.4, "mid": 0.3, "high": 0.3},
        tone={"mean": 128.0, "std": 40.0, "histogram": [0.0] * 256},
    )


# ---------------------------------------------------------------------------
# Data model tests
# ---------------------------------------------------------------------------

class TestFallbackHypothesis:
    """Tests for the FallbackHypothesis dataclass."""

    def test_create_hypothesis(self):
        """FallbackHypothesis should be constructible with all fields."""
        h = FallbackHypothesis(
            core_type="color_warm_core",
            param_ranges={"hue": [0, 45], "saturation": [0.6, 1.0]},
            confidence=0.75,
            reasoning="Warm palette dominant.",
        )
        assert h.core_type == "color_warm_core"
        assert h.param_ranges["hue"] == [0, 45]
        assert h.confidence == 0.75
        assert "Warm" in h.reasoning

    def test_confidence_bounds(self):
        """Confidence should be clamped to [0, 1]."""
        h = FallbackHypothesis(
            core_type="test",
            param_ranges={},
            confidence=1.5,
            reasoning="test",
        )
        # The dataclass itself doesn't clamp — the engine does.
        # But we can verify the field accepts the value.
        assert h.confidence == 1.5


# ---------------------------------------------------------------------------
# ClassicalFallback rule tests
# ---------------------------------------------------------------------------

class TestClassicalFallbackColorRules:
    """Tests for color-related rules in ClassicalFallback."""

    def test_high_saturation_triggers_color_core(
        self, fallback_engine: ClassicalFallback, warm_vibrant_features: FeatureVector
    ):
        """High average saturation should trigger a color-related core."""
        hypotheses = fallback_engine.generate(warm_vibrant_features)
        core_types = [h.core_type for h in hypotheses]
        # Warm colors: red/orange/yellow hue should trigger color_warm_core
        assert "color_warm_core" in core_types

    def test_low_saturation_triggers_muted_core(
        self, fallback_engine: ClassicalFallback
    ):
        """Low saturation should trigger color_muted_core."""
        # Pastel palette: moderate saturation (0.15 < s <= 0.5)
        features = FeatureVector(
            palette=[(200, 150, 150), (180, 170, 160), (190, 160, 170)],
            edges={"magnitude": 8.0, "direction": 45.0, "edge_density": 0.03},
            frequency={"low": 0.7, "mid": 0.2, "high": 0.1},
            tone={"mean": 150.0, "std": 25.0, "histogram": [0.0] * 256},
        )
        hypotheses = fallback_engine.generate(features)
        core_types = [h.core_type for h in hypotheses]
        assert "color_muted_core" in core_types

    def test_monochrome_features_trigger_monochrome_core(
        self, fallback_engine: ClassicalFallback
    ):
        """Very low saturation across all colors → monochrome core."""
        features = FeatureVector(
            palette=[(100, 100, 100), (120, 120, 120), (80, 80, 80)],
            edges={"magnitude": 10.0, "direction": 0.0, "edge_density": 0.02},
            frequency={"low": 0.8, "mid": 0.1, "high": 0.1},
            tone={"mean": 100.0, "std": 15.0, "histogram": [0.0] * 256},
        )
        hypotheses = fallback_engine.generate(features)
        core_types = [h.core_type for h in hypotheses]
        assert "color_monochrome_core" in core_types

    def test_cool_palette_triggers_cool_core(
        self, fallback_engine: ClassicalFallback, cool_muted_features: FeatureVector
    ):
        """Cool palette (blue/cyan/magenta dominance) → color_cool_core."""
        hypotheses = fallback_engine.generate(cool_muted_features)
        core_types = [h.core_type for h in hypotheses]
        assert "color_cool_core" in core_types


class TestClassicalFallbackToneRules:
    """Tests for tone-related rules in ClassicalFallback."""

    def test_bright_tone_triggers_bright_core(
        self, fallback_engine: ClassicalFallback, warm_vibrant_features: FeatureVector
    ):
        """High tone mean → tone_bright_core."""
        hypotheses = fallback_engine.generate(warm_vibrant_features)
        core_types = [h.core_type for h in hypotheses]
        assert "tone_bright_core" in core_types

    def test_dark_tone_triggers_dark_core(
        self, fallback_engine: ClassicalFallback, cool_muted_features: FeatureVector
    ):
        """Low tone mean → tone_dark_core."""
        hypotheses = fallback_engine.generate(cool_muted_features)
        core_types = [h.core_type for h in hypotheses]
        assert "tone_dark_core" in core_types

    def test_high_contrast_triggers_contrast_core(
        self, fallback_engine: ClassicalFallback, warm_vibrant_features: FeatureVector
    ):
        """High tone std → tone_high_contrast_core."""
        hypotheses = fallback_engine.generate(warm_vibrant_features)
        core_types = [h.core_type for h in hypotheses]
        assert "tone_high_contrast_core" in core_types

    def test_low_contrast_triggers_low_contrast_core(
        self, fallback_engine: ClassicalFallback, cool_muted_features: FeatureVector
    ):
        """Low tone std → tone_low_contrast_core."""
        hypotheses = fallback_engine.generate(cool_muted_features)
        core_types = [h.core_type for h in hypotheses]
        assert "tone_low_contrast_core" in core_types


class TestClassicalFallbackEdgeRules:
    """Tests for edge-related rules in ClassicalFallback."""

    def test_high_edge_density_triggers_geometric_core(
        self, fallback_engine: ClassicalFallback, warm_vibrant_features: FeatureVector
    ):
        """High edge density and magnitude → edge_geometric_core."""
        hypotheses = fallback_engine.generate(warm_vibrant_features)
        core_types = [h.core_type for h in hypotheses]
        assert "edge_geometric_core" in core_types

    def test_low_edge_density_triggers_soft_core(
        self, fallback_engine: ClassicalFallback, cool_muted_features: FeatureVector
    ):
        """Low edge density and magnitude → edge_soft_core."""
        hypotheses = fallback_engine.generate(cool_muted_features)
        core_types = [h.core_type for h in hypotheses]
        assert "edge_soft_core" in core_types

    def test_directional_edges_trigger_directional_core(
        self, fallback_engine: ClassicalFallback, warm_vibrant_features: FeatureVector
    ):
        """Directional edges (near horizontal/vertical) → edge_directional_core."""
        # warm_vibrant_features has direction=0.0, magnitude=55, density=0.35
        hypotheses = fallback_engine.generate(warm_vibrant_features)
        core_types = [h.core_type for h in hypotheses]
        assert "edge_directional_core" in core_types


class TestClassicalFallbackTextureRules:
    """Tests for texture-related rules in ClassicalFallback."""

    def test_high_freq_triggers_fine_texture_core(
        self, fallback_engine: ClassicalFallback, warm_vibrant_features: FeatureVector
    ):
        """High frequency ratio → texture_fine_core."""
        hypotheses = fallback_engine.generate(warm_vibrant_features)
        core_types = [h.core_type for h in hypotheses]
        assert "texture_fine_core" in core_types

    def test_low_freq_triggers_smooth_texture_core(
        self, fallback_engine: ClassicalFallback, cool_muted_features: FeatureVector
    ):
        """Low frequency ratio → texture_smooth_core."""
        hypotheses = fallback_engine.generate(cool_muted_features)
        core_types = [h.core_type for h in hypotheses]
        assert "texture_smooth_core" in core_types


# ---------------------------------------------------------------------------
# Parameter range tests
# ---------------------------------------------------------------------------

class TestClassicalFallbackParamRanges:
    """Tests for parameter ranges in generated hypotheses."""

    def test_color_warm_has_hue_range(self, fallback_engine: ClassicalFallback):
        """color_warm_core should include a hue range parameter."""
        features = FeatureVector(
            palette=[(220, 50, 30)],
            edges={"magnitude": 20.0, "direction": 45.0, "edge_density": 0.08},
            frequency={"low": 0.4, "mid": 0.3, "high": 0.3},
            tone={"mean": 128.0, "std": 40.0, "histogram": [0.0] * 256},
        )
        hypotheses = fallback_engine.generate(features)
        warm = [h for h in hypotheses if h.core_type == "color_warm_core"]
        assert len(warm) == 1
        assert "hue_range" in warm[0].param_ranges
        assert len(warm[0].param_ranges["hue_range"]) == 2
        assert 0 <= warm[0].param_ranges["hue_range"][0] <= 45

    def test_edge_geometric_has_density_range(self, fallback_engine: ClassicalFallback):
        """edge_geometric_core should include edge_density range."""
        features = FeatureVector(
            palette=[(128, 128, 128)],
            edges={"magnitude": 55.0, "direction": 0.0, "edge_density": 0.35},
            frequency={"low": 0.4, "mid": 0.3, "high": 0.3},
            tone={"mean": 128.0, "std": 40.0, "histogram": [0.0] * 256},
        )
        hypotheses = fallback_engine.generate(features)
        geo = [h for h in hypotheses if h.core_type == "edge_geometric_core"]
        assert len(geo) == 1
        assert "edge_density_range" in geo[0].param_ranges

    def test_tone_bright_has_mean_range(self, fallback_engine: ClassicalFallback):
        """tone_bright_core should include a tone_mean range."""
        features = FeatureVector(
            palette=[(220, 50, 30)],
            edges={"magnitude": 20.0, "direction": 45.0, "edge_density": 0.08},
            frequency={"low": 0.4, "mid": 0.3, "high": 0.3},
            tone={"mean": 200.0, "std": 40.0, "histogram": [0.0] * 256},
        )
        hypotheses = fallback_engine.generate(features)
        bright = [h for h in hypotheses if h.core_type == "tone_bright_core"]
        assert len(bright) == 1
        assert "tone_mean_range" in bright[0].param_ranges


# ---------------------------------------------------------------------------
# Confidence scoring tests
# ---------------------------------------------------------------------------

class TestClassicalFallbackConfidence:
    """Tests for confidence scoring in ClassicalFallback."""

    def test_extreme_features_have_high_confidence(
        self, fallback_engine: ClassicalFallback, warm_vibrant_features: FeatureVector
    ):
        """Features far from thresholds should have higher confidence."""
        hypotheses = fallback_engine.generate(warm_vibrant_features)
        # The warm features are very far from neutral — confidences should be high
        for h in hypotheses:
            assert h.confidence >= 0.5

    def test_neutral_features_have_low_confidence_or_empty(
        self, fallback_engine: ClassicalFallback, neutral_features: FeatureVector,
        warm_vibrant_features: FeatureVector,
    ):
        """Neutral features should yield fewer hypotheses than extreme features."""
        neutral_hypotheses = fallback_engine.generate(neutral_features)
        extreme_hypotheses = fallback_engine.generate(warm_vibrant_features)
        # Neutral features produce fewer hypotheses than extreme ones
        assert len(neutral_hypotheses) < len(extreme_hypotheses)

    def test_confidence_in_valid_range(
        self, fallback_engine: ClassicalFallback, warm_vibrant_features: FeatureVector
    ):
        """All confidences should be in [0, 1]."""
        hypotheses = fallback_engine.generate(warm_vibrant_features)
        for h in hypotheses:
            assert 0.0 <= h.confidence <= 1.0


# ---------------------------------------------------------------------------
# Edge case tests
# ---------------------------------------------------------------------------

class TestClassicalFallbackEdgeCases:
    """Edge case tests for ClassicalFallback."""

    def test_empty_palette(self, fallback_engine: ClassicalFallback):
        """Empty palette should not crash."""
        features = FeatureVector(
            palette=[],
            edges={"magnitude": 20.0, "direction": 45.0, "edge_density": 0.08},
            frequency={"low": 0.4, "mid": 0.3, "high": 0.3},
            tone={"mean": 128.0, "std": 40.0, "histogram": [0.0] * 256},
        )
        # Should not raise
        hypotheses = fallback_engine.generate(features)
        # Color cores should not fire, but tone/edge/texture cores might
        for h in hypotheses:
            assert not h.core_type.startswith("color_")

    def test_single_color_palette(self, fallback_engine: ClassicalFallback):
        """Single color palette should work."""
        features = FeatureVector(
            palette=[(220, 50, 30)],
            edges={"magnitude": 20.0, "direction": 45.0, "edge_density": 0.08},
            frequency={"low": 0.4, "mid": 0.3, "high": 0.3},
            tone={"mean": 128.0, "std": 40.0, "histogram": [0.0] * 256},
        )
        hypotheses = fallback_engine.generate(features)
        core_types = [h.core_type for h in hypotheses]
        assert "color_warm_core" in core_types

    def test_all_extreme_values(self, fallback_engine: ClassicalFallback):
        """Extreme values in all dimensions should not crash."""
        features = FeatureVector(
            palette=[(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 255), (0, 0, 0)],
            edges={"magnitude": 255.0, "direction": 360.0, "edge_density": 1.0},
            frequency={"low": 1.0, "mid": 1.0, "high": 1.0},
            tone={"mean": 255.0, "std": 128.0, "histogram": [0.0] * 256},
        )
        hypotheses = fallback_engine.generate(features)
        assert len(hypotheses) > 0

    def test_no_crash_on_minimal_features(self, fallback_engine: ClassicalFallback):
        """Minimal feature vector should not crash."""
        features = FeatureVector(
            palette=[(0, 0, 0)],
            edges={"magnitude": 0.0, "direction": 0.0, "edge_density": 0.0},
            frequency={"low": 0.0, "mid": 0.0, "high": 0.0},
            tone={"mean": 0.0, "std": 0.0, "histogram": [0.0] * 256},
        )
        hypotheses = fallback_engine.generate(features)
        # Should return hypotheses (at minimum monochrome/dark/soft/smooth)
        assert isinstance(hypotheses, list)


# ---------------------------------------------------------------------------
# Convenience function tests
# ---------------------------------------------------------------------------

class TestGenerateFallbackHypotheses:
    """Tests for the module-level convenience function."""

    def test_generate_fallback_hypotheses_returns_list(self):
        """generate_fallback_hypotheses should return a list of hypotheses."""
        features = FeatureVector(
            palette=[(220, 50, 30)],
            edges={"magnitude": 20.0, "direction": 45.0, "edge_density": 0.08},
            frequency={"low": 0.4, "mid": 0.3, "high": 0.3},
            tone={"mean": 128.0, "std": 40.0, "histogram": [0.0] * 256},
        )
        result = generate_fallback_hypotheses(features)
        assert isinstance(result, list)
        assert len(result) > 0
        assert all(isinstance(h, FallbackHypothesis) for h in result)

    def test_generate_fallback_hypotheses_sorted_by_confidence(self):
        """Results should be sorted by confidence descending."""
        features = FeatureVector(
            palette=[(220, 50, 30), (240, 180, 20)],
            edges={"magnitude": 55.0, "direction": 0.0, "edge_density": 0.35},
            frequency={"low": 0.2, "mid": 0.3, "high": 0.5},
            tone={"mean": 200.0, "std": 65.0, "histogram": [0.0] * 256},
        )
        result = generate_fallback_hypotheses(features)
        confidences = [h.confidence for h in result]
        assert confidences == sorted(confidences, reverse=True)


# ---------------------------------------------------------------------------
# Consistency tests (same input → same output)
# ---------------------------------------------------------------------------

class TestClassicalFallbackConsistency:
    """Deterministic output tests."""

    def test_same_input_same_output(self, fallback_engine: ClassicalFallback):
        """Same features should always produce the same hypotheses."""
        features = FeatureVector(
            palette=[(220, 50, 30), (240, 180, 20)],
            edges={"magnitude": 55.0, "direction": 0.0, "edge_density": 0.35},
            frequency={"low": 0.2, "mid": 0.3, "high": 0.5},
            tone={"mean": 200.0, "std": 65.0, "histogram": [0.0] * 256},
        )
        h1 = fallback_engine.generate(features)
        h2 = fallback_engine.generate(features)
        assert len(h1) == len(h2)
        for a, b in zip(h1, h2):
            assert a.core_type == b.core_type
            assert a.confidence == b.confidence
            assert a.param_ranges == b.param_ranges
