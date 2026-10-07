# LAY//ERS

Layer-based design tool where cores replace traditional layer styles. Built on a shader-first architecture with a Graphite basis (ADR-012) for desktop/iPad and a light WebGL2/WebGPU renderer for phone.

See the [Product Vision](03-Reference/Product-Vision) in the vault for the full brief.

## Project Status (2026-10-08)

**Phase:** 0.1 (Setup & decisions) — **COMPLETE**

### Backend (BE) — All tasks done except T-BE-008
- T-BE-001: Private GitHub repos + protections ✅
- T-BE-002: Syncthing + .stignore ✅
- T-BE-004: Monorepo skeleton + CI + CODEOWNERS + pre-commit hook ✅
- T-BE-005: Preset JSON Schema v0 + contracts (17 tests) ✅
- T-BE-006: License register (17 OK / 8 WARNING / 1 BLOCKED) ✅
- T-BE-007: Skills audit (7/13 categories) ✅
- T-BE-008: Headless renderer + golden-image infra — **IN PROGRESS** (blocked on T-FE-003)

### Frontend (FE) — Pending Mac agent
- T-FE-001: Mac setup (Hermes, Syncthing, Node/pnpm)
- T-FE-002: Install + vet FE skills
- T-FE-003: WebGL2 context + ping-pong skeleton
- T-FE-004: Design tokens
- T-FE-005: Pattern/Dither core v0

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
- 17/17 passing (packages/schema)
- pnpm build: success
- pnpm test: success

### Commits
- 14 commits on main (2026-10-07)
- Branch feat/preset-schema-v0 merged to main
