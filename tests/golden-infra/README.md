# Golden Image Infrastructure

## Purpose
Deterministic headless rendering + golden-image comparison for CI.
Used by T-BE-008 (Stage 0.7) to validate shader stacks render identically across environments.

## Architecture
```
fixtures/           # Golden reference images (committed)
  bevel-emboss/
    golden.png      # Reference render
    stack.json      # Effect stack that produced it
    meta.json       # Render params (resolution, seed, etc.)
  gradient-overlay/
    ...
  noise-grain/
    ...
scripts/
  render.js         # Headless render script (Playwright + Chromium + SwiftShader)
  compare.js        # Image comparison (SSIM + pixelmatch)
  run-all.js        # Run all golden tests
output/             # Generated test results (gitignored)
  diff/
  report.json
```

## What's Implemented
- **Headless renderer**: Playwright + Chromium with SwiftShader (`--use-gl=angle --use-angle=swiftshader-webgl`) for software WebGL2 rendering on CI (no display, no GPU).
- **Deterministic WebGL flags**: `preserveDrawingBuffer: true, alpha: false, antialias: false, premultipliedAlpha: false` in the WebGL2 context (H-3).
- **Shader generation**: `generateFragmentShader()` in render.js produces GLSL for `bevel-emboss` (real shader) and placeholder solid-color shaders for other cores.
- **Stack-driven rendering**: Each fixture's `stack.json` specifies `core`, `params`, `opacity`, `blend`, and `enabled`.
- **meta.json loading**: render.js reads `meta.json` from each fixture directory and uses its `resolution` and `seed` as defaults. Environment variables (`LAYERS_RENDER_WIDTH`, `LAYERS_RENDER_HEIGHT`, `LAYERS_RENDER_SEED`) take priority over meta.json values.
- **SSIM comparison**: compare.js implements a real 11x11 Gaussian-window (sigma=1.5) Structural Similarity Index, with pixelmatch for diff image generation.
- **Fixture iteration + report**: run-all.js iterates all fixture directories, renders each stack, compares against golden.png, and writes `output/report.json`.

## Fixtures
| Fixture | Core | Description | Status |
|---|---|---|---|
| bevel-emboss | bevel-emboss | Bevel/emboss core with default parameters | Real shader |
| gradient-overlay | gradient-overlay | Linear gradient overlay (red→blue, 45°) | Placeholder shader |
| noise-grain | noise-grain | Perlin noise grain | Placeholder shader |

## Requirements
- Headless WebGL2 rendering in CI (ubuntu-latest, no display)
- Deterministic output (same input → same image, ±1% tolerance)
- SSIM >= 0.98 for deterministic cores
- Performance: < 5s per 1024x1024 render (S-0.7 threshold)

## Metrics
- **SSIM** (Structural Similarity) — primary metric, computed with 11x11 Gaussian window (sigma=1.5)
- **pixelmatch** — pixel-level diff image generation
- **LPIPS** — learned perceptual similarity (Phase 1, not yet implemented)
- **Palette distance** — color histogram comparison (Phase 1, not yet implemented)
- **Edge SSIM** — edge-aware comparison (Phase 1, not yet implemented)
- **Frequency distance** — FFT-based comparison (Phase 1, not yet implemented)

## Usage
```bash
# From the golden-infra directory
cd tests/golden-infra
pnpm install
npx playwright install chromium --with-deps

# Run all golden tests
node scripts/run-all.js

# Render a single fixture
node scripts/render.js fixtures/bevel-emboss/stack.json output/rendered.png

# Compare rendered vs golden
node scripts/compare.js output/rendered.png fixtures/bevel-emboss/golden.png 0.98

# Run performance benchmark
node scripts/benchmark.js
```

## Deterministic Rendering Flags
The headless Chromium launch uses these flags for deterministic, CI-friendly rendering:
- `--headless=new`
- `--use-gl=angle`
- `--use-angle=swiftshader-webgl`
- `--enable-unsafe-swiftshader`
- `--disable-dev-shm-usage`
- `--no-sandbox`
- `--disable-setuid-sandbox`
- `--disable-gpu-sandbox`
- `--disable-extensions`
- `--disable-background-timer-throttling`
- `--disable-renderer-backgrounding`

The WebGL2 context itself uses: `preserveDrawingBuffer: true, alpha: false, antialain: false, premultipliedAlpha: false`.

## meta.json Loading Behavior
render.js loads `meta.json` from the fixture directory (same directory as `stack.json`). If present, it reads:
- `meta.resolution.width` / `meta.resolution.height` — used as default render dimensions
- `meta.seed` — used as default random seed

Environment variables always override meta.json:
- `LAYERS_RENDER_WIDTH` overrides `meta.resolution.width`
- `LAYERS_RENDER_HEIGHT` overrides `meta.resolution.height`
- `LAYERS_RENDER_SEED` overrides `meta.seed`

If no meta.json exists, defaults are 1024x1024 and seed=42.

## Current Limitations
- Only `bevel-emboss` has a real GLSL shader implementation; `gradient-overlay`, `noise-grain`, and other cores use a placeholder solid-color shader based on a hash of the core name.
- SSIM thresholds are uniform (0.98) across all fixtures; stochastic cores may need looser thresholds once real shaders are implemented.
- LPIPS, palette distance, edge SSIM, and frequency distance metrics are not yet implemented (planned for Phase 1).
- Golden images are generated from the placeholder shaders for non-bevel-emboss fixtures — these serve as infrastructure baselines, not visual verification of actual effects.

## CI Integration
```yaml
- name: Golden image tests
  run: |
    cd tests/golden-infra
    npm install -g playwright
    npx playwright install chromium --with-deps
    node scripts/run-all.js
```

## Status
- [x] Headless renderer (Playwright + Chromium + SwiftShader)
- [x] Golden fixtures (bevel-emboss, gradient-overlay, noise-grain)
- [x] Comparison pipeline (SSIM + pixelmatch)
- [ ] CI integration (not yet wired to repo CI)
- [x] Performance benchmarking (benchmark.js)
- [x] Documentation

## References
- [[03-Reference/Gates]] — Quality gates
- [[01-Roadmap/S-0.7]] — Stage 0.7 spec
- [[03-Reference/Cores]] — 7 shader cores
- ADR-012 — Graphite strategy (reference-only)
