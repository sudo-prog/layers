"""Palette extraction using k-means clustering on a downsampled image."""

from __future__ import annotations

import numpy as np
from PIL import Image


def _kmeans(
    data: np.ndarray, k: int, max_iter: int = 20, seed: int = 42
) -> np.ndarray:
    """Pure-numpy k-means clustering returning ``k`` centroids.

    Uses k-means++ style seeding for stability and a small iteration count
    suitable for colour palette extraction.
    """
    rng = np.random.default_rng(seed)
    n = data.shape[0]

    # K-means++ initiation: pick first centroid randomly, then choose
    # subsequent centroids weighted by squared distance to nearest centre.
    centroids = np.empty((k, data.shape[1]), dtype=np.float64)
    first_idx = rng.integers(n)
    centroids[0] = data[first_idx]
    closest_sq = np.sum((data - centroids[0]) ** 2, axis=1)
    for i in range(1, k):
        total = closest_sq.sum()
        if total <= 0:
            # Degenerate: all remaining points identical. Pick a random one.
            idx = rng.integers(n)
        else:
            probs = closest_sq / total
            idx = rng.choice(n, p=probs)
        centroids[i] = data[idx]
        new_sq = np.sum((data - centroids[i]) ** 2, axis=1)
        closest_sq = np.minimum(closest_sq, new_sq)

    for _ in range(max_iter):
        # Assign each point to the nearest centroid.
        dists = np.empty((n, k), dtype=np.float64)
        for i in range(k):
            dists[:, i] = np.sum((data - centroids[i]) ** 2, axis=1)
        labels = np.argmin(dists, axis=1)

        new_centroids = centroids.copy()
        for i in range(k):
            mask = labels == i
            if np.any(mask):
                new_centroids[i] = data[mask].mean(axis=0)
        if np.array_equal(new_centroids, centroids):
            break
        centroids = new_centroids

    return centroids


def extract_palette(image: Image.Image, n_colors: int = 5) -> list[tuple[int, int, int]]:
    """Extract the ``n_colors`` dominant colours from *image*.

    The image is downsampled to at most 100x100 before clustering so that
    k-means runs on a small, representative pixel set.  Colours are returned
    sorted by descending frequency.
    """
    if image.mode != "RGB":
        image = image.convert("RGB")

    # Downsample to at most 100x100 preserving aspect ratio.
    max_dim = 100
    ratio = min(max_dim / image.width, max_dim / image.height, 1.0)
    small_w = max(1, int(image.width * ratio))
    small_h = max(1, int(image.height * ratio))
    image = image.resize((small_w, small_h), Image.Resampling.LANCZOS)

    pixels = np.asarray(image, dtype=np.float64).reshape(-1, 3)

    # Guard against tiny images with fewer unique pixels than requested.
    n_colors = min(n_colors, pixels.shape[0])
    if n_colors <= 0:
        return []
    if n_colors == 1:
        centroid = pixels.mean(axis=0)
        return [tuple(int(c) for c in centroid)]

    centroids = _kmeans(pixels, n_colors)

    # Assign every pixel to its nearest centroid and count.
    dists = np.empty((pixels.shape[0], n_colors), dtype=np.float64)
    for i in range(n_colors):
        dists[:, i] = np.sum((pixels - centroids[i]) ** 2, axis=1)
    labels = np.argmin(dists, axis=1)

    counts = np.bincount(labels, minlength=n_colors)
    # Sort centroids by descending frequency.
    order = np.argsort(-counts)

    palette: list[tuple[int, int, int]] = []
    for idx in order:
        c = centroids[idx]
        palette.append((int(c[0]), int(c[1]), int(c[2])))
    return palette
