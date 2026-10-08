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
