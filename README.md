# LAY//ERS

Layer-based design tool where cores replace traditional layer styles. Built on a shader-first architecture with a Graphite basis (ADR-012) for desktop/iPad and a light WebGL2/WebGPU renderer for phone.

See the [Product Vision](03-Reference/Product-Vision) in the vault for the full brief.

## Repository locations

| Item | Path |
|---|---|
| Code (this repo) | `~/Data/20_Projects/20.34_LAYERS` |
| Vault | `~/Data/20_Projects/20.34_LAYERS-Vault` |
| GitHub | `github.com/sudo-prog/layers` (private) |

Both peers use the **same relative path** (`~/Data/20_Projects/...`) — ThinkPad and MacBook Air.

Syncthing syncs the code folder between peers; `.git` is deliberately excluded from sync, so
**git push/pull is the mechanism for code**, and Syncthing carries only working-tree files.
`.stignore` must be present on **both** devices (it is per-device, never synced).

> **Convention:** all numbered project folders live under `~/Data/20_Projects/`. Never at the home root.

## Project Status (2026-10-09)

**Phase:** 0.1 (Setup & decisions) — **COMPLETE**
**Phase:** 0.7 (Eval harness) — **COMPLETE** (metrics.js + curate-benchmark.js + benchmark pipeline green)
**Phase:** 1.2 (Feature extraction) — **COMPLETE**
**Phase:** 1.3 (Core scaffolding) — **COMPLETE**

### Backend (BE)
- T-BE-001: Private GitHub repos + protections ✅
- T-BE-002: Syncthing + .stignore ✅
- T-BE-004: Monorepo skeleton + CI + CODEOWNERS + pre-commit hook ✅
- T-BE-005: Preset JSON Schema v0 + contracts (17 tests) ✅
- T-BE-006: License register (17 OK / 8 WARNING / 1 BLOCKED) ✅
- T-BE-007: Skills audit (7/13 categories) ✅
- T-BE-008: Headless renderer + golden-image infra ✅ (3 fixtures, SSIM, benchmark)

### Backend (BE) — Phase 1.2
- Feature extraction pipeline (palette, edges, frequency, tone, CLIP) ✅
- Cross-reference consistency + outlier detection ✅
- FastAPI service skeleton + job queue ✅
- packages/sync: SyncProvider + MemorySyncProvider (13 tests) ✅
- packages/vector: VectorStore + MemoryVectorStore (11 tests) ✅
- services/ai: OpenAPI 3.1 spec ✅
- services/eval: README ✅
- services/learning: README ✅

### Frontend (FE) — Stage 0.2/0.3 foundation
- `@layers/engine` — WebGL2 context manager (context-loss recovery), ping-pong FBOs, pass interface, blend composite (16 modes), multi-pass Renderer with **program cache** (compiles once, not per frame). 11 tests.
- `@layers/cores` — **All 7 cores** with real GLSL: Pattern/Dither, Noise/Grain, Blur, Displacement, Color/Blend, Lighting, Outline. Cores 1–2 vendor **Paper Shaders** (Apache-2.0) — real Bayer matrices, `getBayerValue()`, simplex noise. 33 tests.
- `@layers/stack` — Effect stack state management (add/remove/update/move/toggle/select), pass estimation, mobile budget check. 11 tests.
- `@layers/ui` — Design tokens (color/spacing/typography/motion), CSS variable generation, WCAG AA contrast checking, light/dark themes. 9 tests.
- `tests/e2e/` — Live browser verification (Playwright + SwiftShader WebGL2): context creation, GLSL compilation for all 7 cores, multi-pass render pixel audit, context-loss, resize, readPixels-synced FPS benchmark. 13 checks.
- `tests/golden-infra/scripts/cores-golden.js` — Per-core golden images rendered through the **real** engine+cores pipeline, with an **effect-presence guard** that catches shaders which silently no-op. 8 fixtures, SSIM 1.0000.
- `third_party/paper-design-shaders/` — Vendored Paper Shaders v0.0.81 with LICENSE, NOTICE, and PROVENANCE.md.
- `docs/EFFICIENCY-LEDGER.md` — Pass/param/look/ms accounting + Simplification Gate verdict.

**Note on FPS:** The e2e benchmark uses `readPixels` as its GPU sync primitive because `gl.finish()` is a no-op in Chromium/SwiftShader builds (returns immediately without waiting for the rasteriser). Numbers are a CPU-rasterisation lower bound; the Stage 0.2 gate (8-pass >= 30 fps @ 1536px on reference phone) requires real hardware.

### Manager (MGR)
- T-M-001: License audit addendum ✅
- T-M-002: Phone renderer backend choice
- T-M-003: Graphite basis spike (ADR-012)
- T-M-004: Graphite license/trademark/repo strategy ✅
- T-M-005: Core 8 Relief v0

### CI Jobs (5)
1. lint-typecheck-test
2. license-check (cross-checks against docs/licenses.md)
3. conflict-files (sync-conflict + .env detection)
4. ownership-check (CODEOWNERS enforcement)
5. golden-image (Playwright + Chromium + SwiftShader)

### Key Decisions
- Graphite: reference-only (no fork, dual MIT/Apache-2.0)
- Headless GL: Playwright + Chromium + SwiftShader (full WebGL2, deterministic)
- GSAP: OK for now, "Prohibited Uses" clause flagged
- Ownership: pre-commit hook + CI script enforce CODEOWNERS
- Turborepo 2.0: `pipeline` renamed to `tasks`

### Tests
- 105/105 JS unit tests passing (7 packages: schema, sync, vector, engine, cores, stack, ui)
- Python tests: NOT VERIFIABLE on Mac (pytest not installed locally; BE reports 57/57 on ThinkPad)
- 3/3 golden-image fixtures passing (legacy)
- 8/8 per-core golden checks passing (SSIM 1.0000, effect-presence guard on)
- **42/42 multi-look checks passing — Stage 0.3 gate: >= 6 distinct looks per core, all 7 cores**
- 13/13 live browser checks passing (tests/e2e)
- pnpm build: 7/7 tasks successful
- pnpm test: 15/15 turbo tasks successful

### Commits
- 15+ commits on main (2026-10-07 → 2026-10-09)
- Branch feat/preset-schema-v0 merged to main
