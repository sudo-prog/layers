"""CLIP embedding extraction.

This is a placeholder implementation.  Real CLIP integration requires
downloading a model (e.g. ``ViT-B/32`` from HuggingFace) which is not
done here to keep the service dependency-free and fast to bootstrap.

TODO: Integrate a real CLIP model for semantic embeddings. Options:
  * ``transformers`` + ``CLIPModel`` from HuggingFace.
  * ``open_clip`` for a lighter-weight alternative.
  * Remote inference via the LiteLLM/OmniRoute gateway.

When integrated, replace the zero-vector return with the actual 512-dim
embedding produced by the selected model.
"""

from __future__ import annotations

import numpy as np
from PIL import Image


def extract_clip(image: Image.Image) -> list[float]:
    """Return a 512-dim CLIP embedding for *image*.

    Currently returns a zero vector because real CLIP requires a model
    download.  See the module docstring TODO for integration notes.
    """
    # TODO: Load CLIP model, preprocess *image*, and return the embedding.
    embedding = np.zeros(512, dtype=np.float32)
    return embedding.tolist()
