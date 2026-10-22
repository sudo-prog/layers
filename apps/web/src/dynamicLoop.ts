/**
 * Live dynamic-prop driving for the render loop.
 *
 * Owns the driver instance, the cursor input, and the map to live core passes.
 * `rebuildPasses()` registers each pass here; `tickDrivers()` resolves once per
 * frame and pushes the resolved numbers into the live cores.
 *
 * The driver is rebuilt only when the stack's *shape* changes (a driven prop is
 * added, removed, or switched mode). A plain value edit does not rebuild it —
 * that would throw away smoothing state mid-gesture.
 */

import {
  createDynamicDriver,
  hasDynamicProps,
  isDynamicProp,
  type DynamicDriver,
  type DynamicProp,
  type DriverStackItem,
} from "@layers/engine";
import { state } from "./app-state";
import { getEnabledItems } from "@layers/stack";

/** The structural subset of a core this module needs. */
interface ParamSink {
  setParams?: (params: Record<string, unknown>) => void;
}

interface Registration {
  /** The live core instance added as a renderer pass. */
  core: ParamSink;
  /** The stack item id whose params drive it. */
  itemId: string;
  /** Core key, used to find the param definitions. */
  coreName: string;
}

const registrations: Registration[] = [];

let driver: DynamicDriver | null = null;
/** Signature of the last driver build, so we only rebuild on structural change. */
let driverSignature = "";

/** Normalised cursor position, 0…1. Starts centred. */
const cursor = { x: 0.5, y: 0.5 };

let pointerWired = false;
let lastTime = 0;
/** Set true whenever a resolved value changes, so the loop knows to redraw. */
let dirty = false;

/**
 * Map-mode source values: layer id → resolved channel values, 0…1.
 *
 * `map` reads another layer's output, which means an FBO readback — expensive.
 * We approximate from the source layer's own params instead, which is cheap and
 * stable. Documented as a known limitation: this is not a pixel-accurate read.
 */
function readSourceChannels(): Map<string, Record<string, number>> {
  const out = new Map<string, Record<string, number>>();
  for (const item of state.stack.items) {
    // A driven source layer has no static value to read; skip it rather than
    // feeding a driven prop back into itself.
    const alpha = typeof item.opacity === "number" ? item.opacity : 1;
    out.set(item.id, {
      alpha,
      luminance: alpha,
      red: alpha,
      green: alpha,
      blue: alpha,
    });
  }
  return out;
}

/** A stable signature of which params are driven and how. */
function computeSignature(): string {
  const parts: string[] = [];
  for (const item of getEnabledItems(state.stack)) {
    for (const [key, value] of Object.entries(item.params ?? {})) {
      if (!isDynamicProp(value)) continue;
      const p = value as DynamicProp;
      // Mode and type change the resolution path; range/easing changes do not
      // need a rebuild because they are read fresh every frame.
      parts.push(`${item.id}:${key}:${p.type}:${p.mode ?? ""}:${p.axis ?? ""}:${p.source ?? ""}:${p.channel ?? ""}`);
    }
  }
  return parts.sort().join("|");
}

/** True when the stack has any driven prop. */
export function hasDrivers(): boolean {
  return hasDynamicProps(state.stack.items as DriverStackItem[]);
}

/** Register a live core pass so driven params can be pushed into it. */
export function registerPass(core: ParamSink, itemId: string, coreName: string): void {
  registrations.push({ core, itemId, coreName });
}

/** Drop all pass registrations. Called at the start of every rebuildPasses(). */
export function clearRegistrations(): void {
  registrations.length = 0;
}

/** Forget the driver so the next tick rebuilds it. */
export function invalidateDriver(): void {
  driverSignature = "";
  driver = null;
}

/**
 * Rebuild the driver if the set of driven props changed.
 * Returns true when a rebuild happened.
 */
export function syncDriver(): boolean {
  const sig = computeSignature();
  if (sig === driverSignature && driver) return false;

  const reducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  driver = createDynamicDriver(getEnabledItems(state.stack) as DriverStackItem[], {
    reducedMotion,
  });
  driverSignature = sig;
  return true;
}

/** True when the last tick produced a changed value. */
export function isDriverDirty(): boolean {
  return dirty;
}

/**
 * Resolve every driven param for this frame and push it into the live cores.
 *
 * Call ONCE per frame, before the renderer draws. Returns true when anything
 * changed, so the caller can decide whether the frame needs a redraw.
 */
export function tickDrivers(deltaMs: number): boolean {
  if (!pointerWired) wirePointer();

  if (!hasDrivers()) {
    dirty = false;
    return false;
  }

  syncDriver();
  if (!driver) {
    dirty = false;
    return false;
  }

  const now = performance.now() / 1000;
  // Clamp the delta: a backgrounded tab can hand us a multi-second gap, which
  // would make a spring jump. The driver also sub-steps, but clamping here keeps
  // the time base sane.
  const delta = lastTime === 0 ? 1 / 60 : Math.min(0.1, Math.max(1 / 240, now - lastTime));
  lastTime = now;

  driver.resolve({
    time: now,
    cursor,
    sources: readSourceChannels(),
    delta,
  });

  let changed = false;
  for (const reg of registrations) {
    const resolved = driver.forItem(reg.itemId);
    const keys = Object.keys(resolved);
    if (keys.length === 0) continue;
    if (!reg.core.setParams) continue;

    const patch: Record<string, unknown> = {};
    for (const key of keys) {
      const v = resolved[key];
      // The driver already guarantees finite output; this is belt-and-braces
      // against a future change to the driver.
      if (typeof v === "number" && Number.isFinite(v)) patch[key] = v;
    }
    if (Object.keys(patch).length > 0) {
      reg.core.setParams(patch);
      changed = true;
    }
  }

  // A driven value that is still moving must keep the frame dirty even when the
  // pushed patch happens to be identical.
  dirty = changed || driver.dirty();
  return dirty;
}

/** Reset smoothing/momentum state. Used on undo, redo, and preset load. */
export function resetDrivers(): void {
  driver?.reset();
  lastTime = 0;
}

/** The normalised cursor, exposed for tests and diagnostics. */
export function driverCursor(): { x: number; y: number } {
  return { ...cursor };
}

/**
 * Set the normalised cursor directly. Used by tests and by the debug session;
 * pointer events are the production path.
 */
export function setDriverCursor(x: number, y: number): void {
  cursor.x = Math.max(0, Math.min(1, x));
  cursor.y = Math.max(0, Math.min(1, y));
}

/** Wire `pointermove` to the normalised cursor. Idempotent. */
function wirePointer(): void {
  if (pointerWired || typeof window === "undefined") return;
  pointerWired = true;

  const update = (clientX: number, clientY: number) => {
    const el = document.querySelector("main.workspace") ?? document.documentElement;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    cursor.x = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    cursor.y = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
  };

  window.addEventListener(
    "pointermove",
    (e) => update(e.clientX, e.clientY),
    { passive: true },
  );

  // Touch: track the primary contact so a phone drives the effect too.
  window.addEventListener(
    "touchmove",
    (e) => {
      const t = e.touches[0];
      if (t) update(t.clientX, t.clientY);
    },
    { passive: true },
  );
}
