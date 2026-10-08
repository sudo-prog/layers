"""In-memory embedding store for feature vectors.

Provides lightweight persistence and similarity search for
:class:`~app.models.FeatureVector` objects.  The store assigns each added
vector a sequential integer id (or accepts a caller-supplied ``image_id``),
serialises the feature vector to a flat numeric array (reusing the same
``_vectorize`` logic as :mod:`app.consistency`), and stores it alongside
metadata (the original feature vector, candidate cores, and any extra
caller metadata).

Querying returns the top-``k`` most similar entries by cosine similarity.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from pydantic import BaseModel, Field

from app.models import FeatureVector
from app.hypothesis import CandidateCore


def _vectorize(feature: FeatureVector) -> np.ndarray:
    """Flatten a :class:`FeatureVector` into a 1-D numeric array.

    This mirrors the logic in :mod:`app.consistency` so that similarity
    comparisons are consistent across the pipeline.

    Layout:
        palette (flattened RGB) → edges (3 values) → frequency (3 values) →
        tone mean, tone std → tone histogram (256 bins) → clip embedding (512,
        if present).
    """
    parts: list[np.ndarray] = []

    # Palette.
    if feature.palette:
        parts.append(
            np.asarray(feature.palette, dtype=np.float64).reshape(-1)
        )
    else:
        parts.append(np.zeros(15, dtype=np.float64))  # 5 colours × 3 channels

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
            [freq.get("low", 0.0), freq.get("mid", 0.0), freq.get("high", 0.0)],
            dtype=np.float64,
        )
    )

    # Tone mean / std.
    tone = feature.tone or {}
    parts.append(
        np.asarray([tone.get("mean", 0.0), tone.get("std", 0.0)], dtype=np.float64)
    )

    # Tone histogram.
    hist = tone.get("histogram", [])
    if hist:
        parts.append(np.asarray(hist, dtype=np.float64))
    else:
        parts.append(np.zeros(256, dtype=np.float64))

    # CLIP embedding (optional).
    if feature.clip_embedding:
        parts.append(np.asarray(feature.clip_embedding, dtype=np.float64))

    return np.concatenate(parts)


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity between two 1-D arrays, clipped to ``[-1, 1]``."""
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    sim = float(np.dot(a, b) / (norm_a * norm_b))
    return max(-1.0, min(1.0, sim))


class StoredVector(BaseModel):
    """A single entry in the embedding store."""

    image_id: str
    vector: list[float] = Field(..., description="Flat numeric embedding.")
    features: dict[str, Any] = Field(
        ..., description="Serialised FeatureVector for round-tripping."
    )
    candidates: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Serialised CandidateCore objects.",
    )
    metadata: dict[str, Any] = Field(
        default_factory=dict, description="Extra caller-supplied metadata."
    )


class EmbeddingStore:
    """A simple in-memory embedding store with cosine-similarity search."""

    def __init__(self) -> None:
        self._vectors: list[StoredVector] = []
        self._index: dict[str, int] = {}  # image_id → position in _vectors
        self._next_seq: int = 0

    # ------------------------------------------------------------------ write

    def add(
        self,
        features: FeatureVector,
        candidates: list[CandidateCore] | None = None,
        image_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        """Add a feature vector to the store.

        Args:
            features: The :class:`FeatureVector` to store.
            candidates: Optional list of candidate cores associated with the
                feature vector.
            image_id: Caller-supplied id.  If ``None``, a synthetic id of the
                form ``"vec_<seq>"`` is generated.
            metadata: Extra metadata to attach.

        Returns:
            The ``image_id`` under which the vector was stored.  If
            *image_id* was provided and already existed, the old entry is
            replaced (upsert semantics).
        """
        if image_id is None:
            image_id = f"vec_{self._next_seq}"
            self._next_seq += 1

        vec = _vectorize(features).astype(np.float64)

        entry = StoredVector(
            image_id=image_id,
            vector=vec.tolist(),
            features=features.model_dump(),
            candidates=(
                [c.model_dump() for c in candidates] if candidates else []
            ),
            metadata=metadata or {},
        )

        if image_id in self._index:
            pos = self._index[image_id]
            self._vectors[pos] = entry
        else:
            self._index[image_id] = len(self._vectors)
            self._vectors.append(entry)

        return image_id

    # ------------------------------------------------------------------ read

    def query(
        self,
        features: FeatureVector,
        k: int = 5,
        include_metadata: bool = True,
    ) -> list[tuple[str, float, dict[str, Any]]]:
        """Find the top-``k`` most similar stored vectors to *features*.

        Args:
            features: Query feature vector.
            k: Number of results to return.
            include_metadata: If ``True``, each result tuple includes the
                stored metadata dict; otherwise an empty dict is returned.

        Returns:
            A list of ``(image_id, score, metadata)`` tuples sorted by
            descending cosine similarity.  ``score`` is in ``[-1, 1]``.
        """
        if not self._vectors:
            return []

        query_vec = _vectorize(features).astype(np.float64)
        k = max(1, min(k, len(self._vectors)))

        scored = [
            (
                entry.image_id,
                _cosine_similarity(query_vec, np.asarray(entry.vector)),
                entry.metadata if include_metadata else {},
            )
            for entry in self._vectors
        ]

        scored.sort(key=lambda t: t[1], reverse=True)
        return scored[:k]

    def get(self, image_id: str) -> StoredVector | None:
        """Retrieve a stored vector by id."""
        pos = self._index.get(image_id)
        if pos is None:
            return None
        return self._vectors[pos]

    def delete(self, image_id: str) -> bool:
        """Remove a stored vector by id.  Returns ``True`` if removed."""
        pos = self._index.get(image_id)
        if pos is None:
            return False
        self._vectors.pop(pos)
        # Rebuild index.
        self._index = {
            entry.image_id: idx for idx, entry in enumerate(self._vectors)
        }
        return True

    def clear(self) -> None:
        """Remove all vectors from the store."""
        self._vectors.clear()
        self._index.clear()
        self._next_seq = 0

    # ------------------------------------------------------------------ stats

    @property
    def count(self) -> int:
        """Number of vectors currently stored."""
        return len(self._vectors)

    @property
    def ids(self) -> list[str]:
        """Return all stored image ids."""
        return [entry.image_id for entry in self._vectors]


__all__ = [
    "EmbeddingStore",
    "StoredVector",
    "_vectorize",
    "_cosine_similarity",
]
