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
  benchmark.js
  compare.js
  cores-golden.js   # Per-core golden tests: renders the REAL @layers/engine +
                    # @layers/cores pipeline, SSIM vs baseline, plus a
                    # zero-control effect-presence guard.
  curate-benchmark.js
  metrics.js
  render.js         # Headless render script (Playwright + Chromium + SwiftShader)
  run-all.js        # Run all golden tests
fixtures/           # Golden reference images (committed) — legacy shader fixtures
fixtures-cores/     # Per-core golden PNGs + JSON fixture defs (committed)
output/             # Generated test results (gitignored)
```

## Per-core golden tests (`cores-golden.js`)

Unlike `render.js` (which has its own hardcoded shader generator),
`cores-golden.js` renders through the **real** `@layers/engine` +
`@layers/cores` packages, so it validates the shipping code path.

Two checks per fixture:

1. **SSIM vs. golden baseline** — threshold 0.98 (0.90 for stochastic cores).
2. **Effect-presence guard** — for fixtures declaring `zeroControl`, the core
   is re-rendered with the effect disabled and the output must differ by
   ≥ 0.5% of pixels. SSIM alone cannot catch a shader that silently no-ops,
   which is a bug we actually hit.

```bash
node scripts/cores-golden.js --generate   # write golden PNGs + fixture JSON
node scripts/cores-golden.js --verify     # compare against goldens
```

Determinism: fixed seed, `uTime` pinned to 0, SwiftShader software raster,
`preserveDrawingBuffer` so the canvas is captured verbatim. Verified
pixel-identical (SSIM 1.0000) across independent browser sessions.

**Source-pattern pitfall:** a Y-axis displacement is invisible on *vertical*
stripes (shifting a uniform column in y changes nothing), so the displacement
fixture uses `stripes-h`.

## Multi-look coverage gate (`cores-looks.js`)

The Stage 0.3 gate requires each core to reproduce **≥ 6 reference looks**, each
at SSIM ≥ 0.9. One golden PNG per core proves the shader renders *something* —
it does **not** prove the core can produce six *different* looks. A core with a
dead parameter would still pass a single-look golden test, which is exactly the
class of bug this gate exists to catch.

`cores-looks.js` renders every declared look through the real pipeline and
asserts each one:

1. **Renders non-blank** (and the WebGL context was not silently dropped —
   browsers cap live contexts at ~16).
2. **Look count ≥ 6**.
3. **Looks are mutually distinct**:
   - Deterministic cores: SSIM < 0.95 between any two looks.
   - Stochastic cores (`NoiseGrainCore`): a luminance **std-dev spread ≥ 2.0**
     instead, because SSIM measures local structural correlation and two
     *different* noise fields have no structure to correlate — they legitimately
     score ~0.95–0.98 against each other.

```bash
node scripts/cores-looks.js           # check all looks
node scripts/cores-looks.js --json    # machine-readable report
```

### Source-pattern rules learned the hard way

Which test source a look needs is not arbitrary — the wrong source makes a
correct shader look broken:

| Effect | Required source | Why |
|---|---|---|
| Y-axis displacement / wave | `stripes-h` (horizontal) | A uniform column shifted in y is unchanged |
| Outline `roughness` / `inkBleed` | `soft` (graded) | On a binary checkerboard the edge field only takes ~0 or ~0.88, both outside the threshold band |
| Lighting `glow` | `soft` (graded) | On a flat source every pixel clamps to the same value |
| Lighting `shadow` | `shapes` (opaque on transparency) + `alpha: true` | A drop shadow casts from the source **silhouette**; with `alpha:false` the alpha channel is forced to 1.0 and it renders blank |

**Bugs this gate caught:** `blur` was dead in shadow mode; `offsetX`/`opacity`
were dead in every Lighting mode (the renderer hardcodes pass opacity to 1);
`roughness`/`inkBleed` were inert on binary sources; and `cast` is a GLSL
reserved word that silently failed compilation.

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
- Only `bevel-emboss` has a real GLSL shader implementation on the **legacy single-core path**; `gradient-overlay`, `noise-grain`, and other cores use a placeholder solid-color shader based on a hash of the core name. The **layered path** (`buildLayeredFragmentShader`, used by the benchmark/calibration stacks) implements all 16 layer cores with real math — see "Layered rendering in `render.js`" below.
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

## Calibration (Stage 0.7)

The human-calibration harness validates that the automated composite similarity
metric (from `metrics.js`) correlates with human pairwise judgments. This is the
Stage 0.7 gate: **Spearman rho >= 0.7** against >= 200 human pairwise judgments.

### Scripts

- `scripts/calibrate.js` — Selects N deterministic pairs (two **different**
  style sets on the **same** content image) from the benchmark manifest, renders
  both stacks, computes `computeAllMetrics` on each pair, and writes
  `output/benchmark/calibration/calibration-study.json`.
- `scripts/calibrate-check.js` — Computes Spearman rank correlation between
  `composite_score` and `human_judgment` across all pairs with a non-null
  judgment. Falls back to a built-in synthetic 20-pair example (known rho ~0.85)
  when fewer than 2 human judgments are present.

### Running calibrate.js

```bash
cd tests/golden-infra
# Default: 30 pairs
node scripts/calibrate.js

# Custom pair count
LAYERS_CALIBRATION_N=10 node scripts/calibrate.js
```

Outputs:
- `output/benchmark/calibration/calibration-study.json` — study file with
  `generated_at`, `seed`, `n_pairs`, and a `pairs` array.
- `output/benchmark/calibration/pairs/pair-0000/` — per-pair directory
  containing `a.png`, `b.png`, `stack-a.json`, `stack-b.json`.

Each pair object has: `pair_id`, `image` (content image id), `style_a`,
`style_b`, `composite_score`, `image_a_path`, `image_b_path`, and
`human_judgment` (set to `null` initially — humans fill this in).

### Human annotation

Open `output/benchmark/calibration/calibration-study.json` in a text editor.
For each pair, edit the `human_judgment` field to an integer from 1 to 5, where
**5 = most similar** (nearly identical) and **1 = least similar** (very
different). The images are at the relative paths under
`output/benchmark/calibration/pairs/`.

### Running calibrate-check.js

```bash
cd tests/golden-infra
node scripts/calibrate-check.js
echo $?  # 0 = PASS, 1 = FAIL
```

Prints the Spearman rho, number of judged pairs, the 0.7 threshold, and
PASS/FAIL. With no human judgments it prints `SYNTHETIC — known correlation
~0.85` and exits 0 (validates the harness logic).

### Determinism check

When `LAYERS_CALIBRATION_DETERMINISM=1`, `calibrate.js` renders the same pair
twice (same seed), computes `computeAllMetrics` on each render, and prints both
composite values, the delta, and PASS/FAIL vs 1% tolerance. This is **print
only** — it never causes the script to fail.

```bash
LAYERS_CALIBRATION_DETERMINISM=1 node scripts/calibrate.js
```

Result is written to
`output/benchmark/calibration/determinism/determinism-report.json`.

### Gate

| Metric | Threshold | Status |
|---|---|---|
| Determinism (delta) | <= 1% | Ready — see determinism-report.json |
| Human correlation (rho) | >= 0.7 | Harness ready, awaiting judgments |

### Layered rendering in `render.js` (fixed 2026-10-09)

**Two stack shapes exist, and only one was being rendered.**

`curate-benchmark.js` emits stacks with a **`layers` array** (content layer +
style core + effect layers, each with its own `core`/`params`/`opacity`/`blend`).
`render.js` only read the top-level `stack.core`, which is **`undefined` for
every layered stack** — so `generateFragmentShader()` fell into its
`'unknown'` branch and rendered *one flat solid colour* for every stack.

Symptom: **every `composite_score` came out exactly `1.0`**, because
`computeAllMetrics` was comparing two identical flat images. That looked like a
metrics bug but was a rendering bug.

Fix: `buildLayeredFragmentShader(layers)` now composes all layers, each with its
own GLSL and one of the 13 blend modes. Two paths are kept deliberately
separate so the 3 committed fixture goldens stay byte-identical:

- **Legacy** (`stack.core` present) — unchanged, `run-all.js` still 3/3 PASS.
- **Layered** (`stack.layers` present) — new multi-layer path.

Layer params are **baked in as GLSL literals**, not uniforms, because GLSL ES
3.0 forbids `uniform` declarations inside a nested `{}` scope. Only `uSeed` is
a uniform (it carries `LAYERS_RENDER_SEED`).

Verified after the fix: two different style sets on the same content image now
give composite **0.345** (was 1.0); re-rendering the same stack gives
**1.000000** (pixel-identical, delta 0). Shader compile/link failures now
`throw` instead of silently drawing a black frame — that silent failure is what
let the flat-colour renders go undiagnosed.

### CLIP RGB-histogram fallback caveat

`computeAllMetrics` uses CLIP embeddings when `LAYERS_CLIP_API` is set. Without
a live CLIP API, the `clip` metric falls back to an RGB-histogram cosine
distance (see `metrics.js` → `getClipEmbedding` → `rgbHistogramFeatures`). This
is a coarse proxy — it captures color distribution but not semantic content.
The `lpips` metric (multi-scale perceptual distance), `palette`, `edge`, and
`frequency` metrics are all computed from pixels directly and do not depend on
a live API.

### Status

- Harness ready: `calibrate.js` and `calibrate-check.js` are functional
- 30 pairs generated in ~269s (SwiftShader renders at ~9s/pair)
- Composite scores now have real variance: range 0.311–0.845, mean 0.591
  (was uniformly 1.0 before the layered-render fix)
- Determinism: PASS (delta = 0.00000000, renders pixel-identical)
- Goldens: 3/3 PASS after the render.js change (no regression)
- Awaiting human judgments for the rho >= 0.7 gate
