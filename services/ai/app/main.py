"""FastAPI application for the LAYERS AI Service.

Provides feature extraction, job queue, and image management endpoints.
All models run on-device; no network access is required after the model is cached.
"""

from __future__ import annotations

import base64
import os
import tempfile
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

# Models are imported from models.py to avoid duplicate definitions.
#
# NOTE: There are two extraction APIs in this service:
#
# 1. Batch API (models.py: ExtractRequest / ExtractResponse)
#    Accepts ``image_paths`` (list of file paths) and ``extractors`` selector.
#    Intended for server-side batch processing of pre-uploaded images.
#    Not wired to a live endpoint yet but available for future use.
#
# 2. Live REST API (below)
#    Accepts a single base64-encoded image via ``_APIExtractRequest``.
#    Internally decodes, writes a temp file, runs the real pipeline
#    (preprocess_image -> extract_features -> consistency analysis),
#    and returns an ``ExtractResponse``.
from app.models import FeatureVector, ExtractRequest, ExtractResponse, JobResponse
from app.extractors.pipeline import preprocess_image, extract_features, extract_features_multiscale
from app.consistency import cross_reference, detect_outliers
from app.queue import IMAGE_DIR, queue

# Stage 1.4: stack search / optimization / pruning
from app.search import search_stacks, RankedStack
from app.optimize import optimize_stack, OptimizationResult, _inject_params
from app.pareto import prune_stack, pareto_frontier, stack_metrics
from app.search import _stack_passes

# Stage 1.5/1.6: mock AI server & retrieval weighting
from app.mock_ai import router as vlm_router
from app.retrieval import (
    WeightedRetrieval,
    AcceptanceRateTracker,
    get_style_clusters,
    CORE_TYPES,
    STYLE_CLUSTERS,
    WEIGHT_COSINE,
    WEIGHT_ACCEPTANCE,
    WEIGHT_RECENCY,
    WEIGHT_RATING,
)


class _APIExtractRequest(BaseModel):
    """Request body for the live single-image extraction endpoints."""

    image_data: str = Field(
        ..., description="Base64-encoded image data (PNG/JPEG/etc.)"
    )


class MultiscaleExtractResponse(BaseModel):
    """Response from the multiscale feature extraction endpoint."""

    features: list[FeatureVector] = Field(
        ..., description="Feature vectors, one per pyramid level."
    )
    pyramid_levels: int = Field(
        ..., description="Number of pyramid levels used for extraction."
    )
    consistency: dict = Field(
        ..., description="Consistency report: cross_reference_scores, outliers."
    )


class ImageUploadResponse(BaseModel):
    """Response from image upload."""

    image_id: str
    path: str


# Startup time for uptime tracking
_START_TIME: float = time.time()


def _extract_from_base64(image_data: str) -> ExtractResponse:
    """Decode base64 image data, run the real pipeline, and return ExtractResponse."""
    try:
        image_bytes = base64.b64decode(image_data)
    except Exception as exc:
        raise HTTPException(
            status_code=400, detail=f"Invalid base64 image data: {exc}"
        ) from exc

    # Write decoded bytes to a temp file so preprocess_image can load from disk.
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
    try:
        tmp.write(image_bytes)
        tmp.close()

        image = preprocess_image(tmp.name)
        feature = extract_features(image)
        features = [feature]

        xref = cross_reference(features)
        consistency = {
            **xref,
            "outliers": detect_outliers(features),
        }

        return ExtractResponse(features=features, consistency=consistency)
    finally:
        os.unlink(tmp.name)


def _extract_multiscale_from_base64(
    image_data: str, levels: int = 3
) -> MultiscaleExtractResponse:
    """Decode base64 image, run multiscale extraction, return response."""
    try:
        image_bytes = base64.b64decode(image_data)
    except Exception as exc:
        raise HTTPException(
            status_code=400, detail=f"Invalid base64 image data: {exc}"
        ) from exc

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
    try:
        tmp.write(image_bytes)
        tmp.close()

        image = preprocess_image(tmp.name)
        features = extract_features_multiscale(image, levels=levels)

        xref = cross_reference(features)
        consistency = {
            **xref,
            "outliers": detect_outliers(features),
        }

        return MultiscaleExtractResponse(
            features=features,
            pyramid_levels=len(features),
            consistency=consistency,
        )
    finally:
        os.unlink(tmp.name)


def _to_job_response(job) -> JobResponse:
    """Convert a queue.JobResponse to models.JobResponse for the API."""
    return JobResponse(
        job_id=job.job_id,
        status=job.status,
        result=job.result if isinstance(job.result, ExtractResponse) else None,
        error=job.error,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create the image directory and start the job worker."""
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    if not queue._worker_running:  # noqa: SLF001
        queue.run_worker()
    yield
    queue.shutdown()


app = FastAPI(
    title="LAYERS AI Service", version="0.1.0", lifespan=lifespan
)

# ---------------------------------------------------------------------------
# Auth middleware — all endpoints require a bearer token.
# The token is read from the LAYERS_AI_TOKEN env var (default: "dev-token").
# ---------------------------------------------------------------------------

import secrets as _secrets
from fastapi import Request, Response

_AI_TOKEN = os.environ.get("LAYERS_AI_TOKEN", "dev-token")


# ---------------------------------------------------------------------------
# Simple in-memory rate limiter (no new dependencies).
# 60 requests per minute per IP for compute-heavy endpoints.
# ---------------------------------------------------------------------------

import time as _time
from collections import defaultdict

_rate_buckets: dict[str, list[float]] = defaultdict(list)
_RATE_LIMIT = 60  # requests
_RATE_WINDOW = 60  # seconds


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if request.url.path == "/v1/health":
        return await call_next(request)
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return Response(status_code=401, content="Missing bearer token")
    token = auth[7:]
    if not _secrets.compare_digest(token, _AI_TOKEN):
        return Response(status_code=403, content="Invalid token")
    # Rate limiting for compute-heavy endpoints
    if request.url.path.startswith(("/v1/features", "/v1/jobs", "/v1/stacks")):
        client_ip = request.client.host if request.client else "unknown"
        now = _time.time()
        bucket = _rate_buckets[client_ip]
        # Remove old entries
        cutoff = now - _RATE_WINDOW
        _rate_buckets[client_ip] = [t for t in bucket if t > cutoff]
        if len(_rate_buckets[client_ip]) >= _RATE_LIMIT:
            return Response(status_code=429, content="Rate limit exceeded")
        _rate_buckets[client_ip].append(now)
    return await call_next(request)

# Stage 1.5: mount the mock AI (VLM) router for regenerate / suggest / re-optimize.
app.include_router(vlm_router)


@app.get("/v1/health")
def health() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok", "model": "none"}


@app.post("/v1/features/extract", response_model=ExtractResponse)
def extract_features_endpoint(request: _APIExtractRequest) -> ExtractResponse:
    """Extract features from base64-encoded image data (synchronous)."""
    return _extract_from_base64(request.image_data)


@app.post("/v1/features/extract-multiscale", response_model=MultiscaleExtractResponse)
def extract_features_multiscale_endpoint(
    request: _APIExtractRequest, levels: int = 3
) -> MultiscaleExtractResponse:
    """Extract features at multiple scales using an image pyramid (synchronous).

    Builds a Gaussian-style pyramid with *levels* entries and runs feature
    extraction on each level.  Returns one :class:`FeatureVector` per level
    along with a consistency report.
    """
    return _extract_multiscale_from_base64(request.image_data, levels=levels)


@app.post("/v1/jobs", response_model=JobResponse)
def submit_job(request: _APIExtractRequest) -> JobResponse:
    """Submit a feature extraction job for asynchronous processing."""
    try:
        base64.b64decode(request.image_data)
    except Exception as exc:
        raise HTTPException(
            status_code=400, detail=f"Invalid base64 image data: {exc}"
        ) from exc
    job_id = queue.submit(_extract_from_base64, request.image_data)
    job = queue.get_status(job_id)
    if job is None:
        raise HTTPException(status_code=500, detail="Failed to queue job")
    return _to_job_response(job)


@app.get("/v1/jobs/{job_id}", response_model=JobResponse)
def get_job(job_id: str) -> JobResponse:
    """Check the status of a job, or retrieve its result if complete."""
    job = queue.get_status(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return _to_job_response(job)


# Allowed MIME types for image upload
ALLOWED_IMAGE_TYPES: frozenset[str] = frozenset({"image/png", "image/jpeg", "image/webp", "image/gif"})
MAX_IMAGE_SIZE: int = 50 * 1024 * 1024  # 50 MB


@app.post("/v1/images/upload", response_model=ImageUploadResponse)
async def upload_image(file: UploadFile = File(...)) -> ImageUploadResponse:
    """Upload an image file. Returns the image_id and stored path."""
    content = await file.read()
    if len(content) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=413, detail="Image too large (max 50 MB)")
    mime = file.content_type or "application/octet-stream"
    if mime not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail=f"Unsupported image type: {mime}")
    image_id = str(uuid.uuid4())
    file_extension = Path(file.filename).suffix if file.filename else ".png"
    stored_path = IMAGE_DIR / f"{image_id}{file_extension}"
    stored_path.write_bytes(content)

    return ImageUploadResponse(
        image_id=image_id,
        path=str(stored_path),
    )


@app.get("/v1/images/{image_id}")
def get_image(image_id: str) -> FileResponse:
    """Retrieve a stored image by id."""
    # Find the file by matching the image_id prefix
    for path in IMAGE_DIR.iterdir():
        if path.stem == image_id:
            return FileResponse(path)
    raise HTTPException(status_code=404, detail="Image not found")


@app.delete("/v1/images/{image_id}")
def delete_image(image_id: str) -> dict[str, bool]:
    """Delete a stored image by id."""
    for path in IMAGE_DIR.iterdir():
        if path.stem == image_id:
            path.unlink()
            return {"deleted": True}
    raise HTTPException(status_code=404, detail="Image not found")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=8123)


# ---------------------------------------------------------------------------
# Stage 1.4: stack search / optimization / pruning endpoints
# ---------------------------------------------------------------------------

class SearchRequest(BaseModel):
    """Request body for /v1/stacks/search."""

    feature: FeatureVector
    beam_width: int = 8


class OptimizeRequest(BaseModel):
    """Request body for /v1/stacks/optimize."""

    feature: FeatureVector
    stack: list[dict[str, Any]]
    max_trials: int = 200


class PruneRequest(BaseModel):
    """Request body for /v1/stacks/prune."""

    feature: FeatureVector
    stack: list[dict[str, Any]]
    max_loss_pct: float = 0.02


@app.post("/v1/stacks/search")
def search_stacks_endpoint(request: SearchRequest) -> dict[str, Any]:
    """Beam-search over effect-stack candidates for the given feature vector."""
    candidates = search_stacks(
        request.feature,
        beam_width=request.beam_width,
        max_layers=5,
        seed=None,
    )
    return {"candidates": [r.to_dict() for r in candidates], "count": len(candidates)}


@app.post("/v1/stacks/optimize")
def optimize_stacks_endpoint(request: OptimizeRequest) -> dict[str, Any]:
    """Optimize stack parameters via CMA-ES (optuna not installed)."""
    result: OptimizationResult = optimize_stack(
        request.stack, request.feature, max_trials=request.max_trials
    )
    optimized_stack = _inject_params(request.stack, result.optimized_params)
    return {
        "optimized_stack": optimized_stack,
        "score": result.score,
        "trace": result.trace,
        "passes": _stack_passes(optimized_stack),
    }


@app.post("/v1/stacks/prune")
def prune_stacks_endpoint(request: PruneRequest) -> dict[str, Any]:
    """Prune layers from a stack keeping fidelity loss within max_loss_pct."""
    report = prune_stack(request.stack, request.feature, max_loss_pct=request.max_loss_pct)
    return {"report": report}


# ---------------------------------------------------------------------------
# Stage 1.6: retrieval weighting & acceptance-rate dashboard endpoints
# ---------------------------------------------------------------------------

class RetrieveRequest(BaseModel):
    """Request body for /v1/retrieve."""
    feature: FeatureVector
    k: int = 10


class AcceptanceRequest(BaseModel):
    """Request body for recording acceptance events."""
    core_type: str
    cluster: str


@app.get("/v1/style-clusters")
def get_clusters_endpoint() -> dict[str, Any]:
    """Return the canonical list of style-cluster names."""
    return {"clusters": get_style_clusters()}


@app.get("/v1/core-types")
def get_core_types_endpoint() -> dict[str, Any]:
    """Return the canonical list of core types."""
    return {"core_types": list(CORE_TYPES)}


@app.post("/v1/retrieve")
def retrieve_endpoint(request: RetrieveRequest) -> dict[str, Any]:
    """Retrieve top-k stacks for a target feature vector via weighted retrieval.

    Uses the composite scoring formula (40% cosine similarity + 30% acceptance
    rate + 20% recency + 10% user rating) against the event log.
    """
    retriever = WeightedRetrieval()
    results = retriever.retrieve(request.feature, k=request.k)
    return {
        "results": [
            {
                "stack": record.stack,
                "core_type": record.core_type,
                "cluster": record.cluster,
                "score": round(score, 4),
                "rating": record.rating,
            }
            for record, score in results
        ],
        "count": len(results),
        "weighting_formula": (
            f"score = {WEIGHT_COSINE} * cosine_sim "
            f"+ {WEIGHT_ACCEPTANCE} * acceptance_rate "
            f"+ {WEIGHT_RECENCY} * recency_weight "
            f"+ {WEIGHT_RATING} * user_rating"
        ),
    }


@app.get("/v1/dashboard/acceptance")
def acceptance_dashboard_endpoint() -> dict[str, Any]:
    """Acceptance-rate dashboard: per-core-type acceptance rate per cluster.

    Returns a full matrix of all core types × all style clusters, with
    acceptance rates (0.0–1.0) for each pair.
    """
    tracker = AcceptanceRateTracker()
    rates = tracker.get_all_acceptance_rates()
    return {
        "acceptance_rates": rates,
        "core_types": list(CORE_TYPES),
        "style_clusters": list(STYLE_CLUSTERS),
        "description": "Rate = applied / suggested per (core_type, cluster).",
    }


@app.post("/v1/events/suggest")
def record_suggestion_endpoint(request: AcceptanceRequest) -> dict[str, Any]:
    """Record that a stack was suggested (Stage 1.6 event logging)."""
    tracker = AcceptanceRateTracker()
    tracker.record_suggested(request.core_type, request.cluster)
    return {"status": "recorded", "event": "stack_suggested"}


@app.post("/v1/events/apply")
def record_application_endpoint(request: AcceptanceRequest) -> dict[str, Any]:
    """Record that a stack was applied (Stage 1.6 event logging)."""
    tracker = AcceptanceRateTracker()
    tracker.record_applied(request.core_type, request.cluster)
    return {"status": "recorded", "event": "stack_applied"}

