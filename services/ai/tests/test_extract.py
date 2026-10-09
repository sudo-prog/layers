"""Tests for feature extraction endpoint."""

import base64
import io

from fastapi.testclient import TestClient
from PIL import Image

from app.main import app


def _make_test_image_bytes() -> bytes:
    """Create a small in-memory test image and return its bytes."""
    img = Image.new("RGB", (64, 64), color=(128, 64, 200))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_extract_features() -> None:
    """POST /v1/features/extract with a test image should return features."""
    image_bytes = _make_test_image_bytes()
    encoded = base64.b64encode(image_bytes).decode("ascii")

    client = TestClient(app)
    response = client.post(
        "/v1/features/extract",
        json={"image_data": encoded},
    )

    assert response.status_code == 200
    data = response.json()
    assert "features" in data
    assert isinstance(data["features"], list)
    assert len(data["features"]) == 1
    # Each feature is a FeatureVector dict with expected keys
    feature = data["features"][0]
    assert isinstance(feature, dict)
    assert "palette" in feature
    assert "edges" in feature
    assert "frequency" in feature
    assert "tone" in feature
    # Consistency report should be present
    assert "consistency" in data
    assert isinstance(data["consistency"], dict)
    assert "outliers" in data["consistency"]


def test_extract_features_invalid_base64() -> None:
    """POST /v1/features/extract with invalid base64 should return 400."""
    client = TestClient(app)
    response = client.post(
        "/v1/features/extract",
        json={"image_data": "not valid base64!!!"},
    )
    assert response.status_code == 400
