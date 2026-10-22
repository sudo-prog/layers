# LAYERS — Mockups in the warm-radius / glass style

**Written:** 2026-10-22 · **Author:** AIR HERMES
**Artifact:** `docs/research/layers-warm-radius-mockups.html` — self-contained, open in a browser

**Trigger:** three reference screenshots — a Create flyout on a warm gradient with
enormous corners and a translucent menu surface; an ambient-sound tablet with a dense
dark control panel beside an atmospheric visual; and the request to "save that design
and create some mock ups in this style."

---

## 1. What was borrowed, and what was not

The *style vocabulary* is borrowed. The subject matter, the palette and the panels are
LAYERS's own.

| Borrowed | Not borrowed |
|--|--|
| Oversized radius at the top of the hierarchy | Any layout — the composition is LAYERS's |
| A warm ambient gradient as the page | Any panel or control |
| Genuine translucency where the field shows through | Any branded screen or chrome |
| A dense control deck beside an atmospheric visual | |
| Menus that slide from underneath the plane | |

---

## 2. The three mockups

| # | Mockup | Composition |
|--|--|--|
| 1 | The shell + icon rail + Create flyout | A black shell at 52px corners, an 88px icon rail, and a translucent menu surface where the warm gradient shows *through* the glass |
| 2 | The control deck + atmospheric visual | A dark control panel at 30% against a CSS-generated sky at 70%, hard seam |
| 3 | The animation, live | The toolbar and menu motion, clickable |

Mockup 3 is interactive. Click **Layers**, **Create** or **Export** above the stage.

---

## 3. The warm field

The gradient is the *page*, not a panel. Every panel must be an opaque or glass surface
over it — never text sitting directly on the gradient, where contrast is uncontrolled.

| Token | Value |
|--|--|
| `--field-top` | `#c16b3e` |
| `--field-mid` | `#8a4526` |
| `--field-bottom` | `#4e2623` |

---

## 4. The radius ladder

Oversized at the top of the hierarchy and a normal scale below. This is the character
of the reference, and it is the opposite of the SaaS-card kit where one radius is used
everywhere.

| Step | Value | Used for |
|--|--|--|
| `--r-shell` | 52px | The app shell |
| `--r-surface` | 32px | Panels and the menu surface |
| `--r-card` | 24px | Menu cards |
| `--r-control` | 16px | Buttons and menu rows |
| `--r-icon` | 14px | Rail buttons |
| `--r-chip` | 999px | Chips and pills |

**The menu surface rounds only its trailing corners.** Its leading edge is flush with
the black rail, so rounding it would open a notch showing the gradient behind:

```css
border-radius: 0 var(--r-surface) var(--r-surface) 0;
```

---

## 5. Glass, measured

The menu surface is `rgba(20, 10, 8, 0.72)` with a 24px blur. At that alpha the warm
field bleeds through to an effective brown of roughly `#3A231B` — dark enough for light
text, warm enough to read as glass rather than as a dark panel.

```css
.menu-surface {
  background: rgba(20, 10, 8, 0.72);
  backdrop-filter: blur(24px) saturate(1.2);
}
```

This is the single most important detail in the reference: a dark panel at 0.9 opacity
looks like a dark panel. At 0.72 with the field behind it, it looks like glass.

---

## 6. The menu motion — and the trap it took four attempts to solve

The toolbar is `z-index: 2`, the menu band `z-index: 3`, the stage `z-index: 0`. The
menu's hidden state is `translateY(-12px)` — tucked **up** under the toolbar — so the
open animation is a genuine slide out from underneath the plane rather than a fade.

### The trap

The band cannot be a child of `.anim-bar`. That element carries `overflow: hidden` to
clip its own rounded corners, and **`overflow` on a grid item clips
absolutely-positioned descendants against the grid area**. The band measured
`top: -961px` — far off the bar — and its menus were clipped away entirely.

The z-order also has to be **inverted** from the intuitive reading. A band at `z=1`
can never clear a toolbar that is a *sibling* of it, because the toolbar at `z=2` wins
regardless of DOM order. So:

| Element | z-index | Why |
|--|--|--|
| `.anim-menus` | **3** | Above the toolbar. It is *positioned* under the toolbar's edge in JS, which is what creates the illusion. |
| `.anim-toolbar` | 2 | The ceiling the menus appear to hang from |
| `.anim-stage` | 0 | The surface the menus slide over |

The band is a direct child of `<body>`, positioned against the **toolbar's bottom
edge** rather than the bar's top, so the open menu emerges from underneath the
toolbar plane. `.anim-bar`'s own `overflow: hidden` clips it to the bar's shape.

```css
.anim-menus { position: absolute; pointer-events: none; z-index: 3; }
.anim-menu  { transform: translateY(-12px);      /* tucked up */
              opacity: 0; visibility: hidden;
              border-top: 0;                     /* seam disappears */
              border-radius: 0 0 16px 16px; }
.anim-menu.is-open { transform: translateY(0); opacity: 1; visibility: visible; }
```

```javascript
// Document coordinates: viewport-relative rect PLUS the current scroll.
band.style.top = toolbarRect.bottom + scrollY;
```

### Two things that had to be re-derived

- **Offsets are document coordinates.** An absolutely-positioned element's containing
  block here is the initial one, so `top` is `rect.top + scrollY` — not `rect.top`.
- **`overflow: hidden` on the band would clip the menu's own shadow.** The horizontal
  overflow from the band being wider than a 390px screen is clipped at the root
  (`html, body { overflow-x: hidden }`) instead.

---

## 7. The control deck

Deliberately utilitarian against a dreamy visual, at a hard seam. A dark panel at 30%,
an atmospheric render at 70%.

- **Chips** — `Time of day` / `Clouds` / `Weather`, active in a muted teal.
- **A formation grid** — seven CSS-gradient tiles, 4-up, 12px radius.
- **Sliders** — compact, 3px tracks, tabular values with units.
- **A toggle** — teal when on.
- **A footer** — `Back to defaults` / `Reset`.

The atmospheric visual is generated in CSS gradients. The mockup is self-contained and
has no image dependency.

---

## 8. Verification

Playwright against the real file, 390 / 500 / 768 / 1024 / 1280 / 1440 / 1920.

| Check | Result |
|--|--|
| Menu seam with the toolbar | 0px at all 7 widths — flush, as designed |
| Menu inside the bar | **true** at all 7 widths |
| All menu labels hit their own menu | **true** at all 7 widths |
| Truncated labels anywhere | **0** at all 7 widths |
| Horizontal scroll | **0** at all 7 widths |
| Console / page errors | **none** |
| Vision review | oversized radius, warm field, readable open menu — all confirmed |

**Width-specific fixes:** a 264px menu anchored to the far-right trigger ran outside
the bar at 390px (clamped to `bar width − menu width − 8`); the band being wider than
a narrow screen caused 52px of horizontal scroll (clipped at the root).

---

## 9. What is deliberately not here

- **No SaaS-card kit.** The radius is *not* one value everywhere — that is the point.
- **No glassmorphism for its own sake.** The translucency exists so the warm field
  shows through, not as decoration.
- **No emoji as icons, no feature-tile grid, no monument stat.**
- **No image dependency.** Every visual is CSS.

---

## 10. Files

| File | Role |
|--|--|
| `docs/research/layers-warm-radius-mockups.html` | The artifact — three mockups, both themes, the live menu motion |
| `docs/research/layers-studio-design-system.md` | The parent design system |
| `docs/research/layers-studio-design-system.html` | The parent artifact |

Nothing here is wired into `packages/ui` or either app. It is a proposal.
