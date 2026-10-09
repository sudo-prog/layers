"""Hypothesis generation: rule-based mapping from :class:`FeatureVector` to
candidate design *cores*.

Each core represents a reusable, parameterised visual operation (e.g. a colour
overlay, an edge-detect shader, a noise texture).  The rules below translate
low-level image statistics into candidate cores that a VLM can later validate
and refine.

The module is intentionally dependency-light: it depends only on *numpy* and
*pydantic*, so it can be unit-tested without an HTTP server.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
from pydantic import BaseModel, Field

from app.models import FeatureVector


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------


class CandidateCore(BaseModel):
    """A candidate core proposed by the rules engine.

    Attributes:
        core_type: The kind of visual core (e.g. ``"color_overlay"``).
        parameters: Arbitrary JSON-serialisable parameters describing *how* the
            core should be applied.
        confidence: A score in ``[0, 1]`` indicating how strongly the rule
            believes the core matches the feature vector.
        reasoning: A short human-readable explanation of *why* this candidate
            was generated.
    """

    core_type: str = Field(..., description="The kind of core (e.g. color_overlay).")
    parameters: dict[str, Any] = Field(
        default_factory=dict,
        description="Parameters describing how the core should be applied.",
    )
    confidence: float = Field(
        ..., ge=0.0, le=1.0, description="Confidence score in [0, 1]."
    )
    reasoning: str = Field(..., description="Why this candidate was generated.")


# ---------------------------------------------------------------------------
# Palette helpers
# ---------------------------------------------------------------------------

# Approximate HSV hue bands (degrees) used to classify a palette colour.
# Each tuple is (name, lower_deg, upper_deg).
_HUE_BANDS: list[tuple[str, float, float]] = [
    ("red", 0, 15),
    ("orange", 15, 45),
    ("yellow", 45, 75),
    ("green", 75, 165),
    ("cyan", 165, 210),
    ("blue", 210, 285),
    ("magenta", 285, 330),
    ("purple", 330, 360),
]


def _rgb_to_hsv(r: int, g: int, b: int) -> tuple[float, float, float]:
    """Convert an 8-bit RGB triplet to HSV (h in degrees, s/v in [0, 1])."""
    r_n, g_n, b_n = r / 255.0, g / 255.0, b / 255.0
    mx = max(r_n, g_n, b_n)
    mn = min(r_n, g_n, b_n)
    diff = mx - mn
    if diff == 0:
        h = 0.0
    elif mx == r_n:
        h = (60 * ((g_n - b_n) / diff) + 360) % 360
    elif mx == g_n:
        h = (60 * ((b_n - r_n) / diff) + 120) % 360
    else:
        h = (60 * ((r_n - g_n) / diff) + 240) % 360
    s = 0.0 if mx == 0 else diff / mx
    v = mx
    return h, s, v


def _classify_hue(h: float) -> str:
    """Return the hue-band name for a given hue angle in degrees."""
    for name, lo, hi in _HUE_BANDS:
        if lo <= h < hi:
            return name
    return _HUE_BANDS[0][0]  # default to red if exactly 360


def _palette_hue_summary(palette: list[tuple[int, int, int]]) -> dict[str, int]:
    """Return a ``{hue_name: weight}`` summary of the palette.

    The weight is the *index position* of the colour in the sorted-by-frequency
    palette, so earlier (more frequent) colours contribute more weight.  This is
    a rough proxy for "how dominant this hue is".
    """
    summary: dict[str, int] = {}
    for idx, colour in enumerate(palette):
        h, _s, _v = _rgb_to_hsv(*colour)
        name = _classify_hue(h)
        summary[name] = summary.get(name, 0) + (len(palette) - idx)
    return summary


# ---------------------------------------------------------------------------
# Rules engine
# ---------------------------------------------------------------------------

# Confidence scaling factor (1.0 = full confidence from a single rule).
_RULE_CONFIDENCE = 0.8


def _palette_dominant_colour(palette: list[tuple[int, int, int]]) -> tuple[int, int, int]:
    if palette:
        return palette[0]
    return (0, 0, 0)


class RulesEngine:
    """Apply rule-based mapping from :class:`FeatureVector` to candidate cores.

    The engine holds no mutable state — every call to :meth:`generate_candidates`
    is independent.
    """

    def __init__(self, confidence: float = _RULE_CONFIDENCE) -> None:
        self.confidence = confidence

    # ------------------------------------------------------------------ rules

    def _rule_color_warm(self, features: FeatureVector) -> CandidateCore | None:
        """Palette dominated by warm hues (red/orange/yellow)."""
        summary = _palette_hue_summary(features.palette)
        warm = summary.get("red", 0) + summary.get("orange", 0) + summary.get("yellow", 0)
        cool = summary.get("blue", 0) + summary.get("cyan", 0) + summary.get("magenta", 0)
        if warm == 0 and cool == 0:
            return None
        if warm > cool:
            colour = _palette_dominant_colour(features.palette)
            return CandidateCore(
                core_type="color_warm_core",
                parameters={"hue": "warm", "rgb": list(colour)},
                confidence=self.confidence,
                reasoning="Palette contains predominantly warm hues (red/orange/yellow), "
                "suggesting warm emotional tonality.",
            )
        return None

    def _rule_color_cool(self, features: FeatureVector) -> CandidateCore | None:
        """Palette dominated by cool hues (blue/cyan/magenta)."""
        summary = _palette_hue_summary(features.palette)
        warm = summary.get("red", 0) + summary.get("orange", 0) + summary.get("yellow", 0)
        cool = summary.get("blue", 0) + summary.get("cyan", 0) + summary.get("magenta", 0)
        if warm == 0 and cool == 0:
            return None
        if cool > warm:
            colour = _palette_dominant_colour(features.palette)
            return CandidateCore(
                core_type="color_cool_core",
                parameters={"hue": "cool", "rgb": list(colour)},
                confidence=self.confidence,
                reasoning="Palette contains predominantly cool hues (blue/cyan/magenta), "
                "suggesting calm / technical / serene tonality.",
            )
        return None

    def _rule_monochrome(self, features: FeatureVector) -> CandidateCore | None:
        """Palette with low saturation throughout (monochrome / grayscale)."""
        max_sat = 0.0
        for colour in features.palette:
            _h, s, _v = _rgb_to_hsv(*colour)
            max_sat = max(max_sat, s)
        if max_sat < 0.15:
            grey = _palette_dominant_colour(features.palette)
            return CandidateCore(
                core_type="color_monochrome_core",
                parameters={"rgb": list(grey), "saturation_max": max_sat},
                confidence=self.confidence,
                reasoning=f"All palette colours have saturation < 0.15 (max={max_sat:.3f}), "
                "indicating a monochrome or grayscale aesthetic.",
            )
        return None

    def _rule_high_contrast(self, features: FeatureVector) -> CandidateCore | None:
        """Tone distribution with high standard deviation → strong contrast."""
        std = features.tone.get("std", 0.0)
        if std > 70.0:
            return CandidateCore(
                core_type="tone_high_contrast_core",
                parameters={"std_threshold": std, "tone_mean": features.tone.get("mean", 0.0)},
                confidence=self.confidence,
                reasoning=f"Tone std={std:.2f} (high), indicating strong tonal contrast "
                "and dynamic range suitable for high-contrast styling.",
            )
        return None

    def _rule_low_contrast(self, features: FeatureVector) -> CandidateCore | None:
        """Tone distribution with low standard deviation → muted / flat contrast."""
        std = features.tone.get("std", 0.0)
        if std < 30.0:
            return CandidateCore(
                core_type="tone_low_contrast_core",
                parameters={"std_threshold": std, "tone_mean": features.tone.get("mean", 0.0)},
                confidence=self.confidence,
                reasoning=f"Tone std={std:.2f} (low), indicating a flat, muted, or "
                "minimal-contrast aesthetic.",
            )
        return None

    def _rule_edge_high(self, features: FeatureVector) -> CandidateCore | None:
        """High edge density and strong gradients → geometric / sharp core."""
        density = features.edges.get("edge_density", 0.0)
        magnitude = features.edges.get("magnitude", 0.0)
        if density > 0.15 and magnitude > 30.0:
            return CandidateCore(
                core_type="edge_geometric_core",
                parameters={
                    "edge_density": density,
                    "magnitude": magnitude,
                    "direction": features.edges.get("direction", 0.0),
                },
                confidence=self.confidence,
                reasoning=f"High edge density ({density:.3f}) and magnitude ({magnitude:.2f}) "
                "suggest sharp, geometric, or architectural structure.",
            )
        return None

    def _rule_edge_low(self, features: FeatureVector) -> CandidateCore | None:
        """Low edge density → soft / organic / blurred aesthetic."""
        density = features.edges.get("edge_density", 0.0)
        magnitude = features.edges.get("magnitude", 0.0)
        if density < 0.05 and magnitude < 15.0:
            return CandidateCore(
                core_type="edge_soft_core",
                parameters={
                    "edge_density": density,
                    "magnitude": magnitude,
                    "direction": features.edges.get("direction", 0.0),
                },
                confidence=self.confidence,
                reasoning=f"Low edge density ({density:.3f}) and magnitude ({magnitude:.2f}) "
                "indicate a soft, organic, or blurred aesthetic with few hard boundaries.",
            )
        return None

    def _rule_texture_high_freq(self, features: FeatureVector) -> CandidateCore | None:
        """Frequency spectrum dominated by high frequencies → fine texture / noise."""
        high = features.frequency.get("high", 0.0)
        if high > 0.4:
            return CandidateCore(
                core_type="texture_fine_core",
                parameters={
                    "high_freq_ratio": high,
                    "low_freq_ratio": features.frequency.get("low", 0.0),
                    "mid_freq_ratio": features.frequency.get("mid", 0.0),
                },
                confidence=self.confidence,
                reasoning=f"High-frequency energy ratio is {high:.3f} (> 0.4), indicating "
                "fine texture, grain, or noise in the image.",
            )
        return None

    def _rule_texture_smooth(self, features: FeatureVector) -> CandidateCore | None:
        """Frequency spectrum dominated by low frequencies → smooth / gradient."""
        low = features.frequency.get("low", 0.0)
        if low > 0.5:
            return CandidateCore(
                core_type="texture_smooth_core",
                parameters={
                    "low_freq_ratio": low,
                    "high_freq_ratio": features.frequency.get("high", 0.0),
                    "mid_freq_ratio": features.frequency.get("mid", 0.0),
                },
                confidence=self.confidence,
                reasoning=f"Low-frequency energy ratio is {low:.3f} (> 0.5), indicating "
                "smooth gradients, soft transitions, or large uniform areas.",
            )
        return None

    def _rule_directional_edges(self, features: FeatureVector) -> CandidateCore | None:
        """Strongly directional edges → linear / striped / structured pattern."""
        direction = features.edges.get("direction", 0.0)
        magnitude = features.edges.get("magnitude", 0.0)
        density = features.edges.get("edge_density", 0.0)
        # Direction near 0 or 90 (or ±180) suggests horizontals/verticals.
        abs_dir = abs(direction) % 90
        if magnitude > 40.0 and density > 0.1 and abs(abs_dir - 0) < 10:
            return CandidateCore(
                core_type="edge_directional_core",
                parameters={
                    "direction": direction,
                    "magnitude": magnitude,
                    "dominant_orientation": "horizontal",
                },
                confidence=self.confidence,
                reasoning=f"Edges are strongly directional (angle={direction:.1f}°, "
                f"magnitude={magnitude:.2f}), suggesting horizontal/vertical structure.",
            )
        return None

    def _rule_bright_tone(self, features: FeatureVector) -> CandidateCore | None:
        """High tone mean → bright / airy aesthetic."""
        mean = features.tone.get("mean", 0.0)
        if mean > 180.0:
            return CandidateCore(
                core_type="tone_bright_core",
                parameters={"mean": mean, "std": features.tone.get("std", 0.0)},
                confidence=self.confidence,
                reasoning=f"Tone mean={mean:.2f} (high), indicating a bright, airy, "
                "high-key aesthetic.",
            )
        return None

    def _rule_dark_tone(self, features: FeatureVector) -> CandidateCore | None:
        """Low tone mean → dark / moody aesthetic."""
        mean = features.tone.get("mean", 0.0)
        if mean < 70.0:
            return CandidateCore(
                core_type="tone_dark_core",
                parameters={"mean": mean, "std": features.tone.get("std", 0.0)},
                confidence=self.confidence,
                reasoning=f"Tone mean={mean:.2f} (low), indicating a dark, moody, "
                "low-key aesthetic.",
            )
        return None

    def _rule_mid_tone_balanced(self, features: FeatureVector) -> CandidateCore | None:
        """Moderate tone mean and moderate std → balanced / neutral tonality."""
        mean = features.tone.get("mean", 0.0)
        std = features.tone.get("std", 0.0)
        if 70.0 <= mean <= 180.0 and 30.0 <= std <= 70.0:
            return CandidateCore(
                core_type="tone_balanced_core",
                parameters={"mean": mean, "std": std},
                confidence=self.confidence,
                reasoning=f"Balanced tonality: mean={mean:.2f}, std={std:.2f}. Neither "
                "extreme highlights nor deep shadows dominate.",
            )
        return None

    def _rule_mixed_frequency(self, features: FeatureVector) -> CandidateCore | None:
        """Energy spread across low and high bands → busy / complex texture."""
        low = features.frequency.get("low", 0.0)
        high = features.frequency.get("high", 0.0)
        mid = features.frequency.get("mid", 0.0)
        if low > 0.2 and high > 0.2 and mid < 0.3:
            return CandidateCore(
                core_type="texture_mixed_complexity_core",
                parameters={
                    "low": low,
                    "mid": mid,
                    "high": high,
                },
                confidence=self.confidence,
                reasoning=f"Mixed frequency profile (low={low:.3f}, high={high:.3f}, "
                "mid={mid:.3f}) suggests complex texture with both smooth and fine detail.",
            )
        return None

    def _rule_color_vibrant(self, features: FeatureVector) -> CandidateCore | None:
        """High average saturation in palette → vibrant / saturated colours."""
        sats = []
        for colour in features.palette:
            _h, s, _v = _rgb_to_hsv(*colour)
            sats.append(s)
        avg_sat = float(np.mean(sats)) if sats else 0.0
        if avg_sat > 0.5:
            colour = _palette_dominant_colour(features.palette)
            return CandidateCore(
                core_type="color_vibrant_core",
                parameters={
                    "avg_saturation": avg_sat,
                    "rgb": list(colour),
                },
                confidence=self.confidence,
                reasoning=f"Average palette saturation={avg_sat:.3f} (> 0.5), indicating "
                "vibrant, saturated colours.",
            )
        return None

    def _rule_color_muted(self, features: FeatureVector) -> CandidateCore | None:
        """Low average saturation in palette → muted / desaturated colours."""
        sats = []
        for colour in features.palette:
            _h, s, _v = _rgb_to_hsv(*colour)
            sats.append(s)
        avg_sat = float(np.mean(sats)) if sats else 0.0
        if 0.15 < avg_sat <= 0.5:
            colour = _palette_dominant_colour(features.palette)
            return CandidateCore(
                core_type="color_muted_core",
                parameters={
                    "avg_saturation": avg_sat,
                    "rgb": list(colour),
                },
                confidence=self.confidence,
                reasoning=f"Average palette saturation={avg_sat:.3f} (muted range), "
                "indicating desaturated or pastel colours.",
            )
        return None

    def _rule_edge_diagonal(self, features: FeatureVector) -> CandidateCore | None:
        """Strong diagonal edge orientation → dynamic / angular composition."""
        direction = features.edges.get("direction", 0.0)
        magnitude = features.edges.get("magnitude", 0.0)
        density = features.edges.get("edge_density", 0.0)
        # Diagonal means direction near 45 or 135 degrees (mod 90 = 45).
        diag_component = abs(abs(direction) % 90 - 45)
        if magnitude > 35.0 and density > 0.1 and diag_component < 15:
            return CandidateCore(
                core_type="edge_diagonal_core",
                parameters={
                    "direction": direction,
                    "magnitude": magnitude,
                    "dominant_orientation": "diagonal",
                },
                confidence=self.confidence,
                reasoning=f"Strong diagonal edge orientation (angle={direction:.1f}°, "
                f"magnitude={magnitude:.2f}) suggests dynamic, angular composition.",
            )
        return None

    # ------------------------------------------------------------------ public

    def generate_candidates(self, features: FeatureVector) -> list[CandidateCore]:
        """Run all rules against *features* and return matching candidates.

        Rules are applied independently and may all fire, producing a list of
        candidate cores.  Each candidate carries its own confidence and
        reasoning.  A feature vector that matches no rules returns an empty
        list.
        """
        rules = [
            self._rule_color_warm,
            self._rule_color_cool,
            self._rule_color_vibrant,
            self._rule_color_muted,
            self._rule_monochrome,
            self._rule_high_contrast,
            self._rule_low_contrast,
            self._rule_edge_high,
            self._rule_edge_low,
            self._rule_edge_diagonal,
            self._rule_directional_edges,
            self._rule_texture_high_freq,
            self._rule_texture_smooth,
            self._rule_mixed_frequency,
            self._rule_bright_tone,
            self._rule_dark_tone,
            self._rule_mid_tone_balanced,
        ]

        candidates: list[CandidateCore] = []
        for rule in rules:
            result = rule(features)
            if result is not None:
                candidates.append(result)
        return candidates


def generate_hypotheses(features: FeatureVector) -> list[CandidateCore]:
    """Convenience wrapper around :class:`RulesEngine`.

    This is the primary public entry point for Phase 1.3.
    """
    engine = RulesEngine()
    return engine.generate_candidates(features)


__all__ = [
    "CandidateCore",
    "RulesEngine",
    "generate_hypotheses",
]
