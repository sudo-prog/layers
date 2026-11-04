# LAYERS Desktop — canvas-as-window design

**Written:** 2026-10-23 · **Author:** AIR HERMES
**Artifact:** `docs/research/layers-canvas-over-panels.html` — self-contained, open in a browser
**Status:** approved by the user ("Looks Great!"), to be refined next session
**Does not touch:** `apps/LAYERS_DESKTOP` — this is a proposal, the app is unchanged.

---

## 1. What the design is

The LAYERS Desktop shell, unchanged, with one structural idea: **the canvas is a
round window, and the black chrome is laid on top of it.**

Not a raised card. Not a panel among panels. The bright canvas is painted, and the
dark UI is cut away around it so the canvas reads as a lit opening in a dark surface.

This is the opposite of the app's current structure, where the canvas is a flex
sibling between two opaque panels.

---

## 2. The layers, bottom to top

| z | Layer | Surface | Corners |
|--|--|--|--|
| 0 | **Base** — the app's black, runs to the edge | `--bg-primary` `#0a0b0d` | app rounded at 20px |
| 1 | **Side panels** — same black as the base | `--bg-primary` `#0a0b0d` | square, integrated |
| 2 | **Canvas** — a bright window, on top | mid-grey gradient | rounded at 28px |
| 3 | **Pill toolbar** — on the canvas | chrome glass | pill |

**The critical detail: the panels use the SAME colour value as the base.**

```css
.panel { background: var(--bg-primary); }   /* not a tint */
.base  { background: var(--bg-primary); }
```

A tint here — even 2.4% white — leaves a brightness step at the panel/black
boundary, and a step reads as a seam. Identical values mean no step, so the panel
and the black read as one continuous surface and only the *content* separates them.

**Measured:** panel `rgb(10,11,13)` → 12px of identical `rgb(10,11,13)` → canvas
`rgb(115,129,149)`. Zero delta at the boundary.

---

## 3. The black frame

The canvas does not touch the panels. There is a **12px strip of black** between a
panel and the canvas on each side, and 12px above and below.

```css
.canvas-card {
  top:    var(--gap);                                   /* 12px */
  bottom: var(--gap);
  left:   calc(var(--panel-left-w)  + var(--gap));
  right:  calc(var(--panel-right-w) + var(--gap));
}
```

That strip is not a border — it is the base showing through, so it is the same black
as everything else. `--gap` is the one number that controls it.

**`.body` must be explicitly `--bg-primary`.** It was transparent, which meant the
frame's owner was whatever happened to be behind it; any tonal difference in that
element reads as a line at the canvas edge.

---

## 4. No top bar

The full-width header is gone. The top of the app **starts where the side panels
start.**

Its contents came down into the panels:

| Was in the top bar | Now lives |
|--|--|
| LAYERS · Untitled · 1920 × 1080 | left panel strip |
| P3 Linear · ACES | right panel strip |
| Canvas · 1920 × 1080 | the canvas's own header |

---

## 5. The canvas is bright — this took three passes

The canvas has to be clearly luminous, or it reads as another panel. Progression:

| Pass | Value | Result |
|--|--|--|
| 1 | `#2a3038` → `#1d2126` | marginally lighter than the panels — read as a panel |
| 2 | `#39424d` → `#2b323b` | a muted dark blue-grey — read as low-key chrome |
| 3 | **`#6b7787` → `#525c6b`** | **reads as a lit window** |

The gradient stops live in one place — the `.canvas-card` block.

**Consequence:** when the canvas went bright, its text had to invert. The canvas
header and the readout are now dark-on-light (`rgb(0,0,0,0.58)`), or they vanish.

---

## 6. The bug that took longest: the canvas border

A `1px solid rgb(255,255,255,0.14)` border on the canvas drew a hard vertical line
exactly where the panel meets the canvas. On a bright surface a light border is the
brightest thing in the app.

**Fix: the canvas has no border at all.** It is defined by its own luminance against
the black around it.

---

## 7. Radius ladder

| Token | Value | Used for |
|--|--|--|
| `--r-shell` | 20px | the whole app — black runs to the edge, rounded |
| `--r-canvas` | 28px | the canvas window |
| `--r-panel` | 20px | reserved; panels are currently square |
| `--r-row` | 8px | list rows |
| `--r-control` | 6px | buttons, chips |
| `--r-pill` | 999px | pill toolbar, toggles |

The app is one rounded black surface: `#app` carries the radius and
`overflow: hidden`, which clips its children to the curve.

---

## 8. Panels collapse to a navbar

Both panels can collapse to a **thin black icon rail** (56px), icons only. The canvas
widens to reclaim the space:

```css
.canvas-card.nav-left  { left:  calc(var(--nav-w) + var(--gap)); }
.canvas-card.nav-right { right: calc(var(--nav-w) + var(--gap)); }
```

The collapsed rail has **no border and no background of its own** — it is the black
base with icons on it.

---

## 9. Switchable states

Bottom-right controls let you compare without editing:

- **Radius** — 16 / 28 / 44 on the canvas (the panel radius steps down with it, and
  must stay *smaller* than the canvas radius or the two curves read as one broken
  edge)
- **Expanded / Navbar** — panels open, or collapsed to icon rails

---

## 10. Verification

Playwright against the real file, at 390 / 500 / 768 / 1024 / 1280 / 1440 / 1920.

| Check | Result |
|--|--|
| Panel ↔ black delta | **0** — identical values, no seam |
| Black frame around canvas | 12px on all four sides |
| Canvas border | `0px none` |
| Canvas on top | yes (`elementFromPoint` at canvas centre returns the canvas) |
| App rounded, clipped | radius 20px, `overflow: hidden` |
| Truncated labels | **0** |
| Horizontal scroll | **0** |
| Console / page errors | **none** |

Pixel scan across the boundary (y=400): panel `10,11,13` → 12px of identical
`10,11,13` → canvas `115,129,149`. Uniform, no step.

---

## 11. To refine next session

1. **The frame width.** 12px is the current value. It may want to be tighter or
   wider — `--gap` is the single control.
2. **The canvas label.** The canvas keeps a small "Canvas · 1920 × 1080" header. It
   may belong in a corner, or not at all.
3. **Panel corners.** Panels are square and integrated. Whether they should pick up a
   radius at some point is open.
4. **Whether this goes into the app.** It has not been wired into
   `apps/LAYERS_DESKTOP`. Doing so is a separate piece of work.
5. **The collapse interaction.** The navbar works, but the expand/collapse affordance
   is a chevron in the panel header — worth reviewing.

---

## 12. Files

| File | Role |
|--|--|
| `docs/research/layers-canvas-over-panels.html` | The artifact — all states, self-contained |
| `docs/design-graphite.md` | The parent token system, unchanged |
| `apps/LAYERS_DESKTOP/src/desktop.css` | The app's real CSS — **not modified** |
