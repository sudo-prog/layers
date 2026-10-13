"""Pydantic models for the feature extraction pipeline."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class FeatureVector(BaseModel):
    """A single feature vector extracted from one image."""

    palette: list[tuple[int, int, int]] = Field(
        ..., description="Dominant RGB colors sorted by frequency."
    )
    edges: dict = Field(
        ...,
        description="Edge statistics: magnitude, direction, edge_density.",
    )
    frequency: dict = Field(
        ...,
        description="Frequency energy ratios: low, mid, high.",
    )
    tone: dict = Field(
        ...,
        description="Tone statistics: mean, std, histogram (256 normalized bins).",
    )
    clip_embedding: Optional[list[float]] = Field(
        None,
        description="512-dim CLIP embedding (optional; placeholder when unavailable).",
    )


class ExtractRequest(BaseModel):
    """Request payload for batch feature extraction."""

    image_paths: list[str] = Field(..., description="Paths to images to process.")
    extractors: list[str] = Field(
        default_factory=list,
        description=(
            "Extractors to run (default: all). Options: palette, edges, "
            "frequency, tone, clip."
        ),
    )

    @classmethod
    def all_extractors(cls) -> list[str]:
        """Return the default extractor list."""
        return ["palette", "edges", "frequency", "tone", "clip"]


class ExtractResponse(BaseModel):
    """Response payload for batch feature extraction."""

    features: list[FeatureVector] = Field(..., description="Per-image feature vectors.")
    consistency: dict = Field(
        ...,
        description="Consistency report: cross_reference_scores, outliers.",
    )


class JobResponse(BaseModel):
    """Asynchronous job status response."""

    job_id: str = Field(..., description="Unique job identifier.")
    status: str = Field(
        ..., description="Job status: pending, processing, completed, failed."
    )
    result: Optional[ExtractResponse] = Field(
        None, description="Final result, present when status is completed."
    )
    error: Optional[str] = Field(
        None, description="Error message if the job failed."
    )
