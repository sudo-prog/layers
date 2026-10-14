/**
 * LAYERS Web App — main entry point
 *
 * Wires the @layers/engine + @layers/cores + @layers/stack + @layers/ui
 * packages into a working visual style editor.
 */

import { Renderer } from "@layers/engine";
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
import { applyTheme } from "@layers/ui";
import { validateEffectStack } from "@layers/schema";
import { persistence } from "./persistence";
import { CORE_KEYS } from "./keyboard";
import { presetStore } from "./presetStore";
import { presetIdFromHash } from "./presetShare";
import { emitEvent } from "./eventEmitter";
import { stackSignature as stackSignatureOf } from "./renderState";
import { installGlobalErrorHandlers } from "./errorBoundary";
import { mountPresetGrid } from "./presetGrid";
import { mountLibraryPanel } from "./libraryPanel";
import { openCamera, loadImageAsSource } from "./imageImport";
import { state } from "./app-state";
import {
  canvas,
  coreList,
  stackList,
  inspector,
  btnTheme,
  btnUndo,
  btnRedo,
  maskCanvas,
  maskOverlay,
  maskBrush,
  syncIndicator,
  syncText,
} from "./dom-refs";
import {
  initMaskBrush,
  initVectorEditor,
  initHelpOverlay,
  initStage06,
  wireToolbarButtons,
  wireKeyboardShortcuts,
  wireOverlayDismissal,
} from "./event-wiring";
import { renderFrame, startLoop } from "./animation-loop";

// ── Core metadata ──────────────────────────────────────────────────────────

interface CoreDef {
  name: string;
  label: string;
  icon: string;
  create: (params?: any) => any;
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

export const CORE_DEFS: CoreDef[] = [
  {
    name: "pattern-dither",
    label: "Pattern/Dither",
    icon: "◉",
    create: (p?: any) => new PatternDitherCore(p),
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
    create: (p?: any) => new NoiseGrainCore(p),
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
    create: (p?: any) => new BlurCore(p),
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
    create: (p?: any) => new ColorBlendCore(p),
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
    create: (p?: any) => new DisplacementCore(p),
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
    create: (p?: any) => new LightingCore(p),
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
    create: (p?: any) => new OutlineCore(p),
    params: [
      { key: "strength", label: "Strength", type: "slider", min: 0, max: 3, step: 0.01, default: 1 },
      { key: "width", label: "Width", type: "slider", min: 0.5, max: 10, step: 0.5, default: 1 },
      { key: "roughness", label: "Roughness", type: "slider", min: 0, max: 1, step: 0.01, default: 0 },
      { key: "inkBleed", label: "Ink Bleed", type: "toggle", default: false },
    ],
  },
];

// ── Core param conversion ──────────────────────────────────────────────────

/**
 * Cores declare colour params as [r,g,b] in 0-255 and divide by 255 for the
 * uniform. The stack stores them as hex strings so the colour picker and
 * IndexedDB round-trip cleanly, so convert at the core boundary.
 */
function toRgbArray(value: unknown): [number, number, number] | null {
  if (Array.isArray(value) && value.length === 3) {
    return [Number(value[0]), Number(value[1]), Number(value[2])];
  }
  if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) {
    return [
      parseInt(value.slice(1, 3), 16),
      parseInt(value.slice(3, 5), 16),
      parseInt(value.slice(5, 7), 16),
    ];
  }
  return null;
}

/** Normalise any stored colour value to a #rrggbb string for <input type=color>. */
function toHexColor(value: unknown, fallback: unknown): string {
  if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) return value;
  const rgb = toRgbArray(value) ?? toRgbArray(fallback);
  if (!rgb) return "#000000";
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(rgb[0])}${h(rgb[1])}${h(rgb[2])}`;
}

/** Convert a stack item's params into the shape the core constructor expects. */
function buildCoreParams(def: CoreDef, itemParams: Record<string, unknown>): Record<string, unknown> {
   const out: Record<string, unknown> = {};
   for (const p of def.params) {
     const raw = itemParams[p.key] ?? p.default;
     if (p.type === "color") {
       out[p.key] = toRgbArray(raw) ?? toRgbArray(p.default) ?? [0, 0, 0];
     } else if (p.type === "slider") {
       out[p.key] = Number(raw);
     } else {
       out[p.key] = raw;
     }
   }
   return out;
}

/**
 * Creates a signature string for the current stack state to detect changes.
 * Delegates to the pure helper in ./renderState (unit-tested separately).
 */
function stackSignature(state: StackState): string {
  return stackSignatureOf(state);
}

// ── Context lost banner ────────────────────────────────────────────────────

export function showContextLostBanner(): void {
   if (state.contextLostBanner) {
     return; // Already showing
   }

   state.contextLostBanner = document.createElement('div');
   state.contextLostBanner.textContent = 'Graphics context lost — restoring…';
   state.contextLostBanner.style.position = 'fixed';
   state.contextLostBanner.style.top = '0';
   state.contextLostBanner.style.left = '0';
   state.contextLostBanner.style.right = '0';
   state.contextLostBanner.style.backgroundColor = 'rgba(255, 165, 0, 0.9)';
   state.contextLostBanner.style.color = '#000';
   state.contextLostBanner.style.padding = '0.75rem';
   state.contextLostBanner.style.textAlign = 'center';
   state.contextLostBanner.style.fontWeight = 'bold';
   state.contextLostBanner.style.zIndex = '1000';
   state.contextLostBanner.style.boxSizing = 'border-box';
   document.body.appendChild(state.contextLostBanner);
}

export function hideContextLostBanner(): void {
   if (state.contextLostBanner) {
     state.contextLostBanner.remove();
     state.contextLostBanner = null;
   }
}

// ── Renderer ───────────────────────────────────────────────────────────────

function initRenderer(): void {
   state.renderer = new Renderer(canvas, {
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

   // Store the source canvas for later use
   state.sourceCanvas = document.createElement("canvas");
   state.sourceCanvas.width = 512;
   state.sourceCanvas.height = 512;
   const sourceCtx = state.sourceCanvas.getContext("2d")!;
   sourceCtx.drawImage(src, 0, 0);

   state.renderer.uploadSource(src, 512, 512);

   // Set up WebGL context loss handlers
   const glContext = state.renderer.context;
   glContext.onContextLost(() => {
     showContextLostBanner();
   });

   glContext.onContextRestored(() => {
     hideContextLostBanner();
     // Rebuild passes when context is restored
     rebuildPasses();
   });
}

export function rebuildPasses(): void {
   if (!state.renderer) return;

   // Clear existing passes
   for (const pass of [...state.renderer.passes]) {
     state.renderer.removePass(pass.id);
   }

   // Add enabled stack items as passes
   const enabled = getEnabledItems(state.stack);
   for (const item of enabled) {
     const def = CORE_DEFS.find((d) => d.name === item.core);
     if (!def) continue;

     // Params must go through the constructor: cores read from their private
     // _params object, so assigning core[key] directly has no effect.
     const core = def.create(buildCoreParams(def, item.params));
     state.renderer.addPass(core);
   }

   state.renderer.warmUp();
}

// ── Undo/redo ──────────────────────────────────────────────────────────────

export function pushUndo(): void {
  state.undoStack.push(state.stack);
  if (state.undoStack.length > 100) state.undoStack.shift();
  state.redoStack = [];
  updateUndoButtons();
}

export function updateUndoButtons(): void {
  btnUndo.disabled = state.undoStack.length === 0;
  btnRedo.disabled = state.redoStack.length === 0;
}

export function doUndo(): void {
   if (state.undoStack.length === 0) return;
   state.redoStack.push(state.stack);
   state.stack = state.undoStack.pop()!;
   updateUndoButtons();
   rebuildStack();
   rebuildInspector();
   rebuildPasses();
   scheduleSave();
}

export function doRedo(): void {
   if (state.redoStack.length === 0) return;
   state.undoStack.push(state.stack);
   state.stack = state.redoStack.pop()!;
   updateUndoButtons();
   rebuildStack();
   rebuildInspector();
   rebuildPasses();
   scheduleSave();
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
        state.stack = addStackItem(state.stack, {
          core: def.name,
          params,
          opacity: 1,
          blend: "normal",
          mask: null,
          enabled: true,
        });
        rebuildStack();
        rebuildInspector();
        rebuildPasses();
        scheduleSave();
        emitEvent("stack_created", { core_type: def.name });
     });
    coreList.appendChild(btn);
  }
}

// ── Stack list UI ──────────────────────────────────────────────────────────

export function rebuildStack(): void {
  stackList.innerHTML = "";
  if (state.stack.items.length === 0) {
    stackList.innerHTML = `<p class="stack-empty">Click a core to add it to the stack</p>`;
    return;
  }

  for (const item of state.stack.items) {
    const el = document.createElement("div");
    el.className = "stack-item";
    if (item.id === state.stack.selectedId) el.classList.add("selected");
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
       state.stack = toggleStackItem(state.stack, item.id);
       rebuildStack();
       rebuildPasses();
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
       state.stack = removeStackItem(state.stack, item.id);
       rebuildStack();
       rebuildInspector();
       rebuildPasses();
       scheduleSave();
    });
    el.appendChild(remove);

    el.addEventListener("click", () => {
      state.stack = selectStackItem(state.stack, item.id);
      rebuildStack();
      rebuildInspector();
      scheduleSave();
    });

    stackList.appendChild(el);
  }
}

// ── Inspector UI ───────────────────────────────────────────────────────────

export function rebuildInspector(): void {
  const selected = state.stack.items.find((i) => i.id === state.stack.selectedId);
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
      // Colors are stored as hex strings in the stack (so the picker and
      // IndexedDB round-trip correctly) and converted to [r,g,b] on the way
      // into the core, which divides by 255.
      const hexVal = toHexColor(val, param.default);
      html += `<div class="param-color">`;
      html += `<input type="color" data-key="${param.key}" value="${hexVal}">`;
      html += `<span>${hexVal}</span>`;
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
    const sel = state.stack.items.find((i) => i.id === state.stack.selectedId);
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
           state.stack = updateStackItem(state.stack, selected.id, { opacity: numVal });
         } else {
           const newParams = { ...selected.params, [key]: numVal };
           state.stack = updateStackItem(state.stack, selected.id, { params: newParams });
         }
        rebuildPasses();
        scheduleSave();
      });
    } else if (el instanceof HTMLSelectElement) {
      el.addEventListener("change", () => {
        pushUndo();
         if (key === "__blend") {
           state.stack = updateStackItem(state.stack, selected.id, { blend: el.value });
         } else {
           const newParams = { ...selected.params, [key]: el.value };
           state.stack = updateStackItem(state.stack, selected.id, { params: newParams });
         }
        rebuildPasses();
        scheduleSave();
      });
    } else if (el instanceof HTMLInputElement && el.type === "color") {
       el.addEventListener("input", () => {
         const val = el.value;
         (el as HTMLElement).parentElement!.querySelector("span")!.textContent = val;
         pushUndo();
         // Store the hex string; render() converts it to [r,g,b] for the core.
         const newParams = { ...selected.params, [key]: val };
         state.stack = updateStackItem(state.stack, selected.id, { params: newParams });
         rebuildPasses();
         scheduleSave();
       });
    } else if (el instanceof HTMLInputElement && el.type === "checkbox") {
       el.addEventListener("change", () => {
         pushUndo();
         const newParams = { ...selected.params, [key]: el.checked };
         state.stack = updateStackItem(state.stack, selected.id, { params: newParams });
         rebuildPasses();
         scheduleSave();
       });
    } else if (el instanceof HTMLButtonElement) {
      el.addEventListener("click", () => {
        pushUndo();
         if (key === "__moveUp") {
           state.stack = moveStackItem(state.stack, selected.id, "up");
         } else if (key === "__moveDown") {
           state.stack = moveStackItem(state.stack, selected.id, "down");
         }
        rebuildStack();
        rebuildPasses();
        scheduleSave();
      });
    }
  });
}

// ── Theme ──────────────────────────────────────────────────────────────────

export function toggleTheme(): void {
  state.theme = state.theme === "light" ? "dark" : "light";
  applyTheme(state.theme);
  btnTheme.textContent = state.theme === "light" ? "🌙 Dark" : "☀️ Light";
}

// ── Mask brush ─────────────────────────────────────────────────────────────

export function saveMaskToSelected(): void {
  const selected = state.stack.items.find((i) => i.id === state.stack.selectedId);
  if (!selected) return;
  const maskData = maskBrush.getMaskData();
  if (maskData !== selected.mask) {
    state.stack = updateStackItem(state.stack, selected.id, { mask: maskData });
    scheduleSave();
  }
}

// ── Export / Import ────────────────────────────────────────────────────────

export function exportPreset(): void {
  const enabled = getEnabledItems(state.stack);
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
  emitEvent("preset_saved", {});
}

export function importPreset(): void {
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
       state.stack = createStackState(preset.stack);
       rebuildStack();
       rebuildInspector();
       rebuildPasses();
       scheduleSave();
    } catch (e) {
      alert("Failed to import: " + String(e));
    }
  });
  input.click();
}

// ── Sync status ────────────────────────────────────────────────────────────

export async function updateSyncStatus(): Promise<void> {
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

export function scheduleSave(): void {
  persistence.scheduleSave(state.stack);
}

// ── Stage 0.6 — Presets + photo import ─────────────────────────────────────

export async function openPresetPanel(): Promise<void> {
  const panel = document.createElement("div");
  panel.id = "preset-panel";
  panel.className = "preset-panel";

  const header = document.createElement("div");
  header.className = "preset-panel-header";
  const title = document.createElement("h3");
  title.className = "preset-panel-title";
  title.textContent = "Presets";
  header.appendChild(title);
  const closeBtn = document.createElement("button");
  closeBtn.className = "btn";
  closeBtn.textContent = "✕";
  closeBtn.title = "Close presets";
  closeBtn.addEventListener("click", () => panel.remove());
  header.appendChild(closeBtn);
  panel.appendChild(header);

  const gridContainer = document.createElement("div");
  gridContainer.className = "preset-panel-grid";
  panel.appendChild(gridContainer);

  document.body.appendChild(panel);

  await mountPresetGrid(gridContainer, {
    onApply: (stack) => {
      pushUndo();
      state.stack = stack;
      rebuildStack();
      rebuildInspector();
      rebuildPasses();
      scheduleSave();
      panel.remove();
    },
    getCurrentStack: () => state.stack,
  });
}

/**
 * Stage 2.2 — Library overlay.
 *
 * `library-overlay-mount` is the contract used by the Escape handler in the
 * overlay-dismissal list; it must be the id of the element that gets removed
 * on close.
 */
export async function openLibraryPanel(): Promise<void> {
  const mount = document.createElement("div");
  mount.id = "library-overlay-mount";

  const overlay = document.createElement("div");
  overlay.className = "library-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Preset library");

  const modal = document.createElement("div");
  modal.className = "library-modal";
  overlay.appendChild(modal);
  mount.appendChild(overlay);
  document.body.appendChild(mount);

  await mountLibraryPanel(modal, {
    onApply: (stack) => {
      pushUndo();
      state.stack = stack;
      rebuildStack();
      rebuildInspector();
      rebuildPasses();
      scheduleSave();
      emitEvent("preset_applied", {});
      mount.remove();
    },
    getCurrentStack: () => state.stack,
  });
}

/**
 * Stage 2.2 — honour a `#/preset/<id>` deep link on load.
 *
 * Loads the referenced preset into the editor and clears the hash so a
 * refresh does not re-apply it.
 */
async function applyPresetFromHash(): Promise<void> {
  const id = presetIdFromHash(window.location.hash);
  if (!id) return;
  try {
    const stack = await presetStore.loadPreset(id);
    if (stack) {
      pushUndo();
      state.stack = stack;
      rebuildStack();
      rebuildInspector();
      rebuildPasses();
      scheduleSave();
    }
  } catch (e) {
    console.warn("Could not open preset from link:", e);
  } finally {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

export async function importPhotoFromCamera(): Promise<void> {
  const file = await openCamera();
  if (!file) return;
  try {
    const source = await loadImageAsSource(file);
    if (state.renderer) {
      state.renderer.uploadSource(source.canvas, source.width, source.height);
      // Update the stored source canvas. `loadImageAsSource` may return an
      // OffscreenCanvas; the review/compare tools need a real HTMLCanvasElement
      // (for toDataURL + getContext('2d')), so normalise by blitting into one.
      state.sourceCanvas = toHTMLCanvas(source.canvas, source.width, source.height);
      rebuildPasses();
      emitEvent("photo_imported", {});
    }
  } catch (e) {
    alert(`Could not load image: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ── Canvas utility ─────────────────────────────────────────────────────────

/**
 * Normalise any 2D-drawable canvas (including OffscreenCanvas) into a real
 * HTMLCanvasElement, which the review/compare tools need for `toDataURL()`
 * and `getContext('2d')`. OffscreenCanvas lacks both.
 */
function toHTMLCanvas(
  src: OffscreenCanvas | HTMLCanvasElement,
  width: number,
  height: number,
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (ctx) ctx.drawImage(src as CanvasImageSource, 0, 0, width, height);
  return out;
}

// ── Init ───────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
   // Initialize persistence and restore state
   const persistenceReady = await persistence.init();
   if (persistenceReady) {
     const restored = await persistence.restore();
     if (restored && restored.items.length > 0) {
       state.stack = restored;
       console.info("[persistence] Restored stack state from IndexedDB");
     }
   }

   // Install global error handlers
   installGlobalErrorHandlers({
     maxToasts: 5,
     logToConsole: true
   });

   // Escape closes the topmost open overlay (WCAG 2.2 AA)
   wireOverlayDismissal();

   // Initialise the preset store BEFORE any panel mounts it. Without this the
   // store reports unavailable and both the Presets and Library panels fail
   // silently (save/load/list all no-op).
   try {
     await presetStore.init();
   } catch (e) {
     console.warn("Preset store unavailable:", e);
   }

   initRenderer();
   buildCoreList();
   rebuildStack();
   rebuildInspector();
   rebuildPasses();
   renderFrame();

   // Event listeners
   wireToolbarButtons();
   wireKeyboardShortcuts();

   // Initialize new features
   initMaskBrush();
   initVectorEditor();
   initHelpOverlay();
   initStage06();

   // Stage 2.2: a `#/preset/<id>` link loads that preset on open. Runs after
   // the store is initialised so the id can be resolved.
   void applyPresetFromHash();

   // Start render loop
   startLoop();

   // Start sync status updates
   updateSyncStatus();
   setInterval(updateSyncStatus, 2000);
}

init();
