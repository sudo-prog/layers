# Shaders "Quick Tour" video — corrections to the research dossier

**Source:** `Quick Tour of the Shaders Design Editor` (Shaders, 4m23s, 1280×718).
**Method:** 132 frames OCR'd at 1 frame / 2 s (macOS Vision, `.accurate`) + 20 frames
re-OCR'd at 2560px + targeted crops for small text. Cross-checked against the
existing transcript (`G7kzM8M7hA4`, already in `transcripts_full.txt`).
**Verdict:** the transcript was already captured; **the frames were not analysed
closely enough**. Five factual errors and three omissions found.

---

## 1. Errors in the dossier — correct these

### 1a. `colorStops` shape is wrong (§13, rule 3) — **highest impact**

Dossier says:

> `colorStops` is a **flat array of colour strings** — `["#ff0000","#0000ff"]` —
> not an array of `{position, color}` objects. Positions are implied by index.

The editor's own exported code (t=260 s) shows:

```
stops={[{ color: "#1633c3", position: 0}, { color: "#b33b…  }, …]}
```

It **is** an array of `{position, color}` objects. Two things are wrong:

1. The shape: `{position, color}` objects, not bare strings.
2. The prop name in the editor's export is **`stops`**, not `colorStops`.

The old examples came from the docs (`llms-full.txt`); the video shows the
*editor's* export. Treat `stops: {position, color}[]` as the editor's contract
and note the docs sample differs.

### 1b. Version number (§1) — wrong

Dossier: `v0.0.365`. Video (confirmed at 2 s, 60 s, 100 s, 120 s, both OCR and
vision): **`v3.0.363`**. The §14 heading already refers to a "v3 announcement",
so `v0.0.365` was almost certainly a transcription slip that got recorded as fact.

### 1c. Dimensions presets (§4) — three values wrong, one mispaired

| Preset | Dossier | Video (verified) |
|--|--|--|
| `iPhone 16 Plus` | 430 × 932 | **428 × 926** |
| `iPhone 16 Pro Max` | 440 × 956 | **430 × 932** |
| `MacBook Pro 14"` | 1512 × 952 | **1512 × 982** |
| `Desktop` | 1200 × 675 | **no dimensions shown** — it is a plain selectable row (✓ when active) |
| `X Post` | (no value) | **1200 × 675** |

So `1200 × 675` belongs to **X Post**, not to a "Desktop" entry. Correct:

- Mobile: `iPhone 16 Pro` 393 × 852 · `iPhone 16 Plus` 428 × 926 · `iPhone 16 Pro Max` 430 × 932
- Tablet: `iPad Air 11"` 820 × 1180 · `iPad Mini 8.3"` 744 × 1133
- Desktop: `MacBook Air` 1280 × 832 · `MacBook Pro 14"` 1512 × 982 · `MacBook Pro 16"` 1728 × 1117 · `Desktop` (no dims) · `4K UHD` 3840 × 2160
- Social Media: `OpenGraph` 1200 × 630 · `X Post` 1200 × 675

### 1d. Picker footer count (§1) — it is per-category, not global

Dossier implies a single `17 components`. The count changes with the open
category:

- shape-effects category → `17 components`
- stylize category → `26 components`
- interactive category → `11 components`

Also in the footer and not recorded: **`Esc Close`**.

### 1e. `LightEdge` props (§2g) — list is wrong for this version

Dossier: `Pulse · Speed · Smoothness · Thickness · Softness`.
Video shows the panel sections as `Rotation X · Rotation Y · Rotation Z ·
Colors → Stops · Color Space → OKLAB · Position`, and the exported JSX carries
`shapeType="blob3D" · softness · thickness · speed · rotX/rotY/rotZ`.
`Pulse` and `Smoothness` were not observed.

---

## 2. Omissions — add these

### 2a. The export is **JSX**, not JSON (§13 covers only JSON)

The video's export dialog produces a React component tree, not the JSON
examples in §13. Verbatim structure:

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

Confirmed prop conventions: camelCase (`backIntensity`, `shapeType`, `rotX`),
numbers as `{…}` braces, `center` normalised to 0–1, hex strings plain-quoted.
This confirms §13 rule 4 (`center` is normalised UV) and **contradicts** rule 3.

### 2b. `CursorRipples` props (absent from §2g)

Sections `Transform` (`X 0%` · `Y 0%` · `W 100%` · `H 100%` · rotation `0°` ·
`0px`) and `Effect`:
`Intensity` · `Decay` · `Radius` · `Chromatic Split` · `Edges` (`Stretch`)

### 2c. `Export Code: "<Shader Name>"` reflects a rename

The shader was renamed to `Desktop` and the dialog title became
`Export Code: "Desktop"`, with the MCP prompt
`Ask Shaders MCP to install "Desktop" (4728929) in my project`.
The numeric ID (`4728929`) is embedded in the prompt — §5 has this right.

---

## 3. Dynamic props are NOT demonstrated in this video

Searched all 132 + 20 frames and every crop for `dyn`, `make value dynamic`,
`Automatic`, `Smoothing`, `Momentum`, `Reach`, `Invert`, `Ping`, `Easing`,
`Map`: **zero hits**.

§3 of the dossier ("Next to **every** prop sits a small *make value dynamic*
toggle", with three modes and named controls) is therefore **not sourced from
this video**. It came from the other tutorial videos. The existing sourcing note
already flags `Invert Horizontal/Vertical` as unverified; the stronger statement
is that the *Quick Tour* — the video most likely to be cited for it — does not
show the feature at all.

---

## 4. Confirmed correct (no change needed)

- 3-column layout, left ~250px / right ~300px, infinite canvas
- Top bar: project name, zoom `55%`, zoom chevron, avatar
- Left panel: `Shaders` list + `Layers` list, `Community` footer link
- `Transform` / `Sizing` / `Appearance` sections; `Object Fit`
- Colors: `Stops`, `%` positions, hex swatches, `Color Space` → `OKLAB`, `+`/`−`
- Export tabs: `Vue · React · Svelte · Solid · JS · Framer`
- MCP copy: `Connect your AI agent to the Shaders MCP…` + `How do I connect the MCP?`
- Canvas bottom-right `P3 Linear` / `ACES Filmic`
- Picker search placeholder `Search components...`
- Component names: `CarbonFiber Crystal Emboss Frost Glass Goo Heatmap Holographic
  LightEdge LiquidMetal Neon Plastic SmokeFill ThinFilm`, and
  `Chalkboard FilmGrain ObjectTracker ChromaticAberration Glitch Paper
  CompressionArtifacts Glow Pixelate ContourLines GradientMap ReflectivePlane
  CRTScreen Halftone Stone DataMosh Dither KeyFrames LensFlare VHS Vignette`,
  and `CursorRipples CursorTrail Smoke SmokeFlow Fog GridDistortion Liquify
  PixelSort PixelThrow`

---

## 5. Confidence

| Claim | Confidence | Basis |
|--|--|--|
| `stops` is `{position, color}[]` | **High** | OCR of the code line, legible |
| `v3.0.363` | **High** | OCR + vision agree, 4 timestamps |
| Dimensions numbers | **High** | vision read of a 1380px-tall crop, clean |
| Export is JSX | **High** | multiple lines OCR'd + vision |
| Dynamic props absent | **High** | exhaustive negative search |
| Exact code-block formatting | Medium | 26px strips defeat vision; some lines read from local OCR only |
