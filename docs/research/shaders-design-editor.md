# Shaders.com Design Editor — Research Dossier

Evidence base: 11 official tutorial videos (full transcripts + 160 high-res OCR'd frames),
the docs site, the GitHub repo, and 440 downloaded images. Compiled 2026-10-21.

---

## 1. Top-level layout (verbatim, from OCR + transcripts)

Five regions. Nothing else exists.

| Region | Contents |
|---|---|
| **Top bar** | Folder icon · **project name** (double-click to rename) · window icon · fullscreen icon · **zoom %** (e.g. `100%`, `55%`) · zoom dropdown · avatar |
| **Left panel** | Section header `Shaders` (list of shaders in the project) · section header `Layers` (the layer stack of the selected shader) · footer: `v3.0.363` left, `Community` right |
| **Canvas** | Infinite canvas. Frame label top-left (shader name + unsaved dot) · top-right `1920 × 1080` with frame icon · bottom-right `P3 Linear` and `Neutral` (colour space + tone mapping) |
| **Right panel — "Props"** | Component name (accent colour) · docs link icon · zoom-to-shader controls · sections: `Transform`, `Sizing`, `Appearance`, then component-specific props |
| **Bottom insert toolbar** | Floating pill, 10 icons. Opens a component picker with a search box |

### Insert toolbar → component picker

Search field: `Q Search components..`
Footer of the picker: a **per-category** live count — `17 components` for shape
effects, `26 components` for stylize, `11 components` for interactive. Also in
the footer: `Esc Close`.

> Corrected 2026-10-21: an earlier revision recorded a single global count of
> `17 components`. The count follows the open category.

Categories seen open in the picker:
`Textures` · `Text` · `Shapes` · `Shape Effects` · `Stylize` · `Interactive` · `Distortions` · `Blurs` · `Adjustments` · `Media`

Each category shows live-rendered thumbnails of every component.

---

## 2. The Properties (Props) panel — the heart of it

### 2a. `Transform` section
`X` · `Y` · `W` · `H` · `Rotation` · `Corner Radius`
Values carry a **unit toggle** — `%` or `px`. Tooltip on the toggle: **"switch unit"**.
Alignment grid control (square-with-crosshair).

### 2b. `Sizing` section
`Object Fit` with a segmented control:
`Fill` · `Cover` · `Contain` · `Scale Down`

### 2c. `Appearance` section (present on essentially every component)
`Opacity` (0–100) · `Blend Mode` · `Mask Source` · `Mask Channel`

**Blend Mode** options (verbatim from the picker):
`Normal (OKLCh)` · `Normal (OKLAB)` · `Multiply` · `Screen` · `Linear Dodge` · `Overlay` · `Difference` · `Exclusion` · `Hard Light` · `Soft Light` · `Color Dodge` · `Color Burn` · `Darken` · `Lighten` · `Hue` · `Saturation` · `Color` · `Luminosity`

**Mask Channel** options: `Alpha` · `Luminance` · (RGB channels)

### 2d. `Colors` section
A gradient **bar** showing the stop flow · swatch circles · a **Stops** list where each row is:
`<position %> <hex>` (e.g. `0 %  #3E1CFF`, `23 %  #1F1982`, `37 %  #10C3F9`, `76 %  #F67119`, `100 %  #FFD182`)
plus `+` / `−` to add and remove stops.
Header actions: a **swap** control (reverse stops) and a **randomize** control
(narrated as "hit the randomize colors button"; the dice glyph was not resolved).
`Color Space` dropdown — options seen: `Linear RGB` · `OKLAB` · `OKLCh` · `sRGB`
Also seen: `Color Variance`, `Color Shade`, `Color Blending`, `Color Decay`.

> `Randomize` is **transcript-sourced, not OCR-verified** — the word appears in
> the narration but the button's on-screen label was never captured in a frame.

### 2e. `Position` section
`Start` (`X`, `Y`) · `End` (`X`, `Y`) · `Angle` · `Center` (`X`, `Y`) · `Scale`
Units toggle between `%` and `px`, and `px` values survive canvas resizes.

### 2f. `Shape` section (shape effects)
`Shape` selector with grouped choices:
- 2D: `Circle` · `Polygon` · `Heart` · `Ring` · `Cross` · `Rounded Rect` · `Parallelogram` · `Teardrop` · `Flower`
- 3D: `Sphere` · `Cube` · `Torus` · `Octahedron` · `Cylinder` · `Capsule` · `Cone` · `Pyramid`
- `Custom SVG` → uploads, then `Geometry`: `Flat` / **`extrude`**, with `Depth` and `Bevel`

Shape params: `Width` · `Height` · `Depth` · `Rounding` · `Radius` · `Base Size` · `Scale` · `Rotation X` · `Rotation Y` · `Rotation Z`

### 2g. Component-specific prop groups (real examples)
**Glass** (shape effect): `Rotation` · `Fresnel` · `Fresnel Softness` · `Fresnel Color` · `Cutout` · `Refraction` · `Edge Softness` · `Blur` · `Thickness` · `Aberration` · `Inner Zoom` · `Light Angle` · `Highlight` · `Highlight Softness` · `Ambient`
**LightEdge**: `Rotation X` · `Rotation Y` · `Rotation Z` · `Colors` → `Stops` ·
`Color Space` (`OKLAB`) · `Position`. Exported JSX also carries
`shapeType="blob3D"` · `softness` · `thickness` · `speed` · `rotX`/`rotY`/`rotZ`.
*(Corrected 2026-10-21: an earlier revision listed `Pulse` · `Speed` ·
`Smoothness` · `Thickness` · `Softness`; `Pulse` and `Smoothness` were not
observed in the Quick Tour.)*
**CursorRipples** (Interactive): `Transform` (`X` · `Y` · `W` · `H` · rotation · px)
then `Effect`: `Intensity` · `Decay` · `Radius` · `Chromatic Split` · `Edges` (`Stretch`)
**BrushedMetal**: `Brush` · `Brush Angle` · `Anisotropy`
**Ascii**: `Effect` · `Characters` · `Cell Size`
**PagePeel**: `Corner` (`Bottom Right`) · `Amount` · `Curl Radius` · `Shading` · `Highlight` · `Highlight Softness`
**Strands**: `Frequency` · `Strand Count` · `Strand Width` · `Strand Softness` · `Spread` · `Pin Edges` · `Animation`
**DotGrid**: `Density` · `Dot Size` · `Map source`
**ColorWheel**: `Mode` (`Rainbow`) · `Scale` · `Angle` · `Sonate`
**FlowingGradient**: `Color` · `Color A` · `Color B` · `Color C` · `Color D` · `Color Space` · `Seed`
**ImageTexture**: `Media` → `Image`, plus `Transform` / `Sizing` / `Appearance`
**Text**: `Font Family` · `Weight` · typographic controls
**Circle** (shape): `Color` · `Color Blending` · `Position` → `Center Position` · `Radius` · `Softness` · `Chatter` · `Stroke Thickness` · `Stroke Color` · `Stroke`
**MultiPointGradient**: `Transform` · `Colors` → `Color A`…`Color F` · `Color Channel`
**Holographic**: `Shape` → `Pyramid` · `Base Size` · `Height` · `Rotation X/Y/Z` · `Center`
**Group**: `X` · `Y` · `W` · `H` · `Appearance` · `Mask Source` · `Blend Mode` · `Mask Channel`

---

## 3. Dynamic props — the "make value dynamic" control

Next to **every** prop sits a small **"make value dynamic"** toggle. Turning it on replaces the static value with a dynamic-prop editor.

Three modes:
1. **Cursor** (mouse-driven)
2. **Automatic** (auto-animate)
3. **Map** (driven by another layer)

**Cursor mode controls:** `Axis` (`X` / `Y`) · `Min` · `Max` · `Curve` (−1…1) · `Smoothing` · `Momentum`
**Position mode adds:** `Reach` · `Lock X` · `Lock Y` · `Invert Horizontal` · `Invert Vertical`
**Automatic mode controls:** `Mode` (`Ping-pong` / `Loop`) · `Easing` (`Sine`, `Linear`, `Quad`, `Expo`, `Bounce`) · `Speed`
**Map mode controls:** `Source` (pick a layer) · channel (e.g. `Alpha`)

> **Sourcing note (corrected 2026-10-21).** `Min`, `Max`, `Curve`, `Smoothing`,
> `Momentum`, `Reach`, `Axis`, `Ping-pong`, `Easing` and `Sine` are verbatim from
> the OCR'd frames or the transcripts. `Lock X` / `Lock Y` are transcript-only.
> **`Invert Horizontal` / `Invert Vertical` were not observed in any source** — an
> earlier revision of this dossier listed them as if seen. They are named in the
> video's *narration* ("we have some fun ones... inversing for horizontal and
> inversing for Y") but the on-screen labels were never captured. Treat them as
> inferred, not verified.
>
> **The *Quick Tour of the Shaders Design Editor* does not show this feature at
> all.** All 132 frames (1/2 s) plus 20 re-OCR'd at 2560px were searched for
> `dyn`, `make value dynamic`, `Automatic`, `Smoothing`, `Momentum`, `Reach`,
> `Invert`, `Ping`, `Easing`, `Map` — **zero hits**. Everything in this section
> comes from the *other* tutorial videos. Do not cite the Quick Tour for it.
> See `shaders-quick-tour-corrections.md` §3.

Real code shape for these:
```js
radius: { type: 'auto-animate', mode: 'ping-pong', outputMin: 0.2, outputMax: 0.6, speed: 0.8, easing: 'sine' }
```

---

## 4. Canvas interactions

- **Infinite canvas**, zoom in/out, pan — "just like any other design tool"
- **Multiple shaders** coexist as frames on one canvas
- **Duplicate** via right-click, or `Cmd/Ctrl+D`
- **Right-click frame menu**: `Hide visibility` · `Lock` · `Bring to front` · `Send to back` · `Fit to frame` · `Cover` · `Fill` · `Copy properties`
- **Right-click canvas menu**: `Zoom to fit active` · `Zoom to fit all` · `Clean up layout` · align tools
- **Transform handles**: blue selection border, square corner + midpoint handles, orange rotation handle
- **3D gizmo** for 3D shapes
- **Drag and drop** media straight onto the canvas
- **Double-click** a project / shader / layer name to rename inline
- **`Fit to frame`** / **`Set frame to image dimensions`** context actions
- **Anchor point** selectable per layer (center, corners, edges) — governs how it behaves on canvas resize

### Dimensions switcher (top-right of canvas)
Grouped presets (verified against the Quick Tour video, 2026-10-21):

- **Mobile**: `iPhone 16 Pro` `393 × 852` · `iPhone 16 Plus` `428 × 926` · `iPhone 16 Pro Max` `430 × 932`
- **Tablet**: `iPad Air 11"` `820 × 1180` · `iPad Mini 8.3"` `744 × 1133`
- **Desktop**: `MacBook Air` `1280 × 832` · `MacBook Pro 14"` `1512 × 982` · `MacBook Pro 16"` `1728 × 1117` · `Desktop` (no dimensions — a plain selectable row, ✓ when active) · `4K UHD` `3840 × 2160`
- **Social Media**: `OpenGraph` `1200 × 630` · `X Post` `1200 × 675`

> Corrected 2026-10-21. An earlier revision had `iPhone 16 Plus` as `430 × 932`,
> `iPhone 16 Pro Max` as `440 × 956`, `MacBook Pro 14"` as `1512 × 952`, and
> `Desktop` as `1200 × 675`. The video shows `1200 × 675` belongs to **X Post**,
> and the `Desktop` row carries no dimensions.

Canvas colour space / tone mapping (bottom-right): `P3 Linear` · `sRGB`, and `Linear` · `ACES Filmic` · `Neutral`

---

## 5. Export

**`Export`** button sits bottom-right next to **`Share`**.

Export dialog title: `Export Code: "<Shader Name>"`

Framework tabs: `Vue` · `React` · `Svelte` · `Solid` · `JS` · `Framer`

Two export paths:
1. **`Install with the Shaders MCP`**
   - Copyable command: `npx shaders@latest install-mcp`
   - Instruction: *"Connect your AI agent to the Shaders MCP, then paste this prompt to install."*
   - Generated prompt: `Ask Shaders MCP to install "<Name>" (4728929) in my project`
   - Link: `How do I connect the MCP?`
2. **`Or copy the code manually`** — an expandable code block with the full component tree.

Also: **export video** and **export image** (right-click a frame → `Copy image`).

---

## 6. Layers panel

Each row: type icon · name · **eye** (visibility) · **lock**
Nesting is real — drag a layer into another to nest it; an effect then applies only to its children.
`Group` layers via right-click (multi-select with Shift/Cmd).
Hidden layers still exist in the tree, which is what makes them usable as mask sources.

---

## 7. Design language (measured, not guessed)

- **Dark-only.** Near-black surfaces: `#0e0e11` page, `#16161a` panels, `#1e1e24` raised.
- **Accent**: blue `#4d7cff`-ish for selection; layer/component names render in an **orange/amber** (`#f6a219`-ish).
- **Type**: system sans (SF/Segoe), 11–13px for UI, uppercase 10px letterspaced section headers.
- **Density**: extremely dense — 4px padding on prop rows, 28px row height.
- **Radius**: 4–6px on controls, 8px on panels and frames.
- **Borders**: 1px, low-contrast, used structurally. Elevation comes from background step, not shadow.
- **Layout widths**: left panel ~250px, right props ~300px, canvas flexes.
- **Icons**: single stroke family, `currentColor`, 16–18px.
- **No emoji anywhere.**

---

## 8. What LAYERS already has (the base we're building on)

`/Users/AIR2K/Data/20_Projects/20.34_LAYERS/apps/web/`
- `index.html` (138 lines) · `src/styles.css` (2376 lines, 183 classes) · `src/*.ts` (9615 lines, 155 tests)
- 7 cores with real GLSL: Pattern/Dither, Noise/Grain, Blur, Displacement, Color/Blend, Lighting, Outline
- Existing surface: top toolbar · left `Cores` panel · centre canvas · right `Stack` + inspector · bottom mobile tab bar
- Inspector renders: sliders, selects, `<input type=color>`, checkboxes, opacity, blend mode, move up/down
- Maestro flows exist at `apps/web/.maestro/` (mobile-500.yaml, mobile-ui.yaml)

---

## 9. Evidence artifacts

| Artifact | Path |
|---|---|
| Video transcripts (11 videos, ~90KB) | `transcripts_full.txt` |
| OCR of 160 hi-res frames | `ocr.json`, `ocr_hi.txt` |
| OCR of 245 lo-res frames | `ocr_report.txt` |
| Downloaded images (440) | `research-shots/`, `img/`, `preset-thumbnails/` |
| Contact sheets | `sheets/`, `sheets2/` |
| Raw videos | `yt/hi/` |

*(All under `/Users/AIR2K/.hermes/cache/scratch/layers-ui/`)*
---

## 10. Full component inventory (all 200, by category)

Parsed from `llms-full.txt`. Order within a category is the reference's own.

### Blurs (9)

`AngularBlur`, `Blur`, `BokehBlur`, `ChannelBlur`, `DiffuseBlur`, `LinearBlur`, `ProgressiveBlur`, `TiltShift`, `ZoomBlur`

### Shapes (16)

`Arc`, `Circle`, `Crescent`, `Cross`, `Ellipse`, `Flower`, `Heart`, `Line`, `Parallelogram`, `Polygon`, `Ring`, `RoundedRect`, `Star`, `Teardrop`, `Trapezoid`, `Vesica`

### Stylize (31)

`Ascii`, `Chalkboard`, `ChromaticAberration`, `CompressionArtifacts`, `ContourLines`, `CRTScreen`, `DataMosh`, `Dither`, `DropShadow`, `Engraving`, `FilmGrain`, `Glitch`, `Glow`, `GradientMap`, `Halftone`, `KeyFrames`, `LensDistortion`, `LensFlare`, `LightLeak`, `ObjectTracker`, `Paper`, `ParticleField`, `Pixelate`, `ReflectivePlane`, `Sparkle`, `Stone`, `TimeTrail`, `VHS`, `Vignette`, `Watercolor`, `Wool`

### Textures (55)

`Aurora`, `Beam`, `Blob`, `BlockNoise`, `BlueNoise`, `BrickPattern`, `Checkerboard`, `Chevron`, `ColorWheel`, `ConicGradient`, `CurlNoise`, `DiamondGradient`, `DotGrid`, `ErosionNoise`, `FallingLines`, `FloatingParticles`, `FlowingGradient`, `FractalNoise`, `GaborNoise`, `Godrays`, `Grid`, `HexGrid`, `HTMLInCanvas`, `ImageTexture`, `IsometricCubes`, `LinearGradient`, `Marble`, `MeshGradient`, `MultiPointGradient`, `PerlinNoise`, `Plasma`, `Prism`, `RadialGradient`, `Ripples`, `Satin`, `Scratches`, `SimplexNoise`, `SineWave`, `SolidColor`, `Spiral`, `Strands`, `Stripes`, `StudioBackground`, `SunBurst`, `Swirl`, `Text`, `TriangularGrid`, `Truchet`, `VideoTexture`, `Voronoi`, `Waveform`, `WaveletNoise`, `Weave`, `WebcamTexture`, `WorleyNoise`

### Transitions (13)

`BarnDoors`, `BlockDissolve`, `CheckerWipe`, `DiamondWipe`, `IrisWipe`, `LinearWipe`, `NoiseDissolve`, `PagePeel`, `RadialWipe`, `RandomBars`, `RippleWipe`, `SliceWipe`, `VenetianBlinds`

### Distortions (22)

`BarShift`, `Bend`, `Bulge`, `ConcentricSpin`, `CornerPin`, `DisplacementMap`, `Flip`, `FlowField`, `FlutedGlass`, `Form3D`, `GlassTiles`, `Kaleidoscope`, `Mirror`, `Perspective`, `PolarCoordinates`, `RectangularCoordinates`, `Repeater`, `Spherize`, `Stretch`, `Surface3D`, `Twirl`, `WaveDistortion`

### Interactive (16)

`Boids`, `ChromaFlow`, `CursorRipples`, `CursorTrail`, `Fog`, `GridDistortion`, `InkFlow`, `Liquify`, `MagneticFilings`, `ParticleFlow`, `PixelSort`, `PixelThrow`, `ReactionDiffusion`, `Shatter`, `Smoke`, `SmokeFlow`

### Adjustments (14)

`BrightnessContrast`, `Duotone`, `Exposure`, `FilmStock`, `Grayscale`, `HueShift`, `Invert`, `Posterize`, `Saturation`, `Sharpness`, `Solarize`, `Tint`, `Tritone`, `Vibrance`

### Shape Effects (23)

`BrushedMetal`, `CarbonFiber`, `Chrome`, `Crystal`, `Emboss`, `Frost`, `Glass`, `Goo`, `Heatmap`, `Hologram`, `Holographic`, `Irradiance`, `LightEdge`, `LiquidMetal`, `Nebula`, `Neon`, `Obsidian`, `Particles`, `Plastic`, `SmokeFill`, `ThinFilm`, `Voxels`, `Water`

### Utilities (1)

`Group`

---

## 11. Prop-name frequency across the library

The 30 prop names that recur most — these are the ones a generic properties
panel has to render well, because they appear across many components.

| Prop | Components using it |
|--|--|
| `colorSpace` | 74 |
| `center` | 70 |
| `speed` | 69 |
| `colorA` | 56 |
| `colorB` | 56 |
| `rotation` | 47 |
| `softness` | 43 |
| `intensity` | 41 |
| `seed` | 41 |
| `scale` | 41 |
| `origin` | 40 |
| `radius` | 30 |
| `angle` | 30 |
| `color` | 30 |
| `stops` | 27 |
| `shape` | 27 |
| `edges` | 25 |
| `contrast` | 18 |
| `lightAngle` | 17 |
| `edgeSoftness` | 17 |
| `strokeColor` | 16 |
| `strokeThickness` | 15 |
| `strokePosition` | 15 |
| `thickness` | 15 |
| `strength` | 14 |
| `balance` | 14 |
| `invert` | 12 |
| `count` | 12 |
| `progress` | 12 |
| `falloff` | 11 |

Distinct prop names across all 200 components: **602**.
---

## 12. MCP server — tools and config

Endpoint: `https://shaders.com/mcp` (Streamable HTTP). OAuth in the browser by
default; `SHADERS_API_KEY` / a Bearer header for CI and tools without OAuth.

### What the MCP exposes

| Capability | Notes |
|--|--|
| Browse the user's saved shaders | Pull component code in any framework |
| Search the Pro library | Code, thumbnail preview, contextual notes |
| Modify props, wire to state | Reactive binding in the user's framework |
| Generate SDF from SVG | Required for shape effects (logo shaders) |
| Pro knowledge base | Private expert notes, injected as context |

### Per-client config (verbatim)

| Client | Config |
|--|--|
| Claude Code | `claude mcp add --transport http shaders https://shaders.com/mcp` |
| Cursor | `.cursor/mcp.json` → `{"mcpServers":{"shaders":{"url":"https://shaders.com/mcp"}}}` |
| VS Code | `.vscode/mcp.json` → `{"servers":{"shaders":{"type":"http","url":…}}}` |
| Windsurf | `.windsurf/mcp_config.json` → `{"mcpServers":{"shaders":{"serverUrl":…}}}` |
| Codex | `~/.codex/config.toml` → `[mcp_servers.shaders]` + `url` |
| Lovable / Bolt | Built-in connector — no config |

API-key variant adds `headers: { "Authorization": "Bearer <key>" }`.

---

## 13. Code export — the exact shape

Three documented examples, showing how nesting maps to the JSON tree:

```json
// Example 1 — one generative layer
{"components":[{"type":"Circle","id":"id1","props":
  {"color":"#5b18ca","radius":1,"softness":0.5,"center":{"x":0.5,"y":0.5}}}]}

// Example 2 — an effect wrapping a generative layer
{"components":[{"type":"Blur","id":"id2","props":{"intensity":50},"children":
  [{"type":"LinearGradient","id":"id3",
    "props":{"colorStops":["#ff0000","#0000ff"],"angle":45}}]}]}

// Example 3 — three levels of nesting
{"components":[{"type":"Glow","id":"id4","props":{"intensity":1,"radius":20},
  "children":[{"type":"ChromaticAberration","id":"id5","props":{"offset":5},
    "children":[{"type":"Circle","id":"id6",
      "props":{"color":"#ffffff","radius":0.5}}]}]}]}
```

Rules visible in the examples:

1. `children` appears **only when there are nested layers** — it is omitted, not
   emitted as `[]`, in the single-layer case.
2. **Effects nest their inputs.** `Blur` wraps `LinearGradient`; the gradient is a
   child, not a sibling. That is the whole composition model.
3. ⚠️ **Gradient stops are `{position, color}` objects, and the prop is `stops`
   — NOT `colorStops`.** These docs examples show `colorStops: ["#ff0000","#0000ff"]`
   (a flat string array with implied positions). The **editor's own export**
   (Quick Tour video, t=260 s) emits:
   ```jsx
   stops={[{ color: "#1633c3", position: 0 }, { color: "#b33b…", position: … }, …]}
   ```
   Two different contracts. Trust the editor's: `stops: {position, color}[]`.
   Positions are explicit, not index-implied. See
   `shaders-quick-tour-corrections.md` §1a.
4. `center` is `{"x":0.5,"y":0.5}` — **normalised UV**, not pixels. Confirmed in
   the video's JSX export: `center={{x: 0.5, y: 0.93}}`.

### The editor exports **JSX**, not only JSON

The docs show JSON; the editor's `Export` dialog produces a React component tree
(verified in the Quick Tour, t=244–262 s):

```jsx
import { Shader, CursorRipples, LightEdge, StudioBackground } from 'shaders/react'

export default function ShaderEffect() {
  return (
    <Shader toneMapping="aces">
      <StudioBackground backIntensity={93} center={{x: 0.5, y: 0.93}} color="#222230" />
      <LightEdge center={{x: 0.5, y: 0.5}} colorSpace="oklab"
                 shapeType="blob3D" softness={0.95} thickness={0.69}
                 speed={0.7} rotX={0} rotY={0} rotZ={0}
                 stops={[{color: "#1633c3", position: 0}, …]} />
      <CursorRipples … />
    </Shader>
  )
}
```

Prop conventions: camelCase (`backIntensity`, `shapeType`, `rotX`), numbers in
`{…}` braces, hex strings plain-quoted, `center` normalised 0–1.
The dialog title tracks the shader name: `Export Code: "Desktop"`.

---

## 14. Design-language measurements

From the OCR'd frames and the v3 announcement screenshots:

| Property | Value |
|--|--|
| Layout | 3 columns: left ~250px, canvas flex, right ~300px |
| Top bar | project name (double-click to rename), zoom %, zoom dropdown, avatar |
| Panel section header | uppercase, ~11px, 0.06em tracking, 32px row |
| Prop row | 32px, label 84px column, control fills the rest |
| Control height | 28px; radius 4px; border 1px low-contrast |
| Surfaces | `#0e0e11` page, `#16161a` panel, `#1e1e24` raised |
| Accent | blue for selection; layer/component names in amber |
| Icons | single stroke family, `currentColor`, 16–18px, no emoji |

The reference is **denser than it looks** — the 300px panel holds a labelled
slider per row with no wasted width, which is why two labelled controls per row
does not fit at that width.

---

## 15. What this dossier does not cover

1. **The editor UI itself is not public.** `shaders.com/design-editor` requires
   an account, so every UI detail here comes from the tutorial videos, the
   announcement screenshots, and the docs prose — not from driving the product.
   The docs page `quick-tour-of-the-design-editor` renders only its intro card;
   the body is client-side and was not retrievable.
2. **Pro-only surfaces** (the preset library, Sections, the knowledge base)
   could not be inspected without a subscription.
3. **No performance numbers** were published by the vendor beyond the v3
   announcement's own claims (25× faster compile, 3× smaller bundles).
4. **The `colorStops` vs `stops` discrepancy is unresolved at source.** The docs
   and the editor's export disagree (§13 rule 3). Only the editor's export has
   been seen in motion; the docs sample may be stale or a different API version.

## 16. Corrections log

| Date | Item | Was | Now | Evidence |
|--|--|--|--|--|
| 2026-10-21 | Version string | `v0.0.365` | `v3.0.363` | Quick Tour, 4 timestamps |
| 2026-10-21 | Picker count | global `17 components` | per-category (`17`/`26`/`11`) | Quick Tour 185–195 s |
| 2026-10-21 | `iPhone 16 Plus` | 430 × 932 | 428 × 926 | Quick Tour 124 s |
| 2026-10-21 | `iPhone 16 Pro Max` | 440 × 956 | 430 × 932 | Quick Tour 124 s |
| 2026-10-21 | `MacBook Pro 14"` | 1512 × 952 | 1512 × 982 | Quick Tour 124 s |
| 2026-10-21 | `Desktop` preset | `1200 × 675` | no dimensions; `1200 × 675` is `X Post` | Quick Tour 124 s |
| 2026-10-21 | Gradient stops | `colorStops: string[]` | `stops: {position, color}[]` | Quick Tour 260 s (code) |
| 2026-10-21 | `LightEdge` props | `Pulse · Speed · Smoothness · …` | `Rotation X/Y/Z · Colors/Stops · Color Space · Position` | Quick Tour 42–90 s |
| 2026-10-21 | Dynamic props | implied sourced from tutorials generally | **not in the Quick Tour at all** | exhaustive negative search |