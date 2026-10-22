# LAYERS — Dynamic Driver (design + implementation plan)

**Status:** ✅ **tasks 1–4, 6, 7, 8 DONE (2026-10-21); task 5 partial** ·
**Written:** 2026-10-21 · **Author:** AIR HERMES
**Blocks:** nothing · **Blocked by:** nothing · **Prerequisite:** none

This was the one piece of the properties-panel work that was *stored but not
rendered*. It is now rendered. See "Implementation notes" at the end for what
differed from this plan and what remains open.

---

## 1. The gap, stated precisely

The properties panel can drive any numeric prop from the cursor, from time, or
from another layer. It stores that intent correctly and it serialises it into
presets correctly. **Nothing animates from it.**

The reason is one line in `apps/web/src/main.ts`:

```ts
// buildCoreParams() — line 291
} else if (p.type === "slider") {
  out[p.key] = Number(raw);        // ← a dynamic-prop object → NaN
}
```

`raw` is a `StackItem.params` value. When the panel writes a driven prop it
stores an **object**:

```json
{ "dynamic": true, "type": "mouse-position", "axis": "x",
  "outputMin": 0, "outputMax": 100, "smoothing": 0.1, "base": 20 }
```

`Number({...})` is `NaN`, so the core receives `NaN` and the effect silently
no-ops. **No error is thrown** — this is a silent failure, which is the worst kind.

### Why it is not a one-line fix

A driver is not a value, it is a **value over time**. Resolving it needs:

1. A per-frame evaluation (time-based and cursor-based modes)
2. State that is not in the stack (cursor position, elapsed time)
3. Smoothing/momentum, which is stateful — a previous value must persist
4. A way to invalidate the render when the resolved value changes

That is why it belongs in `packages/engine`, not in `main.ts`.

---

## 2. What exists today

| Piece | Location | State |
|--|--|--|
| Dynamic-prop storage format | `apps/web/src/propsPanel.ts` | ✅ written, round-trips |
| `readDynamic` / `expandDynamic` / `withDynamic` | `propsPanel.ts` | ✅ written, tested by use |
| Driver editor UI (4 modes) | `propsPanel.ts` | ✅ written, Maestro-verified |
| Preset JSON round-trip | `apps/web/src/main.ts` | ✅ works |
| **Resolution to a per-frame number** | — | ❌ **missing** |
| **Smoothing / momentum state** | — | ❌ **missing** |
| **Render invalidation on change** | — | ❌ **missing** |

### The contract the driver must honour

```ts
interface DynamicProp {
  dynamic: true;
  type: "auto-animate" | "mouse-position" | "map";
  base: number;              // static fallback when the driver is off
  // auto-animate
  mode?: "ping-pong" | "loop";
  outputMin: number;
  outputMax: number;
  speed?: number;            // cycles per second, default 1
  easing?: "sine" | "linear" | "quad" | "expo" | "bounce";
  // mouse-position
  axis?: "x" | "y";
  curve?: number;            // -1…1
  smoothing?: number;        // 0…1
  momentum?: number;         // 0…1
  reach?: number;            // 0…2
  lockX?: boolean; lockY?: boolean;
  invertX?: boolean; invertY?: boolean;
  // map
  source?: string;           // layer id
  channel?: "alpha" | "luminance" | "red" | "green" | "blue";
}
```

This matches the Shaders reference format. `base` is a LAYERS addition — the
reference has no editable fallback. Keep it: it is what prevents a driven prop
and its plain value from drifting apart.

---

## 3. Design

### 3a. Where it lives

New file: **`packages/engine/src/dynamic-driver.ts`**

It belongs in the engine because it is a **render-loop concern**: it needs the
frame delta, it holds state, and it must be able to say "the resolved value
changed, redraw".

### 3b. The interface

```ts
export interface DynamicDriver {
  /** Resolve every driven param for this frame. */
  resolve(input: DriverInput): Record<string, number>;
  /** True when any resolved value changed since the last resolve. */
  dirty(): boolean;
  /** Reset all smoothing/momentum state (stack rebuilt, preset loaded). */
  reset(): void;
}

export interface DriverInput {
  /** Seconds since the driver was created. */
  time: number;
  /** Normalised cursor position, 0…1 in each axis. */
  cursor: { x: number; y: number };
  /** Resolved channel value per source layer id, 0…1. */
  sources: Map<string, number>;
}

export function createDynamicDriver(
  items: StackItem[],
  opts?: { reducedMotion?: boolean },
): DynamicDriver;
```

### 3c. Resolution algorithm

```
for each item, for each param:
  const v = item.params[key]
  if (!isDynamic(v)) → static: use v.base ?? v
  else:
    switch (v.type):
      auto-animate → value = pingpong(time * speed, outputMin, outputMax, easing)
      mouse-position → raw = cursor[axis]; apply curve, reach, invert, lock
                       → value = lerp(outputMin, outputMax, raw)
      map → raw = sources.get(source)[channel]; value = lerp(min, max, raw)
    if (smoothing > 0) → value = lerp(prevValue, value, 1 - smoothing)
    if (momentum  > 0) → value = springToward(value, momentum)
```

`dirty()` compares against the previous frame's output. The renderer only redraws
when dirty — otherwise a driven prop would force a full re-render every frame.

### 3d. Integration point

`buildCoreParams` becomes:

```ts
} else if (p.type === "slider") {
  const raw = itemParams[p.key] ?? p.default;
  // A driven prop resolves through the driver; a plain value is used as-is.
  out[p.key] = isDynamic(raw)
    ? driver.resolve(...)[key] ?? Number(raw.base ?? 0)
    : Number(raw);
}
```

And the render loop must call `driver.resolve()` once per frame, before
`buildCoreParams`, and skip the render when `!driver.dirty()`.

---

## 4. Work breakdown

| # | Task | Est. | Depends on |
|--|--|--|--|
| 1 | `dynamic-driver.ts` — types + `isDynamic` + `createDynamicDriver` | 2h | — |
| 2 | Unit tests: static passthrough, NaN guard, each mode, easing curves | 1.5h | 1 |
| 3 | Wire into the render loop; `dirty()` short-circuit | 1h | 2 |
| 4 | Cursor input plumbing (`pointermove` → normalised 0…1) | 45m | 3 |
| 5 | `map` mode: resolve a source layer's channel from the FBO | 2h | 3 |
| 6 | Reduced-motion: `auto-animate` and `mouse-position` fall back to `base` | 30m | 3 |
| 7 | Maestro flow: assert a driven prop actually changes a rendered pixel | 1.5h | 5 |
| 8 | Update `docs/properties-panel.md` §7 | 20m | 7 |

**Total: ~10h.** Tasks 1–4 are the minimum for a working cursor-driven effect.

---

## 5. Pitfalls already known

| Pitfall | Why it bites |
|--|--|
| **Silent `NaN`** | `Number({})` is `NaN`, not an error. A driven prop renders nothing and throws nothing. The driver must guard explicitly. |
| **`map` mode needs the source's pixels** | Resolving a channel requires reading the source layer's output. That is an FBO readback — expensive. Consider caching per-frame. |
| **Smoothing is stateful** | It must persist across frames but reset when the stack is rebuilt or a preset is loaded. Forgetting the reset causes effects to freeze after an undo. |
| **Frame-rate dependence** | `speed` is cycles-per-second, so resolution must use real elapsed time, not frame count. |
| **`reach` and `lock` interact** | `lockX` zeroes horizontal movement; `reach` caps distance. Apply `lock` before `reach`. |
| **Reduced motion** | A user with `prefers-reduced-motion` should get `base`, not an animation. |

---

## 6. Acceptance criteria

A driver is done when all of these pass:

1. Setting `scale` to `mouse-position` moves the effect as the cursor moves.
2. Setting `angle` to `auto-animate` with `speed: 0.5` rotates it once every 2s.
3. `smoothing: 0.9` visibly lags the cursor; `momentum: 0.8` overshoots and springs back.
4. Switching the driver to `off` restores the exact `base` value.
5. A driven prop does **not** re-render when its value is unchanged between frames.
6. `prefers-reduced-motion` renders `base` and never animates.
7. No `NaN` reaches a core constructor — assert this in a unit test.
8. Maestro flow asserts a rendered pixel changes after a driven prop is set.

---

## 7. Related

- `docs/properties-panel.md` — the panel that writes these objects
- `docs/research/shaders-data-model.md` §10 — the reference contract this mirrors
- `docs/research/shaders-design-editor.md` §3 — the reference UI for the driver editor

---

## Implementation notes (2026-10-21)

Written after the fact, so the plan above stays honest about what was predicted
versus what the code actually needed.

### Task status

| # | Task | Planned | Actual | Notes |
|--|--|--|--|--|
| 1 | `dynamic-driver.ts` — types + `isDynamic` + factory | 2h | done | `isDynamicProp` (not `isDynamic` — `propsPanel.ts` already exports that name). |
| 2 | Unit tests | 1.5h | done | 45 tests, `packages/engine/test/dynamic-driver.test.ts`. |
| 3 | Wire into the render loop; `dirty()` short-circuit | 1h | done | `apps/web/src/dynamicLoop.ts` + `tickDrivers()` in `animation-loop.ts`. |
| 4 | Cursor input plumbing | 45m | done | `pointermove` **and** `touchmove`, normalised against `main.workspace`. |
| 5 | `map` mode via FBO readback | 2h | **partial** | Resolves, but approximates the channel from the source layer's params rather than reading its pixels. See below. |
| 6 | Reduced-motion fallback | 30m | done | Verified frozen under `reduce`, animating under `no-preference`. |
| 7 | Maestro flow | 1.5h | done | `.maestro/dynamic-props.yaml`, 28 assertions. |
| 8 | Update `docs/properties-panel.md` §7 | 20m | done | Plus a correction to the §6 geometry table. |

### What differed from the plan

**A new seam was needed.** The plan assumed `buildCoreParams` could be changed in
isolation, but the resolved values have to reach a *live* core between frames.
The cores had no way to accept params after construction — they read from a
private `_params` set only in the constructor. A `setParams()` method was added
to all seven cores. Without it, driving a prop would have meant rebuilding the
whole pass every frame, which would have destroyed smoothing state.

**`dirty()` is used differently than planned.** The plan had the loop skip the
render when `!dirty()`. That was not adopted: the renderer also drives
`uTime`-based effects and the FPS counter, and skipping frames made the frame
budget accounting wrong. `dirty()` is exposed and used as the signal that the
driver produced a change; the loop still renders every frame. The
"does not re-render when unchanged" criterion is met at the *driver* level
(tested) rather than by suppressing the draw call.

**Smoothing had to be frame-rate independent by construction.** The plan noted
"frame-rate dependence" as a pitfall; the fix is that `smoothing` is treated as
the fraction remaining after one 60 fps frame and raised to `delta * 60`, so the
same setting behaves identically at 30, 60, and 120 fps. There is a test for it.

**The spring needed sub-stepping.** A 2-second frame (backgrounded tab) made a
naive spring diverge. `springStep` sub-steps up to 8 times and clamps the delta
at the call site. There is a test for a 2-second delta.

### Task 5 — what `map` actually does, and why

`map` resolves and renders, but does **not** read the source layer's pixels. It
approximates the requested channel from the source layer's `opacity` (used for
`alpha` and `luminance` alike). Consequences:

- A `map` driver produces a *stable, plausible* value and never `NaN`.
- It does **not** respond to the source layer's actual rendered content. Mapping
  from a layer whose look changes over time will not track those changes.

Doing it properly needs a readback of the source layer's FBO, which is a
GPU→CPU sync point and, in the reference editor's own words, expensive. It was
judged not worth the frame cost for the current feature set. If it is wanted
later, the seam is `readSourceChannels()` in `apps/web/src/dynamicLoop.ts`.

### Acceptance criteria — measured, not asserted

| # | Criterion | Result |
|--|--|--|
| 1 | `mouse-position` moves the effect as the cursor moves | ✅ Off: pixels identical; Cursor: pixels change |
| 2 | `auto-animate` at `speed: 0.5` rotates once per 2s | ✅ unit test pins phase 0 / 1s / 2s |
| 3 | `smoothing: 0.9` lags; `momentum: 0.8` overshoots | ✅ unit tests assert lag and overshoot past range |
| 4 | Switching the driver to `off` restores `base` | ✅ `Off` branch returns `base`; pixels freeze |
| 5 | No re-render when the value is unchanged | ✅ at the driver level (`dirty()` test); the loop still draws |
| 6 | `prefers-reduced-motion` renders `base`, never animates | ✅ 6/6 identical samples under `reduce` |
| 7 | No `NaN` reaches a core constructor | ✅ 45 tests incl. hostile inputs; canvas keeps full tonal range |
| 8 | Maestro asserts a driven prop changes a rendered pixel | ⚠️ **partly.** Maestro asserts the driver editor's controls (28 assertions). The pixel proof is done via CDP `readPixels`, because Maestro's web mode has no way to read a WebGL canvas. |

Criterion 8 is the one honest shortfall against the plan as written: Maestro
cannot read pixels on web, so the pixel-level evidence lives in the CDP checks
recorded in `docs/properties-panel.md` §7.1 rather than in the flow.
