# LAYERS — Studio design system

**Written:** 2026-10-22 · **Author:** AIR HERMES
**Artifact:** `docs/research/layers-studio-design-system.html` (self-contained, open in a browser)
**Parent system:** `docs/design-graphite.md` — the glass, the contrast discipline and the
panel-over-canvas structure are unchanged there. This document adds the layer on top.

**Trigger:** "Can you also load the skills ui quality bar says too? Also can save that
design and create some mock ups in this style. I really like the rounded corners with
the menus sliding out from underneath the canvas."

---

## 1. What this is

A design-system artifact for the next LAYERS surface, built from a reference
screenshot of a studio-management tool: dense thread lists, a small colour-coded
status dot per row, and menus that slide out from under the top plane rather than
dropping off the pill they belong to.

The reference supplied the **posture**. The layout, the panels and the tokens are
LAYERS's own — this is not a copy of another product's chrome.

Three things were added to the graphite system:

1. A **radius ladder** that is arithmetic rather than arbitrary.
2. **One warm accent** instead of a cool blue, chosen so it is not a default.
3. **Menus that hang from the canvas plane**, structurally rather than as an
   animation trick.

---

## 2. The palette

Warm charcoal — not neutral grey, not tinted near-black. The lift between steps is
deliberately narrow so a panel reads as one material.

| Token | Value | Role |
|--|--|--|
| `--bg-primary` | `#17181b` | The void the glass sits on |
| `--bg-secondary` | `#1e2024` | Panel fill |
| `--bg-tertiary` | `#26292e` | Controls on the panel |
| `--bg-raised` | `#2f3339` | Popovers, the densest surfaces |
| `--border` | `#35393f` | Structural hairline |
| `--border-strong` | `#4a5059` | Floating surfaces only |
| `--text-primary` | `#eceef2` | Not pure white — pure white on charcoal reads harsh |
| `--text-secondary` | `#a3aab5` | Labels |
| `--text-tertiary` | `#a1a8b2` | Section headers, metadata |
| `--accent` | `#e0824a` | Selection, active state |
| `--accent-strong` | `#f0955c` | Active trigger, hover |

`#eceef2` rather than `#ffffff` is a deliberate choice, and the most common tell of
a generated dark UI.

### Why the accent is warm amber

Two of the most common generated-dark-UI tells are a near-black ground with an
acid-green or vermilion accent, and an indigo accent chosen by default rather than
by reason. Amber is neither: it is warm against a cool charcoal, it clears 3:1 as a
boundary, and it reads as a studio signal rather than a system colour.

It is used for exactly one thing — the active trigger, the selected row and focus.
Not for decoration, not for every highlighted thing.

### `text-tertiary` had to be lighter than it looked like it should be

The graphite system uses `#8b95a3` for tertiary text. At this system's surface ramp
that measures **3.96:1** — below the 4.5:1 floor — so it is `#a1a8b2` here.

The graphite doc hit the identical trap with `#6b7280`, which failed AA at *any*
alpha because the colour itself was too dark for small text on a dark ground. A
muted grey that looks correct on a swatch routinely fails in situ. This is the
second time this exact mistake has surfaced in this project.

---

## 3. The radius ladder

Six steps, and they are related rather than arbitrary. The rule that makes them hold
together:

> **outer radius = inner radius + padding**

A 20px panel holds a 10px control because it has 10px of padding. A 12px chip holds
an 8px inset because it has 4px. Two worked examples are drawn in the artifact
itself, with the arithmetic written under each.

| Step | Value | Used for |
|--|--|--|
| `--r-window` | 20px | The app window |
| `--r-panel` | 20px | Side panels |
| `--r-menu` | 16px | Menus (bottom corners only) |
| `--r-card` | 14px | The canvas frame |
| `--r-chip` | 12px | Pills, status chips |
| `--r-control` | 10px | Buttons, inputs |
| `--r-pill` | 999px | Dots, avatar, the insert bar |

Equal radii on a parent and its child is the most common thing that makes nested
corners look pinched.

---

## 4. The sliding menus

This is the behaviour the brief asked for, and it is a **structural** decision, not
an animation trick. The menu is a sibling of the toolbar, not a child of the trigger
button.

Three planes, in paint order:

| z | Plane | Role |
|--|--|--|
| 2 | toolbar | Sits on top; its bottom edge is the ceiling the menus hang from |
| 1 | menu | Starts tucked 12px *up* under the toolbar, slides down over the canvas |
| 0 | canvas | Bleeds under the panels; the backdrop filter blurs it |

Because the hidden state is **translated up** rather than merely faded, the open
animation is a genuine slide out from underneath the plane. A dropdown that grows
downward from its pill reads as attached to that pill; one that drops from the plane
reads as attached to the surface.

### The two traps this fell into

**Trap 1 — the menu band was inside `.canvas`.** `.canvas` carries `z-index: 0` so
the panels can sit above it, and a positioned element with a z-index *establishes a
stacking context*. Everything inside it is then ranked against the other children of
`.canvas`, and can never rise above a **sibling** of `.canvas` — including the left
panel. The menu painted behind the panel and its left edge was clipped.

**Trap 2 — the menu band was inside `.panel`.** A panel's own `backdrop-filter`
applies to everything painted behind it, and a child of the panel is *not* behind
it — but the panel's blur and brightness still consumed the menu, which vanished
into the glass and was only readable as a sliver.

The fix was structural both times: the menus are children of `.window` and siblings
of the panels, placed **after** the panels in DOM order and carrying the same
z-index (1), with the toolbar still at 2. Equal z-index means DOM order decides, so
the menus win.

**Both traps passed every geometry assertion.** The assertions measured the menu's
box, and the box was correct; what was wrong was *what covered it*. Vision review
caught what the measurements could not.

---

## 5. Interaction and motion

Motion is **150–220ms with `cubic-bezier(0.2, 0, 0, 1)`** — the standard ease-out.

| State | Treatment |
|--|--|
| Default | `bg-tertiary` |
| Hover | `bg-raised` — colour only, no geometry change |
| Press | `scale(0.96)` — never smaller; anything below 0.95 feels exaggerated |
| Focus | 2px accent outline, 2px offset |
| Primary | Accent fill, white text |
| Disabled | `opacity: 0.45` |

Nothing animates on hover except colour. `prefers-reduced-motion` removes every
transition, including the menu slide — the menu still opens, it just stops moving.

---

## 6. Contrast

Every text token clears WCAG AA, measured against the **effective** panel — the
colour the glass actually composites to, not the token value.

| Backdrop | text-primary | text-secondary | text-tertiary | accent |
|--|--|--|--|--|
| Dark, white canvas (binding) | 10.57 | 5.25 | 5.12 | 4.36 |
| Dark, black canvas | 15.44 | 7.66 | 7.48 | 6.37 |
| Light, black canvas (binding) | 8.93 | 5.19 | 4.95 | 3.83 |
| Light, white canvas | 17.79 | 10.33 | 9.86 | 7.63 |

**Which canvas is binding depends on the theme.** In dark mode it is the white one,
because `brightness()` on a white canvas leaves it at `255 × 0.42 = 107`, still far
brighter than the panel — that pulls the composite lightest against light text. In
light mode it is the black one, for the mirror-image reason. The artifact names
which canvas each row used rather than asserting one for both.

The accent is judged against **3:1, not 4.5:1** — it is used as a *fill* (the primary
button is white text on an amber ground), so WCAG's non-text contrast rule applies.
Judging a fill by the text rule produced a false failure at 4.36:1.

### The light theme is the harder case, and it failed its first two passes

The instinct in light mode is to *lighten* the text tokens. That is backwards. The
panel is near-white, so the binding constraint is dark text on a near-white ground,
and the tokens must be held **darker** than the dark theme's.

| Token | Dark | Light | Note |
|--|--|--|--|
| `--text-secondary` | `#a3aab5` | `#3a4149` | |
| `--text-tertiary` | `#a1a8b2` | `#3d444c` | |
| `--accent` | `#e0824a` | `#8a3d08` | Dark enough to reach 3:1 as a fill |
| `--panel-alpha` | 0.72 | 0.72 | |

Two separate failures, both caught by measurement rather than by looking:

1. `#6b7280` for tertiary text — the graphite system's own value — reaches only
   4.63:1 on a pure-white composite, under the floor.
2. `--glass-brightness: 0.96` in light mode **brightened** a black canvas. That
   factor is a dark-mode device: it darkens a bright backdrop so light text
   survives. Applying it in light mode does the opposite of its job, and the
   measured ratios fell to 2.43:1 and 2.10:1 before it was set to 1.

---

## 7. Rules that were load-bearing

1. **The canvas must bleed under the panels.** If it is a flex sibling, a backdrop
   filter has nothing behind it and the glass reads as an opaque slab. Proven in
   pixels in the graphite doc: a magenta probe behind a panel came through as
   `rgb(35,17,39)`.
2. **Only the outer slab is glass.** Controls, chips and selected rows are opaque.
   A translucent control on a translucent panel is unreadable.
3. **Icons inherit `currentColor` and never come from emoji.** One stroke weight
   throughout; emoji cannot take a stroke weight or inherit colour.
4. **Icon-only controls keep a real text node.** `display: none` removes a label
   from the accessibility tree entirely. A visually-hidden span is not the same thing.
5. **Measure at every width, and measure the axis that matters.** A viewport media
   query is the wrong axis for a panel-width problem.
6. **Assert the box, then look at the box.** The menu's geometry was correct at every
   width while it painted behind the left panel. No measurement of the menu's own
   rect could see that.
7. **A translucent band must not be a descendant of a blurred surface.** Neither a
   stacking context nor a `backdrop-filter` on an ancestor is survivable for a
   floating menu. Put it in the window, as a sibling.

---

## 8. Verification

Measured with Playwright against the real file, at 390 / 500 / 768 / 1024 / 1280 /
1440 / 1920.

| Check | Result |
|--|--|
| Menu seam with the toolbar | −13px at every width (tucked under, as designed) |
| Menu inside the window | **true** at all 7 widths |
| Truncated menu labels | **0** at all 7 widths |
| Truncated text anywhere | **0** at all 7 widths |
| Horizontal scroll | **0** at all 7 widths |
| Panel height vs window | 758 / 760 — fills the window |
| Console / page errors | **none** |
| Contrast, both themes | **0 failures** |
| Vision review, dark + light | clean; menu on top, all labels readable |

Two width-specific fixes came out of that run:

- **390px** — a 264px menu anchored to the far-right trigger ran outside the
  window. Fixed by clamping the anchor to `band width − menu width − 4`.
- **Panels sized to content** — `top: 0; bottom: 0` on a panel is an *indefinite*
  height when the flex container's height is content-derived. Fixed with an explicit
  height on `.window`.

---

## 9. What is deliberately not here

Every one of these is a default that shows up in generated UI regardless of the
subject. Each was considered and dropped.

- **No centre stack.** Three columns and a full-bleed canvas — this is a tool
  surface, not a landing page.
- **No feature tiles.** Nothing arranged as icon + heading + sentence × 3.
- **No accent rail, no gradient wash as decoration.** The only warm colour is the
  accent, and it marks one thing at a time.
- **No monument stat.** The numbers present are real render measurements, in 11px
  tabular numerals.
- **No emoji as icons, no uppercase-as-default, no single-word italic accent.**

---

## 10. Files

| File | Role |
|--|--|
| `docs/research/layers-studio-design-system.html` | The artifact — self-contained, tokens, radii, menus, motion, both themes, live contrast |
| `docs/design-graphite.md` | The parent system: the glass, the contrast discipline, the bleed |
| `packages/ui/src/tokens.ts` | The product's real tokens — this system is a proposal, not yet merged |

The artifact is a proposal and a reference. Nothing in it is wired into
`packages/ui` or either app yet.
