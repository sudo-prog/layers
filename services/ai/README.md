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

## Mock AI Server — Stage 1.5

Stage 1.5 uses a **mock AI server** (pure-Python rule engine) instead of a real
on-device VLM model.  The mock implements three flows that the frontend uses
during development:

| Endpoint | Method | Description |
|---|---|---|
| `/v1/vlm/refine` | POST | Simulate VLM refinement of candidate cores. Accepts `FeatureVector` + optional `candidates`. Returns `refined_candidates` (accepted/rejected, updated confidence, VLM notes), `overall_confidence`, `vlm_summary`, and `style_cluster`. |
| `/v1/vlm/regenerate` | POST | Regenerate a single layer at `layer_index`. Replaces it with the best-matching candidate core scored by proxy fidelity. Returns `regenerated_core`, `regenerated_params`, `stack`, `score`, `confidence`, `reasoning`. |
| `/v1/vlm/suggest` | POST | Suggest alternative stacks (each ≤ 8 GPU passes) ranked by proxy-fidelity score. Returns `alternatives` list, `count`, `current_stack_passes`, `current_stack_score`, `target_cluster`, `style_clusters`. |
| `/v1/vlm/optimize` | POST | Re-optimize a stack via CMA-ES parameter tuning, then compute a pruned variant. Returns `optimized_stack`, `score`, `trace`, `passes`, `pruned_stack`, `mobile_ok`. |

When the real VLM model is integrated (via `transformers`/`open_clip` or
remote inference), swap out `app/mock_ai.py`'s `MockAIServer` — the API
contract stays the same.

## Retrieval Weighting & Acceptance Dashboard — Stage 1.6

Stage 1.6 adds weighted retrieval and an acceptance-rate dashboard driven by
the event log:

| Endpoint | Method | Description |
|---|---|---|
| `/v1/retrieve` | POST | Retrieve top-k stacks for a target `FeatureVector` using the composite weighting formula. Returns ranked results, count, and the weighting formula string. |
| `/v1/dashboard/acceptance` | GET | Full matrix of all 17 core types × 4 style clusters with acceptance rates (`applied / suggested`, 0.0–1.0). |
| `/v1/style-clusters` | GET | Returns `["geometric", "organic", "texture", "smooth"]`. |
| `/v1/core-types` | GET | Returns all 17 core-type identifiers. |
| `/v1/events/suggest` | POST | Record a stack suggestion (for acceptance-rate tracking). |
| `/v1/events/apply` | POST | Record a stack application (for acceptance-rate tracking). |

**Weighting formula:**

```
score = 0.40 * cosine_sim
      + 0.30 * acceptance_rate[core_type][cluster]
      + 0.20 * recency_weight(stack.age)     # half-life: 7 days
      + 0.10 * user_rating(stack.metadata.rating)    # normalised 0-10 → 0-1
```

Weights sum to 1.0.  `recency_weight` uses a 7-day half-life decay
(`0.5 ** (age / half_life)`).  Acceptance rate is `applied / suggested` per
`(core_type, cluster)` pair, refreshed from `stack_created` and `stack_applied`
events in the event log.

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
