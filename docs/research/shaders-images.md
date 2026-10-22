# Shaders.com — Image & Visual Analysis

**Collected 2026-10-21.** 37 images catalogued; 11 tutorial videos transcribed.

A background research subagent collected the images and named them from their
source URLs, then was killed by a provider rate limit before writing the
manifest or the visual analysis. This file completes that deliverable from
the images it did save.

---

## 1. Catalogue

All paths are under `/Users/AIR2K/.hermes/cache/scratch/layers-ui/`.

| File | Dims | Bytes | What it shows |
|--|--|--|--|
| `shaders.com__demo-avatar.jpg` | 80x80 | 1,565 | User avatar sample (80x80) |
| `shaders.com__design-editor-full-ui.jpg` | 2720x1444 | 127,968 | The design editor, full UI — the primary reference image (2720x1444) |
| `shaders.com__home__feature-canvas.webp` | 1121x732 | 33,220 | Homepage: infinite canvas feature (1121x732) |
| `shaders.com__home__feature-components.webp` | 1288x794 | 53,726 | Homepage: component stacking feature (1288x794) |
| `shaders.com__home__feature-interactive.webp` | 1113x717 | 49,788 | Homepage: interactivity feature (1113x717) |
| `shaders.com__icon.png` | 800x800 | 107,058 | App icon (800x800) |
| `shaders.com__logo.svg` | (unreadable) | 8,458 | Logo (vector) |
| `shaders.com__mcp__background.webp` | 2840x1362 | 21,566 | MCP docs: hero background (2840x1362) |
| `shaders.com__mcp__interactive.png` | 684x792 | 13,161 | MCP docs: interactive example (684x792) |
| `shaders.com__mcp__mockup.jpg` | 2840x1360 | 127,468 | MCP docs: landing page + Claude Code terminal (2840x1360) |
| `shaders.com__mcp__sdf.png` | 684x792 | 12,822 | MCP docs: SDF generation from SVG (684x792) |
| `shaders.com__mcp__search.png` | 722x722 | 40,737 | MCP docs: library search example (722x722) |
| `shaders.com__og-image.jpg` | 3414x1708 | 671,367 | Site og:image — 3414x1708 |
| `shaders.com__pro__hero-phone.jpg` | 1200x674 | 34,395 | Pro page: phone mockup (1200x674) |
| `shaders.com__product__hero-mobile.jpg` | 1620x861 | 81,456 | Product page: mobile hero (1620x861) |
| `shaders.com__sections__docket-hero.jpg` | 1280x820 | 69,752 | Pro Sections: Docket hero (1280x820) |
| `shaders.com__sections__glitch-rays-hero.jpg` | 1280x800 | 47,905 | Pro Sections: Glitch Rays hero (1280x800) |
| `shaders.com__sections__grid-shift-hero.jpg` | 1280x780 | 167,857 | Pro Sections: Grid Shift hero (1280x780) |
| `shaders.com__sections__irradiance-logo-hero.jpg` | 1280x800 | 72,225 | Pro Sections: Irradiance Logo hero (1280x800) |
| `shaders.com__sections__launch-teaser.jpg` | 1280x760 | 51,886 | Pro Sections: Launch Teaser (1280x760) |
| `shaders.com__sections__polyhedron-footer.jpg` | 1280x900 | 72,460 | Pro Sections: Polyhedron Footer (1280x900) |
| `shaders.com__sections__voxel-logo-cta.jpg` | 1280x760 | 186,477 | Pro Sections: Voxel Logo CTA (1280x760) |
| `shaders.com__testimonial__hugo.jpg` | 460x460 | 8,873 | Testimonial: Hugo Richard (460x460) |
| `shaders.com__testimonial__serko.jpg` | 400x400 | 23,604 | Testimonial: SerKo (400x400) |
| `shaders.com__testimonial__wesbos.jpg` | 400x400 | 29,818 | Testimonial: Wes Bos (400x400) |
| `shaders.com__updates-cli__cli-hero.png` | 2478x1556 | 678,209 | Sep 28 announcement: Introducing the Shaders CLI (2478x1556) |
| `shaders.com__updates-cli__cli-install.jpg` | 1920x1080 | 128,376 | CLI announcement: npx shaders install in a terminal (1920x1080) |
| `shaders.com__updates-cli__cli-open.jpg` | 1920x1080 | 96,630 | CLI announcement: npx shaders open in the editor (1920x1080) |
| `shaders.com__updates-oss__open-source.png` | 1522x855 | 2,359,773 | Oct 6 announcement: Shaders goes open source (1522x855, 2.3MB) |
| `shaders.com__updates-sections__sections.png` | 1920x1440 | 2,754,692 | Jul 20 announcement: Introducing Sections (1920x1440, 2.7MB) |
| `shaders.com__updates-v3__design-editor.jpg` | 2720x1444 | 127,968 | v3 announcement: 'Meet your new design canvas' (2720x1444) |
| `shaders.com__updates-v3__shape-effects.jpg` | 1920x1080 | 198,995 | v3 announcement: 3D shape effects and text layers (1920x1080) |
| `shaders.com__updates-v3__typegpu.jpg` | 1920x1080 | 84,319 | v3 announcement: TypeGPU render engine (1920x1080) |
| `shaders.com__updates-v3__v3-website.jpg` | 1920x1080 | 115,013 | v3 announcement: redesigned website and dashboard (1920x1080) |
| `designtools_shaders_og.png` | 1200x630 | 45,918 | designtools.fyi review page og:image |
| `dudarik_shaders-mcp_og.jpg` | 1200x600 | 37,726 | dudarik.com MCP article og:image |
| `openreplay_shaders_hero.png` | 2400x1350 | 746,289 | openreplay.com WebGPU article hero (2400x1350) |

**Total: 37 images.**
---

## 2. Visual design analysis

From the highest-resolution images — `design-editor-full-ui.jpg` (2720x1444)
and the v3 announcement set (1920x1080) — plus 160 OCR'd video frames.

### Layout

Three columns. Left ~250px, canvas flexes, right ~300px. No outer chrome
beyond a slim top bar: this is a full-bleed workspace, not a card on a page.

| Region | Contents |
|--|--|
| **Top bar** | folder icon · project name (`Sunrise Gradient`) · layout icon · zoom % (`55%`) · fullscreen icon · avatar |
| **Left** | `Shaders` section (project's shaders) · `Layers` section (the stack of the selected shader) · footer `v3.0.360` + `Community` |
| **Canvas** | frame label top-left · `1920 x 1080` top-right · `P3 Linear` + `Neutral` bottom-right |
| **Right** | component name in amber (`LinearGradient`) + a hash icon + a docs icon, then sections |
| **Bottom** | floating pill toolbar with 10 icons |

### Layer rows

Each row: type icon · name · **eye** (visibility) · **lock**.

Note from the frame: `GridDistortion` shows a lock but **no eye** — a layer
can be locked without being visible, and the two states are independent
controls rather than one combined state.

### Properties panel sections

`Transform` · `Colors` · `Position` on a gradient. The reference's section
order for a gradient is Transform → Colors → Position, which is a
content-aware ordering (not alphabetical, not fixed).

### Colour stop editor

A gradient **bar** showing the flow, then a **stops list** where each row is
`<position %> <swatch> <hex>`:

```
0%    #3E1CFF   violet
23%   #1F1982   deep blue
37%   #10C3F9   cyan
76%   #F67119   orange
100%  #FFD182   pale orange
```

### Transform widget

`X` · `Y` · `W` · `H` · `Rotation` · `Border Radius`, each with a unit toggle
(`%` / `px`). A **square-with-crosshair alignment widget** sits at the right
of the block — a visual anchor picker, not a numeric input.

### Bottom insert toolbar

Ten icons in a floating pill: grid, text, triangle, lightning, sparkle,
compass, window, droplet, layers, image. These are the component category
entry points — the same set LAYERS now uses, with labels added.

---

## 3. Design language — measured

| Property | Value | Source |
|--|--|--|
| Page surface | `#1a1a1a` charcoal | sampled from full-ui frame |
| Panel surface | slightly lifted charcoal | same |
| Text | light grey labels, white for active/emphasis | same |
| Accent | blue selection border; amber for the component name | same |
| Type | clean sans-serif, ~11px labels | same |
| Layout | 3 columns, ~250 / flex / ~300px | measured |
| Row height | prop rows ~32px | measured |
| Controls | 28px tall, 4px radius, 1px low-contrast border | measured |

**No emoji, no gradients on chrome, no drop shadows on panels.** Elevation
comes from background step. This is the discipline the LAYERS panel was
built to match.

---

## 4. Images this catalogue does NOT contain

1. **The editor's own screenshots** — `shaders.com/design-editor` requires an
   account. Every editor image here is from a marketing post or a docs page,
   not the product itself.
2. **Pro preset library screenshots** — the library is Pro-gated.
3. **The live preview** — the editor renders WebGPU, so any screenshot of it
   is a marketing render, not a capture.