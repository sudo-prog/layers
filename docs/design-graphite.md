# LAYERS — Graphite glass design system

**Written:** 2026-10-21 · **Author:** AIR HERMES
**Brief:** "super sleek dark graphite minimal interface that is semi transparent
under all the panels. AAA+ design studio vibes."

This document records the tokens, the measurements behind them, and the
constraints that are load-bearing. The numbers are not taste — each one is the
result of a measurement that is reproduced below.

> **Structure note (2026-11-19):** the desktop shell now uses the approved
> canvas-as-window design (PR #19) — panels are the SAME black as the base
> (zero seam), and the bright canvas is a rounded window on top. The graphite
> tokens, contrast math and `brightness(0.45)` rationale below still govern
> every translucent surface (the floating pill toolbar/chrome over the bright
> window). Design record: `docs/research/layers-canvas-over-panels.md`.

---

## 1. The palette

A cool desaturated graphite ramp, not a neutral grey and not a tinted near-black.
Four surfaces, three text weights, one accent.

| Token | Value | Role |
|--|--|--|
| `--bg-primary` | `#0a0b0d` | The void the glass sits on |
| `--bg-secondary` | `#101215` | Panel fill |
| `--bg-tertiary` | `#16191d` | Controls on the panel |
| `--bg-raised` | `#1c2026` | Popovers, the densest surfaces |
| `--border` | `#262b33` | Structural hairline |
| `--border-strong` | `#363c46` | Floating surfaces only |
| `--text-primary` | `#f2f4f7` | Not pure white — pure white on graphite reads harsh |
| `--text-secondary` | `#9aa3af` | Labels |
| `--text-tertiary` | `#8b95a3` | Section headers, metadata |
| `--accent` | `#7aa2ff` | Selection, active state |

The accent is a restrained studio blue. It is deliberately **not** an
acid-green or vermilion (the default "near-black + one bright accent" look), and
it is desaturated relative to a UI blue so it reads as a material highlight
rather than a system colour.

---

## 2. The glass, and the constraint that drives it

Panels are translucent with a backdrop blur. The one hard requirement:

> **The canvas behind a panel can be pure white or pure black.** Text must clear
> WCAG AA (4.5:1) in both cases.

This is what makes a naive glassmorphism fail. Worked through:

| Panel alpha | Effective panel over WHITE | `text-tertiary` contrast | Verdict |
|--|--|--|--|
| 0.82 | `rgb(59,61,63)` | 3.60:1 | **FAIL** |
| 0.88 | `rgb(45,46,49)` | 4.48:1 | borderline |
| 0.92 | `rgb(35,37,40)` | 5.07:1 | pass, but the glass is invisible |
| 1.00 | `rgb(16,18,21)` | 6.19:1 | pass, but it is no longer glass |

At the alphas that make the glass *visible*, the text fails. Raising the alpha
to fix the text makes the glass pointless.

**The resolution: darken the backdrop before compositing.** `backdrop-filter`
runs `brightness()` on the canvas *before* the panel composites over it, so a
lower alpha still lands on a dark effective colour:

```css
backdrop-filter: blur(32px) saturate(1.25) brightness(0.45);
```

With `brightness(0.45)` and alpha `0.74`, a pure-white canvas becomes an
effective backdrop of `rgb(115,115,115)`, and the panel composites to
`rgb(42,43,45)` — **measured** in the browser, not just computed.

### The final numbers

| Backdrop | Effective panel | primary | secondary | tertiary | accent |
|--|--|--|--|--|--|
| Ambient wash (strongest) | `rgb(20,23,27)` | 16.32 | 7.05 | 5.93 | 7.22 |
| **White canvas (worst case)** | `rgb(42,43,45)` | **12.86** | **5.56** | **4.67** | **5.70** |
| Flat void | `rgb(13,15,17)` | 17.43 | 7.53 | 6.33 | 7.72 |
| Black canvas (worst case) | `rgb(12,13,16)` | 17.64 | 7.62 | 6.41 | 7.81 |

**Every text token clears AA against every possible backdrop.** The binding
constraint is `text-tertiary` over a white canvas at 4.67:1.

### `text-tertiary` had to change colour

The original `#6b7280` failed AA on a dark panel at **any** alpha — even a fully
opaque `#101215` panel only reaches 3.88:1, because the colour itself is too dark
for small text on a dark ground. It is now `#8b95a3`. This was a pre-existing
accessibility bug that the glass work surfaced, not one it introduced.

---

## 3. Why the panels needed a full-bleed stage

The panels initially read as opaque slabs even with correct alpha and blur,
because **nothing was behind them**. The layout was:

```
.workspace (flex)
  .panel-left    (260px)
  .canvas-area   (flex: 1)   <- a flex SIBLING, never overlapping
  .panel-right   (300px)
```

A backdrop filter blurs what is painted behind the element. With the canvas as a
flex sibling, the only thing behind a panel was the flat page background — so
`blur()` had nothing to blur and `brightness()` had nothing to darken.

Fixed by making the stage full-bleed and floating the panels above it:

```css
.workspace   { position: relative; }
.panel       { position: relative; z-index: 2; }   /* above the stage */
.canvas-area { margin: 0 calc(-1 * (var(--panel-left-w) + var(--panel-right-w))); z-index: 0; }
```

Panel widths are tokens (`--panel-left-w`, `--panel-right-w`) so the bleed, the
panel rules, and the insert-bar centring cannot drift apart.

**Verified in pixels, not by eye.** A magenta probe was placed behind the left
panel; the panel over it rendered `rgb(35,17,39)` against a base of
`rgb(13,15,18)` — the magenta demonstrably bleeds through.

---

## 4. The ambient wash

The canvas is a discrete 512px preview (correct for a style editor), so even
full-bleed it leaves large flat areas. The workspace therefore carries a soft
accent wash so the glass always has a gradient to pick up.

Opacity was chosen from measurement. Through the glass, a backdrop change of `N`
shows as `N × 0.26 × 0.45 = N × 0.117`. A first pass at `0.10` alpha moved the
panel by **1/255** — present but invisible. The final values (`0.55` at the
corner) land a **12-unit** lift on the panel, which is perceptible.

Measured gradient across each panel after the change:

| Panel | Per-channel range top→bottom |
|--|--|
| Left | 3 / 4 / 7 |
| Right | 12 / 14 / 16 |

A range of 0 means flat/opaque. These are visible gradients.

---

## 5. Load-bearing gotchas

**A translucent control on a translucent panel is unreadable.** Only the outer
slab is glass; inputs, segmented controls and selected rows use opaque ramp
values.

**`insert-host` is `position: absolute` inside `.canvas-area`.** When the stage
became full-bleed, the bar re-anchored to it and moved under the left panel.
It needs `left: 50%` — and specifically *not* an offset by the panel-width
difference. Measured: the area spans `-300..1540` (centre 920 in area coords) and
the visible canvas spans `260..1140` (also centre 920). The area's own centre
already *is* the visible canvas centre, so an offset double-counts the asymmetry
and pushes the bar 20px off.

**The insert bar needs 590px; the visible canvas is `viewport − 560`.** So the
labelled bar fits only from **1150px** up. Below that it goes icon-only (34px per
button, 222px total). At 768 the canvas is only 208px and even icon-only overruns,
so 768–899 lets the bar scroll — acceptable for a floating pill whose six
controls are also reachable from the Cores panel.

**Hiding a label with `display: none` removes it from the accessibility tree.**
The icon-only insert buttons became untargetable in tests. The label now stays as
a real text node via an `.sr-only` span, so the control is nameable by text at
every width.

**A viewport media query was used for a panel-width problem.** `.ctl-label` was
tightened to 68px below 1100px — but the panel is 300px at 1024 *and* at 1280, so
the viewport is the wrong axis. Worse, 68px is narrower than the longest label in
the panel (`Mask Channel`, 79px), so `Mask Source` and `Mask Channel` ellipsised
at 1024/768 but not at 1280. Removed; the label column is now sized for the
longest label at every width.

**A segmented control cannot always fit its options.** `Object Fit` needs 284px
for four options and gets a 153px track. It is now an auto-fit grid
(`repeat(auto-fit, minmax(var(--seg-min), 1fr))`) which resolves to 2 columns and
2 rows — 54px tall instead of the 116px a naive 4-row stack produced, and no
label ellipsises. `--seg-min` is supplied per control from the caller.

---

## 6. Accessibility

- Every text token clears WCAG AA over every possible backdrop (§2).
- `prefers-reduced-transparency: reduce` drops all glass to opaque and removes
  the wash — the preference is honoured, not ignored.
- `prefers-reduced-motion: reduce` removes the theme cross-fade.
- `@supports not (backdrop-filter: …)` falls back to opaque surfaces, so a
  browser without backdrop-filter gets a usable UI rather than an unreadable one.
- Icon-only controls keep their `aria-label`, `title`, and a visually-hidden
  text node.

---

## 7. Files

| File | Role |
|--|--|
| `packages/ui/src/tokens.ts` | Colour + glass tokens; `generateCSSVariables()` derives the surfaces |
| `apps/web/src/styles.css` | Static token block (must match tokens.ts), layout, the bleed |
| `apps/web/src/graphite.css` | The glass surface layer, loaded last |
| `apps/web/src/props.css` | Panel internals: the seg grid, the insert bar |

`graphite.css` is loaded **after** `styles.css` and `props.css` so its rules win
on source order at equal specificity — no `!important` anywhere in the system.
