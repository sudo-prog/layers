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

## Design

The same graphite glass as the mobile build — see `docs/design-graphite.md` for
the full rationale and every measurement. The load-bearing points:

- **`brightness(0.45)` in the backdrop filter.** The canvas behind a panel can be
  white or black; darkening the backdrop *before* compositing is what lets a low
  alpha (0.74) still clear WCAG AA. Without it, text fails over a bright canvas.
- **The canvas is full-bleed and the panels float above it.** Panels are
  `z-index: 2` over a stage with negative side margins. A backdrop filter blurs
  what is painted behind the element — with the canvas as a flex *sibling* there
  is nothing behind a panel and the glass reads as a flat slab.
- **Desktop proportions**: 264px left / 316px right panels, a 44px top bar.

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
