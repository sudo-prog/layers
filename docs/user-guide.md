# LAYERS User Guide

**Version:** 0.9-beta
**Last updated:** 2026-10-19

LAYERS is a layer-based design tool where "cores" replace traditional layer styles. Built on a shader-first architecture with a Graphite basis for desktop/iPad and a light WebGL2 renderer for phone.

---

## Getting Started

### Installing

1. Clone the repository
2. Run `pnpm install`
3. Run `pnpm dev` to start the dev server
4. Open the URL shown in the terminal (default: http://localhost:5173)

### Importing an Image

- Click the **Import** button or press `Ctrl+E` / `Cmd+E`
- Select an image from your device
- The image will be downscaled to 1024px on the longest edge for performance

---

## Cores

Cores are the building blocks of LAYERS. Each core is a shader-based effect that can be stacked and combined.

| # | Core | Description | Passes | Parameters |
|---|------|-------------|--------|------------|
| 1 | Pattern/Dither | Halftone, mosaic, CMYK, line screen, bit-crush, posterize | 2 | scale, shape, angle, intensity |
| 2 | Noise/Grain | Film grain, paper texture, stipple | 2 | amount, size, mono |
| 3 | Blur/Convolution | Soft focus, sharpen, emboss | 1 | radius, mode |
| 4 | Displacement/Warp | Liquid, fluted glass, wave, heat haze | 2 | amount, scale, speed |
| 5 | Color/Palette/Blend | Duotone, vintage, LUT | 1 | palette, intensity |
| 6 | Lighting/Atmosphere | Shadow, glow, haze, vignette | 1 | type, intensity, blur, offsetX, offsetY |
| 7 | Outline/Edge | Ink outline, edge detect | 2 | threshold, roughness, inkBleed |

### Adding a Core

1. Click a core button (1-7) in the toolbar
2. The core is added to the stack and applied immediately
3. Use the inspector to adjust parameters

### Removing a Core

1. Select the core in the stack panel
2. Press `Delete` or click the remove button

### Reordering Cores

- Drag and drop in the stack panel, or
- Use `Ctrl+Up` / `Ctrl+Down` to move the selected core

---

## Stack Panel

The stack panel shows all active cores in order. Each core can be:

- **Toggled** on/off (eye icon)
- **Selected** for editing (click)
- **Moved** up/down (drag or keyboard)
- **Removed** (delete key or button)

The stack can have up to 11 passes (2+2+1+1+2+1+2 for all 7 cores). The mobile budget is 8 passes (target 6).

---

## Inspector

The inspector shows parameters for the selected core. All changes are applied in real-time.

- **Sliders**: Drag to adjust numeric values
- **Selects**: Choose from dropdown options
- **Color pickers**: Click to open color picker (hex input supported)

All changes are undoable with `Ctrl+Z` / `Cmd+Z`.

---

## Review Tools

The review screen provides comparison tools for evaluating edits:

- **Split View**: Side-by-side comparison with a draggable divider
- **Onion Skin**: Overlay with adjustable opacity (ghosting)
- **Diff Map**: Visualize pixel differences
- **Isolate**: Show only the selected core's effect

Press `R` to toggle the review screen.

---

## Presets & Library

### Saving a Preset

1. Configure your stack
2. Click **Save Preset** or press `Ctrl+S` / `Cmd+S`
3. Enter a name
4. The preset is saved to IndexedDB and available in the library

### Loading a Preset

1. Open the library panel
2. Browse available presets (with real rendered thumbnails)
3. Click a preset to apply it

### Importing/Exporting Presets

- **Export**: Click export to download a JSON file
- **Import**: Click import to load a JSON file from your device

### Sync

Presets sync via:
- **GitHub**: Auto-backup to a private repo (debounced, rate-limit aware)
- **Immich**: Photo server integration (server-side only)
- **Device-to-device**: Via Syncthing (when configured)

---

## AI Panel

The AI panel provides intelligent assistance (requires opt-in consent):

- **Search**: Find similar stacks based on feature vectors
- **Optimize**: AI-suggested parameter adjustments
- **Suggest**: AI-generated core combinations
- **Acceptance Dashboard**: View acceptance rates per core/cluster

### Consent

AI features are opt-in. The consent dialog appears on first use. You can:
- Grant or deny consent per feature
- Revoke consent at any time
- View and manage consent in the Learning Store

All AI requests go through a local AI service (`localhost:8123`). No data leaves your device without explicit opt-in.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1-7` | Add core 1-7 |
| `Ctrl+S` / `Cmd+S` | Save preset |
| `Ctrl+E` / `Cmd+E` | Export JSON |
| `Ctrl+D` / `Cmd+D` | Import JSON |
| `Ctrl+Z` / `Cmd+Z` | Undo |
| `Ctrl+Y` / `Cmd+Y` | Redo |
| `Ctrl+Up` / `Cmd+Up` | Move core up |
| `Ctrl+Down` / `Cmd+Down` | Move core down |
| `Space` | Toggle selected core |
| `T` | Toggle theme (light/dark) |
| `R` | Toggle review screen |
| `?` | Show help overlay |

---

## Mask Brush

The mask brush allows painting masks directly on the canvas:

- **Paint**: Hold mouse/touch and drag
- **Erase**: Hold `Alt` / `Option` while painting
- **Size**: Adjustable brush size
- **Opacity**: Adjustable brush opacity
- Masks are serialized as base64 PNG

---

## Quick Vector Editor

Access the vector editor for quick SVG-based edits:

- **Points**: Click to add points
- **Lines**: Drag between points
- **Curves**: Adjust bezier handles
- **Zoom**: Mouse wheel or pinch
- **Import/Export**: SVG format

---

## PWA

LAYERS is a Progressive Web App:

- **Installable**: Add to home screen on mobile
- **Offline**: Works offline after first load (service worker precaches assets)
- **Auto-update**: Workbox handles updates in the background

---

## Themes

Press `T` or click the theme toggle to switch between light and dark modes. The choice is persisted in localStorage.

---

## Tips

- Start with a Color/Palette core for quick color grading
- Use Noise/Grain on top for film-like texture
- The Blur core is the cheapest (1 pass) — use it liberally
- Monitor the pass count in the stack panel (mobile budget: 8)
- Save presets often — they sync across devices
- Use the review screen to compare before/after
