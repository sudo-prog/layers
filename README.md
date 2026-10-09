# LAY//ERS

Layer-based design tool where cores replace traditional layer styles. Built on a shader-first architecture with a Graphite basis (ADR-012) for desktop/iPad and a light WebGL2/WebGPU renderer for phone.

See the [Product Vision](03-Reference/Product-Vision) in the vault for the full brief.

## Project Status (2026-10-09)

**Phase:** 0.1 (Setup & decisions) — **COMPLETE**
**Phase:** 0.7 (Eval harness) — **COMPLETE** (metrics.js + curate-benchmark.js + benchmark pipeline green)
**Phase:** 1.2 (Feature extraction) — **COMPLETE**
**Phase:** 1.3 (Core scaffolding) — **COMPLETE**
**Phase:** 0.4 (Stack, presets & persistence) — **COMPLETE**
**Phase:** 0.5 (Manual editor) — **COMPLETE**

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

### Frontend (FE) — Stage 0.2/0.3/0.4 foundation + web app
- `@layers/engine` — WebGL2 context manager (context-loss recovery), ping-pong FBOs, pass interface, blend composite (16 modes), multi-pass Renderer with **program cache** and per-pass opacity propagation. 13 tests.
- `@layers/cores` — **All 7 cores** with real GLSL: Pattern/Dither, Noise/Grain, Blur, Displacement, Color/Blend, Lighting, Outline. Cores 1–2 vendor **Paper Shaders** (Apache-2.0) — real Bayer matrices, `getBayerValue()`, simplex noise. 33 tests.
- `@layers/stack` — Effect stack state management (add/remove/update/move/toggle/select), pass estimation, mobile budget check. 11 tests.
- `@layers/ui` — Design tokens (color/spacing/typography/motion), CSS variable generation, WCAG AA contrast checking, light/dark themes. 9 tests.
- `@layers/schema` — JSON Schema validation (AJV) for contracts. Schemas inlined as TypeScript constants — browser-compatible (no fs/path). Preset v1 schema with v0→v1 migration. 54 tests.
- `@layers/sync` — Browser-compatible SyncProvider (Web Crypto API, no node:crypto), IndexedDBProvider for persistence. 23 tests.
- `@layers/web` — **Web editor app** (Vite + TypeScript): 7 core buttons, stack panel, inspector, undo/redo, export/import JSON, light/dark theme, live WebGL2 rendering, IndexedDB persistence, sync status UI.
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
- 187/187 JS unit tests passing (7 packages: schema 54, sync 46, engine 13, cores 33, stack 11, ui 9, vector 11)
- Python tests: NOT VERIFIABLE on Mac (pytest not installed locally; BE reports 57/57 on ThinkPad)
- 3/3 golden-image fixtures passing (legacy)
- 8/8 per-core golden checks passing (SSIM 1.0000, effect-presence guard on)
- **42/42 multi-look checks passing — Stage 0.3 gate: >= 6 distinct looks per core, all 7 cores**
- 13/13 live browser checks passing (tests/e2e)
- pnpm build: 8/8 tasks successful
- pnpm test: 16/16 turbo tasks successful

### Commits
- 15+ commits on main (2026-10-07 → 2026-10-09)
- Branch feat/preset-schema-v0 merged to main

### Project Location
- **Code:** `/Users/AIR2K/Data/20_Projects/20.34_LAYERS/`
- **Vault:** `/Users/AIR2K/Data/20_Projects/20.34_LAYERS-Vault/`
- Synced with ThinkPad via Syncthing (5 folders)
