# AI Service (services/ai)

A local desktop AI service exposing the embedding and scoring models used by
LAYERS. It runs on-device (no pixels or tokens leave the machine) and answers
`@layers/ai` and the desktop client over HTTP.

## Responsibilities

| Capability | Endpoint | Description |
|---|---|---|
| Feature extraction | `POST /v1/features/extract` | Run CLIP on reference images to produce embedding tokens + pooled vectors for similarity search. |
| Hypothesis generation | `POST /v1/hypotheses/generate` | Given reference features, generate candidate style hypotheses (effect-stack proposals) to render and score. |
| Preset scoring | `POST /v1/presets/score` | Score a preset against reference features (cosine similarity + perceptual distance). |
| Health | `GET /v1/health` | Liveness probe for the service. |

## Architecture

```
                    ┌──────────────────┐
   Edit (IndexedDB) │   services/ai    │
      ────────────► │  HTTP (FastAPI   │──►  CLIP (on-device, no network)
                    │   / uvicorn)     │
                    └──────────────────┘
```

- **Model**: CLIP ViT-B/32 served via `@huggingface/transformers` or a local
  `llama.cpp`/`onnxruntime` worker. No third-party API calls.
- **Embeddings** are routed through `packages/vector` (cosine similarity store)
  for nearest-neighbour lookups.
- **Scoring** re-uses `packages/schema`'s `estimatePasses` / `mobileOk` gates
  so AI suggestions never violate the ≤ 8-pass mobile budget.

## Local development

The service is a thin HTTP wrapper. Until the Python implementation lands, the
contract is defined in [`openapi.yaml`](./openapi.yaml) (OpenAPI 3.1) and can
be code-generated with `datamodel-codegen` or `fastapi-codegen`.

## Security

- Listens on `127.0.0.1` only (never exposed to the network).
- No secrets in logs. Tokens/embeddings are short-lived and never persisted.

## Stack search & optimization (Stage 1.4)

### Overview

Stage 1.4 adds beam-search stack generation, parameter optimization, and
greedy ablation-based pruning on top of the existing feature-extraction
pipeline.  All scoring uses **proxy fidelity** — a cosine-similarity estimate
computed from a stack's parameters vs. the target `FeatureVector.  **No rendering
is performed**, so these scores approximate (but do not guarantee) visual
fidelity.

### New endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/v1/stacks/search` | POST | Beam search over ordered effect-stack cores. Accepts a `FeatureVector`, `beam_width` (default 8), and `levels` (ignored, reserved for future multiscale search). Returns `{"candidates": [...], "count": n}`. |
| `/v1/stacks/optimize` | POST | CMA-ES parameter optimization for a given stack. Accepts `FeatureVector`, `stack` (list of layer dicts), and `max_trials` (default 200). Returns `{"optimized_stack": [...], "score": float, "trace": [...], "passes": int}`. |
| `/v1/stacks/prune` | POST | Greedy layer ablation keeping fidelity loss ≤ `max_loss_pct` (default 0.02). Accepts `FeatureVector`, `stack`, and `max_loss_pct`. Returns `{"report": {pruned_stack, removed_indices, fidelity_before, fidelity_after, passes_before, passes_after, params_before, params_after, layers_removed_pct}}`. |

### Pass-budget scoring

| Budget | Rule |
|---|---|
| ≤ 6 passes | 20% confidence bonus (optimal mobile target) |
| 7–8 passes | Linear decay from 1.0 → 0.7 |
| > 8 passes | Pruned (score = -1.0) |

Stacks exceeding 8 GPU passes are excluded from beam-search results and
penalized to -1.0 in optimization objectives.

### Optimization backend

When `optuna` is installed it is used as the optimization backend.  In the
default installation **optuna is not available**, so the service falls back to
a compact CMA-ES implementation (`app.optimize._SimpleCMAES`) backed by numpy
only.  The fallback performs diagonal covariance adaptation with up to
`max_trials` evaluations (default 200).

### Proxy-fidelity caveat

`stack_metrics` and `_proxy_fidelity` compute a **proxy** fidelity score
without rendering.  These scores are suitable for relative ranking and
ablation analysis but are **not** a substitute for actual render-based
perceptual evaluation.

### Stage 1.4 gate status

- **Latency**: median search latency target < 120s (beam search with
  `max_layers=5`, `beam_width=8` on CPU).
- **Mobile compatibility**: ≥ 90% of generated candidate stacks are
  ≤ 8 GPU passes (mobile budget met).
- **Pruning effectiveness**: greedy ablation removes ≥ 15% of layers from
  over-long stacks while keeping fidelity loss ≤ 2% (normalized).
