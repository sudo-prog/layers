/**
 * The desktop editor's document model and render bridge.
 *
 * A "shader" is a named stack of cores. Multiple shaders coexist as frames on
 * the canvas — that is the desktop editor's whole point versus the mobile
 * prototype's single stack.
 *
 * The renderer holds one pass list at a time; switching shaders rebuilds it.
 */

import { Renderer } from "@layers/engine";
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
  type StackState,
  type StackItem,
} from "@layers/stack";
import { CORE_DEFS, coreDef, defaultParams, type CoreDef } from "./cores.js";
import { toRgbArray } from "./color.js";

export interface ShaderDoc {
  id: string;
  name: string;
  stack: StackState;
  /** Canvas dimensions for this shader's frame. */
  width: number;
  height: number;
}

export interface ProjectState {
  name: string;
  shaders: ShaderDoc[];
  activeId: string | null;
}

/** A live core instance plus the stack item that drives it. */
interface LivePass {
  core: { setParams?: (p: Record<string, unknown>) => void };
  itemId: string;
}

let shaderSeq = 0;

export function createShader(name: string, width = 1920, height = 1080): ShaderDoc {
  shaderSeq += 1;
  return {
    id: `shader-${shaderSeq}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    stack: createStackState(),
    width,
    height,
  };
}

export function createProject(): ProjectState {
  const first = createShader("Untitled");
  return { name: "Untitled", shaders: [first], activeId: first.id };
}

/** Dimensions presets — the desktop editor's frame sizes. */
export interface DimensionPreset {
  group: string;
  label: string;
  width: number;
  height: number;
}

export const DIMENSIONS: DimensionPreset[] = [
  { group: "Desktop", label: "FHD", width: 1920, height: 1080 },
  { group: "Desktop", label: "QHD", width: 2560, height: 1440 },
  { group: "Desktop", label: "4K UHD", width: 3840, height: 2160 },
  { group: "Desktop", label: "MacBook Pro 16\"", width: 1728, height: 1117 },
  { group: "Desktop", label: "MacBook Air", width: 1280, height: 832 },
  { group: "Social", label: "OpenGraph", width: 1200, height: 630 },
  { group: "Social", label: "X Post", width: 1200, height: 675 },
  { group: "Social", label: "Square", width: 1080, height: 1080 },
  { group: "Mobile", label: "iPhone 16 Pro", width: 393, height: 852 },
  { group: "Mobile", label: "iPhone 16 Plus", width: 428, height: 926 },
  { group: "Mobile", label: "iPhone 16 Pro Max", width: 430, height: 932 },
  { group: "Tablet", label: "iPad Air 11\"", width: 820, height: 1180 },
  { group: "Tablet", label: "iPad Mini 8.3\"", width: 834, height: 1194 },
];

/**
 * Build the params object a core constructor expects.
 *
 * A slider param stored as an object is a driven prop from the mobile editor's
 * format. This app has no dynamic-prop UI yet, so a driven object is coerced to
 * its `base` rather than passed through — `Number({})` would be `NaN` and the
 * core would silently render nothing.
 */
export function buildCoreParams(def: CoreDef, itemParams: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of def.params) {
    const raw = itemParams[p.key] ?? p.default;
    if (p.type === "color") {
      out[p.key] = toRgbArray(raw) ?? toRgbArray(p.default) ?? [0, 0, 0];
    } else if (p.type === "slider") {
      if (raw && typeof raw === "object") {
        const base = (raw as Record<string, unknown>).base;
        out[p.key] = typeof base === "number" ? base : Number(p.default);
      } else {
        out[p.key] = Number(raw);
      }
    } else {
      out[p.key] = raw;
    }
  }
  return out;
}

export class Editor {
  readonly renderer: Renderer;
  project: ProjectState;
  private live: LivePass[] = [];
  private started = 0;

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.renderer = new Renderer(canvas, {
      width,
      height,
      alpha: false,
      antialias: false,
      // `preserveDrawingBuffer: true` is required, not optional: without it the
      // drawing buffer is cleared after the browser composites the frame, so
      // `readPixels` (and any export/screenshot path) reads a blank canvas.
      // The mobile app sets this too — it is the engine's working assumption.
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
    });
    this.project = createProject();
    this.started = performance.now();
  }

  get active(): ShaderDoc | null {
    if (!this.project.activeId) return null;
    return this.project.shaders.find((s) => s.id === this.project.activeId) ?? null;
  }

  /** A procedural source so an empty stack still shows something. */
  uploadDefaultSource(): void {
    const doc = this.active;
    const w = doc?.width ?? 1920;
    const h = doc?.height ?? 1080;
    const c = new OffscreenCanvas(w, h);
    const g = c.getContext("2d");
    if (!g) return;
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#1b2430");
    grad.addColorStop(0.5, "#8fa3c8");
    grad.addColorStop(1, "#e8eef7");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    this.renderer.uploadSource(c, w, h);
  }

  /** Rebuild the renderer's passes from the active shader's stack. */
  rebuildPasses(): void {
    for (const pass of [...this.renderer.passes]) this.renderer.removePass(pass.id);
    this.live = [];

    const doc = this.active;
    if (!doc) {
      this.renderer.warmUp();
      return;
    }

    for (const item of getEnabledItems(doc.stack)) {
      const def = coreDef(item.core);
      if (!def) continue;
      const core = def.create(buildCoreParams(def, item.params)) as LivePass["core"];
      this.renderer.addPass(core as never);
      this.live.push({ core, itemId: item.id });
    }

    this.renderer.resize(doc.width, doc.height);
    this.renderer.warmUp();
  }

  render(): void {
    const t = (performance.now() - this.started) / 1000;
    this.renderer.render(t);
  }

  passCount(): number {
    const doc = this.active;
    return doc ? estimatePasses(getEnabledItems(doc.stack)) : 0;
  }

  // ── Stack mutations, all of which rebuild the passes ──────────────────────

  addCore(def: CoreDef): StackItem | null {
    const doc = this.active;
    if (!doc) return null;
    doc.stack = addStackItem(doc.stack, {
      core: def.name,
      params: defaultParams(def),
      opacity: 1,
      blend: "normal",
      mask: null,
      enabled: true,
    });
    this.rebuildPasses();
    return doc.stack.items[doc.stack.items.length - 1] ?? null;
  }

  removeItem(id: string): void {
    const doc = this.active;
    if (!doc) return;
    doc.stack = removeStackItem(doc.stack, id);
    this.rebuildPasses();
  }

  setParam(id: string, key: string, value: unknown): void {
    const doc = this.active;
    if (!doc) return;
    doc.stack = updateStackItem(doc.stack, id, {
      params: { ...(doc.stack.items.find((i) => i.id === id)?.params ?? {}), [key]: value },
    });
    // A param edit changes a live core in place rather than rebuilding, so a
    // slider drag does not recompile the shader on every frame.
    const item = doc.stack.items.find((i) => i.id === id);
    const def = item ? coreDef(item.core) : undefined;
    if (item && def) {
      const live = this.live.find((l) => l.itemId === id);
      if (live?.core.setParams) {
        live.core.setParams(buildCoreParams(def, item.params));
      }
    }
  }

  moveItem(id: string, dir: "up" | "down"): void {
    const doc = this.active;
    if (!doc) return;
    doc.stack = moveStackItem(doc.stack, id, dir);
    this.rebuildPasses();
  }

  toggleItem(id: string): void {
    const doc = this.active;
    if (!doc) return;
    doc.stack = toggleStackItem(doc.stack, id);
    this.rebuildPasses();
  }

  selectItem(id: string | null): void {
    const doc = this.active;
    if (!doc) return;
    doc.stack = selectStackItem(doc.stack, id);
  }

  /** Layer opacity. Applied to the live pass, not the core's params. */
  setOpacity(id: string, value: number): void {
    const doc = this.active;
    if (!doc) return;
    const clamped = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
    doc.stack = updateStackItem(doc.stack, id, { opacity: clamped });
  }

  /** Layer blend mode. Stored on the item; the renderer's blend pass reads it. */
  setBlend(id: string, value: string): void {
    const doc = this.active;
    if (!doc) return;
    doc.stack = updateStackItem(doc.stack, id, { blend: value });
  }

  addShader(): ShaderDoc {
    const n = this.project.shaders.length + 1;
    const s = createShader(`Shader ${n}`);
    this.project.shaders.push(s);
    this.project.activeId = s.id;
    this.rebuildPasses();
    return s;
  }

  setActiveShader(id: string): void {
    this.project.activeId = id;
    const doc = this.active;
    if (doc) this.renderer.resize(doc.width, doc.height);
    this.rebuildPasses();
  }

  setDimensions(w: number, h: number): void {
    const doc = this.active;
    if (!doc) return;
    doc.width = w;
    doc.height = h;
    this.renderer.resize(w, h);
    this.uploadDefaultSource();
  }
}

export { CORE_DEFS, coreDef };
