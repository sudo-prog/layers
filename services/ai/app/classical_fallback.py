"""Classical fallback: rule-based hypothesis generation when the VLM is unavailable.

This module provides a deterministic, rule-based mapping from a
:class:`~app.models.FeatureVector` to candidate design cores with parameter
ranges.  It mirrors the heuristics already present in
:class:`app.hypothesis.RulesEngine` but adds *parameter ranges* (min/max
bounds for each tunable parameter) so that downstream optimizers (CMA-ES)
can refine without a VLM.

Design principles:
  * **Deterministic** — same input always produces the same output.
  * **Dependency-light** — depends only on numpy and pydantic.
  * **Fallback-grade** — confidence is conservative (capped at 0.85) since
    no learned model is backing the predictions.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np

from app.models import FeatureVector
from app.hypothesis import _rgb_to_hsv, _classify_hue, _palette_dominant_colour


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------


@dataclass
class FallbackHypothesis:
    """A rule-based hypothesis with parameter ranges.

    Attributes:
        core_type: The kind of visual core (e.g. ``"color_warm_core"``).
        param_ranges: Dict mapping parameter names to ``[min, max]`` ranges.
        confidence: A score in ``[0, 1]`` indicating how strongly the rule
            believes the core matches the feature vector.
        reasoning: A short human-readable explanation of *why* this hypothesis
            was generated.
    """

    core_type: str
    param_ranges: dict[str, list[float]] = field(default_factory=dict)
    confidence: float = 0.0
    reasoning: str = ""


# ---------------------------------------------------------------------------
# Confidence cap for fallback hypotheses
# ---------------------------------------------------------------------------

_MAX_FALLBACK_CONFIDENCE = 0.85


def _clamp_confidence(value: float) -> float:
    """Clamp a confidence value to ``[0, _MAX_FALLBACK_CONFIDENCE]``."""
    return max(0.0, min(_MAX_FALLBACK_CONFIDENCE, value))


# ---------------------------------------------------------------------------
# Rule helpers
# ---------------------------------------------------------------------------


def _avg_saturation(palette: list[tuple[int, int, int]]) -> float:
    """Return the average HSV saturation across the palette."""
    if not palette:
        return 0.0
    sats = [_rgb_to_hsv(*c)[1] for c in palette]
    return float(np.mean(sats))


def _max_saturation(palette: list[tuple[int, int, int]]) -> float:
    """Return the maximum HSV saturation across the palette."""
    if not palette:
        return 0.0
    return max(_rgb_to_hsv(*c)[1] for c in palette)


def _dominant_hue(palette: list[tuple[int, int, int]]) -> float:
    """Return the hue (degrees) of the first (most frequent) palette colour."""
    if not palette:
        return 0.0
    return _rgb_to_hsv(*palette[0])[0]


def _hue_distance(h1: float, h2: float) -> float:
    """Angular distance between two hues in degrees (0–180)."""
    diff = abs(h1 - h2) % 360
    return min(diff, 360 - diff)


# ---------------------------------------------------------------------------
# ClassicalFallback engine
# ---------------------------------------------------------------------------


class ClassicalFallback:
    """Rule-based hypothesis generator with parameter ranges.

    Each rule inspects a specific aspect of the :class:`FeatureVector` and,
    if the aspect matches a threshold pattern, produces a
    :class:`FallbackHypothesis` with confidence and parameter bounds.

    The rules are intentionally simple heuristics — they serve as a fallback
    when the VLM is down and are not a replacement for learned models.
    """

    def __init__(self, max_confidence: float = _MAX_FALLBACK_CONFIDENCE) -> None:
        self.max_confidence = max_confidence

    # ------------------------------------------------------------------ public

    def generate(self, features: FeatureVector) -> list[FallbackHypothesis]:
        """Run all rules against *features* and return matching hypotheses.

        Results are sorted by confidence descending.  A feature vector that
        matches no rules returns an empty list.
        """
        hypotheses: list[FallbackHypothesis] = []
        rules = [
            self._rule_color_warm,
            self._rule_color_cool,
            self._rule_color_vibrant,
            self._rule_color_muted,
            self._rule_monochrome,
            self._rule_high_contrast,
            self._rule_low_contrast,
            self._rule_edge_geometric,
            self._rule_edge_soft,
            self._rule_edge_directional,
            self._rule_texture_fine,
            self._rule_texture_smooth,
            self._rule_tone_bright,
            self._rule_tone_dark,
        ]
        for rule in rules:
            result = rule(features)
            if result is not None:
                hypotheses.append(result)
        hypotheses.sort(key=lambda h: h.confidence, reverse=True)
        return hypotheses

    # ------------------------------------------------------------------ color rules

    def _rule_color_warm(self, features: FeatureVector) -> FallbackHypothesis | None:
        """Warm palette (red/orange/yellow dominant) → color_warm_core."""
        if not features.palette:
            return None
        hue = _dominant_hue(features.palette)
        # Warm hues: 0–75 degrees
        if hue <= 75.0:
            sat = _avg_saturation(features.palette)
            # Confidence scales with saturation (more saturated = more confident)
            conf = _clamp_confidence(0.5 + sat * 0.3)
            return FallbackHypothesis(
                core_type="color_warm_core",
                param_ranges={
                    "hue_range": [0.0, 75.0],
                    "saturation_range": [max(0.3, sat - 0.2), 1.0],
                    "blend_opacity": [0.3, 0.9],
                },
                confidence=conf,
                reasoning=f"Dominant hue={hue:.1f}° (warm range 0–75°), "
                f"avg saturation={sat:.2f}.",
            )
        return None

    def _rule_color_cool(self, features: FeatureVector) -> FallbackHypothesis | None:
        """Cool palette (blue/cyan/magenta dominant) → color_cool_core."""
        if not features.palette:
            return None
        hue = _dominant_hue(features.palette)
        # Cool hues: 165–330 degrees
        if 165.0 <= hue <= 330.0:
            sat = _avg_saturation(features.palette)
            conf = _clamp_confidence(0.5 + sat * 0.3)
            return FallbackHypothesis(
                core_type="color_cool_core",
                param_ranges={
                    "hue_range": [165.0, 330.0],
                    "saturation_range": [max(0.3, sat - 0.2), 1.0],
                    "blend_opacity": [0.3, 0.9],
                },
                confidence=conf,
                reasoning=f"Dominant hue={hue:.1f}° (cool range 165–330°), "
                f"avg saturation={sat:.2f}.",
            )
        return None

    def _rule_color_vibrant(self, features: FeatureVector) -> FallbackHypothesis | None:
        """High average saturation → color_vibrant_core."""
        if not features.palette:
            return None
        avg_sat = _avg_saturation(features.palette)
        if avg_sat > 0.5:
            conf = _clamp_confidence(0.4 + avg_sat * 0.4)
            return FallbackHypothesis(
                core_type="color_vibrant_core",
                param_ranges={
                    "saturation_range": [0.5, 1.0],
                    "intensity": [0.6, 1.0],
                    "blend_opacity": [0.4, 0.9],
                },
                confidence=conf,
                reasoning=f"Average saturation={avg_sat:.3f} (> 0.5), "
                "indicating vibrant colours.",
            )
        return None

    def _rule_color_muted(self, features: FeatureVector) -> FallbackHypothesis | None:
        """Moderate-to-low saturation → color_muted_core."""
        if not features.palette:
            return None
        avg_sat = _avg_saturation(features.palette)
        if 0.15 < avg_sat <= 0.5:
            conf = _clamp_confidence(0.3 + (0.5 - avg_sat) * 0.4)
            return FallbackHypothesis(
                core_type="color_muted_core",
                param_ranges={
                    "saturation_range": [0.15, 0.5],
                    "intensity": [0.2, 0.6],
                    "blend_opacity": [0.2, 0.6],
                },
                confidence=conf,
                reasoning=f"Average saturation={avg_sat:.3f} (muted range).",
            )
        return None

    def _rule_monochrome(self, features: FeatureVector) -> FallbackHypothesis | None:
        """Very low max saturation → color_monochrome_core."""
        if not features.palette:
            return None
        max_sat = _max_saturation(features.palette)
        if max_sat < 0.15:
            conf = _clamp_confidence(0.6 + (0.15 - max_sat) * 2.0)
            grey = _palette_dominant_colour(features.palette)
            return FallbackHypothesis(
                core_type="color_monochrome_core",
                param_ranges={
                    "brightness_range": [0.2, 0.8],
                    "contrast_range": [0.1, 0.4],
                },
                confidence=conf,
                reasoning=f"Max saturation={max_sat:.3f} (< 0.15), "
                "indicating monochrome aesthetic.",
            )
        return None

    # ------------------------------------------------------------------ tone rules

    def _rule_high_contrast(self, features: FeatureVector) -> FallbackHypothesis | None:
        """High tone std → tone_high_contrast_core."""
        std = features.tone.get("std", 0.0)
        if std > 65.0:
            conf = _clamp_confidence(0.4 + (std - 65.0) / 100.0)
            return FallbackHypothesis(
                core_type="tone_high_contrast_core",
                param_ranges={
                    "contrast_range": [0.5, 1.0],
                    "shadow_clip": [0.0, 0.3],
                    "highlight_boost": [0.5, 1.0],
                },
                confidence=conf,
                reasoning=f"Tone std={std:.2f} (> 70), high contrast.",
            )
        return None

    def _rule_low_contrast(self, features: FeatureVector) -> FallbackHypothesis | None:
        """Low tone std → tone_low_contrast_core."""
        std = features.tone.get("std", 0.0)
        if std < 30.0:
            conf = _clamp_confidence(0.4 + (30.0 - std) / 60.0)
            return FallbackHypothesis(
                core_type="tone_low_contrast_core",
                param_ranges={
                    "contrast_range": [0.1, 0.4],
                    "shadow_lift": [0.2, 0.6],
                    "highlight_compress": [0.2, 0.5],
                },
                confidence=conf,
                reasoning=f"Tone std={std:.2f} (< 30), low contrast.",
            )
        return None

    # ------------------------------------------------------------------ edge rules

    def _rule_edge_geometric(self, features: FeatureVector) -> FallbackHypothesis | None:
        """High edge density + magnitude → edge_geometric_core."""
        density = features.edges.get("edge_density", 0.0)
        magnitude = features.edges.get("magnitude", 0.0)
        if density > 0.15 and magnitude > 30.0:
            conf = _clamp_confidence(0.5 + min(density, magnitude / 100.0) * 0.3)
            return FallbackHypothesis(
                core_type="edge_geometric_core",
                param_ranges={
                    "edge_density_range": [0.15, min(1.0, density + 0.1)],
                    "magnitude_range": [30.0, min(100.0, magnitude + 20.0)],
                    "threshold": [0.05, 0.3],
                },
                confidence=conf,
                reasoning=f"Edge density={density:.3f}, magnitude={magnitude:.2f} — "
                "sharp geometric structure.",
            )
        return None

    def _rule_edge_soft(self, features: FeatureVector) -> FallbackHypothesis | None:
        """Low edge density + magnitude → edge_soft_core."""
        density = features.edges.get("edge_density", 0.0)
        magnitude = features.edges.get("magnitude", 0.0)
        if density < 0.05 and magnitude < 15.0:
            conf = _clamp_confidence(0.6 + (0.05 - density) * 2.0)
            return FallbackHypothesis(
                core_type="edge_soft_core",
                param_ranges={
                    "blur_radius": [1.0, 8.0],
                    "softness": [0.5, 1.0],
                    "falloff": [0.3, 0.8],
                },
                confidence=conf,
                reasoning=f"Edge density={density:.3f}, magnitude={magnitude:.2f} — "
                "soft organic aesthetic.",
            )
        return None

    def _rule_edge_directional(self, features: FeatureVector) -> FallbackHypothesis | None:
        """Directional edges (near 0° or 90°) → edge_directional_core."""
        direction = features.edges.get("direction", 0.0)
        magnitude = features.edges.get("magnitude", 0.0)
        density = features.edges.get("edge_density", 0.0)
        abs_dir = abs(direction) % 90
        if magnitude > 40.0 and density > 0.1 and abs(abs_dir - 0) < 10:
            conf = _clamp_confidence(0.5 + magnitude / 200.0)
            return FallbackHypothesis(
                core_type="edge_directional_core",
                param_ranges={
                    "angle_range": [0.0, 90.0],
                    "strength": [0.4, 1.0],
                    "wavelength": [2.0, 20.0],
                },
                confidence=conf,
                reasoning=f"Directional edges: angle={direction:.1f}°, "
                f"magnitude={magnitude:.2f}.",
            )
        return None

    # ------------------------------------------------------------------ texture rules

    def _rule_texture_fine(self, features: FeatureVector) -> FallbackHypothesis | None:
        """High frequency dominance → texture_fine_core."""
        high = features.frequency.get("high", 0.0)
        if high > 0.4:
            conf = _clamp_confidence(0.4 + high * 0.4)
            return FallbackHypothesis(
                core_type="texture_fine_core",
                param_ranges={
                    "grain_intensity": [0.2, 0.8],
                    "grain_size": [0.5, 3.0],
                    "frequency_range": [0.4, 1.0],
                },
                confidence=conf,
                reasoning=f"High-frequency ratio={high:.3f} (> 0.4).",
            )
        return None

    def _rule_texture_smooth(self, features: FeatureVector) -> FallbackHypothesis | None:
        """Low frequency dominance → texture_smooth_core."""
        low = features.frequency.get("low", 0.0)
        if low > 0.5:
            conf = _clamp_confidence(0.4 + low * 0.3)
            return FallbackHypothesis(
                core_type="texture_smooth_core",
                param_ranges={
                    "gradient_smoothness": [0.5, 1.0],
                    "noise_suppression": [0.3, 0.8],
                },
                confidence=conf,
                reasoning=f"Low-frequency ratio={low:.3f} (> 0.5).",
            )
        return None

    # ------------------------------------------------------------------ tone mean rules

    def _rule_tone_bright(self, features: FeatureVector) -> FallbackHypothesis | None:
        """High tone mean → tone_bright_core."""
        mean = features.tone.get("mean", 0.0)
        if mean > 180.0:
            conf = _clamp_confidence(0.4 + (mean - 180.0) / 75.0 * 0.4)
            return FallbackHypothesis(
                core_type="tone_bright_core",
                param_ranges={
                    "tone_mean_range": [180.0, 255.0],
                    "exposure_boost": [0.2, 0.6],
                    "highlight_recovery": [0.3, 0.7],
                },
                confidence=conf,
                reasoning=f"Tone mean={mean:.2f} (> 180), bright aesthetic.",
            )
        return None

    def _rule_tone_dark(self, features: FeatureVector) -> FallbackHypothesis | None:
        """Low tone mean → tone_dark_core."""
        mean = features.tone.get("mean", 0.0)
        if mean < 70.0:
            conf = _clamp_confidence(0.4 + (70.0 - mean) / 70.0 * 0.4)
            return FallbackHypothesis(
                core_type="tone_dark_core",
                param_ranges={
                    "tone_mean_range": [0.0, 70.0],
                    "shadow_boost": [0.2, 0.6],
                    "exposure_reduction": [0.3, 0.7],
                },
                confidence=conf,
                reasoning=f"Tone mean={mean:.2f} (< 70), dark aesthetic.",
            )
        return None


# ---------------------------------------------------------------------------
# Convenience function
# ---------------------------------------------------------------------------


def generate_fallback_hypotheses(features: FeatureVector) -> list[FallbackHypothesis]:
    """Convenience wrapper around :class:`ClassicalFallback`.

    This is the primary public entry point for the classical fallback path.
    """
    engine = ClassicalFallback()
    return engine.generate(features)


__all__ = [
    "FallbackHypothesis",
    "ClassicalFallback",
    "generate_fallback_hypotheses",
    "_MAX_FALLBACK_CONFIDENCE",
]
