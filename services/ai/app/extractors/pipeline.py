"""Preprocessing and feature-extraction pipeline orchestration."""

from __future__ import annotations

from typing import Optional

from PIL import Image

from app.extractors.clip import extract_clip
from app.extractors.edges import extract_edges
from app.extractors.frequency import extract_frequency
from app.extractors.palette import extract_palette
from app.extractors.tone import extract_tone
from app.models import FeatureVector

# Registry of available extractors.  Each maps a name to a callable taking
# ``(image: Image.Image)`` and returning the extractor output.
_EXTRACTORS = {
    "palette": lambda img: extract_palette(img, n_colors=5),
    "edges": extract_edges,
    "frequency": extract_frequency,
    "tone": extract_tone,
    "clip": extract_clip,
}


def preprocess_image(path: str, max_size: int = 1024) -> Image.Image:
    """Load *path* from disk and resize maintaining aspect ratio.

    The longer side is capped at ``max_size`` pixels.  The image is always
    converted to ``RGB``.
    """
    image = Image.open(path)
    if image.mode != "RGB":
        image = image.convert("RGB")

    ratio = min(max_size / image.width, max_size / image.height, 1.0)
    if ratio < 1.0:
        new_w = max(1, int(image.width * ratio))
        new_h = max(1, int(image.height * ratio))
        image = image.resize((new_w, new_h), Image.Resampling.LANCZOS)

    return image


def extract_features(
    image: Image.Image, extractors: Optional[list[str]] = None
) -> FeatureVector:
    """Run the requested *extractors* on *image* and assemble a
    :class:`~app.models.FeatureVector`.

    When *extractors* is ``None`` or empty, every available extractor is run.
    """
    if extractors is None or not extractors:
        names = list(_EXTRACTORS.keys())
    else:
        names = extractors

    results: dict = {}
    for name in names:
        if name not in _EXTRACTORS:
            raise ValueError(f"Unknown extractor: {name!r}")
        results[name] = _EXTRACTORS[name](image)

    return FeatureVector(
        palette=results.get("palette", []),
        edges=results.get("edges", {"magnitude": 0.0, "direction": 0.0, "edge_density": 0.0}),
        frequency=results.get("frequency", {"low": 0.0, "mid": 0.0, "high": 0.0}),
        tone=results.get(
            "tone",
            {"mean": 0.0, "std": 0.0, "histogram": [0.0] * 256},
        ),
        clip_embedding=results.get("clip"),
    )


def build_pyramid(image: Image.Image, levels: int = 3) -> list[Image.Image]:
    """Build a Gaussian-style image pyramid with *levels* entries.

    The base (level 0) is the original image; each subsequent level is
    downsampled by a factor of 2 using a Lanczos filter.
    """
    if levels < 1:
        raise ValueError("levels must be >= 1")

    pyramid: list[Image.Image] = [image]
    current = image
    for _ in range(levels - 1):
        new_w = max(1, current.width // 2)
        new_h = max(1, current.height // 2)
        current = current.resize((new_w, new_h), Image.Resampling.LANCZOS)
        pyramid.append(current)
    return pyramid


def extract_features_multiscale(
    image: Image.Image, extractors: Optional[list[str]] = None, levels: int = 3
) -> list[FeatureVector]:
    """Extract features from *image* at multiple scales.

    A Gaussian-style pyramid with *levels* entries is built from *image*
    (see :func:`build_pyramid`).  The same set of *extractors* is then run
    on every pyramid level, producing one :class:`~app.models.FeatureVector`
    per level.

    Args:
        image: The source image (already preprocessed).
        extractors: Optional list of extractor names to run.  When ``None``
            or empty, all registered extractors are used (same semantics
            as :func:`extract_features`).
        levels: Number of pyramid levels (including the base level).

    Returns:
        A list of :class:`~app.models.FeatureVector` objects with one entry
        per pyramid level (index 0 is the full-resolution base).
    """
    pyramid = build_pyramid(image, levels=levels)
    return [extract_features(level, extractors) for level in pyramid]
