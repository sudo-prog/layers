# LAYERS — Session Handoff (2026-10-22)

**Written by:** AIR HERMES (MacBook Air) · **For:** the next session, on either machine
**Repo:** `~/Data/20_Projects/20.34_LAYERS` · **Branch:** `main` (local), 9 commits ahead of remote `main`

---

## TL;DR

1. **The desktop editor exists.** `apps/LAYERS_DESKTOP` — the full-canvas shader
   surface. Built, measured, screenshotted, committed.
2. **The dynamic-prop driver works.** A driven prop now animates; it used to
   silently render nothing.
3. **The graphite glass design system is documented and measured.**
4. **The push is NOT done from this machine.** Everything is committed locally;
   Thinkpad Hermes is pushing from their side.
5. **One thing is genuinely urgent and it is not code:** a GitHub token sat in
   plaintext in four repos' `.git/config`. It was scrubbed locally, but it has
   already replicated via Syncthing and **must be rotated in GitHub.**

---

## 1. The immediate action item

**Rotate the GitHub token.** This is not optional and not something the next
session can do for you.

- It was in `origin` URLs as `https://x-access-token:…@github.com/…`, written in
  plaintext into `.git/config`.
- Those folders are Syncthing-synced, so the credential **already replicated to
  every peer**, including the Thinkpad.
- Locally scrubbed in four repos (`layers`, `www-paint`, `3ddd-studio`,
  `3DDD_STUDIO_V2`) — all now bare URLs. Verified clean machine-wide.
- **Scrubbing local copies cannot recall what is already on the other machines.**
  Rotate at https://github.com/settings/tokens

Re-check for regressions with:

```bash
grep -rl "x-access-token\|github_pat_\|ghp_" \
  $(find ~/Data -name config -path '*/.git/*' 2>/dev/null)
```

---

## 2. The push, and why it is not a normal push

`layers` has **unrelated histories**. This was verified, not assumed:

```bash
git merge-base HEAD origin/main    # no output = NO COMMON ANCESTOR
git rev-list --left-right --count HEAD...origin/main   # 23 local / 31 remote
```

| | |
|--|--|
| Local root | `c71fed6` |
| Remote root | `33a5320` |
| Files only in local | 35 |
| Files only on remote | 2 (`.stignore`, a tsbuildinfo) |
| Lines only on remote | **987** |
| Lines only in local | 7,290 |

**The remote is not a subset of the local tree.** It holds merged-PR work
(#5–#16) that local `main` has never seen:

- `services/ai/app/ranker.py` (233 lines)
- `services/ai/app/pareto.py` (125 lines)
- `services/ai/tests/test_ranker.py` (388 lines)
- `services/ai/tests/test_classical_fallback.py` (433 lines)
- Stage 1.5 review/refine UI, Stage 1.6 learning store, Stage 2.2 sharing &
  library, Stage 2.3 perf, Stage 2.4 accessibility

**A force-push destroys all of that.** Do not.

### What was already done

Local work was pushed to a **new branch**, `feat/layers-desktop`, which is on the
remote at `089d0fd`. Remote `main` is untouched at `ac7474b3`.

- PR: https://github.com/sudo-prog/layers/pull/new/feat/layers-desktop

### The state to resolve

Since that push, **one more commit landed locally** (`ce50b86`, the screenshot
script). So:

- Local `main` = `ce50b86` — 9 commits ahead of remote `main`
- Remote `feat/layers-desktop` = `089d0fd` — 1 commit behind local

**Recommended next step (Thinkpad Hermes):**

```bash
git push origin main:feat/layers-desktop     # brings the branch up to date
```

Then open the PR and decide the merge strategy for the unrelated histories. The
options, unchanged:

| Option | Effect |
|--|--|
| Merge `feat/layers-desktop` into `main` | Both histories preserved; 65 files may conflict |
| `git merge --allow-unrelated-histories` locally, resolve, push | Same, done by hand |
| Force-push local over `main` | **Destroys** 987 lines and the merged-PR history |
| Keep the branch, never merge | Nothing is lost; the work is reviewable |

**Note:** GitHub rejected the first push with `GH007` (private email). The repo
uses `270566838+sudo-prog@users.noreply.github.com`. Commits authored with a
different address are rejected — set `user.email` accordingly before pushing.

---

## 3. What was built this session

### `apps/LAYERS_DESKTOP` — the desktop editor

19 files, ~3,300 lines. Runs on **`:3003`** (3000 = mobile prototype, 3001 = stale
dist server, 3002 = an unrelated 3DDD.STUDIO server).

| Region | Contents |
|--|--|
| Top bar | project name · dimensions · colour space · tone mapping · zoom · theme |
| Left | `Shaders` list (multiple, switchable) + `Layers` stack + pass/fps |
| Centre | the frame, zoom-to-fit, floating insert toolbar |
| Right | `Props`: layer header, Transform, Appearance, core params |
| Overlay | component picker: category tabs, search, grid |

Reuses `packages/engine`, `packages/cores`, `packages/stack` **unchanged** — only
the shell is new.

```bash
pnpm --filter @layers/desktop dev      # :3003
pnpm --filter @layers/desktop build
pnpm --filter @layers/desktop test     # 22 tests
node apps/LAYERS_DESKTOP/scripts/measure.cjs   # geometry + pixels, 5 widths
node apps/LAYERS_DESKTOP/scripts/shots.cjs <dir>   # screenshots at 2x
```

### The dynamic-prop driver

`packages/engine/src/dynamic-driver.ts` + `apps/web/src/dynamicLoop.ts`.

The bug it closed: `buildCoreParams` did `Number(raw)` on a driven prop, which is
an object, so `Number({…})` = `NaN` — the core received `NaN` and **silently
rendered nothing, throwing nothing.**

All 7 cores gained `setParams()` so a live pass can be driven without being
rebuilt.

### The graphite glass design system

`docs/design-graphite.md`. The load-bearing insight: the canvas behind a panel can
be pure white *or* black, and at the alphas that make glass visible, text fails
WCAG AA. Raising the alpha to fix text makes the glass pointless.

**Resolution:** `brightness(0.45)` in the backdrop filter darkens the canvas
*before* the panel composites over it, so a low alpha (0.74) still lands dark.
Every text token now clears AA over every possible backdrop; the binding case is
`text-tertiary` over white at 4.67:1.

---

## 4. Verification status — what is proven, what is not

### Proven

| Check | Evidence |
|--|--|
| Driven prop changes rendered pixels | CDP `readPixels`: driver Off → identical (325125→325125); Cursor → changed (184110→300645) |
| Auto-animate animates, no input | 6/6 distinct frames |
| `prefers-reduced-motion` freezes it | 6/6 identical; control at `no-preference` 5/6 distinct |
| No `NaN` reaches a shader | canvas keeps full tonal range |
| Desktop frame framed + centred | `measure.cjs` at 1600/1440/1280/1180/1024 |
| Desktop canvas renders | ≥2 of 5 sampled regions non-uniform, all widths |
| Zero text truncation | desktop 5 widths; mobile 7 widths |
| Tests | 294 (mobile: 99 engine + 40 cores + 155 web) + 22 (desktop) |
| Maestro | `props-panel` 36 assertions, `dynamic-props` 28, `desktop` 24 |

### NOT proven — do not claim these

1. **The S55 phone at 384px.** A device *is* connected (Opel Mobile S55, Android
   14, physical 480 @ 200dpi → **CSS viewport 384px**). It has **never been used**
   to test LAYERS. Maestro's floor is 500px, so 384px is a width this project has
   **never measured**. This is the highest-value next test.
2. **The iPhone 8.** Blocked: no Xcode (CLT only), and `libimobiledevice` /
   `ios-webkit-debug-proxy` have **no Homebrew bottles for Intel** (Tier 3), so
   they'd need a source build — and `autoconf`/`automake`/`pkg-config` are also
   missing. Untested, unverified.
3. **The iPad 3.** Caps at iOS 9.3.5 (2012, A5X). Cannot run a modern PWA.
   Ruled out — don't spend time on it.
4. **The light theme's contrast.** Tokens were updated but contrast was measured
   for the DARK theme across every backdrop. Light got matching structure only.
5. **`map` mode's fidelity.** It resolves and renders, but approximates the
   source layer's channel from its params rather than reading its pixels. A real
   FBO readback is a GPU→CPU sync point and was judged too expensive.
6. **Local ASR on this machine.** No working path exists:
   `whisper.cpp` is Homebrew Tier 3 (no bottles), and `Speech.framework` hangs
   because a bare CLI binary has no TCC identity so the auth callback never fires
   (verified with 10s, 20s and 300s bounded waits). Recorded in the
   `interface-research-from-video` skill.

---

## 5. Known gaps in the desktop app

1. **No persistence.** In-memory; a reload starts fresh.
2. **No export.** The reference editor's code/JSX export is not implemented.
3. **No dynamic-prop UI.** A driven prop is coerced to its `base` so it renders
   rather than emitting `NaN`, but there is no driver editor.
4. **Blend mode is stored, not applied.** The select writes `item.blend`; the
   renderer's blend pass does not read it.
5. **No layer drag-to-reorder.** Move up/down buttons only.
6. **Only the 7 existing cores.** The picker's six categories map onto them; the
   reference editor has ~200 components.

Also outstanding from the mobile app: `Object Fit` / `Mask Source` /
`Mask Channel` are stored but not applied by the renderer.

---

## 6. Environment facts the next session needs

| Fact | Value |
|--|--|
| Desktop app port | **3003** |
| Mobile prototype port | **3000** |
| Port 3001 | a stale `python -m http.server` on `apps/web/dist` |
| Port 3002 | an unrelated 3DDD.STUDIO dev server |
| Android device | Opel Mobile S55, serial `11080250104723`, adb-ready |
| Hermes browser harness | **times out on the desktop app** — the rAF loop over a 1920×1080 canvas starves its 5s `Runtime.evaluate` budget. Use Playwright (`scripts/measure.cjs`, `scripts/shots.cjs`). |
| Maestro viewport | 1024×625 (not 1200×459 as the skill says — that's the mobile app at a different window size) |
| Playwright | in the pnpm store at `node_modules/.pnpm/playwright@1.63.0`; the scripts resolve it directly, no install needed |
| Git author | must be `270566838+sudo-prog@users.noreply.github.com` or GitHub rejects with `GH007` |

---

## 7. Documentation written this session

| File | Contents |
|--|--|
| `apps/LAYERS_DESKTOP/README.md` | The desktop app: what it is, how to run it, what's proven, what's not |
| `docs/design-graphite.md` | The glass system, every token, every measurement |
| `docs/dynamic-driver-plan.md` | The driver design + implementation notes on what differed from the plan |
| `docs/properties-panel.md` | Panel structure, stored format, gaps. **§6's geometry table is corrected** — it measured container overflow, not text truncation, and so read clean while five labels were ellipsised |
| `docs/research/shaders-quick-tour-corrections.md` | Nine corrections to the shaders.com dossier |
| `docs/research/shaders-design-editor.md` | The dossier, edited in place, with a §16 corrections log |
| `MAC_LOG/2026-10-21_LAYERS_DYNAMIC_PROPS.md` | Ops log: the driver work |
| `MAC_LOG/2026-10-21_LAYERS_GRAPHITE_GLASS.md` | Ops log: the glass work |
| `MAC_LOG/2026-10-21_SHADERS_QUICK_TOUR_VERIFY.md` | Ops log: the video verification |

---

## 8. Recommended order for the next session

1. **Rotate the GitHub token** (user action, not an agent task).
2. **Push** `ce50b86` to `feat/layers-desktop`, then open the PR.
3. **Test LAYERS on the S55 at 384px.** The device is connected; this is the one
   width never measured. `adb` is at `$HOME/Library/Android/sdk/platform-tools`.
4. Fix the desktop gaps in priority order: persistence → export → dynamic-prop UI.
5. Decide on `map` mode: accept the approximation or build the readback.
