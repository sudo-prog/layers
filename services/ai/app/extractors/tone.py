"""Tone extraction: luminance statistics and histogram."""

from __future__ import annotations

import numpy as np
from PIL import Image


def extract_tone(image: Image.Image) -> dict:
    """Compute tone statistics from *image*.

    Returns a dict with:
      * ``mean`` - mean luminance.
      * ``std`` - standard deviation of luminance.
      * ``histogram`` - 256-bin normalized luminance histogram.
    """
    if image.mode != "RGB":
        image = image.convert("RGB")
    gray = np.asarray(image.convert("L"), dtype=np.float64)

    mean = float(gray.mean())
    std = float(gray.std())

    # 256-bin histogram over [0, 255], normalized to sum to 1.
    counts, _ = np.histogram(gray, bins=256, range=(0, 256))
    total = counts.sum()
    if total > 0:
        normalized = counts.astype(np.float64) / total
    else:
        normalized = counts.astype(np.float64)
    histogram = [round(float(v), 6) for v in normalized]

    return {
        "mean": mean,
        "std": std,
        "histogram": histogram,
    }
