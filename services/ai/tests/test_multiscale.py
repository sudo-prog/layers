"""Tests for multi-scale feature extraction.

These tests exercise ``extract_features_multiscale`` which builds a
Gaussian-style image pyramid and runs all extractors at each level.
"""

import base64
import io
import os
import tempfile

from fastapi.testclient import TestClient
from PIL import Image

from app.extractors.pipeline import extract_features_multiscale, build_pyramid
from app.models import FeatureVector
from app.main import app


def _make_test_image(size: tuple[int, int] = (128, 128)) -> Image.Image:
    """Create a small in-memory test image."""
    img = Image.new("RGB", size, color=(128, 64, 200))
    # Add some variation so extractors have meaningful data.
    for x in range(0, size[0], 4):
        for y in range(0, size[1], 4):
            img.putpixel((x, y), ((x * 2) % 256, (y * 2) % 256, 128))
    return img


def _make_test_image_bytes() -> bytes:
    """Create a small in-memory test image and return its PNG bytes."""
    img = _make_test_image((128, 128))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_build_pyramid_levels():
    """build_pyramid should return the correct number of levels."""
    image = _make_test_image((128, 128))
    levels = 3
    pyramid = build_pyramid(image, levels=levels)
    assert len(pyramid) == levels
    # Level 0 is the original
    assert pyramid[0].size == (128, 128)
    # Each subsequent level is half the size (min 1 px)
    assert pyramid[1].size == (64, 64)
    assert pyramid[2].size == (32, 32)


def test_build_pyramid_single_level():
    """build_pyramid with levels=1 returns just the base image."""
    image = _make_test_image((64, 64))
    pyramid = build_pyramid(image, levels=1)
    assert len(pyramid) == 1
    assert pyramid[0] is image


def test_extract_features_multiscale_returns_list():
    """extract_features_multiscale should return a list of FeatureVector."""
    image = _make_test_image((128, 128))
    results = extract_features_multiscale(image, levels=3)
    assert isinstance(results, list)
    assert len(results) == 3
    for fv in results:
        assert isinstance(fv, FeatureVector)


def test_extract_features_multiscale_correct_levels():
    """The number of returned feature vectors matches the requested levels."""
    image = _make_test_image((128, 128))
    for levels in [1, 2, 3, 4]:
        results = extract_features_multiscale(image, levels=levels)
        assert len(results) == levels, f"Expected {levels} levels, got {len(results)}"


def test_extract_features_multiscale_each_level_has_features():
    """Each pyramid level should produce a valid FeatureVector with all fields."""
    image = _make_test_image((128, 128))
    results = extract_features_multiscale(image, levels=3)
    for i, fv in enumerate(results):
        assert isinstance(fv, FeatureVector)
        # Each feature vector should have the expected keys
        assert fv.palette is not None
        assert fv.edges is not None
        assert fv.frequency is not None
        assert fv.tone is not None
        # Palette should have entries
        assert isinstance(fv.palette, list)
        assert len(fv.palette) > 0
        # Edges should be a dict with expected keys
        assert isinstance(fv.edges, dict)
        assert "magnitude" in fv.edges
        assert "direction" in fv.edges
        assert "edge_density" in fv.edges


def test_extract_features_multiscale_with_extractors():
    """extract_features_multiscale should accept a custom extractor list."""
    image = _make_test_image((128, 128))
    results = extract_features_multiscale(image, extractors=["palette", "tone"], levels=2)
    assert len(results) == 2
    for fv in results:
        assert isinstance(fv, FeatureVector)
        assert fv.palette is not None
        assert fv.tone is not None


def test_extract_features_multiscale_multiscale_differs():
    """Features at different pyramid levels should differ (downsampled images
    produce different feature values)."""
    image = _make_test_image((128, 128))
    results = extract_features_multiscale(image, levels=2)
    # The two levels should not be identical — at least one field should differ.
    fv0, fv1 = results[0], results[1]
    # Compare palette (downsampling changes dominant colors)
    assert fv0.palette != fv1.palette or fv0.edges != fv1.edges or \
           fv0.frequency != fv1.frequency or fv0.tone != fv1.tone


def test_multiscale_endpoint():
    """POST /v1/features/extract-multiscale should return multiscale features."""
    image_bytes = _make_test_image_bytes()
    encoded = base64.b64encode(image_bytes).decode("ascii")

    client = TestClient(app)
    response = client.post(
        "/v1/features/extract-multiscale",
        json={"image_data": encoded},
    )

    assert response.status_code == 200
    data = response.json()
    assert "features" in data
    assert isinstance(data["features"], list)
    assert len(data["features"]) == 3  # default levels=3
    assert "pyramid_levels" in data
    assert data["pyramid_levels"] == 3
    assert "consistency" in data
    assert isinstance(data["consistency"], dict)
    assert "outliers" in data["consistency"]


def test_multiscale_endpoint_custom_levels():
    """POST /v1/features/extract-multiscale with levels=2 should return 2 features."""
    image_bytes = _make_test_image_bytes()
    encoded = base64.b64encode(image_bytes).decode("ascii")

    client = TestClient(app)
    response = client.post(
        "/v1/features/extract-multiscale?levels=2",
        json={"image_data": encoded},
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data["features"]) == 2
    assert data["pyramid_levels"] == 2


def test_multiscale_endpoint_invalid_base64():
    """POST /v1/features/extract-multiscale with invalid base64 should return 400."""
    client = TestClient(app)
    response = client.post(
        "/v1/features/extract-multiscale",
        json={"image_data": "not valid base64!!!"},
    )
    assert response.status_code == 400


def test_extract_features_unchanged():
    """The existing extract_features function should still work unchanged."""
    image = _make_test_image((64, 64))
    from app.extractors.pipeline import extract_features
    fv = extract_features(image)
    assert isinstance(fv, FeatureVector)
    assert fv.palette is not None
    assert isinstance(fv.palette, list)
    assert len(fv.palette) > 0
