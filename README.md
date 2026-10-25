# LAY//ERS

Layer-based design tool where cores replace traditional layer styles. Built on a shader-first architecture with a Graphite basis (ADR-012) for desktop/iPad and a light WebGL2/WebGPU renderer for phone.

See the [Product Vision](03-Reference/Product-Vision) in the vault for the full brief.

> **⚠️ Course Correction (2026-10-19):** The original implementation was the "do more with less" mobile prototype — NOT the full desktop/iPad vision. The 7-core renderer is production-ready; document model, UI, and AI pipeline need rebuilding. See `docs/Course-Correction.md` (vault) for details.
>
> **✅ Desktop surface added (2026-10-21):** `apps/LAYERS_DESKTOP` is the full-canvas shader editor — a shader tree, a layer stack, a full-bleed canvas the panels glass over, and a props panel, with multiple shaders coexisting as frames. It reuses `packages/engine`, `packages/cores` and `packages/stack` unchanged; only the shell is new. Runs on `:3003`. See `apps/LAYERS_DESKTOP/README.md`.

## Repository layout

```
20.34_LAYERS/
├── apps/                    # Deployable shells — thin; wire packages together
│   ├── web/                 #   mobile PWA editor          (:3000)
│   └── LAYERS_DESKTOP/      #   desktop shader editor      (:3003)
├── packages/                # Shared, reusable code — where most logic lives
│   ├── engine/              #   WebGL2/WebGPU context, passes, renderer, caches
│   ├── cores/               #   the 7 shader cores (GLSL)
│   ├── stack/               #   effect-stack state + budget checks
│   ├── ui/                  #   design tokens, themes, contrast checking
│   ├── schema/              #   JSON Schema validation + migrations
│   ├── sync/                #   SyncProvider, IndexedDB persistence
│   ├── vector/              #   VectorStore
│   └── tsconfig/            #   shared TypeScript config
├── services/                # Python backends (not pnpm workspaces)
│   ├── ai/                  #   FastAPI: extraction, ranking, fallback
│   ├── eval/                #   evaluation harness
│   └── learning/            #   learning store
├── tests/                   # e2e + golden-image infrastructure
├── tools/                   # scripts, generators, CI helpers
├── docs/                    # design systems, reviews, license register
├── contracts/               # cross-agent API/schema contracts
├── .github/                 # workflows + ownership-check script
├── CODEOWNERS               # BE/FE ownership rules (enforced by hook + CI)
├── pnpm-workspace.yaml      # workspace globs
└── turbo.json               # task graph
```

**Boundary rule:** shared packages must never import from `apps/`. Logic belongs in
`packages/`; apps stay thin. iPad is deliberately **not** a separate app — the UI is not
substantially different, so it should be an adaptive layout within `apps/web`.

## Getting started

```bash
pnpm install                      # install every workspace package

# Run one app (turbo runs every dev task in parallel, which clashes on ports)
pnpm --filter @layers/web dev            # mobile PWA       -> http://localhost:3000
pnpm --filter @layers/desktop dev        # desktop editor   -> http://localhost:3003

# Everything at once (both apps + watchers)
pnpm dev
```

### Common tasks

```bash
pnpm build                        # turbo build, dependency-ordered
pnpm test                         # turbo test across the workspace
pnpm lint                         # turbo lint

pnpm --filter @layers/engine test        # one package
pnpm --filter @layers/cores build        # one package

# Python service
cd services/ai && pip install -r requirements.txt && python -m pytest tests/ -v

# Golden-image + e2e (Playwright + Chromium/SwiftShader)
cd tests/golden-infra && pnpm install && npx playwright install chromium --with-deps
node scripts/run-all.js
```

### Deploy

```bash
pnpm deploy    # wrangler pages deploy apps/web/dist --project-name layers
```

> The Pages project is named **`layers`** (its subdomain is `layers-403.pages.dev`).
> `layers-403` is *not* the project name.

## Apps

| App | Port | What it is |
|--|--|--|
| `apps/web` | 3000 | The mobile prototype — single stack, phone-first, PWA. |
| `apps/LAYERS_DESKTOP` | 3003 | The desktop editor — shader tree, multi-shader canvas, props panel. |

Both share the same engine, cores and stack model. The desktop app exists because
the mobile shell is built around one stack and a bottom tab bar; the desktop
surface is built around a layer tree and a full-canvas workspace.


## Project Status (2026-10-23)

**Phase:** 0.1 (Setup & decisions) — **COMPLETE**
**Phase:** 0.7 (Eval harness) — **COMPLETE** (metrics.js + curate-benchmark.js + benchmark pipeline green)
**Phase:** 1.2 (Feature extraction) — **COMPLETE**
**Phase:** 1.3 (Core scaffolding) — **COMPLETE**
**Phase:** 0.4 (Stack, presets & persistence) — **COMPLETE**
**Phase:** 0.5 (Manual editor) — **COMPLETE**
**Phase:** 0.6 (Mobile PWA) — **COMPLETE**
**Phase:** 1.4 (Stack search & optimization) — **COMPLETE** (gate PASS: latency 10.6ms, mobile 100%, pruning 57.1%)
**Phase:** 1.5 (Review & refine UI) — **COMPLETE** (PR #9 merged 73f8cef: review screen + split-view/onion-skin/diff-map/isolate)
**Phase:** 1.6 (Learning store) — **COMPLETE** (PR #10 merged 0637478: opt-in consent, event log, acceptance dashboard, retrieval)
**Phase:** 2.1 (Smarter AI) — **COMPLETE** (classical fallback + learned ranker + simplification pass; 57 new Python tests)
**Phase:** 2.2 (Sharing & library) — **COMPLETE** (PR #14 d4d44a7 + thumbnails with real rendered previews)
**Phase:** 2.3 (Performance & reliability) — **PARTIAL** (shader compile cache + adaptive quality + WebGPU parity done; device matrix + soak test need real hardware)
**Phase:** 2.4 (Accessibility, security, compliance) — **PARTIAL** (security review done + all 7 findings fixed; privacy review done + all Medium findings resolved; axe-core run pending — would add dep)
**Phase:** 2.5 (Beta & v1.0 launch) — **PARTIAL** (launch checklist + rollback drill script + docs site done; closed beta + staged rollout pending — private personal use until out of beta)

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
- `@layers/engine` — WebGL2 context manager (context-loss recovery), ping-pong FBOs, pass interface, blend composite (16 modes), multi-pass Renderer with **program cache** and per-pass opacity propagation. **Shader compile cache** (localStorage) + **adaptive quality** (EMA FPS monitor) + **WebGPU parity** (detection + context). 99 tests.
- `@layers/cores` — **All 7 cores** with real GLSL: Pattern/Dither, Noise/Grain, Blur, Displacement, Color/Blend, Lighting, Outline. Cores 1–2 vendor **Paper Shaders** (Apache-2.0) — real Bayer matrices, `getBayerValue()`, simplex noise. 40 tests (33 unit + 7 cross-core composition).
- `@layers/stack` — Effect stack state management (add/remove/update/move/toggle/select), pass estimation, mobile budget check. 11 tests.
- `@layers/ui` — Design tokens (color/spacing/typography/motion), CSS variable generation, WCAG AA contrast checking, light/dark themes. 9 tests.
- `@layers/schema` — JSON Schema validation (AJV) for contracts. Schemas inlined as TypeScript constants — browser-compatible (no fs/path). Preset v1 schema with v0→v1 migration. 54 tests.
- `@layers/sync` — Browser-compatible SyncProvider (Web Crypto API, no node:crypto), IndexedDBProvider for persistence. 46 tests.
- `@layers/web` — **Web editor app** (Vite + TypeScript): 7 core buttons, stack panel, inspector, undo/redo, export/import JSON, light/dark theme, live WebGL2 rendering, IndexedDB persistence, sync status UI, review screen, learning store, library, comparison tools, AI panel, error boundary, consent, real thumbnails. 155 tests.
- `tests/e2e/` — Live browser verification (Playwright + SwiftShader WebGL2): context creation, GLSL compilation for all 7 cores, multi-pass render pixel audit, context-loss, resize, readPixels-synced FPS benchmark. 13 checks.
- `tests/golden-infra/scripts/cores-golden.js` — Per-core golden images rendered through the **real** engine+cores pipeline, with an **effect-presence guard** that catches shaders which silently no-op. 8 fixtures, SSIM 1.0000.
- `third_party/paper-design-shaders/` — Vendored Paper Shaders v0.0.81 with LICENSE, NOTICE, and PROVENANCE.md.
- `docs/EFFICIENCY-LEDGER.md` — Pass/param/look/ms accounting + Simplification Gate verdict + bundle size audit.
- `docs/CI-RUNNER.md` — The CI pipeline as it is: the 7 jobs, the self-hosted runner + kill switch, the two defects that made CI red from the first commit, and why `exit 137` was a watchdog kill rather than an OOM kill.
- `docs/FE-OWNED-FIXES-PENDING-MAC-AGENT.md` — Three verified FE-owned fixes (ui test expectation, dead web debug code, e2e launch retry) that the pre-commit hook blocks from this machine.
- `docs/design-graphite.md` — The graphite glass design system: tokens, every measurement behind them, the load-bearing constraints.
- `docs/research/layers-studio-design-system.md` — The studio design system proposal: radius ladder, warm accent, and menus that slide from underneath the canvas plane. Artifact: `docs/research/layers-studio-design-system.html`.
- `docs/research/layers-warm-radius-mockups.md` — Mockups in the warm-radius / glass style: a shell with 52px corners on a warm gradient, a dense control deck beside an atmospheric visual, and the live menu motion. Artifact: `docs/research/layers-warm-radius-mockups.html`.

**Note on FPS:** The e2e benchmark uses `readPixels` as its GPU sync primitive because `gl.finish()` is a no-op in Chromium/SwiftShader builds (returns immediately without waiting for the rasteriser). Numbers are a CPU-rasterisation lower bound; the Stage 0.2 gate (8-pass >= 30 fps @ 1536px on reference phone) requires real hardware.

### Manager (MGR)
- T-M-001: License audit addendum ✅
- T-M-002: Phone renderer backend choice
- T-M-003: Graphite basis spike (ADR-012)
- T-M-004: Graphite license/trademark/repo strategy ✅
- T-M-005: Core 8 Relief v0

### CI Jobs (7)

`.github/workflows/ci.yml` — one workflow, seven jobs. Runs on the **self-hosted ThinkPad
runner** by default (`vars.CI_RUNNER` = `["self-hosted","linux","x64"]`); deleting that
repo variable falls back to `ubuntu-latest`.

1. `changes` — path filter; computes which areas moved and skips untouched jobs
2. `lint-typecheck-test` — lint + `tsc -b` + build + unit tests (Node 24)
3. `license-check` — BLOCKED-license scan + cross-check against `docs/licenses.md`
4. `conflict-files` — sync-conflict and `.env` detection
5. `ownership-check` — CODEOWNERS enforcement (`.github/scripts/ownership-check.sh`)
6. `python-test` — 257 tests (FastAPI + classical fallback + ranker + simplification)
7. `golden-image` — Playwright + Chromium + SwiftShader; 8 core goldens + 42 multi-look checks

**Concurrency (added 2026-10-23).** `lint-typecheck-test` and `golden-image` share a
job-level group `runner-heavy-<ref>` so only one heavy job runs at a time. The
workflow-level group (`ci-<ref>`, `cancel-in-progress: true`) only cancels runs
superseded by a newer push — it does **not** stop two jobs of the same run racing. See
`docs/CI-RUNNER.md` for why this was necessary.

**CI was red from the first commit.** ESLint was never declared as a dependency and no
config file existed, so `eslint .` resolved to whatever was on PATH and died with
"couldn't find an eslint.config.(js|mjs|cjs) file". Three core goldens were stale against
the `bee8d84` renderer changes. Both were fixed in PR #18 — see `docs/CI-RUNNER.md`.

### Key Decisions
- Graphite: reference-only (no fork, dual MIT/Apache-2.0)
- Headless GL: Playwright + Chromium + SwiftShader (full WebGL2, deterministic)
- GSAP: OK for now, "Prohibited Uses" clause flagged
- Ownership: pre-commit hook + CI script enforce CODEOWNERS
- Turborepo 2.0: `pipeline` renamed to `tasks`
- CSP: production-only headers (dev mode needs eval for Vite HMR)
- AI service auth: Bearer token middleware (skips /v1/health)
- Rate limiting: 60 req/min per IP for compute-heavy endpoints
- Anonymization salt: env-sourced (LAYERS_ANON_SALT)

### Tests (verified 2026-10-23)
- **447/447 JS unit tests passing** across 9 packages: web 155, engine 99, schema 54,
  sync 46, cores 40, desktop 22, stack 11, vector 11, ui 9
- **257/257 Python tests passing** (19 test files: classical fallback, ranker, simplification, events, retrieval, mock AI, search, extract, health, multiscale)
- 3/3 golden-image fixtures passing (legacy)
- 8/8 per-core golden checks passing (SSIM 1.0000, effect-presence guard on)
- **42/42 multi-look checks passing — Stage 0.3 gate: >= 6 distinct looks per core, all 7 cores**
- 13/13 live browser checks passing (tests/e2e)
- pnpm build: 9/9 tasks successful
- pnpm test: 19/19 turbo tasks successful

### Bundle Size
| Component | Gzipped | Gate | Status |
|---|---|---|---|
| Engine + 7 cores | 26.8 KB | ≤ 150 KB | ✅ |
| Web app JS | 84.1 KB | — | ✅ |
| Web app CSS | 4.9 KB | — | ✅ |
| Web app total | 89.0 KB | ≤ 250 KB mobile | ✅ |

### Deferred / open work (not claimed complete)
- **Stage 2.3:** device lab matrix (3 phones, iPad, 3 laptops), 60-min soak test — need real hardware; WebGPU full renderer — detection + context done
- **Stage 2.4:** axe-core automated a11y run (would add a dependency — brief forbade new deps); manual a11y audit pending
- **Stage 2.2:** real device-to-device preset sync verification (needs Mac FE + phone)
- **Stage 2.5:** closed beta (100 users), staged rollout, rollback drill execution — pending (private personal use until out of beta)

### Commits
- 20+ commits on main (2026-10-07 → 2026-10-23)
- Merged PRs: #2, #4–#16 (Stages 1.5, 1.6, 2.2, 2.3, 2.4 and their doc follow-ups)
- **Open:** #18 (`ci/fix-lint-and-golden-baselines`) — restores the lint gate, regenerates
  3 stale goldens, fixes the Node 20→24 mismatch, caps turbo concurrency, serialises the
  heavy CI jobs. CI is 6/7 green; the last red is a one-line FE-owned test expectation
  (`packages/ui/test/tokens.test.ts`). See `docs/CI-RUNNER.md` and
  `docs/FE-OWNED-FIXES-PENDING-MAC-AGENT.md`.
- **Open:** #17 (dependabot: vite 5 → 6)

### Project Location
- **Code (ThinkPad):** `/home/thinkpad/Data/20_Projects/20.34_LAYERS/`
- **Code (Mac):** `~/Data/20_Projects/20.34_LAYERS/`
- **Vault:** `~/Data/20_Projects/20.34_LAYERS-Vault/`
- Synced via Syncthing (5 folders)
