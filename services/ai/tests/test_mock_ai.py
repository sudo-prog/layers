"""Tests for Stage 1.5 mock AI server (regenerate / suggest / re-optimize)
and Stage 1.6 acceptance-rate dashboard endpoints.

Tests cover:
  * VLM /refine endpoint with and without pre-supplied candidates
  * VLM /regenerate endpoint — single layer replacement
  * VLM /suggest endpoint — alternative stacks
  * VLM /optimize endpoint — re-optimize with pruning
  * /v1/style-clusters, /v1/core-types, /v1/retrieve, /v1/dashboard/acceptance
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.models import FeatureVector
from app.mock_ai import MockAIServer
from app.hypothesis import generate_hypotheses
from app.main import app


@pytest.fixture
def base_features() -> FeatureVector:
    return FeatureVector(
        palette=[(220, 80, 40), (200, 60, 30), (180, 50, 20)],
        edges={"magnitude": 50.0, "direction": 0.0, "edge_density": 0.35},
        frequency={"low": 0.2, "mid": 0.2, "high": 0.6},
        tone={"mean": 130.0, "std": 85.0, "histogram": [0.0] * 256},
        clip_embedding=None,
    )


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _make_layer(core: str, params: dict | None = None) -> dict:
    return {
        "core": core,
        "params": params or {},
        "opacity": 1.0,
        "blend": "normal",
        "mask": None,
        "enabled": True,
    }


# ---------------------------------------------------------------------------
# Mock AI Server (unit-level)
# ---------------------------------------------------------------------------

class TestMockAIServer:
    def test_refine_returns_valid_output(self, base_features: FeatureVector):
        server = MockAIServer()
        candidates = generate_hypotheses(base_features)
        result = server.refine(base_features, candidates)
        assert "refined_candidates" in result
        assert "overall_confidence" in result
        assert "vlm_summary" in result
        assert "style_cluster" in result
        assert result["style_cluster"] in ("geometric", "organic", "texture", "smooth")
        for rc in result["refined_candidates"]:
            assert "core_type" in rc
            assert "confidence" in rc
            assert "accepted" in rc

    def test_refine_auto_generates_candidates(self, base_features: FeatureVector):
        """If candidates list is empty, they should be auto-generated."""
        server = MockAIServer()
        result = server.refine(base_features, [])
        assert len(result["refined_candidates"]) >= 1

    def test_refine_rejects_mismatched_geometric(self, base_features: FeatureVector):
        """A geometric edge core should be accepted when edges are high."""
        server = MockAIServer()
        candidates = generate_hypotheses(base_features)
        geo_cands = [c for c in candidates if "geometric" in c.core_type]
        if geo_cands:
            result = server.refine(base_features, geo_cands)
            assert len(result["refined_candidates"]) == len(geo_cands)

    def test_regenerate_layer(self, base_features: FeatureVector):
        server = MockAIServer()
        stack = [
            _make_layer("color_warm_core", {"rgb": [220, 80, 40]}),
            _make_layer("tone_high_contrast_core", {"mean": 130.0, "std": 85.0}),
        ]
        result = server.regenerate_layer(base_features, stack, layer_index=0, max_trials=20)
        assert "regenerated_core" in result
        assert "stack" in result
        assert len(result["stack"]) == len(stack)
        assert result["stack"][0]["core"] == result["regenerated_core"]
        assert result["stack"][1]["core"] == "tone_high_contrast_core"  # unchanged

    def test_regenerate_layer_out_of_range(self, base_features: FeatureVector):
        server = MockAIServer()
        stack = [_make_layer("color_warm_core", {"rgb": [220, 80, 40]})]
        with pytest.raises(ValueError):
            server.regenerate_layer(base_features, stack, layer_index=5)

    def test_suggest_alternatives(self, base_features: FeatureVector):
        server = MockAIServer()
        stack = [_make_layer("color_warm_core", {"edge_density": 0.35, "magnitude": 60.0})]
        result = server.suggest_alternatives(base_features, stack, max_suggestions=5)
        assert "alternatives" in result
        assert "count" in result
        assert "current_stack_passes" in result
        assert result["count"] <= 5
        for alt in result["alternatives"]:
            assert "stack" in alt
            assert "score" in alt
            assert 0.0 <= alt["score"] <= 1.0

    def test_reoptimize(self, base_features: FeatureVector):
        server = MockAIServer()
        stack = [
            _make_layer("color_warm_core", {"rgb": [220, 80, 40]}),
            _make_layer("tone_balanced_core", {"mean": 120.0, "std": 50.0}),
        ]
        result = server.reoptimize(base_features, stack, max_trials=10)
        assert "optimized_stack" in result
        assert "score" in result
        assert "trace" in result
        assert "mobile_ok" in result
        assert result["mobile_ok"] is True
        assert len(result["trace"]) == 10


# ---------------------------------------------------------------------------
# VLM Endpoints (integration via TestClient)
# ---------------------------------------------------------------------------

class TestVLMEndpoints:
    def test_refine_endpoint(self, client: TestClient, base_features: FeatureVector):
        response = client.post(
            "/v1/vlm/refine",
            json={"feature": base_features.model_dump()},
        )
        assert response.status_code == 200
        data = response.json()
        assert "refined_candidates" in data
        assert "overall_confidence" in data
        assert "style_cluster" in data

    def test_refine_endpoint_with_candidates(self, client: TestClient, base_features: FeatureVector):
        candidates = generate_hypotheses(base_features)
        response = client.post(
            "/v1/vlm/refine",
            json={
                "feature": base_features.model_dump(),
                "candidates": [c.model_dump() for c in candidates],
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["refined_candidates"]) == len(candidates)

    def test_regenerate_endpoint(self, client: TestClient, base_features: FeatureVector):
        stack = [
            _make_layer("color_warm_core", {"rgb": [220, 80, 40]}),
            _make_layer("tone_high_contrast_core", {"mean": 130.0, "std": 85.0}),
        ]
        response = client.post(
            "/v1/vlm/regenerate",
            json={
                "feature": base_features.model_dump(),
                "stack": stack,
                "layer_index": 0,
                "max_trials": 20,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "regenerated_core" in data
        assert "stack" in data
        assert len(data["stack"]) == 2

    def test_regenerate_endpoint_bad_index(self, client: TestClient, base_features: FeatureVector):
        stack = [_make_layer("color_warm_core", {"rgb": [220, 80, 40]})]
        response = client.post(
            "/v1/vlm/regenerate",
            json={
                "feature": base_features.model_dump(),
                "stack": stack,
                "layer_index": 99,
            },
        )
        assert response.status_code == 400

    def test_suggest_endpoint(self, client: TestClient, base_features: FeatureVector):
        stack = [_make_layer("color_warm_core", {"edge_density": 0.35, "magnitude": 60.0})]
        response = client.post(
            "/v1/vlm/suggest",
            json={
                "feature": base_features.model_dump(),
                "stack": stack,
                "max_suggestions": 3,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "alternatives" in data
        assert "count" in data

    def test_suggest_endpoint_empty_stack(self, client: TestClient, base_features: FeatureVector):
        response = client.post(
            "/v1/vlm/suggest",
            json={
                "feature": base_features.model_dump(),
                "stack": [],
                "max_suggestions": 3,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "alternatives" in data

    def test_optimize_endpoint(self, client: TestClient, base_features: FeatureVector):
        stack = [
            _make_layer("color_warm_core", {"rgb": [220, 80, 40]}),
            _make_layer("tone_balanced_core", {"mean": 120.0, "std": 50.0}),
        ]
        response = client.post(
            "/v1/vlm/optimize",
            json={
                "feature": base_features.model_dump(),
                "stack": stack,
                "max_trials": 10,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "optimized_stack" in data
        assert "score" in data
        assert "mobile_ok" in data


# ---------------------------------------------------------------------------
# Stage 1.6 Dashboard Endpoints
# ---------------------------------------------------------------------------

class TestDashboardEndpoints:
    def test_style_clusters_endpoint(self, client: TestClient):
        response = client.get("/v1/style-clusters")
        assert response.status_code == 200
        data = response.json()
        assert data["clusters"] == ["geometric", "organic", "texture", "smooth"]

    def test_core_types_endpoint(self, client: TestClient):
        response = client.get("/v1/core-types")
        assert response.status_code == 200
        data = response.json()
        assert len(data["core_types"]) == 17
        assert "color_warm_core" in data["core_types"]

    def test_acceptance_dashboard_endpoint(self, client: TestClient):
        response = client.get("/v1/dashboard/acceptance")
        assert response.status_code == 200
        data = response.json()
        assert "acceptance_rates" in data
        assert "core_types" in data
        assert "style_clusters" in data
        assert len(data["core_types"]) == 17
        assert len(data["style_clusters"]) == 4
        # All core types should be present.
        for ct in data["core_types"]:
            assert ct in data["acceptance_rates"]
            assert set(data["acceptance_rates"][ct].keys()) == set(data["style_clusters"])

    def test_acceptance_dashboard_rates_in_range(self, client: TestClient):
        response = client.get("/v1/dashboard/acceptance")
        assert response.status_code == 200
        data = response.json()
        for ct, rates in data["acceptance_rates"].items():
            for cluster, rate in rates.items():
                assert 0.0 <= rate <= 1.0

    def test_retrieve_endpoint_empty(self, client: TestClient, base_features: FeatureVector):
        """Retrieving from an empty event log returns empty results."""
        response = client.post(
            "/v1/retrieve",
            json={"feature": base_features.model_dump(), "k": 5},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 0
        assert data["results"] == []
        assert "weighting_formula" in data

    def test_retrieve_endpoint_weighting_formula(self, client: TestClient, base_features: FeatureVector):
        response = client.post(
            "/v1/retrieve",
            json={"feature": base_features.model_dump(), "k": 5},
        )
        assert response.status_code == 200
        formula = response.json()["weighting_formula"]
        assert "0.4" in formula or "0.40" in formula
        assert "cosine" in formula.lower()
        assert "acceptance" in formula.lower()
        assert "recency" in formula.lower()
        assert "rating" in formula.lower()

    def test_record_suggestion_endpoint(self, client: TestClient):
        response = client.post(
            "/v1/events/suggest",
            json={"core_type": "color_warm_core", "cluster": "geometric"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["event"] == "stack_suggested"

    def test_record_application_endpoint(self, client: TestClient):
        response = client.post(
            "/v1/events/apply",
            json={"core_type": "edge_geometric_core", "cluster": "organic"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["event"] == "stack_applied"
