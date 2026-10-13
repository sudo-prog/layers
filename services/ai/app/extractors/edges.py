"""Edge extraction using a Sobel operator on the grayscale image."""

from __future__ import annotations

import math

import numpy as np
from PIL import Image


def _sobel_magnitude_direction(gray: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Compute Sobel gradient magnitude and direction.

    Returns ``(magnitude, direction)`` where *magnitude* is the edge
    strength and *direction* is the angle in radians in ``[-pi, pi]``.
    """
    # Sobel kernels (3x3).
    kx = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float64)
    ky = np.array([[-1, -2, -1], [0, 0, 0], [1, 2, 1]], dtype=np.float64)

    h, w = gray.shape
    # Pad so we can compute the full convolution for interior pixels.
    padded = np.pad(gray, 1, mode="edge").astype(np.float64)

    gx = np.zeros((h, w), dtype=np.float64)
    gy = np.zeros((h, w), dtype=np.float64)
    for i in range(3):
        for j in range(3):
            gx += kx[i, j] * padded[i : i + h, j : j + w]
            gy += ky[i, j] * padded[i : i + h, j : j + w]

    magnitude = np.hypot(gx, gy)
    direction = np.arctan2(gy, gx)
    return magnitude, direction


def extract_edges(image: Image.Image) -> dict:
    """Extract edge statistics from *image*.

    Returns a dict with:
      * ``magnitude`` - mean edge strength.
      * ``direction`` - dominant edge angle in degrees.
      * ``edge_density`` - fraction of pixels above a threshold.
    """
    if image.mode != "RGB":
        image = image.convert("RGB")
    gray = np.asarray(image.convert("L"), dtype=np.float64)

    magnitude, direction = _sobel_magnitude_direction(gray)

    magnitude_mean = float(magnitude.mean())

    # Dominant direction: magnitude-weighted circular mean of angles.
    if magnitude.sum() > 0:
        sin_sum = float((magnitude * np.sin(direction)).sum())
        cos_sum = float((magnitude * np.cos(direction)).sum())
        dominant_rad = math.atan2(sin_sum, cos_sum)
    else:
        dominant_rad = 0.0
    dominant_deg = math.degrees(dominant_rad)

    # Edge density: fraction of pixels with strong gradients.
    threshold = magnitude_mean * 1.5
    if magnitude_mean > 0:
        edge_density = float((magnitude > threshold).sum()) / magnitude.size
    else:
        edge_density = 0.0

    return {
        "magnitude": magnitude_mean,
        "direction": dominant_deg,
        "edge_density": edge_density,
    }
