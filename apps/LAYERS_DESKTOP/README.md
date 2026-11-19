# LAYERS Desktop

The full-canvas shader editor — the desktop surface the README's course
correction calls for, as distinct from the mobile prototype in `apps/web`.

**Runs on `:3003`** (`pnpm dev`). 3000 is the mobile prototype, 3001 a stale dist
server, 3002 an unrelated 3DDD.STUDIO server on this machine.

```bash
pnpm --filter @layers/desktop dev      # http://127.0.0.1:3003
pnpm --filter @layers/desktop build
pnpm --filter @layers/desktop test
node apps/LAYERS_DESKTOP/scripts/measure.cjs   # geometry + pixel check, 5 widths
```

---

## What it is

A shaders.com-class editor: a **shader tree**, a **layer stack**, a **full-bleed
canvas the panels glass over**, and a **props panel**. Multiple shaders coexist as
frames on the canvas, which is the whole reason this exists next to the mobile
build.

| Region | Contents |
|--|--|
| Top bar | project name · canvas dimensions · colour space · tone mapping · zoom · theme |
| Left | `Shaders` list (multiple, switchable) + `Layers` stack + pass/fps readout |
| Centre | the frame, zoom-to-fit, and the floating insert toolbar |
| Right | `Props`: layer header, `Transform`, `Appearance`, then the core's own params |
| Overlay | the component picker: category tabs, search, a grid |

Reuses `packages/engine`, `packages/cores`, `packages/stack` unchanged. Only the
shell is new — the renderer, the seven GLSL cores and the stack model are the
same code the mobile app runs.

## Reuse, not a fork

- `Editor` (`src/editor.ts`) owns the `Renderer`, the project model and the
  pass rebuild. A param edit pushes into the **live** core via `setParams()`
  rather than rebuilding, so dragging a slider does not recompile the shader.
- `cores.ts` re-declares the core catalogue. This is deliberate: the desktop
  panel exposes more parameters than the mobile one, which trims for a phone
  panel, and it groups them for the picker. The **cores themselves** are not
  duplicated.
- The graphite design system is the same one documented in
  `docs/design-graphite.md`. Tokens are duplicated in `src/desktop.css` on
  purpose: the theme must render before any JS runs, and a JS-only token pipeline
  would flash unstyled.

## Design — canvas-as-window (IMPLEMENTED 2026-11-19, PR #19)

The shell is the user-approved design from
`docs/research/layers-canvas-over-panels.html` (approved 2026-10-23,
"Looks Great!"; the user clarified 2026-11-19 that approval meant ship it,
and it shipped as `fdf4da3`, PR #19). The earlier "panels glass over a
full-bleed canvas" structure is REPLACED by:

- **20px rounded app shell** (`--r-shell`), base `#0a0b0d` to the edge.
- **The canvas is a bright rounded WINDOW (28px, `--r-canvas`) painted ON
  TOP**, inset 12px (`--gap`) from the panels and the top/bottom.
- **Panels are the SAME colour value as the base** — not a tint, not glass.
  Zero brightness step at the boundary, so panel and base read as one
  continuous black surface; only content separates them.
- **Glass pill toolbar + radius bar** (16/28/44) float on the canvas window.
- **Expanded / Navbar modes** (`data-nav=expanded|collapsed`, `aria-pressed`):
  Expanded shows both rails; Navbar collapses them and the window widens.
  Viewports ≤900px boot collapsed.
- The graphite token system (`docs/design-graphite.md`) still governs color,
  type and the glass treatment of the floating chrome; `brightness(0.45)`
  remains load-bearing for any translucent surface over the bright window.

All functionality is unchanged: WebGL renderer, shader tree, layer stack,
component picker, props panel (Transform/Appearance/core params), zoom,
dims dialog, theme toggle, live pass/fps readout.

### Parity verification (the gate for this design)

`parity-probe.mjs` (Playwright + SwiftShader) measures the built app at
1440x900 and 390x844: shell radius 20px, canvas radius 28px, panel bg ==
base bg exactly, 12px gaps, docOverflowX 0, hit-fails 0, WebGL2 live,
theme dark→light→dark, Noise/Grain Scale/Octaves/Strength present, both
nav states. Run: `node apps/LAYERS_DESKTOP/parity-probe.mjs` (needs
playwright-core; writes parity-probe.json + parity-*.png).

## Verified

`scripts/measure.cjs` drives real Chromium and asserts, at 1600/1440/1280/1180/1024:

| Check | Result |
|--|--|
| Frame inside the visible strip (not under a panel) | ✅ all widths |
| Frame vertically inside the canvas area | ✅ all widths |
| Insert bar past the viewport or over a panel | ✅ none |
| Truncated text nodes | ✅ none |
| Horizontal scroll | ✅ none |
| Canvas actually rendering (`readPixels`, ≥2 of 5 regions non-uniform) | ✅ all widths |

Plus `maestro test --headless .maestro/desktop.yaml` — 24 assertions covering
boot, the toolbar, the picker, adding a component, and the rendered params.

`pnpm test` → 22 unit tests over the pure logic (colour coercion, the core
catalogue's invariants, `buildCoreParams`, picker filtering).

### Two things that were wrong and are worth not repeating

1. **`preserveDrawingBuffer: false` made the canvas read as blank.** Without it
   the drawing buffer is cleared after the browser composites, so `readPixels`
   (and any export/screenshot path) sees nothing. The mobile app sets it to
   `true`; this app now does too. It is the engine's working assumption.
2. **A `place-items: center` grid cannot centre a transformed oversized child.**
   The frame's *layout* box is a fixed 1920×1080 (a transform does not affect
   layout), so the stage stretched to 1080 inside a 906px area and the frame
   ended up 131px low with 43px below — measurably off-centre. Absolute
   positioning with a `translate` is exact and independent of the child's layout
   size.

## Not done

1. **No persistence.** The project is in memory; a reload starts fresh. The
   mobile app has IndexedDB + preset round-trip — that is not wired here.
2. **No export.** The reference editor's code/JSX export is not implemented.
3. **No dynamic props.** The mobile build has the full driver (cursor /
   auto-animate / map). This app coerces a driven prop to its `base` so it
   renders rather than emitting `NaN`, but there is no driver UI.
4. **Blend mode is stored, not applied.** The select writes `item.blend`; the
   renderer's blend pass does not read it yet.
5. **No layer drag-to-reorder.** Move up/down buttons only.
6. **Only the 7 existing cores.** The picker's six categories map onto them; the
   reference editor has ~200 components.
