/**
 * @layers/engine — dynamic-prop driver
 *
 * A driver is not a value, it is a **value over time**. This module resolves the
 * dynamic-prop objects the properties panel writes (`{ dynamic: true, type: … }`)
 * into plain per-frame numbers the cores can consume.
 *
 * Why it lives in the engine: it needs the frame delta, it holds state across
 * frames (smoothing, momentum), and it must be able to say "the resolved value
 * changed, redraw".
 *
 * ## The failure this exists to prevent
 *
 * The properties panel stores a driven prop as an object. The old integration
 * did `Number(raw)`, which is `NaN` for an object — a driven prop silently
 * rendered nothing and threw nothing. Every path through `resolve()` is
 * therefore sanitised: a non-finite value can never leave this module.
 *
 * ## Frame discipline
 *
 * Call `resolve(input)` **once per frame**, then read values with `forItem(id)`.
 * Calling it once per stack item would advance the smoothing/momentum state once
 * per item instead of once per frame, and the effect would lag differently
 * depending on how many layers were in the stack.
 */

/** The stored shape of a driven prop. Mirrors the reference editor's contract. */
export interface DynamicProp {
  dynamic: true;
  type: "auto-animate" | "mouse-position" | "map";
  /** Static fallback. Used when the driver is off or motion is reduced. */
  base?: number;
  /** `auto-animate` only. */
  mode?: "ping-pong" | "loop";
  outputMin?: number;
  outputMax?: number;
  /** Cycles per second. */
  speed?: number;
  easing?: EasingName;
  /** `mouse-position` only. */
  axis?: "x" | "y";
  /** −1…1. Negative eases in, positive eases out, 0 is linear. */
  curve?: number;
  /** 0…1. Higher lags the target more. */
  smoothing?: number;
  /** 0…1. Higher overshoots and springs back more. */
  momentum?: number;
  /** 0…2. Scales distance from centre; 1 is full travel. */
  reach?: number;
  lockX?: boolean;
  lockY?: boolean;
  invertX?: boolean;
  invertY?: boolean;
  /** `map` only — the id of the source layer. */
  source?: string;
  /** `map` only — which channel of the source to read. */
  channel?: "alpha" | "luminance" | "red" | "green" | "blue";
}

export type EasingName = "sine" | "linear" | "quad" | "expo" | "bounce";

/**
 * The structural subset of `StackItem` this module needs. Declared locally so
 * the engine does not take a dependency on `@layers/stack`.
 */
export interface DriverStackItem {
  id: string;
  params: Record<string, unknown>;
  enabled?: boolean;
}

export interface DriverInput {
  /** Seconds since the driver was created. */
  time: number;
  /** Normalised cursor position, 0…1 in each axis. */
  cursor: { x: number; y: number };
  /**
   * Resolved value per source layer id, 0…1.
   *
   * A plain number is the already-resolved channel value. An object lets the
   * driver pick the channel itself (`map` mode names one). Callers that can only
   * produce one number may pass it directly.
   */
  sources: Map<string, number | Record<string, number>>;
  /** Seconds since the previous resolve. Used for frame-rate-independent smoothing. */
  delta?: number;
}

export interface DynamicDriver {
  /**
   * Resolve every driven param for this frame.
   *
   * Returns a flat record keyed by `` `${itemId}:${paramKey}` ``. Prefer
   * `forItem(id)` for per-item lookups; the flat form exists for debugging and
   * for callers that already have a composite key.
   */
  resolve(input: DriverInput): Record<string, number>;
  /** The record `resolve` computed for one item on the last call. */
  forItem(itemId: string): Record<string, number>;
  /** True when any resolved value changed since the last resolve. */
  dirty(): boolean;
  /** Reset all smoothing/momentum state (stack rebuilt, preset loaded, undo). */
  reset(): void;
  /** Param keys that are actually driven, per item. Useful for diagnostics. */
  drivenKeys(itemId: string): string[];
}

export interface DriverOptions {
  /** `prefers-reduced-motion`. `auto-animate` and `mouse-position` fall back to `base`. */
  reducedMotion?: boolean;
  /** Change threshold for `dirty()`. Defaults to 1e-6. */
  epsilon?: number;
}

/* ── Guards and maths ───────────────────────────────────────────────────── */

const isFiniteNumber = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/**
 * Reads a finite number from an unknown, falling back when it is absent or
 * non-finite. This is the guard that keeps `NaN` out of the cores.
 */
function num(value: unknown, fallback: number): number {
  return isFiniteNumber(value) ? value : fallback;
}

export function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Is this stored param value a driven prop? */
export function isDynamicProp(value: unknown): value is DynamicProp {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as Record<string, unknown>).dynamic === true &&
      typeof (value as Record<string, unknown>).type === "string",
  );
}

/* ── Oscillators and easings ────────────────────────────────────────────── */

/** Fractional part, always in [0, 1) — `%` is negative for negative inputs. */
function frac(n: number): number {
  return n - Math.floor(n);
}

/**
 * Triangle wave over one cycle: 0 at phase 0, 1 at phase 0.5, 0 at phase 1.
 * This is the `ping-pong` mode's shape.
 */
export function pingPong(phase: number): number {
  return 1 - Math.abs(2 * frac(phase) - 1);
}

/** Sawtooth over one cycle. This is `loop` mode's shape. */
export function sawtooth(phase: number): number {
  return frac(phase);
}

export function ease(name: EasingName, t: number): number {
  const x = clamp01(t);
  switch (name) {
    case "linear":
      return x;
    case "quad":
      return x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x);
    case "expo":
      if (x === 0) return 0;
      if (x === 1) return 1;
      return x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2;
    case "bounce": {
      const n1 = 7.5625;
      const d1 = 2.75;
      let y = x;
      if (y < 1 / d1) return n1 * y * y;
      if (y < 2 / d1) {
        y -= 1.5 / d1;
        return n1 * y * y + 0.75;
      }
      if (y < 2.5 / d1) {
        y -= 2.25 / d1;
        return n1 * y * y + 0.9375;
      }
      y -= 2.625 / d1;
      return n1 * y * y + 0.984375;
    }
    case "sine":
    default:
      return (1 - Math.cos(Math.PI * x)) / 2;
  }
}

/**
 * Bends a 0…1 input. `curve` 0 is linear; positive eases out (rises fast, then
 * flattens), negative eases in (rises slowly, then accelerates).
 *
 * The exponent is `2 ** (-curve * 2)`, so curve 1 → 0.25 and curve −1 → 4.
 */
export function applyCurve(t: number, curve: number): number {
  const c = Math.max(-1, Math.min(1, num(curve, 0)));
  if (c === 0) return clamp01(t);
  const exponent = Math.pow(2, -c * 2);
  return clamp01(Math.pow(clamp01(t), exponent));
}

/**
 * Scales distance from the centre. `reach` 1 is full travel, 0 pins the value at
 * the centre, >1 amplifies (clamped to the 0…1 range).
 */
export function applyReach(t: number, reach: number): number {
  const r = Math.max(0, num(reach, 1));
  return clamp01(0.5 + (clamp01(t) - 0.5) * r);
}

/* ── The driver ─────────────────────────────────────────────────────────── */

interface ChannelState {
  /** Previous resolved value, for smoothing. */
  value: number;
  /** Spring velocity, for momentum. */
  velocity: number;
  /** Has this channel produced a value yet? Smoothing needs a seed. */
  seeded: boolean;
}

/** Resolved smoothing factor for this frame, independent of frame rate. */
function smoothingAlpha(smoothing: number, delta: number): number {
  // `smoothing` is the fraction REMAINING after one 60 fps frame, so
  // `1 - smoothing` is the per-frame approach factor. Raising the remainder to
  // `delta * 60` makes the same setting behave identically at any frame rate.
  const s = clamp01(num(smoothing, 0));
  if (s <= 0) return 1;
  if (s >= 1) return 0;
  return 1 - Math.pow(s, Math.max(0, delta) * 60);
}

/** One spring step toward `target`, scaled by the frame delta. */
function springStep(
  current: number,
  velocity: number,
  target: number,
  momentum: number,
  delta: number,
): [number, number] {
  const m = clamp01(num(momentum, 0));
  if (m <= 0) return [target, 0];

  // Stiffness pulls toward the target; damping bleeds off velocity. The values
  // are tuned so momentum 0.8 visibly overshoots and springs back.
  const stiffness = m * 0.35;
  const damping = 1 - m * 0.75;

  // Sub-step so a long frame cannot make the spring explode.
  const steps = Math.max(1, Math.min(8, Math.ceil((delta * 60) / 0.5)));
  const dt = (delta * 60) / steps;

  let v = velocity;
  let x = current;
  for (let i = 0; i < steps; i++) {
    v += (target - x) * stiffness * dt;
    v *= Math.pow(damping, dt);
    x += v * dt;
  }
  // A spring can overshoot past the target but must not run away.
  if (!isFiniteNumber(x) || !isFiniteNumber(v)) return [target, 0];
  return [x, v];
}

export function createDynamicDriver(
  items: DriverStackItem[],
  opts: DriverOptions = {},
): DynamicDriver {
  const reducedMotion = opts.reducedMotion === true;
  const epsilon = num(opts.epsilon, 1e-6);

  const state = new Map<string, ChannelState>();
  const last = new Map<string, Record<string, number>>();
  let lastFlat: Record<string, number> = {};
  let lastDirty = false;

  // Precompute which params are driven, so a stack with no drivers costs nothing.
  const driven = new Map<string, string[]>();
  for (const item of items) {
    const keys: string[] = [];
    for (const [key, value] of Object.entries(item.params ?? {})) {
      if (isDynamicProp(value)) keys.push(key);
    }
    if (keys.length) driven.set(item.id, keys);
  }

  const stateKey = (itemId: string, paramKey: string) => `${itemId}:${paramKey}`;

  function channelState(key: string): ChannelState {
    let s = state.get(key);
    if (!s) {
      s = { value: 0, velocity: 0, seeded: false };
      state.set(key, s);
    }
    return s;
  }

  /** The source layer's channel value, 0…1, or null when unavailable. */
  function readSource(input: DriverInput, prop: DynamicProp): number | null {
    const id = prop.source;
    if (!id) return null;
    const raw = input.sources?.get(id);
    if (raw === undefined) return null;
    if (isFiniteNumber(raw)) return clamp01(raw);
    if (raw && typeof raw === "object") {
      const channel = prop.channel ?? "alpha";
      const v = (raw as Record<string, unknown>)[channel];
      return isFiniteNumber(v) ? clamp01(v) : null;
    }
    return null;
  }

  /** The driver's own output for one prop, before smoothing. */
  function rawValue(prop: DynamicProp, input: DriverInput): number {
    const outputMin = num(prop.outputMin, 0);
    const outputMax = num(prop.outputMax, 100);

    // Reduced motion: an animation must not run. `map` is not motion, so it
    // still resolves.
    if (reducedMotion && prop.type !== "map") {
      return num(prop.base, outputMin);
    }

    if (prop.type === "auto-animate") {
      const speed = num(prop.speed, 1);
      const phase = input.time * speed;
      const shaped =
        prop.mode === "loop" ? sawtooth(phase) : pingPong(phase);
      return lerp(outputMin, outputMax, ease(prop.easing ?? "sine", shaped));
    }

    if (prop.type === "mouse-position") {
      const axis = prop.axis === "y" ? "y" : "x";
      let v = clamp01(num(input.cursor?.[axis], 0.5));

      // Order matters: curve shapes the raw input, then invert flips it, then
      // `lock` pins the axis. `lock` must precede `reach` so a locked axis
      // stays centred instead of being amplified off-centre.
      v = applyCurve(v, num(prop.curve, 0));
      const invert = axis === "x" ? prop.invertX === true : prop.invertY === true;
      if (invert) v = 1 - v;
      const lock = axis === "x" ? prop.lockX === true : prop.lockY === true;
      if (lock) v = 0.5;
      v = applyReach(v, num(prop.reach, 1));

      return lerp(outputMin, outputMax, v);
    }

    // `map`
    const src = readSource(input, prop);
    if (src === null) return num(prop.base, outputMin);
    return lerp(outputMin, outputMax, src);
  }

  return {
    resolve(input: DriverInput): Record<string, number> {
      const delta = num(input.delta, 1 / 60);
      const flat: Record<string, number> = {};
      let changed = false;

      for (const [itemId, keys] of driven) {
        const item = items.find((i) => i.id === itemId);
        if (!item) continue;
        const perItem: Record<string, number> = {};

        for (const key of keys) {
          const prop = item.params[key] as DynamicProp;
          const sk = stateKey(itemId, key);
          const st = channelState(sk);

          let value = rawValue(prop, input);
          if (!isFiniteNumber(value)) value = num(prop.base, 0);

          if (!st.seeded) {
            // Seed the first frame at the resolved value: starting from 0 would
            // make every smoothed prop sweep in from zero on the first frame.
            st.value = value;
            st.velocity = 0;
            st.seeded = true;
          } else {
            const alpha = smoothingAlpha(num(prop.smoothing, 0), delta);
            if (alpha < 1) value = lerp(st.value, value, alpha);

            const momentum = num(prop.momentum, 0);
            if (momentum > 0) {
              const [next, vel] = springStep(st.value, st.velocity, value, momentum, delta);
              value = next;
              st.velocity = vel;
            }
          }

          // Final guard: nothing non-finite may reach a core constructor.
          if (!isFiniteNumber(value)) value = num(prop.base, 0);

          st.value = value;
          perItem[key] = value;
          flat[sk] = value;

          const prev = last.get(itemId)?.[key];
          if (prev === undefined || Math.abs(prev - value) > epsilon) changed = true;
        }

        last.set(itemId, perItem);
      }

      lastFlat = flat;
      lastDirty = changed;
      return flat;
    },

    forItem(itemId: string): Record<string, number> {
      return last.get(itemId) ?? {};
    },

    dirty(): boolean {
      return lastDirty;
    },

    reset(): void {
      state.clear();
      last.clear();
      lastFlat = {};
      lastDirty = false;
    },

    drivenKeys(itemId: string): string[] {
      return driven.get(itemId) ?? [];
    },
  };
}

/** True when any item in the stack has a driven prop. Lets the loop skip the driver. */
export function hasDynamicProps(items: DriverStackItem[]): boolean {
  for (const item of items) {
    for (const value of Object.values(item.params ?? {})) {
      if (isDynamicProp(value)) return true;
    }
  }
  return false;
}
