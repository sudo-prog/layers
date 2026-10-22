import { describe, it, expect } from "vitest";
import { hexToRgb, toRgbArray, toHexColor, clamp } from "../src/color.js";
import { buildCoreParams, CORE_DEFS, coreDef } from "../src/editor.js";
import { defaultParams } from "../src/cores.js";
import { filtered } from "../src/picker.js";

describe("colour helpers", () => {
  it("parses 6-digit hex", () => {
    expect(hexToRgb("#ff8800")).toEqual([255, 136, 0]);
    expect(hexToRgb("ff8800")).toEqual([255, 136, 0]);
  });

  it("parses 3-digit hex", () => {
    expect(hexToRgb("#f80")).toEqual([255, 136, 0]);
  });

  it("rejects junk rather than returning NaN", () => {
    expect(hexToRgb("nope")).toBeNull();
    expect(hexToRgb("#12345")).toBeNull();
    expect(toRgbArray({})).toBeNull();
    expect(toRgbArray([1, 2])).toBeNull();
    expect(toRgbArray([1, NaN, 3])).toBeNull();
  });

  it("accepts a numeric triple", () => {
    expect(toRgbArray([10, 20, 30])).toEqual([10, 20, 30]);
  });

  it("normalises to #rrggbb and clamps out-of-range channels", () => {
    expect(toHexColor("#ABCDEF", "#000000")).toBe("#abcdef");
    expect(toHexColor([300, -20, 128], null)).toBe("#ff0080");
    expect(toHexColor(null, "#123456")).toBe("#123456");
    expect(toHexColor(undefined, undefined)).toBe("#000000");
  });

  it("clamps", () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });
});

describe("core catalogue", () => {
  it("has unique core names", () => {
    const names = CORE_DEFS.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every core declares at least one param with a default", () => {
    for (const def of CORE_DEFS) {
      expect(def.params.length).toBeGreaterThan(0);
      for (const p of def.params) {
        expect(p.default).toBeDefined();
      }
    }
  });

  it("every slider declares a coherent range", () => {
    for (const def of CORE_DEFS) {
      for (const p of def.params) {
        if (p.type !== "slider") continue;
        expect(typeof p.min).toBe("number");
        expect(typeof p.max).toBe("number");
        expect(p.max as number).toBeGreaterThan(p.min as number);
        const d = p.default as number;
        expect(d).toBeGreaterThanOrEqual(p.min as number);
        expect(d).toBeLessThanOrEqual(p.max as number);
      }
    }
  });

  it("every select declares options including its default", () => {
    for (const def of CORE_DEFS) {
      for (const p of def.params) {
        if (p.type !== "select") continue;
        expect(p.options?.length).toBeGreaterThan(0);
        expect(p.options?.some((o) => o.value === p.default)).toBe(true);
      }
    }
  });

  it("coreDef finds by name and returns undefined otherwise", () => {
    expect(coreDef("blur")?.label).toBe("Blur/Convolution");
    expect(coreDef("nope")).toBeUndefined();
  });

  it("defaultParams covers every declared param", () => {
    for (const def of CORE_DEFS) {
      const p = defaultParams(def);
      expect(Object.keys(p).sort()).toEqual(def.params.map((x) => x.key).sort());
    }
  });
});

describe("buildCoreParams", () => {
  const def = coreDef("pattern-dither")!;

  it("passes a plain slider value through as a number", () => {
    const out = buildCoreParams(def, { scale: 42 });
    expect(out.scale).toBe(42);
  });

  it("converts a colour to a 0-255 triple", () => {
    const out = buildCoreParams(def, { inkColor: "#ff8800" });
    expect(out.inkColor).toEqual([255, 136, 0]);
  });

  it("never emits NaN for a slider — this is the silent-failure guard", () => {
    // A driven prop from the mobile editor's format is an OBJECT. `Number({})`
    // is NaN, which a shader silently renders as nothing.
    const driven = { dynamic: true, type: "mouse-position", base: 77, outputMin: 0, outputMax: 100 };
    const out = buildCoreParams(def, { scale: driven });
    expect(Number.isFinite(out.scale as number)).toBe(true);
    expect(out.scale).toBe(77);
  });

  it("falls back to the param default when a driven prop has no base", () => {
    const out = buildCoreParams(def, { scale: { dynamic: true, type: "map" } });
    expect(out.scale).toBe(50); // the declared default
  });

  it("falls back to the default for a missing value", () => {
    const out = buildCoreParams(def, {});
    expect(out.scale).toBe(50);
    expect(out.shape).toBe("simplex");
  });

  it("falls back to the default colour when the stored colour is junk", () => {
    const out = buildCoreParams(def, { inkColor: "not-a-colour" });
    expect(out.inkColor).toEqual([0, 0, 0]);
  });
});

describe("picker filtering", () => {
  it("filters by category", () => {
    const blurs = filtered(CORE_DEFS, "blurs", "");
    expect(blurs.every((c) => c.category === "blurs")).toBe(true);
    expect(blurs.length).toBeGreaterThan(0);
  });

  it("filters by query against label, name and blurb", () => {
    expect(filtered(CORE_DEFS, "textures", "dither").map((c) => c.name)).toContain("pattern-dither");
    expect(filtered(CORE_DEFS, "textures", "noise").map((c) => c.name)).toContain("noise-grain");
    // blurb match
    expect(filtered(CORE_DEFS, "blurs", "gaussian").map((c) => c.name)).toContain("blur");
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(filtered(CORE_DEFS, "textures", "zzzz")).toEqual([]);
  });

  it("is case-insensitive", () => {
    expect(filtered(CORE_DEFS, "textures", "DITHER").length).toBeGreaterThan(0);
  });
});
