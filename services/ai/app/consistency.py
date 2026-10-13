"""Cross-image consistency analysis.

Provides pairwise cosine-similarity scoring between feature vectors and
outlier detection for identifying images whose feature profile is atypical
relative to the rest of the batch.
"""

from __future__ import annotations

import numpy as np

from app.models import FeatureVector


def _vectorize(feature: FeatureVector) -> np.ndarray:
    """Flatten a :class:`FeatureVector` into a 1-D numeric vector.

    The palette colours are flattened, and the tone histogram contributes
    256 values.  CLIP, when present, is appended last.
    """
    parts: list[np.ndarray] = []

    # Palette: flatten (R, G, B) triplets.
    if feature.palette:
        parts.append(np.asarray(feature.palette, dtype=np.float64).reshape(-1))
    else:
        parts.append(np.zeros(15, dtype=np.float64))  # 5 colours x 3 channels

    # Edges.
    edges = feature.edges or {}
    parts.append(
        np.asarray(
            [
                edges.get("magnitude", 0.0),
                edges.get("direction", 0.0),
                edges.get("edge_density", 0.0),
            ],
            dtype=np.float64,
        )
    )

    # Frequency.
    freq = feature.frequency or {}
    parts.append(
        np.asarray(
            [
                freq.get("low", 0.0),
                freq.get("mid", 0.0),
                freq.get("high", 0.0),
            ],
            dtype=np.float64,
        )
    )

    # Tone mean / std.
    tone = feature.tone or {}
    parts.append(
        np.asarray(
            [tone.get("mean", 0.0), tone.get("std", 0.0)],
            dtype=np.float64,
        )
    )

    # Tone histogram (256 bins).
    hist = tone.get("histogram", [])
    if hist:
        parts.append(np.asarray(hist, dtype=np.float64))
    else:
        parts.append(np.zeros(256, dtype=np.float64))

    # CLIP embedding.
    if feature.clip_embedding:
        parts.append(np.asarray(feature.clip_embedding, dtype=np.float64))

    return np.concatenate(parts)


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity between two 1-D vectors, clipped to [-1, 1]."""
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    sim = float(np.dot(a, b) / (norm_a * norm_b))
    return max(-1.0, min(1.0, sim))


def cross_reference(features: list[FeatureVector]) -> dict:
    """Compute a pairwise cosine-similarity matrix between *features*.

    Returns a dict with:
      * ``matrix`` - flat list of lists (row-major) with similarity scores.
      * ``mean_similarity`` - average off-diagonal similarity.
    """
    n = len(features)
    vectors = [_vectorize(f) for f in features]
    matrix = [[0.0] * n for _ in range(n)]

    for i in range(n):
        for j in range(n):
            if i == j:
                matrix[i][j] = 1.0
            elif j > i:
                sim = _cosine_similarity(vectors[i], vectors[j])
                matrix[i][j] = sim
                matrix[j][i] = sim

    off_diag = [
        matrix[i][j] for i in range(n) for j in range(n) if i != j
    ]
    mean_similarity = float(sum(off_diag) / len(off_diag)) if off_diag else 0.0

    return {
        "matrix": matrix,
        "mean_similarity": mean_similarity,
        "cross_reference_scores": matrix,
    }


def detect_outliers(
    features: list[FeatureVector], threshold: float = 0.5
) -> list[int]:
    """Return indices of feature vectors that are outliers.

    A feature vector is considered an outlier when its average
    cosine-similarity to all other vectors falls below *threshold*.
    """
    n = len(features)
    if n <= 1:
        return []

    vectors = [_vectorize(f) for f in features]
    outliers: list[int] = []

    for i in range(n):
        sims = [
            _cosine_similarity(vectors[i], vectors[j])
            for j in range(n)
            if j != i
        ]
        avg_sim = sum(sims) / len(sims)
        if avg_sim < threshold:
            outliers.append(i)

    return outliers
