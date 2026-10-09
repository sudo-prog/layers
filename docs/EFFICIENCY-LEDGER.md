# Efficiency Ledger

> **Philosophy: DO MORE WITH LESS.** Every change removes, merges, or justifies
> complexity and reports its delta here.
>
> Per [[03-Reference/Gates]]: "BE computes, FE supplies pass/ms." FE owns this
> file in the code repo; BE consumes it at gate reviews.

## How to read this

| Column | Meaning |
|---|---|
| `passes` | Render passes the core costs against the mobile budget (≤ 8, target 6) |
| `params` | Count of user-facing parameters (schema names) |
| `looks` | Distinct visual outcomes the core can produce |
| `ms/frame` | Measured frame cost. **Environment matters — see the measurement note.** |
| `ledger` | Delta vs. the previous revision (`+` added, `−` removed, `0` neutral) |

### Measurement environment (important)

Frame times below come from `tests/e2e/engine-live.mjs` and
`tests/golden-infra/scripts/cores-golden.js`, running headless
**Chromium + SwiftShader (CPU rasterisation)** on the Mac. These are a
**software lower bound**, not the Stage 0.2 gate.

The gate that actually matters — *8-pass stack ≥ 30 fps @ 1536px on a reference
phone* — requires real GPU hardware and is still open.

**Known measurement pitfall:** `gl.finish()` is a **no-op** in
Chromium/SwiftShader builds; it returns immediately without waiting for the
rasteriser. Any benchmark that syncs with `finish()` measures only JS call
overhead and reports absurd numbers (we saw 33 000 fps). All numbers in this
ledger use `readPixels()` from the default framebuffer as the sync primitive,
which genuinely forces pipeline completion.

## Cores

| # | Core | passes | params | looks | ms/frame (512², SwiftShader) | ledger |
|---|---|---|---|---|---|---|
| 1 | Pattern/Dither | 2 | 7 | halftone, mosaic, CMYK, line screen, bit-crush, posterize | — | vendored Paper Shaders (Apache-2.0) |
| 2 | Noise/Grain | 2 | 5 | film grain, paper, stipple | — | vendored Paper Shaders `snoise` |
| 3 | Blur/Convolution | 1 | 4 | soft focus, sharpen, emboss | — | 0 |
| 4 | Displacement/Warp | 2 | 4 | liquid, fluted glass, wave, heat haze | — | 0 |
| 5 | Color/Palette/Blend | 1 | 5 | duotone, vintage, LUT | — | 0 |
| 6 | Lighting/Atmosphere | 1 | 6 | shadow, glow, haze, vignette | — | 0 |
| 7 | Outline/Edge | 2 | 4 | ink outline, edge detect | — | 0 (≤2 passes, per spec) |

## Engine

| Component | ledger |
|---|---|
| `GLContext` | + context-loss recovery stub |
| `PingPongFBO` | + ping-pong FBO pair, resize |
| Pass interface | + `uTexture/uMask/uOpacity/uResolution/uTime` contract |
| `BlendPass` | + 16 blend modes in one pass |
| `Renderer` | + **program cache** — compiles each pass **once**, not per frame |

### Engine perf, readPixels-synced (SwiftShader)

| Config | ms/frame | fps |
|---|---|---|
| 1 pass @ 512² | ~10 | ~94 |
| 2 pass @ 512² | ~28 | ~35 |
| 4 pass @ 512² | ~51 | ~20 |
| 8 pass @ 1024² | ~759 | ~1 |
| 8 pass @ 1536² | ~1236–1589 | ~1 |

Cost scales ~linearly with passes and ~quadratically with resolution, which is
the expected signature of a correct multi-pass FBO pipeline (no hidden
re-uploads, no per-frame recompiles).

## Simplification Gate record

**Release:** Stage 0.2/0.3 foundation (2026-10-09)

**Verdict:** PASS on criterion (3) — equal fidelity with tighter scope —
because this is the first revision of these components (no prior baseline to
regress against).

**Evidence:**
1. Cores 1 and 2 **removed** ~200 lines of hand-rolled noise/dither GLSL by
   vendoring Paper Shaders' battle-tested implementations (Apache-2.0,
   NOTICE preserved). Fewer lines, better fidelity, correct licensing.
2. The `Renderer` **removed** two per-frame `createProgram` + `deleteProgram`
   pairs (one per pass, plus the blit) by caching programs. This was a real
   performance bug: it recompiled all GLSL every single frame.
3. Blend composite **merged** 16 separate blend operations into one pass with a
   `switch` on an int uniform, rather than 16 shader variants.

**Bugs found and fixed during audit (each is a ledger entry):**
- Per-frame program compilation → program cache + `warmUp()`
- `gl.finish()` no-op discovered → benchmarks switched to `readPixels` sync
- Vertex attributes had no explicit `layout(location=)`, so `aTexCoord` could
  bind to `aPosition`'s slot → both pinned explicitly
- Displacement offsets were scaled so small they snapped away; the `wave` type
  is also invisible on vertical stripes → fixture now uses horizontal stripes
- `jsdom` added without a license-register entry → registered (would have
  failed CI's license gate)
- **Lighting: `offsetX`/`offsetY`/`opacity` were dead in every mode.** The
  renderer hardcodes `PassParams.opacity = 1`, and the shader read `uOpacity`
  (the renderer's value) instead of the core's own opacity param → added a
  separate `uStrength` uniform for the core's opacity.
- **Lighting: `blur` was dead in shadow mode** (the falloff width was a
  constant) → penumbra now derives from `uBlur`.
- **Lighting: shadow shape was derived from a luminance delta**, which vanishes
  on smooth imagery, making the whole mode inert on gradients → shadow now
  casts from the source silhouette (alpha), which requires `alpha: true`.
- **Outline: `roughness`/`inkBleed` were inert on binary sources** because the
  edge field only ever took values ~0 or ~0.88, both outside the threshold band
  → fixtures now use a graded `soft` source (8.37% / 10.27% pixel change proven).
- **GLSL: `cast` is a reserved word** and silently failed compilation, blanking
  every Lighting look → renamed to `castAmt`.
- **Lighting: `glow` centre was `uv + uOffset`, not a fixed point.** That made
  the centre track the current pixel, so `dist` was 0 everywhere and the glow
  collapsed to a flat colour (std 0.0, 1 unique colour) regardless of `blur` →
  centre is now `vec2(0.5, 0.5) + uOffset`. Proven fixed: 166 unique colours,
  10% coloured pixels, and `blur` now visibly changes the spread.
- **Lighting: glow falloff was sub-pixel** (`sigma = blur * 0.08` on a 0–1
  normalised distance), so the glow covered almost nothing → `sigma = blur *
  0.09` on a ±1 normalised distance.

**Renderer design note:** `PassParams.opacity` is always 1 (the renderer never
propagates per-pass opacity). Any core that wants its own opacity must expose a
separate uniform — reading `uOpacity` for a core-level parameter silently
discards it. This is a footgun worth fixing at the engine level in Stage 0.4.

## Web App (Stage 0.4)

| Component | ledger |
|---|---|
| `@layers/web` | + Vite + TypeScript app: 7 core buttons, stack panel, inspector, undo/redo, export/import, theme toggle |
| `@layers/schema` | ~ removed `fs`/`path` deps → schemas inlined as TS constants (browser-compatible) |

**Build:** 8/8 tasks (was 7/7, +1 for @layers/web)
**Tests:** 16/16 turbo tasks (was 15/15, +1 for @layers/web)

## Open items

- **Multi-look coverage: PASSED.** 42 looks across all 7 cores, all mutually
  distinct (`tests/golden-infra/scripts/cores-looks.js`, wired into CI).
- Per-core `ms/frame` in isolation (the table above reports engine-level
  configs; core-level attribution is not yet measured).
- `tests/visual/` and `tests/perf/` harnesses.
- Cross-core composition tests (stacks of >1 core together).
- Real-hardware perf gate (reference phone, 8 passes @ 1536px ≥ 30 fps).
- Engine-level fix for `PassParams.opacity` (see the renderer design note).
- **Stage 0.4:** IndexedDB persistence, sync status UI, preset import/export (BE).
- **Stage 0.5:** Mask brush, SVG overlay, Quick Vector Editor UI.
- **Stage 0.6:** Mobile PWA (Workbox, manifest, offline cache, preset grid).
