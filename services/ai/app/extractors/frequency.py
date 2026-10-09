"""Frequency extraction via 2D FFT on the grayscale image."""

from __future__ import annotations

import numpy as np
from PIL import Image


def _radial_bands(shape: tuple[int, int], n_bands: int = 3) -> np.ndarray:
    """Return an integer label array of the same shape assigning each pixel
    to a radial frequency band (0 = low, 2 = high).

    The bands are defined by concentric rings centred on the frequency-domain
    origin, dividing the maximum radius into ``n_bands`` equal arcs.
    """
    h, w = shape
    cy, cx = h // 2, w // 2
    y, x = np.ogrid[:h, :w]
    radius = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    max_radius = radius.max()
    if max_radius <= 0:
        return np.zeros_like(radius, dtype=int)
    band = np.clip((radius / max_radius * n_bands).astype(int), 0, n_bands - 1)
    return band


def extract_frequency(image: Image.Image) -> dict:
    """Compute low/mid/high frequency energy ratios from *image*.

    The image is converted to grayscale, the 2D FFT is computed, and the
    magnitude spectrum is split into three radial bands.  Each band's
    total energy is expressed as a ratio of the overall energy.
    """
    if image.mode != "RGB":
        image = image.convert("RGB")
    gray = np.asarray(image.convert("L"), dtype=np.float64)

    # Apply a 2D FFT and shift the zero-frequency component to the centre.
    f_transform = np.fft.fft2(gray)
    f_shift = np.fft.fftshift(f_transform)
    magnitude = np.abs(f_shift)

    total_energy = float(magnitude.sum())
    if total_energy <= 0:
        return {"low": 0.0, "mid": 0.0, "high": 0.0}

    bands = _radial_bands(gray.shape, n_bands=3)
    low_energy = float(magnitude[bands == 0].sum()) / total_energy
    mid_energy = float(magnitude[bands == 1].sum()) / total_energy
    high_energy = float(magnitude[bands == 2].sum()) / total_energy

    return {
        "low": low_energy,
        "mid": mid_energy,
        "high": high_energy,
    }
