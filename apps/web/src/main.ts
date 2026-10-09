/**
 * LAYERS Web App — main entry point
 *
 * Wires the @layers/engine + @layers/cores + @layers/stack + @layers/ui
 * packages into a working visual style editor.
 */

import { Renderer, GLContext } from "@layers/engine";
import {
  PatternDitherCore,
  NoiseGrainCore,
  BlurCore,
  ColorBlendCore,
  DisplacementCore,
  LightingCore,
  OutlineCore,
  type PatternDitherParams,
  type NoiseGrainParams,
  type BlurParams,
  type ColorBlendParams,
  type DisplacementParams,
  type LightingParams,
  type OutlineParams,
} from "@layers/cores";
import {
  createStackState,
  addStackItem,
  removeStackItem,
  updateStackItem,
  moveStackItem,
  toggleStackItem,
  selectStackItem,
  getEnabledItems,
  estimatePasses,
  isMobileOk,
  type StackState,
  type StackItem,
} from "@layers/stack";
import { applyTheme, generateCSSVariables } from "@layers/ui";
import { validateEffectStack } from "@layers/schema";
import { persistence } from "./persistence";
import { handleKeyboard, getShortcuts, CORE_KEYS, type KeyboardHandlers } from "./keyboard";
import { createMaskBrush, type MaskBrush } from "./maskBrush";
import { createVectorEditor, type VectorEditor } from "./vectorEditor";

// ── Core metadata ──────────────────────────────────────────────────────────

interface CoreDef {
  name: string;
  label: string;
  icon: string;
  create: () => any;
  params: ParamDef[];
}

interface ParamDef {
  key: string;
  label:  string;
  type: "slider" | "select" | "color" | "toggle";
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  default: any;
}

const CORE_DEFS: CoreDef[] = [
  {
    name: "pattern-dither",
    label: "Pattern/Dither",
    icon: "◉",
    create: () => new PatternDitherCore(),
    params: [
      { key: "shape", label: "Shape", type: "select", options: [
        { value: "simplex", label: "Simplex" },
        { value: "dots", label: "Dots" },
        { value: "wave", label: "Wave" },
      ], default: "simplex" },
      { key: "scale", label: "Scale", type: "slider", min: 1, max: 200, step: 1, default: 50 },
      { key: "levels", label: "Dither Type", type: "select", options: [
        { value: "random", label: "Random" },
        { value: "bayer2", label: "Bayer 2×2" },
        { value: "bayer4", label: "Bayer 4×4" },
        { value: "bayer8", label: "Bayer 8×8" },
      ], default: "bayer4" },
      { key: "angle", label: "Angle", type: "slider", min: 0, max: 360, step: 1, default: 0 },
      { key: "contrast", label: "Contrast", type: "slider", min: 0.1, max: 5, step: 0.1, default: 1.2 },
      { key: "inkColor", label: "Ink", type: "color", default: "#000000" },
      { key: "paperColor", label: "Paper", type: "color", default: "#ffffff" },
    ],
  },
  {
    name: "noise-grain",
    label: "Noise/Grain",
    icon: "▒",
    create: () => new NoiseGrainCore(),
    params: [
      { key: "scale", label: "Scale", type: "slider", min: 1, max: 100, step: 1, default: 20 },
      { key: "octaves", label: "Octaves", type: "slider", min: 1, max: 6, step: 1, default: 3 },
      { key: "strength", label: "Strength", type: "slider", min: 0, max: 1, step: 0.01, default: 0.3 },
      { key: "mono", label: "Monochrome", type: "toggle", default: true },
    ],
  },
  {
    name: "blur",
    label: "Blur/Convolution",
    icon: "◎",
    create: () => new BlurCore(),
    params: [
      { key: "radius", label: "Radius", type: "slider", min: 0.5, max: 20, step: 0.5, default: 2 },
      { key: "direction", label: "Direction", type: "select", options: [
        { value: "omni", label: "Omni" },
        { value: "horizontal", label: "Horizontal" },
        { value: "vertical", label: "Vertical" },
        { value: "radial", label: "Radial" },
      ], default: "omni" },
      { key: "passes", label: "Passes", type: "slider", min: 1, max: 4, step: 1, default: 1 },
      { key: "edgeMode", label: "Edge Mode", type: "select", options: [
        { value: "clamp", label: "Clamp" },
        { value: "wrap", label: "Wrap" },
        { value: "mirror", label: "Mirror" },
      ], default: "clamp" },
    ],
  },
  {
    name: "color-blend",
    label: "Color/Blend",
    icon: "◐",
    create: () => new ColorBlendCore(),
    params: [
      { key: "hueShift", label: "Hue Shift", type: "slider", min: -180, max: 180, step: 1, default: 0 },
      { key: "saturation", label: "Saturation", type: "slider", min: 0, max: 3, step: 0.01, default: 1 },
      { key: "brightness", label: "Brightness", type: "slider", min: 0, max: 3, step: 0.01, default: 1 },
      { key: "blend", label: "Blend Mode", type: "select", options: [
        { value: "normal", label: "Normal" },
        { value: "multiply", label: "Multiply" },
        { value: "screen", label: "Screen" },
        { value: "overlay", label: "Overlay" },
        { value: "soft-light", label: "Soft Light" },
        { value: "hard-light", label: "Hard Light" },
      ], default: "normal" },
    ],
  },
  {
    name: "displacement",
    label: "Displacement",
    icon: "≋",
    create: () => new DisplacementCore(),
    params: [
      { key: "strength", label: "Strength", type: "slider", min: 0, max: 50, step: 0.5, default: 5 },
      { key: "mapScale", label: "Map Scale", type: "slider", min: 1, max: 50, step: 1, default: 10 },
      { key: "axis", label: "Axis", type: "select", options: [
        { value: "x", label: "X" },
        { value: "y", label: "Y" },
        { value: "both", label: "Both" },
        { value: "radial", label: "Radial" },
      ], default: "both" },
      { key: "type", label: "Type", type: "select", options: [
        { value: "liquid", label: "Liquid" },
        { value: "fluted", label: "Fluted" },
        { value: "wave", label: "Wave" },
        { value: "heat", label: "Heat" },
      ], default: "liquid" },
    ],
  },
  {
    name: "lighting",
    label: "Lighting",
    icon: "☀",
    create: () => new LightingCore(),
    params: [
      { key: "offsetX", label: "Offset X", type: "slider", min: -100, max: 100, step: 1, default: 0 },
      { key: "offsetY", label: "Offset Y", type: "slider", min: -100, max: 100, step: 1, default: 0 },
      { key: "blur", label: "Blur", type: "slider", min: 0, max: 20, step: 0.5, default: 1 },
      { key: "color", label: "Color", type: "color", default: "#000000" },
      { key: "opacity", label: "Opacity", type: "slider", min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: "mode", label: "Mode", type: "select", options: [
        { value: "shadow", label: "Shadow" },
        { value: "glow", label: "Glow" },
        { value: "haze", label: "Haze" },
        { value: "vignette", label: "Vignette" },
      ], default: "shadow" },
    ],
  },
  {
    name: "outline",
    label: "Outline/Edge",
    icon: "✎",
    create: () => new OutlineCore(),
    params: [
      { key: "strength", label: "Strength", type: "slider", min: 0, max: 3, step: 0.01, default: 1 },
      { key: "width", label: "Width", type: "slider", min: 0.5, max: 10, step: 0.5, default: 1 },
      { key: "roughness", label: "Roughness", type: "slider", min: 0, max: 1, step: 0.01, default: 0 },
      { key: "inkBleed", label: "Ink Bleed", type: "toggle", default: false },
    ],
  },
];

// ── App state ──────────────────────────────────────────────────────────────

let stackState: StackState = createStackState();
let renderer: Renderer | null = null;
let theme: "light" | "dark" = "light";
let undoStack: StackState[] = [];
let redoStack: StackState[] = [];
let frameCount = 0;
let lastFpsTime = performance.now();
let fpsValue = 0;

// ── DOM refs ───────────────────────────────────────────────────────────────

const $ = <T extends Element>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Element not found: ${sel}`);
  return el;
};

const canvas = $<HTMLCanvasElement>("#gl-canvas");
const coreList = $<HTMLDivElement>("#core-list");
const stackList = $<HTMLDivElement>("#stack-list");
const inspector = $<HTMLDivElement>("#inspector");
const passCount = $<HTMLSpanElement>("#pass-count");
const fpsDisplay = $<HTMLSpanElement>("#fps-display");
const btnUndo = $<HTMLButtonElement>("#btn-undo");
const btnRedo = $<HTMLButtonElement>("#btn-redo");
const btnExport = $<HTMLButtonElement>("#btn-export");
const btnImport = $<HTMLButtonElement>("#btn-import");
const btnSave = $<HTMLButtonElement>("#btn-save");
const btnClear = $<HTMLButtonElement>("#btn-clear");
const btnTheme = $<HTMLButtonElement>("#btn-theme");
const syncIndicator = $<HTMLSpanElement>(".sync-indicator");
const syncText = $<HTMLSpanElement>("#sync-text");
const maskCanvas = $<HTMLCanvasElement>("#mask-canvas");
const maskOverlay = $<HTMLDivElement>("#mask-overlay");
const maskBrush = createMaskBrush(maskCanvas);
const vectorEditor = createVectorEditor($<SVGSVGElement>("#vector-svg"));
const helpOverlay = $<HTMLDivElement>("#help-overlay");
const helpContent = $<HTMLDivElement>("#help-content");
const vectorPanel = $<HTMLDivElement>("#vector-panel");
const vectorSvg = $<SVGSVGElement>("#vector-svg");
const btnVector = $<HTMLButtonElement>("#btn-vector");
// btnMask is created dynamically in rebuildInspector
const maskControls = $<HTMLDivElement>("#mask-controls");
const brushSizeSlider = $<HTMLInputElement>("#brush-size");
const brushOpacitySlider = $<HTMLInputElement>("#brush-opacity");
const btnPaint = $<HTMLButtonElement>("#btn-paint");
const btnErase = $<HTMLButtonElement>("#btn-erase");
const btnClearMask = $<HTMLButtonElement>("#btn-clear-mask");
const btnCloseMask = $<HTMLButtonElement>("#btn-close-mask");
const btnCloseVector = $<HTMLButtonElement>("#btn-close-vector");
const btnAddPoint = $<HTMLButtonElement>("#btn-add-point");
const btnAddLine = $<HTMLButtonElement>("#btn-add-line");
const btnAddCurve = $<HTMLButtonElement>("#btn-add-curve");
const btnDeletePoint = $<HTMLButtonElement>("#btn-delete-point");
const btnNewPath = $<HTMLButtonElement>("#btn-new-path");
const btnZoomIn = $<HTMLButtonElement>("#btn-zoom-in");
const btnZoomOut = $<HTMLButtonElement>("#btn-zoom-out");
const btnExportSvg = $<HTMLButtonElement>("#btn-export-svg");
const btnImportSvg = $<HTMLButtonElement>("#btn-import-svg");
const btnCloseHelp = $<HTMLButtonElement>("#btn-close-help");

// ── Undo/redo ──────────────────────────────────────────────────────────────

function pushUndo(): void {
  undoStack.push(stackState);
  if (undoStack.length > 100) undoStack.shift();
  redoStack = [];
  updateUndoButtons();
}

function updateUndoButtons(): void {
  btnUndo.disabled = undoStack.length === 0;
  btnRedo.disabled = redoStack.length === 0;
}

function doUndo(): void {
  if (undoStack.length === 0) return;
  redoStack.push(stackState);
  stackState = undoStack.pop()!;
  updateUndoButtons();
  rebuildStack();
  rebuildInspector();
  render();
  scheduleSave();
}

function doRedo(): void {
  if (redoStack.length === 0) return;
  undoStack.push(stackState);
  stackState = redoStack.pop()!;
  updateUndoButtons();
  rebuildStack();
  rebuildInspector();
  render();
  scheduleSave();
}

// ── Renderer ───────────────────────────────────────────────────────────────

function initRenderer(): void {
  renderer = new Renderer(canvas, {
    width: 512,
    height: 512,
    preserveDrawingBuffer: true,
    alpha: false,
    antialias: false,
    premultipliedAlpha: false,
  });

  // Create a default gradient source
  const src = new OffscreenCanvas(512, 512);
  const sctx = src.getContext("2d")!;
  const grad = sctx.createLinearGradient(0, 0, 512, 512);
  grad.addColorStop(0, "#ff6b6b");
  grad.addColorStop(0.5, "#feca57");
  grad.addColorStop(1, "#48dbfb");
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 512, 512);

  // Add some shapes for visual interest
  sctx.fillStyle = "rgba(255,255,255,0.3)";
  sctx.beginPath();
  sctx.arc(256, 256, 120, 0, Math.PI * 2);
  sctx.fill();

  sctx.fillStyle = "rgba(0,0,0,0.2)";
  sctx.fillRect(100, 100, 150, 150);

  renderer.uploadSource(src, 512, 512);
}

function render(): void {
  if (!renderer) return;

  // Clear existing passes
  for (const pass of [...renderer.passes]) {
    renderer.removePass(pass.id);
  }

  // Add enabled stack items as passes
  const enabled = getEnabledItems(stackState);
  for (const item of enabled) {
    const def = CORE_DEFS.find((d) => d.name === item.core);
    if (!def) continue;

    const core = def.create();
    // Apply params from stack item
    for (const [key, value] of Object.entries(item.params)) {
      (core as any)[key] = value;
    }
    renderer.addPass(core);
  }

  renderer.warmUp();
  renderer.render(0);

  // Update pass count
  const passes = estimatePasses(enabled);
  passCount.textContent = `${passes} passes`;
  if (!isMobileOk(passes)) {
    passCount.style.color = "var(--error)";
  } else {
    passCount.style.color = "var(--text-tertiary)";
  }
}

// ── Core list UI ───────────────────────────────────────────────────────────

function buildCoreList(): void {
  coreList.innerHTML = "";
  for (const def of CORE_DEFS) {
    const btn = document.createElement("button");
    btn.className = "core-btn";
    btn.innerHTML = `<span class="core-icon">${def.icon}</span><span>${def.label}</span>`;
    btn.addEventListener("click", () => {
      pushUndo();
      const core = def.create();
      const params: Record<string, unknown> = {};
      for (const p of def.params) {
        params[p.key] = p.default;
      }
      stackState = addStackItem(stackState, {
        core: def.name,
        params,
        opacity: 1,
        blend: "normal",
        mask: null,
        enabled: true,
      });
      rebuildStack();
      rebuildInspector();
      render();
      scheduleSave();
    });
    coreList.appendChild(btn);
  }
}

// ── Stack list UI ──────────────────────────────────────────────────────────

function rebuildStack(): void {
  stackList.innerHTML = "";
  if (stackState.items.length === 0) {
    stackList.innerHTML = `<p class="stack-empty">Click a core to add it to the stack</p>`;
    return;
  }

  for (const item of stackState.items) {
    const el = document.createElement("div");
    el.className = "stack-item";
    if (item.id === stackState.selectedId) el.classList.add("selected");
    if (!item.enabled) el.classList.add("disabled");

    const name = document.createElement("span");
    name.className = "stack-item-name";
    name.textContent = item.core;
    el.appendChild(name);

    const toggle = document.createElement("button");
    toggle.className = "stack-item-toggle";
    toggle.textContent = item.enabled ? "👁" : "—";
    toggle.title = "Toggle enabled";
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      pushUndo();
      stackState = toggleStackItem(stackState, item.id);
      rebuildStack();
      render();
      scheduleSave();
    });
    el.appendChild(toggle);

    const remove = document.createElement("button");
    remove.className = "stack-item-remove";
    remove.textContent = "✕";
    remove.title = "Remove";
    remove.addEventListener("click", (e) => {
      e.stopPropagation();
      pushUndo();
      stackState = removeStackItem(stackState, item.id);
      rebuildStack();
      rebuildInspector();
      render();
      scheduleSave();
    });
    el.appendChild(remove);

    el.addEventListener("click", () => {
      stackState = selectStackItem(stackState, item.id);
      rebuildStack();
      rebuildInspector();
      scheduleSave();
    });

    stackList.appendChild(el);
  }
}

// ── Inspector UI ───────────────────────────────────────────────────────────

function rebuildInspector(): void {
  const selected = stackState.items.find((i) => i.id === stackState.selectedId);
  if (!selected) {
    inspector.innerHTML = `<p class="inspector-empty">Select a core to edit its parameters</p>`;
    return;
  }

  const def = CORE_DEFS.find((d) => d.name === selected.core);
  if (!def) {
    inspector.innerHTML = `<p class="inspector-empty">Unknown core: ${selected.core}</p>`;
    return;
  }

  let html = `<h3 class="inspector-title">${def.label}</h3>`;

  for (const param of def.params) {
    const val = selected.params[param.key] ?? param.default;
    html += `<div class="param-group">`;
    html += `<label class="param-label">${param.label}`;

    if (param.type === "slider") {
      const numVal = Number(val);
      html += `<span class="param-value">${numVal}</span>`;
      html += `<input type="range" class="param-slider" data-key="${param.key}" `;
      html += `min="${param.min}" max="${param.max}" step="${param.step}" value="${numVal}">`;
    } else if (param.type === "select") {
      html += `<select class="param-select" data-key="${param.key}">`;
      for (const opt of param.options!) {
        const sel = opt.value === val ? " selected" : "";
        html += `<option value="${opt.value}"${sel}>${opt.label}</option>`;
      }
      html += `</select>`;
    } else if (param.type === "color") {
      html += `<div class="param-color">`;
      html += `<input type="color" data-key="${param.key}" value="${val}">`;
      html += `<span>${val}</span>`;
      html += `</div>`;
    } else if (param.type === "toggle") {
      const checked = val ? " checked" : "";
      html += `<input type="checkbox" data-key="${param.key}"${checked} style="width:18px;height:18px;cursor:pointer;">`;
    }

    html += `</label></div>`;
  }

  // Opacity slider
  html += `<div class="param-group">`;
  html += `<label class="param-label">Opacity`;
  html += `<span class="param-value">${selected.opacity}</span>`;
  html += `<input type="range" class="param-slider" data-key="__opacity" min="0" max="1" step="0.01" value="${selected.opacity}">`;
  html += `</label></div>`;

  // Blend mode
  html += `<div class="param-group">`;
  html += `<label class="param-label">Blend Mode`;
  html += `<select class="param-select" data-key="__blend">`;
  const blendModes = ["normal", "multiply", "screen", "overlay", "soft-light", "hard-light", "color-dodge", "color-burn", "darken", "lighten", "difference", "exclusion", "hue", "saturation", "color", "luminosity"];
  for (const bm of blendModes) {
    const sel = bm === selected.blend ? " selected" : "";
    html += `<option value="${bm}"${sel}>${bm}</option>`;
  }
  html += `</select></label></div>`;

  // Move up/down
  html += `<div class="param-group" style="display:flex;gap:8px;">`;
  html += `<button class="btn" data-key="__moveUp" style="flex:1;">↑ Move Up</button>`;
  html += `<button class="btn" data-key="__moveDown" style="flex:1;">↓ Move Down</button>`;
  html += `</div>`;

  inspector.innerHTML = html;

  // Add mask button when item is selected
  const maskBtn = document.createElement("button");
  maskBtn.id = "btn-mask";
  maskBtn.className = "btn";
  maskBtn.style.width = "100%";
  maskBtn.style.marginTop = "8px";
  maskBtn.textContent = "🎭 Edit Mask";
  maskBtn.addEventListener("click", () => {
    const sel = stackState.items.find((i) => i.id === stackState.selectedId);
    if (!sel) return;
    maskOverlay.classList.remove("hidden");
    maskOverlay.classList.add("visible");
    maskCanvas.classList.remove("hidden");
    if (sel.mask) {
      maskBrush.loadMaskData(sel.mask).then(() => {});
    } else {
      maskBrush.clear();
    }
  });
  inspector.appendChild(maskBtn);

  // Wire up events
  inspector.querySelectorAll("[data-key]").forEach((el) => {
    const key = (el as HTMLElement).dataset.key!;

    if (el instanceof HTMLInputElement && el.type === "range") {
      el.addEventListener("input", () => {
        const numVal = parseFloat(el.value);
        (el as HTMLElement).parentElement!.querySelector(".param-value")!.textContent = String(numVal);
        pushUndo();
        if (key === "__opacity") {
          stackState = updateStackItem(stackState, selected.id, { opacity: numVal });
        } else {
          const newParams = { ...selected.params, [key]: numVal };
          stackState = updateStackItem(stackState, selected.id, { params: newParams });
        }
        render();
        scheduleSave();
      });
    } else if (el instanceof HTMLSelectElement) {
      el.addEventListener("change", () => {
        pushUndo();
        if (key === "__blend") {
          stackState = updateStackItem(stackState, selected.id, { blend: el.value });
        } else {
          const newParams = { ...selected.params, [key]: el.value };
          stackState = updateStackItem(stackState, selected.id, { params: newParams });
        }
        render();
        scheduleSave();
      });
    } else if (el instanceof HTMLInputElement && el.type === "color") {
      el.addEventListener("input", () => {
        const val = el.value;
        (el as HTMLElement).parentElement!.querySelector("span")!.textContent = val;
        pushUndo();
        // Convert hex to RGB array
        const r = parseInt(val.slice(1, 3), 16);
        const g = parseInt(val.slice(3, 5), 16);
        const b = parseInt(val.slice(5, 7), 16);
        const newParams = { ...selected.params, [key]: [r, g, b] };
        stackState = updateStackItem(stackState, selected.id, { params: newParams });
        render();
        scheduleSave();
      });
    } else if (el instanceof HTMLInputElement && el.type === "checkbox") {
      el.addEventListener("change", () => {
        pushUndo();
        const newParams = { ...selected.params, [key]: el.checked };
        stackState = updateStackItem(stackState, selected.id, { params: newParams });
        render();
        scheduleSave();
      });
    } else if (el instanceof HTMLButtonElement) {
      el.addEventListener("click", () => {
        pushUndo();
        if (key === "__moveUp") {
          stackState = moveStackItem(stackState, selected.id, "up");
        } else if (key === "__moveDown") {
          stackState = moveStackItem(stackState, selected.id, "down");
        }
        rebuildStack();
        render();
        scheduleSave();
      });
    }
  });
}

// ── Theme ──────────────────────────────────────────────────────────────────

function toggleTheme(): void {
  theme = theme === "light" ? "dark" : "light";
  applyTheme(theme);
  btnTheme.textContent = theme === "light" ? "🌙 Dark" : "☀️ Light";
}

// ── Mask brush ─────────────────────────────────────────────────────────────

let isPainting = false;
let lastPaintX = 0;
let lastPaintY = 0;

function initMaskBrush(): void {
  // Sync mask canvas size with GL canvas
  maskCanvas.width = canvas.width;
  maskCanvas.height = canvas.height;

  // Brush size slider
  brushSizeSlider.addEventListener("input", () => {
    maskBrush.setSize(parseInt(brushSizeSlider.value, 10));
  });

  // Brush opacity slider
  brushOpacitySlider.addEventListener("input", () => {
    maskBrush.setOpacity(parseFloat(brushOpacitySlider.value));
  });

  // Paint/Erase mode buttons
  btnPaint.addEventListener("click", () => {
    maskBrush.setMode("paint");
    btnPaint.classList.add("active");
    btnErase.classList.remove("active");
  });
  btnErase.addEventListener("click", () => {
    maskBrush.setMode("erase");
    btnErase.classList.add("active");
    btnPaint.classList.remove("active");
  });

  // Clear mask
  btnClearMask.addEventListener("click", () => {
    maskBrush.clear();
    saveMaskToSelected();
  });

  // Close mask overlay
  btnCloseMask.addEventListener("click", () => {
    maskOverlay.classList.remove("visible");
    maskOverlay.classList.add("hidden");
    maskCanvas.classList.add("hidden");
    saveMaskToSelected();
  });

  // Paint events on mask canvas
  maskCanvas.addEventListener("mousedown", (e) => {
    isPainting = true;
    const rect = maskCanvas.getBoundingClientRect();
    lastPaintX = e.clientX - rect.left;
    lastPaintY = e.clientY - rect.top;
    maskBrush.paint(lastPaintX, lastPaintY);
  });
  maskCanvas.addEventListener("mousemove", (e) => {
    if (!isPainting) return;
    const rect = maskCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // Interpolate between last and current position for smooth strokes
    const dx = x - lastPaintX;
    const dy = y - lastPaintY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(1, Math.floor(dist / (maskBrush.getSize() / 4)));
    for (let i = 1; i <= steps; i++) {
      const ix = lastPaintX + (dx * i) / steps;
      const iy = lastPaintY + (dy * i) / steps;
      maskBrush.paint(ix, iy);
    }
    lastPaintX = x;
    lastPaintY = y;
  });
  maskCanvas.addEventListener("mouseup", () => {
    isPainting = false;
    saveMaskToSelected();
  });
  maskCanvas.addEventListener("mouseleave", () => {
    isPainting = false;
    saveMaskToSelected();
  });

}

function saveMaskToSelected(): void {
  const selected = stackState.items.find((i) => i.id === stackState.selectedId);
  if (!selected) return;
  const maskData = maskBrush.getMaskData();
  if (maskData !== selected.mask) {
    stackState = updateStackItem(stackState, selected.id, { mask: maskData });
    scheduleSave();
  }
}

// ── Vector editor ──────────────────────────────────────────────────────────

function initVectorEditor(): void {
  // Close button
  btnCloseVector.addEventListener("click", () => {
    vectorPanel.classList.remove("visible");
  });

  // Add point mode
  let addPointMode = false;
  btnAddPoint.addEventListener("click", () => {
    addPointMode = !addPointMode;
    btnAddPoint.classList.toggle("active", addPointMode);
    vectorSvg.style.cursor = addPointMode ? "crosshair" : "default";
  });

  // Click on SVG to add point
  vectorSvg.addEventListener("click", (e) => {
    if (!addPointMode) return;
    const rect = vectorSvg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    vectorEditor.addPoint(x, y);
    vectorEditor.render();
  });

  // Add line
  btnAddLine.addEventListener("click", () => {
    const paths = vectorEditor.getPaths();
    if (paths.length > 0 && paths[paths.length - 1].points.length >= 2) {
      const pts = paths[paths.length - 1].points;
      vectorEditor.addLine(pts.length - 2, pts.length - 1);
      vectorEditor.render();
    }
  });

  // Add curve
  btnAddCurve.addEventListener("click", () => {
    const paths = vectorEditor.getPaths();
    if (paths.length > 0 && paths[paths.length - 1].points.length >= 2) {
      const pts = paths[paths.length - 1].points;
      const last = pts[pts.length - 1];
      const prev = pts[pts.length - 2];
      const cpx = (prev.x + last.x) / 2;
      const cpy = Math.min(prev.y, last.y) - 50;
      vectorEditor.addCurve(pts.length - 2, pts.length - 1, cpx, cpy);
      vectorEditor.render();
    }
  });

  // Delete last point
  btnDeletePoint.addEventListener("click", () => {
    const paths = vectorEditor.getPaths();
    if (paths.length > 0 && paths[paths.length - 1].points.length > 0) {
      const pts = paths[paths.length - 1].points;
      vectorEditor.deletePoint(paths.length - 1, pts.length - 1);
      vectorEditor.render();
    }
  });

  // New path
  btnNewPath.addEventListener("click", () => {
    vectorEditor.newPath();
    vectorEditor.render();
  });

  // Zoom
  btnZoomIn.addEventListener("click", () => {
    vectorEditor.zoomIn();
    vectorEditor.render();
  });
  btnZoomOut.addEventListener("click", () => {
    vectorEditor.zoomOut();
    vectorEditor.render();
  });

  // Export SVG
  btnExportSvg.addEventListener("click", () => {
    const svgString = vectorEditor.exportSVG();
    const blob = new Blob([svgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vector-path.svg";
    a.click();
    URL.revokeObjectURL(url);
  });

  // Import SVG
  btnImportSvg.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".svg";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      vectorEditor.importSVG(text);
      vectorEditor.render();
    });
    input.click();
  });

  // Vector button in toolbar
  btnVector.addEventListener("click", () => {
    vectorPanel.classList.add("visible");
    vectorEditor.render();
  });
}

// ── Help overlay ───────────────────────────────────────────────────────────

function initHelpOverlay(): void {
  const shortcuts = getShortcuts();
  let html = "<h3>Keyboard Shortcuts</h3><table>";
  for (const [key, desc] of Object.entries(shortcuts)) {
    html += `<tr><td class="shortcut-key">${key}</td><td>${desc}</td></tr>`;
  }
  html += "</table>";
  helpContent.innerHTML = html;

  btnCloseHelp.addEventListener("click", () => {
    helpOverlay.classList.remove("visible");
  });

  helpOverlay.addEventListener("click", (e) => {
    if (e.target === helpOverlay) {
      helpOverlay.classList.remove("visible");
    }
  });
}

// ── Export / Import ────────────────────────────────────────────────────────

function exportPreset(): void {
  const enabled = getEnabledItems(stackState);
  const preset = {
    version: "0.1",
    stack: enabled.map((item) => ({
      core: item.core,
      params: item.params,
      opacity: item.opacity,
      blend: item.blend,
      enabled: item.enabled,
    })),
  };
  const json = JSON.stringify(preset, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "layers-preset.json";
  a.click();
  URL.revokeObjectURL(url);
}

function importPreset(): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const preset = JSON.parse(text);
      const validation = validateEffectStack(preset.stack);
      if (!validation.valid) {
        alert("Invalid preset: " + JSON.stringify(validation.errors));
        return;
      }
      pushUndo();
      stackState = createStackState(preset.stack);
      rebuildStack();
      rebuildInspector();
      render();
      scheduleSave();
    } catch (e) {
      alert("Failed to import: " + String(e));
    }
  });
  input.click();
}

// ── Keyboard shortcuts ─────────────────────────────────────────────────────

function handleKeyboardShortcut(e: KeyboardEvent): void {
  const handlers: KeyboardHandlers = {
    doUndo,
    doRedo,
    doSave: () => btnSave.click(),
    doExport: exportPreset,
    doDelete: () => {
      const selected = stackState.items.find((i) => i.id === stackState.selectedId);
      if (selected) {
        pushUndo();
        stackState = removeStackItem(stackState, selected.id);
        rebuildStack();
        rebuildInspector();
        render();
        scheduleSave();
      }
    },
    doToggle: () => {
      const selected = stackState.items.find((i) => i.id === stackState.selectedId);
      if (selected) {
        pushUndo();
        stackState = toggleStackItem(stackState, selected.id);
        rebuildStack();
        render();
        scheduleSave();
      }
    },
    doMoveUp: () => {
      const selected = stackState.items.find((i) => i.id === stackState.selectedId);
      if (selected) {
        pushUndo();
        stackState = moveStackItem(stackState, selected.id, "up");
        rebuildStack();
        render();
        scheduleSave();
      }
    },
    doMoveDown: () => {
      const selected = stackState.items.find((i) => i.id === stackState.selectedId);
      if (selected) {
        pushUndo();
        stackState = moveStackItem(stackState, selected.id, "down");
        rebuildStack();
        render();
        scheduleSave();
      }
    },
    doDuplicate: () => {
      const selected = stackState.items.find((i) => i.id === stackState.selectedId);
      if (selected) {
        pushUndo();
        const newItem = {
          ...selected,
          id: `stack-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        };
        stackState = addStackItem(stackState, newItem);
        rebuildStack();
        rebuildInspector();
        render();
        scheduleSave();
      }
    },
    doToggleTheme: toggleTheme,
    doAddCore: (index: number) => {
      const coreName = CORE_KEYS[String(index)];
      if (!coreName) return;
      const def = CORE_DEFS.find((d) => d.name === coreName);
      if (!def) return;
      pushUndo();
      const core = def.create();
      const params: Record<string, unknown> = {};
      for (const p of def.params) {
        params[p.key] = p.default;
      }
      stackState = addStackItem(stackState, {
        core: def.name,
        params,
        opacity: 1,
        blend: "normal",
        mask: null,
        enabled: true,
      });
      rebuildStack();
      rebuildInspector();
      render();
      scheduleSave();
    },
    doToggleHelp: () => {
      helpOverlay.classList.toggle("visible");
    },
  };
  handleKeyboard(e, { stackState, theme, undoStack, redoStack }, handlers);
}

// ── FPS counter ────────────────────────────────────────────────────────────

function updateFps(): void {
  frameCount++;
  const now = performance.now();
  const elapsed = now - lastFpsTime;
  if (elapsed >= 1000) {
    fpsValue = Math.round((frameCount * 1000) / elapsed);
    fpsDisplay.textContent = `${fpsValue} fps`;
    frameCount = 0;
    lastFpsTime = now;
  }
}

// ── Sync status ────────────────────────────────────────────────────────────

async function updateSyncStatus(): Promise<void> {
  if (!persistence.available) {
    syncIndicator.className = "sync-indicator";
    syncText.textContent = "Sync: unavailable";
    return;
  }
  try {
    const queue = await persistence.queueStatus();
    const pending = queue.filter((q) => q.status === "pending").length;
    const errors = queue.filter((q) => q.status === "error").length;
    const synced = queue.filter((q) => q.status === "synced").length;

    if (errors > 0) {
      syncIndicator.className = "sync-indicator error";
      syncText.textContent = `Sync: ${errors} error(s), ${pending} pending`;
    } else if (pending > 0) {
      syncIndicator.className = "sync-indicator pending";
      syncText.textContent = `Sync: ${pending} pending, ${synced} synced`;
    } else {
      syncIndicator.className = "sync-indicator synced";
      syncText.textContent = `Sync: ${synced} synced`;
    }
  } catch (e) {
    syncIndicator.className = "sync-indicator error";
    syncText.textContent = "Sync: error";
  }
}

// ── Persistence helpers ────────────────────────────────────────────────────

function scheduleSave(): void {
  persistence.scheduleSave(stackState);
}

// ── Init ───────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  // Initialize persistence and restore state
  const persistenceReady = await persistence.init();
  if (persistenceReady) {
    const restored = await persistence.restore();
    if (restored && restored.items.length > 0) {
      stackState = restored;
      console.info("[persistence] Restored stack state from IndexedDB");
    }
  }

  initRenderer();
  buildCoreList();
  rebuildStack();
  rebuildInspector();
  render();

  // Event listeners
  btnUndo.addEventListener("click", doUndo);
  btnRedo.addEventListener("click", doRedo);
  btnExport.addEventListener("click", exportPreset);
  btnImport.addEventListener("click", importPreset);
  btnSave.addEventListener("click", async () => {
    persistence.flush();
    const result = await persistence.save(stackState);
    if (result.ok) {
      syncText.textContent = "Sync: saved";
      syncIndicator.className = "sync-indicator synced";
    } else {
      syncText.textContent = "Sync: save failed";
      syncIndicator.className = "sync-indicator error";
    }
    updateSyncStatus();
  });
  btnClear.addEventListener("click", async () => {
    if (!confirm("Clear all saved state from IndexedDB?")) return;
    persistence.flush();
    const result = await persistence.clear();
    if (result.ok) {
      stackState = createStackState();
      undoStack = [];
      redoStack = [];
      updateUndoButtons();
      rebuildStack();
      rebuildInspector();
      render();
      syncText.textContent = "Sync: cleared";
      syncIndicator.className = "sync-indicator synced";
    } else {
      syncText.textContent = "Sync: clear failed";
      syncIndicator.className = "sync-indicator error";
    }
    updateSyncStatus();
  });
  btnTheme.addEventListener("click", toggleTheme);
  document.addEventListener("keydown", handleKeyboardShortcut);

  // Initialize new features
  initMaskBrush();
  initVectorEditor();
  initHelpOverlay();

  // Start render loop
  function loop(): void {
    render();
    updateFps();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Start sync status updates
  updateSyncStatus();
  setInterval(updateSyncStatus, 2000);
}

init();
