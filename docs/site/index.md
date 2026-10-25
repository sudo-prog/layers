# LAYERS Documentation Site

> Layer-based design tool — shader-first architecture, 7 cores, local-first privacy.

Welcome to the LAYERS documentation. This site is the canonical reference for architecture decisions, development workflows, and launch readiness.

---

## 🚀 Getting Started

| Topic | Description |
|-------|-------------|
| [README](../README.md) | Project overview, status, and key decisions |
| [User Guide](../user-guide.md) | Complete usage guide — cores, stack, presets, AI panel, shortcuts |
| [Troubleshooting Guide](../troubleshooting.md) | Common issues and solutions |
| [Efficiency Ledger](../EFFICIENCY-LEDGER.md) | Pass/param/look/ms accounting and simplification gate record |
| [Launch Checklist](../launch-checklist.md) | Pre-flight checklist for Stage 2.5 beta & v1.0 launch |

---

## 🏗️ Architecture & Design

| Document | Description |
|----------|-------------|
| [ADR-000: Sync & Git Strategy](../adr/ADR-000-sync-and-git.md) | Two-repo strategy, branch protection, pre-push hooks, Syncthing |
| [ADR-012: Graphite Strategy](../adr/ADR-012-graphite-strategy.md) | Graphite basis decision — reference-only, dual MIT/Apache-2.0 |
| [ADR-012: Graphite Patterns](../adr/ADR-012-graphite-patterns.md) | Graphite design patterns adopted by LAYERS |

---

## 🔒 Security & Privacy

| Document | Description |
|----------|-------------|
| [Security Review](../security-review.md) | Token handling, CSP, SSRF, input validation, anonymization |
| [Privacy Review](../privacy-review.md) | Consent management, data collection, storage, retention, compliance |

---

## 📜 Licenses

| Document | Description |
|----------|-------------|
| [License Register](../licenses.md) | Full license register for all dependencies |
| [License Register v2](../licenses-rev2.md) | Updated license register (revision 2) |

---

## 🔬 Research & Infrastructure

| Document | Description |
|----------|-------------|
| [Headless GL CI](../research/headless-gl-ci.md) | Playwright + Chromium + SwiftShader setup for headless WebGL2 testing |
| [CI Runner](../CI-RUNNER.md) | Self-hosted runner, the 7 jobs, and why CI was red from the first commit |
| [FE-owned fixes pending](../FE-OWNED-FIXES-PENDING-MAC-AGENT.md) | Three verified fixes the Mac agent still needs to apply |

---

## 📁 Repository Structure

```
├── apps/web/          # Vite + TypeScript web editor (PWA)
├── packages/
│   ├── engine/        # WebGL2 renderer (context manager, ping-pong FBOs, multi-pass)
│   ├── cores/         # 7 shader cores (Pattern, Noise, Blur, Displacement, Color, Lighting, Outline)
│   ├── stack/         # Effect stack state management
│   ├── schema/        # JSON Schema validation (browser-compatible)
│   ├── sync/          # Sync providers (GitHub, Immich, IndexedDB)
│   ├── vector/        # Vector store for feature extraction
│   ├── ui/            # Design tokens, CSS variables, WCAG contrast
│   └── tsconfig/      # Shared TypeScript configurations
├── services/
│   ├── ai/            # FastAPI AI service (feature extraction, jobs, retrieval)
│   ├── eval/          # Evaluation harness
│   └── learning/      # Learning service
├── tests/
│   ├── e2e/           # Live browser verification (Playwright)
│   └── golden-infra/  # Golden image infrastructure (SSIM, per-core checks)
├── third_party/
│   └── paper-design-shaders/  # Vendored Paper Shaders (Apache-2.0)
├── docs/              # All documentation (this site lives in docs/site/)
├── contracts/          # Cross-agent contracts
├── tools/             # Utility scripts (lv.py vault interface)
└── scripts/           # Shell scripts (rollback-drill.sh)
```

---

## 🧪 Testing

| Suite | What it covers | How to run |
|-------|----------------|------------|
| Unit tests | All packages (447 JS + 257 Python = 704 total) | `pnpm test` |
| Golden images | Per-core SSIM validation (8 fixtures) | CI `golden-image` job |
| E2E browser | Live WebGL2 rendering, context loss, FPS | `pnpm build && node tests/e2e/*.mjs` |
| License check | Dependency license allow-list | CI `license-check` job |
| Ownership check | CODEOWNERS enforcement | CI `ownership-check` job |

---

## 📊 CI Jobs

Runs on the self-hosted ThinkPad runner (`vars.CI_RUNNER`; delete it to fall back to
`ubuntu-latest`). Full detail in [CI-RUNNER](../CI-RUNNER.md).

1. `changes` — path filter; skips untouched jobs
2. **lint-typecheck-test** — ESLint + TypeScript strict + build + unit tests (Node 24)
3. **license-check** — Cross-checks against `docs/licenses.md`
4. **conflict-files** — Detects sync conflicts and `.env` files
5. **ownership-check** — Enforces CODEOWNERS
6. **python-test** — FastAPI + classical fallback + ranker + simplification (257 tests)
7. **golden-image** — Playwright + Chromium + SwiftShader golden image validation

The two memory-heavy jobs (`lint-typecheck-test`, `golden-image`) share a job-level
`concurrency` group so only one runs at a time.

**CI was red from the first commit** — the lint gate was silently broken (ESLint was never
declared, no config existed) and 3 core goldens were stale. Both fixed in PR #18.
See [CI-RUNNER](../CI-RUNNER.md) for the full story, including why `exit 137` was a
watchdog kill and not an OOM kill.

---

## 🛠️ Scripts

| Script | Purpose |
|--------|---------|
| `scripts/rollback-drill.sh` | Simulates a rollback (git tag checkout + build + test) — PASS 2026-10-19 |
| `tools/lv.py` | Vault lifecycle management (start/end sessions, log entries) |

---

## 📋 Vault References

The project vault lives at `~/Data/20_Projects/20.34_LAYERS-Vault/` and contains:

- **Product Vision** — `03-Reference/Product-Vision.md`
- **Quality Gates** — `03-Reference/Gates.md` (the authoritative gate definitions)
- **Ownership Protocol** — `02-Protocols/Ownership.md`

---

## 🤝 Contributing

1. Read `AGENTS.md` for workspace instructions
2. Follow CODEOWNERS — edit only owned paths
3. Tests ship with code — no stage advances without green gates
4. Update the Efficiency Ledger for every change
5. Record session start/end via `tools/lv.py`

---

## 📄 License

LAYERS is MIT-licensed. Vendored Paper Shaders are Apache-2.0. See the [License Register](../licenses.md) for details.

---

*Last updated: 2026-10-19*
