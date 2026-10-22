import { describe, it, expect } from "vitest";
import {
  createDynamicDriver,
  hasDynamicProps,
  isDynamicProp,
  applyCurve,
  applyReach,
  pingPong,
  sawtooth,
  ease,
  clamp01,
  lerp,
  type DynamicProp,
  type DriverInput,
  type DriverStackItem,
} from "../src/dynamic-driver.js";

const prop = (over: Partial<DynamicProp> = {}): DynamicProp => ({
  dynamic: true,
  type: "mouse-position",
  outputMin: 0,
  outputMax: 100,
  ...over,
});

const item = (id: string, params: Record<string, unknown>): DriverStackItem => ({ id, params });

const input = (over: Partial<DriverInput> = {}): DriverInput => ({
  time: 0,
  cursor: { x: 0.5, y: 0.5 },
  sources: new Map(),
  delta: 1 / 60,
  ...over,
});

describe("guards", () => {
  it("recognises a driven prop and rejects plain values", () => {
    expect(isDynamicProp({ dynamic: true, type: "map" })).toBe(true);
    expect(isDynamicProp(20)).toBe(false);
    expect(isDynamicProp(null)).toBe(false);
    expect(isDynamicProp({ dynamic: true })).toBe(false); // no type
    expect(isDynamicProp({ dynamic: false, type: "map" })).toBe(false);
  });

  it("reports whether a stack has any driven prop", () => {
    expect(hasDynamicProps([item("a", { scale: 20 })])).toBe(false);
    expect(hasDynamicProps([item("a", { scale: prop() })])).toBe(true);
  });
});

describe("static passthrough", () => {
  it("resolves nothing for a stack with no drivers", () => {
    const d = createDynamicDriver([item("a", { scale: 20, angle: 45 })]);
    expect(d.resolve(input())).toEqual({});
    expect(d.dirty()).toBe(false);
    expect(d.drivenKeys("a")).toEqual([]);
  });

  it("ignores disabled items' plain params but still resolves driven ones", () => {
    const d = createDynamicDriver([item("a", { scale: prop({ type: "map", base: 7 }) })]);
    const out = d.resolve(input());
    // No source layer available, so `map` falls back to base.
    expect(out["a:scale"]).toBe(7);
  });
});

describe("NaN guard — the failure this module exists to prevent", () => {
  it("never emits NaN when a driven prop has no usable range", () => {
    const bad = {
      dynamic: true,
      type: "mouse-position",
      outputMin: undefined,
      outputMax: undefined,
      base: undefined,
    } as unknown as DynamicProp;
    const d = createDynamicDriver([item("a", { scale: bad })]);
    const out = d.resolve(input({ cursor: { x: 0.3, y: 0.3 } }));
    expect(Number.isFinite(out["a:scale"])).toBe(true);
    expect(Number.isNaN(out["a:scale"])).toBe(false);
  });

  it("never emits NaN for any prop type with hostile fields", () => {
    const hostile = [
      prop({ outputMin: NaN as unknown as number }),
      prop({ outputMax: Infinity as unknown as number }),
      prop({ type: "auto-animate", speed: NaN as unknown as number }),
      prop({ type: "mouse-position", curve: NaN as unknown as number }),
      prop({ type: "mouse-position", reach: NaN as unknown as number }),
      prop({ type: "map", source: "missing" }),
    ];
    for (const p of hostile) {
      const d = createDynamicDriver([item("a", { scale: p })]);
      const out = d.resolve(input({ time: 1.5 }));
      expect(Number.isFinite(out["a:scale"])).toBe(true);
    }
  });

  it("survives a cursor that is not a number", () => {
    const d = createDynamicDriver([item("a", { scale: prop() })]);
    const out = d.resolve({
      time: 0,
      cursor: { x: NaN, y: undefined as unknown as number },
      sources: new Map(),
    });
    expect(Number.isFinite(out["a:scale"])).toBe(true);
  });
});

describe("mouse-position", () => {
  it("maps the cursor axis across the output range", () => {
    const d = createDynamicDriver([item("a", { scale: prop({ axis: "x" }) })]);
    expect(d.resolve(input({ cursor: { x: 0, y: 0.5 } }))["a:scale"]).toBeCloseTo(0, 5);
    expect(d.resolve(input({ cursor: { x: 1, y: 0.5 } }))["a:scale"]).toBeCloseTo(100, 5);
    expect(d.resolve(input({ cursor: { x: 0.5, y: 0.5 } }))["a:scale"]).toBeCloseTo(50, 5);
  });

  it("reads the y axis when asked", () => {
    const d = createDynamicDriver([item("a", { scale: prop({ axis: "y" }) })]);
    expect(d.resolve(input({ cursor: { x: 0, y: 1 } }))["a:scale"]).toBeCloseTo(100, 5);
  });

  it("inverts the requested axis only", () => {
    const dx = createDynamicDriver([item("a", { s: prop({ axis: "x", invertX: true }) })]);
    expect(dx.resolve(input({ cursor: { x: 0, y: 0 } }))["a:s"]).toBeCloseTo(100, 5);
    const dy = createDynamicDriver([item("a", { s: prop({ axis: "x", invertY: true }) })]);
    expect(dy.resolve(input({ cursor: { x: 0, y: 0 } }))["a:s"]).toBeCloseTo(0, 5);
  });

  it("locks an axis to the centre of the range", () => {
    const d = createDynamicDriver([item("a", { s: prop({ axis: "x", lockX: true }) })]);
    expect(d.resolve(input({ cursor: { x: 0, y: 0 } }))["a:s"]).toBeCloseTo(50, 5);
  });

  it("applies lock BEFORE reach, so a locked axis stays centred", () => {
    // If reach ran first, x=0 would be pushed to 0.5 - 0.5*2 = -0.5 -> clamped 0,
    // and locking afterwards would then give 50 anyway. The distinguishing case is
    // reach > 1 with lock: the locked value must be exactly the centre.
    const d = createDynamicDriver([
      item("a", { s: prop({ axis: "x", lockX: true, reach: 2 }) }),
    ]);
    expect(d.resolve(input({ cursor: { x: 0.9, y: 0.9 } }))["a:s"]).toBeCloseTo(50, 5);
  });

  it("scales distance from centre with reach", () => {
    const d = createDynamicDriver([item("a", { s: prop({ axis: "x", reach: 0 }) })]);
    expect(d.resolve(input({ cursor: { x: 0, y: 0 } }))["a:s"]).toBeCloseTo(50, 5);
  });
});

describe("auto-animate", () => {
  it("ping-pongs: 0 at phase 0, max at half a cycle, 0 at a full cycle", () => {
    const d = createDynamicDriver([
      item("a", { s: prop({ type: "auto-animate", mode: "ping-pong", speed: 1, easing: "linear" }) }),
    ]);
    expect(d.resolve(input({ time: 0 }))["a:s"]).toBeCloseTo(0, 4);
    expect(d.resolve(input({ time: 0.5 }))["a:s"]).toBeCloseTo(100, 4);
    expect(d.resolve(input({ time: 1 }))["a:s"]).toBeCloseTo(0, 4);
  });

  it("loops: rises 0→max over one cycle then resets", () => {
    const d = createDynamicDriver([
      item("a", { s: prop({ type: "auto-animate", mode: "loop", speed: 1, easing: "linear" }) }),
    ]);
    expect(d.resolve(input({ time: 0 }))["a:s"]).toBeCloseTo(0, 4);
    expect(d.resolve(input({ time: 0.5 }))["a:s"]).toBeCloseTo(50, 4);
    expect(d.resolve(input({ time: 1 }))["a:s"]).toBeCloseTo(0, 4);
  });

  it("rotates once every 2s at speed 0.5", () => {
    const d = createDynamicDriver([
      item("a", { s: prop({ type: "auto-animate", speed: 0.5, easing: "linear" }) }),
    ]);
    const peak = d.resolve(input({ time: 1 }))["a:s"]; // half of a 2s cycle
    expect(peak).toBeCloseTo(100, 3);
    const back = d.resolve(input({ time: 2 }))["a:s"];
    expect(back).toBeCloseTo(0, 3);
  });

  it("is frame-rate independent: same time gives the same value", () => {
    const mk = () =>
      createDynamicDriver([
        item("a", { s: prop({ type: "auto-animate", speed: 0.7, easing: "linear" }) }),
      ]);
    const at60 = mk().resolve(input({ time: 1.3, delta: 1 / 60 }))["a:s"];
    const at30 = mk().resolve(input({ time: 1.3, delta: 1 / 30 }))["a:s"];
    const at120 = mk().resolve(input({ time: 1.3, delta: 1 / 120 }))["a:s"];
    expect(at60).toBeCloseTo(at30, 6);
    expect(at60).toBeCloseTo(at120, 6);
  });
});

describe("map", () => {
  it("resolves a source layer's named channel", () => {
    const sources = new Map<string, Record<string, number>>([
      ["src", { alpha: 0.25, luminance: 0.8, red: 1 }],
    ]);
    const d = createDynamicDriver([
      item("a", { s: prop({ type: "map", source: "src", channel: "luminance" }) }),
    ]);
    expect(d.resolve(input({ sources }))["a:s"]).toBeCloseTo(80, 4);
  });

  it("accepts a plain number as the source value", () => {
    const sources = new Map<string, number>([["src", 0.5]]);
    const d = createDynamicDriver([item("a", { s: prop({ type: "map", source: "src" }) })]);
    expect(d.resolve(input({ sources }))["a:s"]).toBeCloseTo(50, 4);
  });

  it("falls back to base when the source is missing", () => {
    const d = createDynamicDriver([
      item("a", { s: prop({ type: "map", source: "nope", base: 33 }) }),
    ]);
    expect(d.resolve(input())["a:s"]).toBe(33);
  });
});

describe("smoothing and momentum", () => {
  it("lags the target when smoothing is high", () => {
    const d = createDynamicDriver([
      item("a", { s: prop({ axis: "x", smoothing: 0.9 }) }),
    ]);
    d.resolve(input({ cursor: { x: 0, y: 0 } })); // seed at 0
    const mid = d.resolve(input({ cursor: { x: 1, y: 0 } }))["a:s"];
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(100); // has not jumped to the target
  });

  it("converges to the target when the cursor holds still", () => {
    const d = createDynamicDriver([item("a", { s: prop({ axis: "x", smoothing: 0.5 }) })]);
    d.resolve(input({ cursor: { x: 0, y: 0 } }));
    let last = 0;
    for (let i = 0; i < 400; i++) last = d.resolve(input({ cursor: { x: 1, y: 0 } }))["a:s"];
    expect(last).toBeCloseTo(100, 1);
  });

  it("seeds at the resolved value, not at zero", () => {
    const d = createDynamicDriver([item("a", { s: prop({ axis: "x", smoothing: 0.99 }) })]);
    // First frame already at x=1 must resolve near 100, not sweep up from 0.
    expect(d.resolve(input({ cursor: { x: 1, y: 0 } }))["a:s"]).toBeCloseTo(100, 3);
  });

  it("overshoots with momentum and springs back", () => {
    const d = createDynamicDriver([item("a", { s: prop({ axis: "x", momentum: 0.8 }) })]);
    d.resolve(input({ cursor: { x: 0, y: 0 } }));
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      peak = Math.max(peak, d.resolve(input({ cursor: { x: 1, y: 0 } }))["a:s"]);
    }
    expect(peak).toBeGreaterThan(100); // overshot the 0…100 output range
  });

  it("does not let the spring explode over a long frame", () => {
    const d = createDynamicDriver([item("a", { s: prop({ axis: "x", momentum: 0.9 }) })]);
    d.resolve(input({ cursor: { x: 0, y: 0 } }));
    const out = d.resolve({ ...input({ cursor: { x: 1, y: 0 } }), delta: 2 }); // 2-second frame
    expect(Number.isFinite(out["a:s"])).toBe(true);
    expect(Math.abs(out["a:s"])).toBeLessThan(1000);
  });
});

describe("dirty()", () => {
  it("is false when nothing moved", () => {
    const d = createDynamicDriver([item("a", { s: prop({ type: "map", source: "src" }) })]);
    const sources = new Map<string, number>([["src", 0.5]]);
    d.resolve(input({ sources }));
    expect(d.dirty()).toBe(true); // first frame is always a change
    d.resolve(input({ sources }));
    expect(d.dirty()).toBe(false);
  });

  it("is true when the resolved value changes", () => {
    const d = createDynamicDriver([item("a", { s: prop({ axis: "x" }) })]);
    d.resolve(input({ cursor: { x: 0.2, y: 0 } }));
    d.resolve(input({ cursor: { x: 0.8, y: 0 } }));
    expect(d.dirty()).toBe(true);
  });

  it("does not re-render an auto-animate prop whose value is unchanged", () => {
    // speed 0 pins the phase, so time advancing must not mark it dirty.
    const d = createDynamicDriver([
      item("a", { s: prop({ type: "auto-animate", speed: 0, easing: "linear" }) }),
    ]);
    d.resolve(input({ time: 0 }));
    d.resolve(input({ time: 5 }));
    expect(d.dirty()).toBe(false);
  });
});

describe("reset()", () => {
  it("clears smoothing state so the next frame re-seeds", () => {
    const d = createDynamicDriver([item("a", { s: prop({ axis: "x", smoothing: 0.99 }) })]);
    d.resolve(input({ cursor: { x: 0, y: 0 } }));
    const lagging = d.resolve(input({ cursor: { x: 1, y: 0 } }))["a:s"];
    expect(lagging).toBeLessThan(50);

    d.reset();
    // After a reset the prop must jump straight to the target, not resume the lag.
    expect(d.resolve(input({ cursor: { x: 1, y: 0 } }))["a:s"]).toBeCloseTo(100, 3);
  });

  it("clears dirty", () => {
    const d = createDynamicDriver([item("a", { s: prop() })]);
    d.resolve(input());
    d.reset();
    expect(d.dirty()).toBe(false);
  });
});

describe("reduced motion", () => {
  it("renders base for auto-animate and never advances", () => {
    const d = createDynamicDriver(
      [item("a", { s: prop({ type: "auto-animate", base: 12, speed: 2 }) })],
      { reducedMotion: true },
    );
    expect(d.resolve(input({ time: 0 }))["a:s"]).toBe(12);
    expect(d.resolve(input({ time: 0.25 }))["a:s"]).toBe(12);
    expect(d.resolve(input({ time: 9 }))["a:s"]).toBe(12);
    expect(d.dirty()).toBe(false);
  });

  it("renders base for mouse-position", () => {
    const d = createDynamicDriver([item("a", { s: prop({ base: 42 }) })], {
      reducedMotion: true,
    });
    expect(d.resolve(input({ cursor: { x: 1, y: 1 } }))["a:s"]).toBe(42);
  });

  it("still resolves map, which is not motion", () => {
    const sources = new Map<string, number>([["src", 0.5]]);
    const d = createDynamicDriver(
      [item("a", { s: prop({ type: "map", source: "src", base: 1 }) })],
      { reducedMotion: true },
    );
    expect(d.resolve(input({ sources }))["a:s"]).toBeCloseTo(50, 4);
  });
});

describe("per-item lookups", () => {
  it("resolves each item independently and exposes forItem", () => {
    const d = createDynamicDriver([
      item("a", { s: prop({ axis: "x" }) }),
      item("b", { s: prop({ axis: "y" }) }),
    ]);
    d.resolve(input({ cursor: { x: 0, y: 1 } }));
    expect(d.forItem("a")["s"]).toBeCloseTo(0, 4);
    expect(d.forItem("b")["s"]).toBeCloseTo(100, 4);
    expect(d.forItem("nope")).toEqual({});
  });

  it("names the driven keys per item", () => {
    const d = createDynamicDriver([
      item("a", { scale: prop(), angle: 45, ink: "#fff" }),
    ]);
    expect(d.drivenKeys("a")).toEqual(["scale"]);
  });

  it("resolves a param key that is present but not driven as absent", () => {
    const d = createDynamicDriver([item("a", { scale: 20, angle: prop() })]);
    const out = d.resolve(input());
    expect(out["a:scale"]).toBeUndefined();
    expect(out["a:angle"]).toBeDefined();
  });
});

describe("maths helpers", () => {
  it("clamps to 0…1", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.5)).toBe(0.5);
  });

  it("lerps", () => {
    expect(lerp(0, 100, 0.25)).toBe(25);
  });

  it("ping-pong is 0,1,0 across a cycle", () => {
    expect(pingPong(0)).toBeCloseTo(0, 6);
    expect(pingPong(0.5)).toBeCloseTo(1, 6);
    expect(pingPong(1)).toBeCloseTo(0, 6);
    expect(pingPong(-0.5)).toBeCloseTo(1, 6); // negative phases are wrapped
  });

  it("sawtooth rises and wraps", () => {
    expect(sawtooth(0)).toBeCloseTo(0, 6);
    expect(sawtooth(0.75)).toBeCloseTo(0.75, 6);
    expect(sawtooth(1)).toBeCloseTo(0, 6);
  });

  it("every easing is pinned at 0 and 1", () => {
    for (const name of ["sine", "linear", "quad", "expo", "bounce"] as const) {
      expect(ease(name, 0)).toBeCloseTo(0, 5);
      expect(ease(name, 1)).toBeCloseTo(1, 5);
    }
  });

  it("the monotonic easings never decrease", () => {
    // `bounce` is excluded on purpose: it is non-monotonic by definition (it
    // rises, falls back, then rises again). Asserting monotonicity on it would
    // be asserting the easing is not a bounce.
    for (const name of ["sine", "linear", "quad", "expo"] as const) {
      let prev = -Infinity;
      for (let i = 0; i <= 20; i++) {
        const v = ease(name, i / 20);
        expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = v;
      }
    }
  });

  it("bounce actually bounces — it decreases somewhere in the middle", () => {
    let sawDecrease = false;
    let prev = -Infinity;
    for (let i = 0; i <= 100; i++) {
      const v = ease("bounce", i / 100);
      if (v < prev - 1e-9) sawDecrease = true;
      prev = v;
    }
    expect(sawDecrease).toBe(true);
  });

  it("curve 0 is identity, positive eases out, negative eases in", () => {
    expect(applyCurve(0.5, 0)).toBeCloseTo(0.5, 6);
    expect(applyCurve(0.25, 1)).toBeGreaterThan(0.25); // rises early
    expect(applyCurve(0.25, -1)).toBeLessThan(0.25); // rises late
    // The bend is a gamma, so it is NOT symmetric about the midpoint: with
    // curve 1 the midpoint 0.5 lifts to 0.5^0.25 ≈ 0.841.
    expect(applyCurve(0.5, 1)).toBeCloseTo(Math.pow(0.5, 0.25), 6);
    expect(applyCurve(0.5, -1)).toBeCloseTo(Math.pow(0.5, 4), 6);
  });

  it("reach 0 pins to centre, 1 is identity", () => {
    expect(applyReach(1, 0)).toBeCloseTo(0.5, 6);
    expect(applyReach(0.25, 1)).toBeCloseTo(0.25, 6);
    expect(applyReach(0.75, 2)).toBeCloseTo(1, 6); // amplified and clamped
  });
});
