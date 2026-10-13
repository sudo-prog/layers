# Evaluation Service (services/eval)

Offline evaluation harness for LAYERS renders. Produces the golden-image
comparisons, metrics and benchmarks used to gate CI before any change ships
to the desktop.

## Responsibilities

| Capability | Description |
|---|---|
| Golden-image comparison | Render a preset against a fixed seed and diff against a checked-in reference PNG. |
| Metrics | Structural similarity (SSIM), per-channel MSE, and perceptual distance (LPIPS-style). |
| Benchmarking | Sweep a parameter space, collect timings, emit a report JSON. |

## Architecture

```
contracts/*.schema.json ──►  services/eval  ──►  tests/golden-infra/
  (effect stacks)              (compare +      (reference PNGs,
                              metrics)        run scripts)
```

The harness reads presets validated by `packages/schema`, renders them through
the headless WebGL pipeline, and asserts against stored reference images. The
threshold and seed are environment variables
(`LAYERS_GOLDEN_THRESHOLD`, `LAYERS_GOLDEN_SEED`) injected by CI.

## Local development

Until the headless renderer is wired up, the service documents its contract
here and consumes the OpenAPI/CLI surface defined by `tests/golden-infra`.

## Security

- Renders never hit the network.
- Output PNGs are written to `tests/golden-infra/output/` (git-ignored).
