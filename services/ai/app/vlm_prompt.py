"""VLM prompt construction and output schema for Phase 1.3.

This module takes a :class:`~app.models.FeatureVector` and a list of
:class:`~app.hypothesis.CandidateCore` objects and produces a structured
prompt that a Vision-Language Model (VLM) can use to *validate* and *refine*
the candidate cores.

The prompt is rendered as plain text (no templating engine dependency) and the
expected VLM response is described by the :class:`VLMRefinedOutput` Pydantic
model, which can be serialised to a JSON schema via
``VLMRefinedOutput.model_json_schema()`` for runtime validation.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.models import FeatureVector
from app.hypothesis import CandidateCore


class RefinedCandidate(BaseModel):
    """A single candidate core as refined by the VLM.

    Attributes:
        core_type: The (possibly modified) core type identifier.
        parameters: Refined parameters dict.
        confidence: VLM-assessed confidence in ``[0, 1]``.
        reasoning: VLM-provided justification for the refined candidate.
        accepted: Whether the VLM accepted this candidate (``True``/``False``).
        vlm_notes: Optional free-form notes from the VLM.
    """

    core_type: str
    parameters: dict[str, Any] = Field(default_factory=dict)
    confidence: float = Field(..., ge=0.0, le=1.0)
    reasoning: str
    accepted: bool = True
    vlm_notes: str | None = None


class VLMRefinedOutput(BaseModel):
    """Top-level schema for the VLM response.

    The VLM is instructed to return exactly this JSON structure.  After
    generation the output can be validated with::

        VLMRefinedOutput.model_validate_json(vlm_response_text)
    """

    refined_candidates: list[RefinedCandidate]
    overall_confidence: float = Field(..., ge=0.0, le=1.0)
    vlm_summary: str
    image_description: str | None = None


def _summarise_features(features: FeatureVector) -> str:
    """Render a human-readable summary of the feature vector for the prompt."""
    dominant_colour = features.palette[0] if features.palette else (0, 0, 0)
    n_colours = len(features.palette)
    edges = features.edges or {}
    freq = features.frequency or {}
    tone = features.tone or {}

    lines = [
        "Feature Summary:",
        f"  - Palette: {n_colours} dominant colour(s); dominant RGB = {dominant_colour}",
        f"  - Edges: magnitude={edges.get('magnitude', 0):.2f}, "
        f"direction={edges.get('direction', 0):.1f}°, "
        f"edge_density={edges.get('edge_density', 0):.3f}",
        f"  - Frequency: low={freq.get('low', 0):.3f}, "
        f"mid={freq.get('mid', 0):.3f}, high={freq.get('high', 0):.3f}",
        f"  - Tone: mean={tone.get('mean', 0):.2f}, std={tone.get('std', 0):.2f}",
    ]
    if features.clip_embedding:
        lines.append(f"  - CLIP embedding: {len(features.clip_embedding)} dims (present)")
    else:
        lines.append("  - CLIP embedding: not available")
    return "\n".join(lines)


def _format_candidate(idx: int, candidate: CandidateCore) -> str:
    """Format a single candidate core for inclusion in the prompt."""
    params_str = ", ".join(f"{k}={v}" for k, v in candidate.parameters.items())
    return (
        f"  Candidate {idx}: core_type='{candidate.core_type}', "
        f"confidence={candidate.confidence:.2f}, parameters=[{params_str}], "
        f"reasoning='{candidate.reasoning}'"
    )


def generate_vlm_prompt(
    features: FeatureVector, candidates: list[CandidateCore]
) -> str:
    """Build a structured VLM prompt string.

    The prompt asks the VLM to:
      1. Describe what it observes in the image based on the feature summary.
      2. Validate each candidate core (accept / reject / modify).
      3. Return results in the exact JSON schema defined by
         :class:`VLMRefinedOutput`.

    Args:
        features: The :class:`FeatureVector` for the image being analysed.
        candidates: The list of :class:`CandidateCore` objects to validate.

    Returns:
        A multi-line string prompt ready to send to a VLM.
    """
    feature_summary = _summarise_features(features)
    candidate_lines = "\n".join(
        _format_candidate(i + 1, c) for i, c in enumerate(candidates)
    )

    prompt = f"""\
You are a design-visualisation assistant specialised in design systems and
visual aesthetics. You have been given an *image* (provided separately as a
vision input) and a set of *automatically generated hypothesis candidates*
derived from a feature-extraction pipeline.  Your job is to examine the image,
cross-reference the feature summary, and either **approve**, **reject**, or
**refine** each candidate.

{feature_summary}

Automatically-generated candidate cores:
{candidate_lines}

---

INSTRUCTIONS:
1. Analyse the image visually.  Compare what you see with the feature summary
   above.
2. For each candidate core:
   a. Decide whether the candidate is a **good fit** for what you observe in
      the image.
   b. If the candidate is inaccurate, propose a **refinement** (modify
      core_type, parameters, confidence, or reasoning).
   c. If the candidate is clearly wrong, mark it `accepted=false` and explain
      why.
3. Optionally provide an overall `image_description` of the visual content.

---

OUTPUT FORMAT — You MUST return a single JSON object that validates against
the following JSON schema:

{{
  "type": "object",
  "required": ["refined_candidates", "overall_confidence", "vlm_summary"],
  "properties": {{
    "refined_candidates": {{
      "type": "array",
      "items": {{
        "type": "object",
        "required": ["core_type", "parameters", "confidence", "reasoning", "accepted"],
        "properties": {{
          "core_type": {{"type": "string"}},
          "parameters": {{"type": "object"}},
          "confidence": {{"type": "number", "minimum": 0, "maximum": 1}},
          "reasoning": {{"type": "string"}},
          "accepted": {{"type": "boolean"}},
          "vlm_notes": {{"type": ["string", "null"]}}
        }}
      }}
    }},
    "overall_confidence": {{"type": "number", "minimum": 0, "maximum": 1}},
    "vlm_summary": {{"type": "string"}},
    "image_description": {{"type": ["string", "null"]}}
  }}
}}

Return ONLY valid JSON — no markdown code fences, no prose before or after
the JSON object.
"""
    return prompt


def vlm_output_schema() -> dict[str, Any]:
    """Return the JSON schema for :class:`VLMRefinedOutput` as a plain dict.

    Useful for sending to a VLM API that accepts a schema parameter (e.g.
    OpenAI's ``response_format`` or Anthropic's JSON mode).
    """
    return VLMRefinedOutput.model_json_schema()


__all__ = [
    "RefinedCandidate",
    "VLMRefinedOutput",
    "generate_vlm_prompt",
    "vlm_output_schema",
]
