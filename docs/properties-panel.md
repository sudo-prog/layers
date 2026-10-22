# LAYERS — Properties Panel (design-editor rebuild)

**Built:** 2026-10-21 · **Status:** working, Maestro-green, 155 tests green, build clean
**Base:** `apps/web/` in the LAYERS monorepo

A Shaders.com-design-editor-style properties panel for LAYERS, plus the missing
capability that editor has and LAYERS did not: driving any numeric prop from the
cursor, from time, or from another layer.

---

## 1. What to run first

```bash
cd /Users/AIR2K/Data/20_Projects/20.34_LAYERS/apps/web
npm run dev                 # http://127.0.0.1:3000
```

Then: click **Textures** in the bottom toolbar → pick a core → the right panel
renders. Click the small **dyn** button on any slider row to open the driver
editor.

**Maestro proof (committed):**

```bash
cd apps/web && maestro test --headless .maestro/props-panel.yaml
```

36 assertions, 0 failures. Covers panel sections, all four driver modes, and
screenshots at each stage.

**Tests and build:**

```bash
cd apps/web && npx vitest run      # 155 passed
cd apps/web && npx vite build      # clean
```

---

## 2. Files

| File | Role |
|---|---|
| `src/propsPanel.ts` | The panel. Store + render pass, all sections, the dynamic-prop editor |
| `src/controls.ts` | Control primitives: slider, number, colour, segmented, select, toggle, text, section |
| `src/insertPanel.ts` | Bottom toolbar + component picker with search |
| `src/props.css` | All styling for the above (~960 lines) |
| `src/icons.ts` | Extended with ~30 inline SVG icons (was 18) |
| `src/main.ts` | `rebuildInspector()` now delegates to `propsPanel`; cores carry `iconName` + `blurb` |
| `index.html` | Mount point for the toolbar, `props.css` link |
| `.maestro/props-panel.yaml` | The committed Maestro flow |

---

## 3. Panel structure

```
┌─ Pattern/Dither                        [doc] ─┐  ← accent name + docs affordance
├─ Transform                     [move]  ▾      │
│    X  [—▬▬▬▬▬▬▬▬▬●——] 20 %      Y  [—▬▬▬▬▬▬▬▬▬●——] 20 %
│    Rotation [—▬▬▬▬●—————] 0°     Opacity [—▬▬▬▬▬▬▬▬▬●——] 69
├─ Sizing                       [frame]  ▾      │
│    Object Fit  ( fill | cover | contain | scale-down )
│    Width  [—▬▬▬▬▬▬▬▬▬●——] 100 %  Height [—▬▬▬▬▬▬▬▬▬●——] 100 %
├─ Appearance                   [blend]  ▾      │
│    Opacity  Blend Mode  Mask Source  Mask Channel  [Edit Mask]
├─ Pattern/Dither                [cores]  ▾      │
│    <one row per param, each with a `dyn` affordance>
├─ Layer                        [layers]  ▸      │
└─ Move Up | Move Down · Visible · Remove Layer
```

Sections collapse. Every value readout is `tabular-nums` so live numbers don't
jitter. Every control is inline SVG, `currentColor`, one 1.75px stroke.

---

## 4. The dynamic-prop system — the part worth knowing

Next to every **numeric** prop is a small `dyn` button. Clicking it opens a
driver editor:

```
Driver  ( Off | Cursor | Auto | Map )
```

Each mode reveals its own controls:

- **Cursor** — `Axis`, `Min`, `Max`, `Curve`, `Smoothing`, `Momentum`,
  `Base value`, `Reach`, then `Adjustments`: `Lock X`, `Lock Y`,
  `Invert Horizontal`, `Invert Vertical`
- **Auto** — `Speed`, `Easing`, `Smoothing`, `Momentum`, `Base value`
- **Map** — `Source` (another layer), `Channel`, `Min`, `Max`, `Smoothing`,
  `Momentum`, `Base value`
- **Off** — reverts to the plain value

Stored shape (survives preset round-trip, matches the reference editor's export):

```json
{ "dynamic": true, "type": "mouse-position", "axis": "x",
  "outputMin": 0, "outputMax": 100, "curve": 0, "smoothing": 0.1,
  "momentum": 0, "reach": 1, "base": 20 }
```

`base` is the static fallback, stored **inside** the dynamic object so a driven
prop and its plain value can never become two copies that drift apart.

### Which labels are the reference's and which are ours

**Verified against the reference** (OCR'd frames or video transcripts):
`Driver` · `Off` · `Cursor` · `Auto` · `Map` · `Axis` · `Min` · `Max` · `Curve` ·
`Smoothing` · `Momentum` · `Reach` · `Lock X` · `Lock Y` · `Ping-pong` ·
`Easing` · `Sine` · `Speed` · `Source` · `Channel` · `Alpha`

**LAYERS additions — not the reference's labels:**
`Base value` · `Invert Horizontal` · `Invert Vertical`

`Base value` is a deliberate addition (the reference has no editable fallback).
`Invert Horizontal` / `Invert Vertical` are **inferred**: the video narrates them
but the on-screen labels were never captured, and the reference may name them
differently. Verify against the live product before treating them as exact.

**Non-numeric props (colour, select, toggle) have no `dyn` button.** Driving a
select would store an object where the dropdown needs a string and silently
corrupt the value. This was a real bug found in verification, not a limitation.

---

## 5. Design language

Matched to the reference, then pushed:

- **Dark-first.** Surfaces stepped by background (`#0e0e11` / `#16161a` /
  `#1e1e24`), never shadow. Borders are structural only.
- **4px rhythm.** Prop rows 32px, controls 28px, section headers 32px.
- **Radius** 4–6px controls, 8px panels and frames.
- **Type** 11–13px UI, uppercase 10px letterspaced section headers.
- **Accent** blue for selection; the panel header and active states in accent.
- **No emoji anywhere** — 39 inline SVG icons in the panel, 0 emoji.

---

## 6. Verified geometry (7 widths)

**This table is misleading and is retained only for history — see §7.6.** It
measures *container overflow* (`scrollWidth - clientWidth` on the panel), which
stays 0 even when text inside a control is ellipsised. A separate measurement of
per-text-node truncation found real clipping at every desktop width.

| Viewport | Overflow | Wrapped labels | Clipped rows | H-scroll |
|--|--|--|--|--|
| 1920×1080 | 0 | 0 | 0 | none |
| 1440×900 | 0 | 0 | 0 | none |
| 1280×800 | 0 | 0 | 0 | none |
| 1024×768 | 0 | 0 | 0 | none |
| 768×900 | 0 | 0 | 0 | none |
| 500×844 | 0 | 0 | 0 | none |
| 390×844 | 0 | 0 | 0 | none |

**Measured text truncation at the same widths** (pixels lost to ellipsis):

| Viewport | Truncated labels |
|--|--|
| 1920 / 1440 / 1280 | `cover` −2, `contain` −12, `scale-down` −34, `Cursor` −13, `Auto` −2 |
| 1024 / 768 | `contain` −8, `scale-down` −30, `Mask Source` −5, `Mask Channel` −11, `Cursor` −9 |
| 500 / 390 | none |

Getting there took five distinct CSS bugs — see the `ui-quality-bar` skill for
the full list. The short version: `flex-basis` cannot override a `flex`
shorthand, `1fr` does not shrink below min-content, and a width basis in a
column-direction row is a **height**.

---

## 7. Known gaps

1. ✅ **The renderer now consumes dynamic props.** Implemented 2026-10-21:
   `packages/engine/src/dynamic-driver.ts` resolves a stored driven object to a
   number per frame, and `apps/web/src/dynamicLoop.ts` pushes the resolved values
   into the live cores via a new `setParams()` on every core.

   The silent failure is closed: `buildCoreParams` no longer calls `Number(raw)`
   on a driven prop, and every path out of the driver is finite-guarded.

   **Verified end-to-end** (CDP, real Chromium, `readPixels` on the WebGL canvas):
   - Driver `Off` + cursor moves → **pixels byte-identical** (325125 → 325125).
   - Driver `Cursor` + same moves → **pixels change** (184110 → 300645).
   - `Auto` with no input → 6/6 distinct frames, i.e. genuinely animating.
   - `prefers-reduced-motion: reduce` + `Auto` → **frozen**, 6/6 identical
     samples; the same setup at `no-preference` → 5/6 distinct.
   - `Map` with two layers → resolves `Source`/`Channel`, canvas stays non-uniform.
   - No `NaN`: the canvas retains its full tonal range (min 0, max 255), so
     nothing is reaching the shader as `NaN`.

   Maestro: `.maestro/dynamic-props.yaml`, 28 assertions, 0 failures.

   **Known limitation:** `map` mode does not do a real FBO readback of the source
   layer's pixels. It approximates the channel from the source layer's params.
   A pixel-accurate readback needs a `readPixels`/blit pass and is not
   implemented — the cost was judged too high for the value. See
   `docs/dynamic-driver-plan.md` task 5.

   **→ Original design: `docs/dynamic-driver-plan.md`.**
2. **`Object Fit`, `Mask Source`, `Mask Channel` are stored but not yet applied**
   by the renderer. They are real controls with real state, awaiting the
   engine work.
3. **The picker has no live thumbnails.** The reference renders each component;
   LAYERS shows icon + name. Component cover images exist in the repo but are
   not wired to the picker.
4. **No drag-to-reorder in the stack list.** Move Up / Move Down buttons only.
5. **The insert toolbar is not present on the mobile tab bar** — mobile gets the
   Cores panel instead, which is the pre-existing behaviour.
6. **Text truncation in the panel is real and unfixed.** `Object Fit`'s
   `contain` and `scale-down`, and the driver's `Cursor` and `Auto`, lose text to
   ellipsis at desktop panel widths (300px panel, 84px label column, 153px for
   the control). `contain` loses 12px, `scale-down` 34px, `Cursor` 13px.
   At 1024/768 `Mask Source` (−5px) and `Mask Channel` (−11px) also clip.
   This is *not* container overflow — `panel.scrollWidth - clientWidth` stays 0 —
   which is why the §6 table below reads as clean. **The §6 table is wrong as
   written:** it measured container overflow, not text truncation.
