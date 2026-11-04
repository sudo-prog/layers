# CI Runner — self-hosted, kill-switchable, and why CI was red

**Updated 2026-10-23.** Records what CI actually is now, the two defects that made it red
from the first commit, and the operational trap that masqueraded as an OOM kill.

---

## 1. Current state

**Workflow:** `.github/workflows/ci.yml` — one workflow, **7 jobs**.

| # | Job | Gated on | Notes |
|--|--|--|--|
| 1 | `changes` | never | path filter; emits `js`/`python`/`golden`/`licenses` outputs |
| 2 | `lint-typecheck-test` | `js` | lint + `tsc -b` + build + unit tests; **Node 24** |
| 3 | `license-check` | `licenses` | BLOCKED-license scan + `docs/licenses.md` cross-check |
| 4 | `conflict-files` | never | sync-conflict + `.env` detection |
| 5 | `ownership-check` | never | `.github/scripts/ownership-check.sh` (CODEOWNERS) |
| 6 | `python-test` | `python` | 257 tests; Python 3.12 |
| 7 | `golden-image` | `golden` | Playwright + Chromium + SwiftShader; 8 core goldens + 42 looks |

**Runner:** self-hosted on the ThinkPad, selected via the repo variable `CI_RUNNER`:

```yaml
runs-on: ${{ fromJSON(vars.CI_RUNNER || '["ubuntu-latest"]') }}
```

`CI_RUNNER` = `["self-hosted","linux","x64"]`. **Kill switch:** delete that variable and CI
instantly falls back to GitHub-hosted `ubuntu-latest`. A dead runner cannot wedge CI.

**Concurrency:** the two memory-heavy jobs share a job-level group:

```yaml
concurrency:
  group: runner-heavy-${{ github.ref }}
  cancel-in-progress: false
```

The workflow-level group (`ci-<ref>`, `cancel-in-progress: true`) only cancels runs
superseded by a newer push — it does **not** stop two jobs of the same run racing.

---

## 2. CI was red from the first commit — two pre-existing defects

CI only started running when the runner was attached (PR #18's predecessors). Both
failures below were **never previously visible**, because the billing block stopped the
jobs from ever executing.

### 2.1 The lint gate was silently broken

Every package declared `"lint": "eslint ."`, but:

- ESLint was **never a declared dependency** (`git log --all -S'eslint'` → empty)
- No `eslint.config.*` was ever committed

So `eslint .` resolved to whatever ESLint happened to be on PATH and died with:

```
couldn't find an eslint.config.(js|mjs|cjs) file
```

**Fix (commit `23096d0`):** declared `@eslint/js`, `eslint`, `globals`,
`typescript-eslint` in the root `package.json`; added root `eslint.config.mjs` (flat config,
`@eslint/js` recommended + `typescript-eslint` recommended + `globals`; `no-unused-vars`
warn; `no-explicit-any` off). Also cleared the lint errors it then surfaced.

### 2.2 Three core goldens were stale

`tests/golden-infra/fixtures-cores/*.png` were generated at `71797d3` (2026-10-13); the
renderer/cores changed at `bee8d84` (2026-10-22). Two failed SSIM:

```
pattern-dither-simplex-bayer4   SSIM = 0.4289
pattern-dither-dots-bayer8      SSIM = 0.2705
```

**Fix:** regenerated the goldens (they are deterministic — 4× identical hashes verified).

---

## 3. Node 20 → 24

`jsdom@30.1.2` engines `^22.22.2 || ^24.15.0 || >=26.0.0`; its `undici@8.11.2` dependency
needs `>=22.19.0`. The `markAsUncloneable` API landed in Node 22.10, so Node 20 failed at
**import**, not at a test:

```
TypeError: webidl.util.markAsUncloneable is not a function   (@layers/desktop#test)
```

All three `node-version` pins in `ci.yml` were bumped to `'24'` (LTS, satisfies both
engine ranges).

---

## 4. The trap: `exit 137` was NOT an OOM kill

Every failing CI job died with `exited (137)` / `Killed` — which reads exactly like memory
exhaustion. It was not.

**The actual cause:** the host's `resource-watchdog.sh` cron — Hermes housekeeping that runs
**every 1 minute** — SIGKILLs any process above its CPU%/RSS% ceiling that is not on its
protected list. Its own log named the victims:

```
killed hog pid=... cpu=103% mem=1.3% args= node .../setup-pnpm
killed hog pid=... cpu=138% mem=5.0% args= node .../_work/layers/layers/
```

**Proof it was not the kernel OOM killer:**

```bash
grep oom_kill /proc/vmstat     # stayed at 7 across ENTIRE failing runs
dmesg | grep -i oom            # empty
```

A kernel OOM kill always increments `oom_kill`.

**The decisive tell:** `license-check` failed with **zero steps executed** — the job died
at startup, before `checkout` ran. A job that never ran a step cannot be out of memory.

### Fixes applied

1. **Watchdog CI gate** (`resource-watchdog.sh`): while the runner has jobs in flight, skip
   the entire kill path — still log, still raise the agent-facing STOP flag, but reap
   nothing:

   ```bash
   CI_ACTIVE=0
   if pgrep -f 'actions-runner/bin/Runner.(Listener|Worker)' >/dev/null 2>&1 \
      && pgrep -f 'actions-runner/_work/.*/(pnpm|node|tsc|eslint)' >/dev/null 2>&1; then
     CI_ACTIVE=1
   fi
   ```

   Verified in the log: `SKIPPED KILLS: CI runner has jobs in flight`.

2. **Protected-list entries:** `actions-runner`, `Runner.Listener`, `Runner.Worker` added to
   the watchdog's `PROTECT_SUBSTR`.

3. **Job-level concurrency groups** in `ci.yml` (see §1) — belt-and-braces so two heavy jobs
   cannot collide even if the watchdog gate is bypassed.

4. **`turbo.json` `concurrency: "25%"`** — turbo's default is 10× cores (40 on a 4-core
   runner). Note it is a **percentage string**; `"concurrency": 2` is rejected with
   `turbo_json_parse_error`. Measured: 2 concurrent `tsc -b` processes vs 8+ before.

### Diagnostic rule

> Before accepting any "the machine is out of RAM" diagnosis on a shared workstation,
> falsify it against every other killer on the box: the kernel OOM killer
> (`oom_kill` in `/proc/vmstat`), `systemd-oomd`, **and any host watchdog cron**.
> Only `oom_kill` proves the kernel did it.

---

## 5. Where CI stands (2026-10-23)

| Job | Status |
|--|--|
| `changes` | ✅ |
| `lint-typecheck-test` — Lint / Typecheck / Build | ✅ |
| `lint-typecheck-test` — Test | ❌ `@layers/ui#test` only |
| `license-check` | ✅ |
| `conflict-files` | ✅ |
| `ownership-check` | ✅ |
| `python-test` | ✅ |
| `golden-image` | ✅ |

`@layers/e2e:test` → **13/13 checks passed**.

**The one remaining failure is a single stale line**, FE-owned, blocked by the
pre-commit ownership hook from the ThinkPad:

```
packages/ui/test/tokens.test.ts
  expect(css).toContain("--bg-primary: #0a0a0a");   // dark ramp is #0a0b0d since bee8d84
```

Fixed and verified on disk; handoff in `docs/FE-OWNED-FIXES-PENDING-MAC-AGENT.md`.
