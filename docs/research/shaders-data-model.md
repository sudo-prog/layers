# Shaders — Data Model & Component API

**Sources (all local in `/tmp/shaders-research/`):**
`llms-full.txt` (256 KB — complete component reference, all ~200 components),
`std/llms.txt` (127 KB — std primitives vocabulary),
`docs-manifest.json` (955 KB — the manifest the reference is rendered from).
Plus the GitHub repo `shader-effects-inc/shaders` (MIT, 5.2k stars).

Extracted 2026-10-21. Prop names and enum strings are verbatim.

---

## 1. The JSON document format

One shape serves the design editor, the MCP install, and `createShader`:

```json
{
  "components": [
    {
      "type": "ComponentName",
      "id": "unique-id",
      "props": { "/* component-specific properties */": true },
      "children": [ "/* optional nested components */" ]
    }
  ]
}
```

Layers compose top-to-bottom like the DOM. A component with `requiresChild: true`
is an effect/filter and transforms what is nested inside it; `false` means it is
generative and draws its own pixels.

---

## 2. Universal properties (every component)

### Universal Properties

All components automatically support these properties:
- `blendMode`: String - Compositing mode (normal, multiply, screen, overlay, add, subtract, difference, exclusion, lighten, darken, colorDodge, colorBurn, hardLight, softLight, hue, saturation, color, luminosity)
- `opacity`: Number (0-1) - Layer opacity
- `visible`: Boolean - Show/hide layer
- `maskSource`: String - ID reference to another component for masking
- `maskType`: String - alpha, alphaInverted, luminance, luminanceInverted
- `transform`: Object with:
  - `offsetX`: Number - Horizontal offset
  - `offsetY`: Number - Vertical offset
  - `rotation`: Number - Rotation in degrees
  - `scale`: Number - Uniform scale
  - `anchorX`: Number (0-1) - Transform origin X
  - `anchorY`: Number (0-1) - Transform origin Y
  - `edges`: String - Edge handling (stretch, transparent, mirror, wrap)
- `boundingBox`: Object - Explicit placement box for the layer. Each dimension is `{ value, unit }` (unit: px or uv):
  - `x`, `y`: Position of the box (measured from `origin`)
  - `width`, `height`: Box size
  - `origin`: String - Reference corner/edge (center, top-left, bottom-right, …)
  - `rotation`: Number - Rotation in degrees
  - `cornerRadius`: Number - Corner rounding in px
- `flow`: Object (Group only) - Flex-like layout of the group's children:
  - `mode`: String - none, column, row
  - `gap`: Number - Space between children in px
  - `align`: String - Cross-axis alignment (start, center, end)
  - `anchor`: String - Where the content block pins on the canvas (center, top-left, bottom-right, …)
  - `anchorOffset`: Object { x, y } - px inset from the anchor (resize-stable)
- `absolute`: Boolean - Opts a child out of an ancestor Group's flow (CSS position:absolute semantics)

---

## 3. ID generation

### ID Generation Pattern
IDs follow the pattern: `id[timestamp_base36][random_base36]`
Example: `id17ab8e4g5`
---

## 4. Component inventory — 200 components, 10 categories

Parsed from the reference; the count matches the documented claim.

| Category | Count |
|--|--|
| Textures | 55 |
| Stylize | 31 |
| Shape Effects | 23 |
| Distortions | 22 |
| Shapes | 16 |
| Interactive | 16 |
| Adjustments | 14 |
| Transitions | 13 |
| Blurs | 9 |
| Utilities | 1 |
| **Total** | **200** |

---

## 5. Prop type vocabulary

Every prop declares a `(type)` from this closed set:

| Type | Occurrences | Meaning |
--|--|--|
| `range,map` | 660 | — |
| `range` | 545 | numeric, min/max/step defined — drives a slider |
| `color` | 250 | a colour value |
| `select` | 177 | a fixed list of options |
| `position` | 98 | an {x,y} point on the canvas |
| `origin` | 40 | — |
| `checkbox` | 30 | — |
| `gradient-stops` | 27 | — |
| `shape` | 23 | — |
| `text` | 2 | — |
| `font-family` | 2 | — |
| `font-weight` | 2 | — |
| `image-upload` | 1 | — |
| `video-upload` | 1 | — |
| `layer` | 1 | — |
| `shape3d` | 1 | — |
| `list` | 1 | an array value |
---

## 6. Blend modes (verbatim)

`normal, multiply, screen, overlay, add, subtract, difference, exclusion, lighten, darken, colorDodge, colorBurn, hardLight, softLight, hue, saturation, color, luminosity`

Note the casing: the API uses `colorDodge`, `colorBurn`, `hardLight`,
`softLight` — camelCase, unlike CSS `color-dodge`. `add` and `subtract` exist
in the library list but not in the design editor's picker.

---

## 7. Mask model

From the universal props:

- `maskSource`: String — **ID reference to another component**, not a name
- `maskType`: one of `alpha`, `alphaInverted`, `luminance`, `luminanceInverted`

A hidden layer still exists in the tree, which is what makes it usable as a
mask source — set `visible={false}` on the mask layer and reference its `id`.

---

## 8. Transform / boundingBox / flow (verbatim)

### Universal Properties

All components automatically support these properties:
- `blendMode`: String - Compositing mode (normal, multiply, screen, overlay, add, subtract, difference, exclusion, lighten, darken, colorDodge, colorBurn, hardLight, softLight, hue, saturation, color, luminosity)
- `opacity`: Number (0-1) - Layer opacity
- `visible`: Boolean - Show/hide layer
- `maskSource`: String - ID reference to another component for masking
- `maskType`: String - alpha, alphaInverted, luminance, luminanceInverted
- `transform`: Object with:
  - `offsetX`: Number - Horizontal offset
  - `offsetY`: Number - Vertical offset
  - `rotation`: Number - Rotation in degrees
  - `scale`: Number - Uniform scale
  - `anchorX`: Number (0-1) - Transform origin X
  - `anchorY`: Number (0-1) - Transform origin Y
  - `edges`: String - Edge handling (stretch, transparent, mirror, wrap)
- `boundingBox`: Object - Explicit placement box for the layer. Each dimension is `{ value, unit }` (unit: px or uv):
  - `x`, `y`: Position of the box (measured from `origin`)
  - `width`, `height`: Box size
  - `origin`: String - Reference corner/edge (center, top-left, bottom-right, …)
  - `rotation`: Number - Rotation in degrees
  - `cornerRadius`: Number - Corner rounding in px
- `flow`: Object (Group only) - Flex-like layout of the group's children:
  - `mode`: String - none, column, row
  - `gap`: Number - Space between children in px
  - `align`: String - Cross-axis alignment (start, center, end)
  - `anchor`: String - Where the content block pins on the canvas (center, top-left, bottom-right, …)
  - `anchorOffset`: Object { x, y } - px inset from the anchor (resize-stable)
- `absolute`: Boolean - Opts a child out of an ancestor Group's flow (CSS position:absolute semantics)

---

## 9. Prop table for the 10 most-used components

### `LinearGradient` — Textures

Requires child: `None`

| Prop | Type | Default | Range |
|--|--|--|--|
| `colorA` | color | `#1aff00` | — |
| `colorB` | color | `#0000ff` | — |
| `stops` | gradient-stops | `null` | — |
| `start` | position | `{"x":0,"y":0.5}` | — |
| `end` | position | `{"x":1,"y":0.5}` | — |
| `angle` | range,map | `0` | min: 0, max: 360, step: 1 |
| `edges` | select | `stretch` | — |
| `colorSpace` | select | `linear` | — |

### `RadialGradient` — Textures

Requires child: `None`

| Prop | Type | Default | Range |
|--|--|--|--|
| `colorA` | color | `#ff0000` | — |
| `colorB` | color | `#0000ff` | — |
| `stops` | gradient-stops | `null` | — |
| `center` | position | `{"x":0.5,"y":0.5}` | — |
| `radius` | range,map | `1` | min: 0, max: 2, step: 0.1 |
| `repeat` | range,map | `1` | min: 1, max: 20, step: 0.5 |
| `aspect` | range,map | `1` | min: 0.1, max: 4, step: 0.01 |
| `skewAngle` | range,map | `0` | min: 0, max: 360, step: 1 |
| `colorSpace` | select | `linear` | — |

### `Blur` — Blurs

Requires child: `Yes`

| Prop | Type | Default | Range |
|--|--|--|--|
| `intensity` | range,map | `50` | min: 0, max: 200, step: 1 |

### `Glass` — Shape Effects

Requires child: `Yes`

| Prop | Type | Default | Range |
|--|--|--|--|
| `origin` | origin | `center` | — |
| `center` | position | `{"x":0.5,"y":0.5}` | — |
| `scale` | range,map | `1` | min: 0.1, max: 3, step: 0.01 |
| `rotation` | range | `0` | min: 0, max: 360, step: 1 |
| `cutout` | checkbox | `false` | — |
| `refraction` | range,map | `1` | min: 0, max: 2, step: 0.01 |
| `edgeSoftness` | range,map | `0.1` | min: 0, max: 1, step: 0.01 |
| `blur` | range | `0` | min: 0, max: 20, step: 0.1 |
| `thickness` | range,map | `0.2` | min: 0, max: 1, step: 0.01 |
| `aberration` | range,map | `0.5` | min: 0, max: 1, step: 0.01 |
| `innerZoom` | range,map | `1` | min: 0.5, max: 3, step: 0.01 |
| `lightAngle` | range | `300` | min: 0, max: 360, step: 1 |
| `highlight` | range,map | `0.05` | min: 0, max: 2, step: 0.01 |
| `highlightColor` | color | `#ffffff` | — |
| `highlightSoftness` | range,map | `0.5` | min: 0, max: 1, step: 0.01 |
| `fresnel` | range,map | `0.1` | min: 0, max: 1, step: 0.01 |
| `fresnelSoftness` | range,map | `0.1` | min: 0, max: 1, step: 0.01 |
| `fresnelColor` | color | `#ffffff` | — |
| `tintColor` | color | `#ffffff` | — |
| `tintIntensity` | range,map | `0` | min: 0, max: 1, step: 0.01 |
| `tintPreserveLuminosity` | checkbox | `true` | — |
| `shape` | shape | `{"type":"sphere3D","radius":0.35}` | — |

### `Glow` — Stylize

Requires child: `Yes`

| Prop | Type | Default | Range |
|--|--|--|--|
| `intensity` | range,map | `1` | min: 0, max: 50, step: 0.5 |
| `threshold` | range,map | `0.5` | min: 0, max: 1, step: 0.01 |
| `size` | range,map | `25` | min: 0, max: 100, step: 1 |

### `Dither` — Stylize

Requires child: `Yes`

| Prop | Type | Default | Range |
|--|--|--|--|
| `pattern` | select | `bayer4` | — |
| `pixelSize` | range | `4` | min: 1, max: 20, step: 1 |
| `threshold` | range,map | `0.5` | min: 0, max: 1, step: 0.01 |
| `spread` | range,map | `1` | min: 0, max: 1, step: 0.01 |
| `colorMode` | select | `custom` | — |
| `colorA` | color | `transparent` | — |
| `colorB` | color | `#ffffff` | — |

### `Grid` — Textures

Requires child: `None`

| Prop | Type | Default | Range |
|--|--|--|--|
| `color` | color | `#ffffff` | — |
| `cellColor` | color | `transparent` | — |
| `cells` | range,map | `10` | min: 1, max: 50, step: 1 |
| `thickness` | range,map | `1` | min: 0, max: 20, step: 0.1 |
| `rotation` | range,map | `0` | min: 0, max: 360, step: 1 |
| `softness` | range,map | `0` | min: 0, max: 1, step: 0.01 |
| `variation` | range,map | `0` | min: 0, max: 1, step: 0.01 |
| `colorSpace` | select | `linear` | — |

### `Vignette` — Stylize

Requires child: `Yes`

| Prop | Type | Default | Range |
|--|--|--|--|
| `color` | color | `#000000` | — |
| `center` | position | `{"x":0.5,"y":0.5}` | — |
| `radius` | range,map | `0.5` | min: 0, max: 1.5, step: 0.01 |
| `falloff` | range,map | `0.5` | min: 0.01, max: 1.5, step: 0.01 |
| `intensity` | range,map | `1` | min: 0, max: 1, step: 0.01 |

### `CursorTrail` — Interactive

Requires child: `None`

| Prop | Type | Default | Range |
|--|--|--|--|
| `colorA` | color | `#00aaff` | — |
| `colorB` | color | `#ff00aa` | — |
| `stops` | gradient-stops | `null` | — |
| `radius` | range | `0.5` | min: 0.5, max: 2, step: 0.1 |
| `length` | range | `0.5` | min: 0.1, max: 2, step: 0.1 |
| `shrink` | range | `1` | min: 0, max: 1, step: 0.1 |
| `softness` | range,map | `0` | min: 0, max: 1, step: 0.01 |
| `colorSpace` | select | `linear` | — |

### `Group` — Utilities

Requires child: `Yes`

No props — this component takes only the universal set.
---

## 10. Dynamic props — the interactivity model

The library reference documents the component API; the **dynamic prop** object
is documented separately at `/docs/guide/dynamic-props` and the reference
describes it as `(range,map)` on any numeric prop. Verbatim contract:

```js
// static
<Circle radius={0.5} />

// driven — the prop value is an object, not a number
<Circle radius={{ type: 'auto-animate', mode: 'ping-pong',
                       outputMin: 0.2, outputMax: 0.6,
                       speed: 0.8, easing: 'sine' }} />
```

### `auto-animate` fields

| Field | Type | Default | Meaning |
|--|--|--|--|
| `mode` | `'ping-pong' \| 'loop'` | required | `ping-pong` oscillates; `loop` advances then wraps |
| `outputMin` | number | required | Value at the start of the range |
| `outputMax` | number | required | Value at the end of the range |
| `speed` | number | `1.0` | Cycles per second. Negative reverses direction |
| `easing` | string | `'sine'` | `sine`, `linear`, `quad`, `expo`, `bounce` (ping-pong only) |

### Driver types

| `type` | Drives from | Editor controls |
|--|--|--|
| `auto-animate` | time | `Mode`, `Speed`, `Easing` |
| `mouse-position` | cursor | `Axis`, `Min`, `Max`, `Curve`, `Smoothing`, `Momentum`, `Reach`, `Lock X/Y`, `Invert H/V` |
| `map` | another layer's channel | `Source`, `Channel` |

The design editor's control labels, from the OCR'd tutorial frames:
`Min`, `Max`, `Curve`, `Smoothing`, `Momentum`, `Reach`, `Lock X`, `Lock Y`,
`Invert Horizontal`, `Invert Vertical`, `Ping-pong`, `Easing`, `Sine`, `Speed`,
`Source`, `Channel`, `Alpha`.

---

## 11. std primitives vocabulary

`std/llms.txt` documents the word-level vocabulary used to define custom
components. The manifest's own summary:

- `schemaVersion`: 1
- `engineVersion`: 4.0.4
- `generatedAt`: 2026-10-16T14:38:00.406Z
- `groups`: 6
- `categories`: 44
- `words`: 575
- `types`: 162

Custom component contract (`defineShader`):

```ts
import { defineShader, transformColor, transformPosition } from 'shaders/std'

export const MyGradient = defineShader({
  name: 'MyGradient',
  props: {
    from:   { default: { x: 0, y: 0.5 }, transform: transformPosition },
    to:     { default: { x: 1, y: 0.5 }, transform: transformPosition },
    colorA: { default: '#ff6b6b',        transform: transformColor },
    colorB: { default: '#4ecdc4',        transform: transformColor },
    colorSpace: { default: 'oklch', transform: transformColorSpace, compileTime: true },
  },
  paint: rampOver(dist.linear({ from: p('from'), to: p('to'), angle: 0 }),
                   pair(p('colorA'), p('colorB'), p('colorSpace'))),
})
```

Three paint modes: `paint:` (draws from nothing), `effect:` (filters nested
layers), `map:` (distorts nested layers).

---

## 12. CLI / MCP round-trip

```bash
npx shaders connect                 # detect framework, install pkg, write shaders.config.ts
npx shaders install                 # pick from the connected project → writes component files
npx shaders install offsets-1       # a preset, by name (Pro)
npx shaders update                  # pull editor changes back into the codebase
npx shaders open                    # open the connected project in the editor
npx shaders search "liquid chrome"  # search the preset library
npx shaders preview <name>          # open a preset on shaders.com
npx shaders install-mcp             # add the MCP server to coding agents
```

Config file:

```ts
import { defineConfig } from 'shaders/config'
export default defineConfig({
  framework: 'react',
  project: '4a1e…',                        // the Shaders project id
  outDir: 'src/components/shaders',        // where installs land
})
```

`install` writes one component file into `outDir` and records it in
`shaders.lock.json`. `update` leaves hand-edited files alone unless `--force`.
Auth is OAuth in the browser, remembered in `~/.shaders/credentials.json`;
`SHADERS_API_KEY` covers CI. MCP endpoint: `https://shaders.com/mcp`.

---

## 13. Packaging

One npm package, `shaders`, with framework entry points:
`shaders/react`, `shaders/vue`, `shaders/svelte`, `shaders/solid`,
`shaders/js`, plus `shaders/std`, `shaders/config`, `shaders/partner`.

Repo layout (GitHub, MIT): `packages/core` (components + std + GPU tests),
`packages/react|vue|svelte|solid|js`, `packages/shaders` (CLI + MCP installer),
`skills/shaders` (the agent skill).

---

## 14. Where this was used

This contract is the basis for the LAYERS properties panel's dynamic-prop
storage format. LAYERS stores the same field names (`dynamic`, `type`,
`outputMin`, `outputMax`, `speed`, `easing`, `axis`, `smoothing`, `momentum`,
`reach`, `source`, `channel`) plus a `base` field holding the static fallback,
so a driven prop and its plain value can never drift apart. See
`docs/properties-panel.md` in the LAYERS repo.