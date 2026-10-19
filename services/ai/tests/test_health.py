"""Tests for the health endpoint."""

from fastapi.testclient import TestClient

from app.main import app


def test_health_returns_ok() -> None:
    """GET /v1/health should return 200 with status='ok'."""
    client = TestClient(app, headers={"Authorization": "Bearer dev-token"})
    response = client.get("/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


def test_health_returns_model() -> None:
    """GET /v1/health should include a model field."""
    client = TestClient(app, headers={"Authorization": "Bearer dev-token"})
    response = client.get("/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["model"] == "none"
