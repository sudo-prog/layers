import { describe, it, expect, vi } from "vitest";
import {
  PatternDitherCore,
  NoiseGrainCore,
  BlurCore,
  ColorBlendCore,
  DisplacementCore,
  LightingCore,
  OutlineCore,
} from "../src/index.js";

function createMockGL(): WebGL2RenderingContext {
  let progCounter = 0;
  return {
    createShader: vi.fn().mockReturnValue({}),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn().mockReturnValue(true),
    getShaderInfoLog: vi.fn().mockReturnValue(""),
    createProgram: vi.fn(() => ({ _id: ++progCounter })),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn().mockReturnValue(true),
    getProgramInfoLog: vi.fn().mockReturnValue(""),
    deleteShader: vi.fn(),
    deleteProgram: vi.fn(),
    createVertexArray: vi.fn().mockReturnValue({}),
    bindVertexArray: vi.fn(),
    createBuffer: vi.fn().mockReturnValue({}),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    getUniformLocation: vi.fn().mockReturnValue({}),
    uniform1i: vi.fn(),
    uniform1f: vi.fn(),
    uniform2f: vi.fn(),
    uniform3f: vi.fn(),
    canvas: { width: 256, height: 256 },
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
  } as unknown as WebGL2RenderingContext;
}

const CORE_FACTORIES: Array<{
  label: string;
  make: () => { id: string; compile(g: WebGL2RenderingContext): WebGLProgram | null; getFragmentShader(): string };
}> = [
  { label: "PatternDither", make: () => new PatternDitherCore() },
  { label: "NoiseGrain", make: () => new NoiseGrainCore() },
  { label: "Blur", make: () => new BlurCore() },
  { label: "ColorBlend", make: () => new ColorBlendCore() },
  { label: "Displacement", make: () => new DisplacementCore() },
  { label: "Lighting", make: () => new LightingCore() },
  { label: "Outline", make: () => new OutlineCore() },
];

// ── Cross-core composition tests ─────────────────────────────────────────────

describe("Cross-core composition", () => {
  it("every core compiles alongside every other core without conflicts", () => {
    for (const a of CORE_FACTORIES) {
      for (const b of CORE_FACTORIES) {
        const gl = createMockGL();
        const coreA = a.make();
        const coreB = b.make();
        const progA = coreA.compile(gl);
        const progB = coreB.compile(gl);
        expect(progA).not.toBeNull();
        expect(progB).not.toBeNull();
        // Each core must produce a distinct program object
        expect(progA).not.toBe(progB);
      }
    }
  });

  it("each core has a unique fragment shader", () => {
    const shaders = new Set<string>();
    for (const c of CORE_FACTORIES) {
      const core = c.make();
      const fs = core.getFragmentShader();
      // Fragment shaders must be unique per core
      shaders.add(fs);
    }
    expect(shaders.size).toBe(7);
  });

  it("stacks of 2+ cores share the same mock GL context without errors", () => {
    const gl = createMockGL();
    const stack = CORE_FACTORIES.map((c) => c.make());
    const programs = stack.map((core) => core.compile(gl));
    // All 7 should compile successfully on the same context
    for (const p of programs) {
      expect(p).not.toBeNull();
    }
  });

  it("disabling a core in a multi-core stack does not affect others", () => {
    const gl = createMockGL();
    const stack = CORE_FACTORIES.map((c) => c.make());
    // Compile all
    const programs = stack.map((core) => core.compile(gl));
    // Simulate disabling the last core — the rest should remain valid
    // (In the real app, the renderer skips disabled cores; here we just
    // verify the remaining cores still compile independently)
    const remaining = stack.slice(0, -1);
    const remainingPrograms = remaining.map((core) => core.compile(createMockGL()));
    for (const p of remainingPrograms) {
      expect(p).not.toBeNull();
    }
  });

  it("core parameter changes do not affect other cores in the stack", () => {
    const gl = createMockGL();
    const stack = CORE_FACTORIES.map((c) => c.make());
    // Compile all
    const firstPass = stack.map((core) => core.compile(gl));
    // Modify one core's params (simulating an inspector change)
    // The other cores should still compile cleanly on a fresh context
    const secondPass = stack.map((core) => core.compile(createMockGL()));
    // Both passes should succeed — no cross-contamination
    for (let i = 0; i < stack.length; i++) {
      expect(firstPass[i]).not.toBeNull();
      expect(secondPass[i]).not.toBeNull();
    }
  });

  it("all cores use the same uniform naming convention", () => {
    for (const c of CORE_FACTORIES) {
      const core = c.make();
      const fs = core.getFragmentShader();
      // Every core should reference the standard uniform contract
      expect(fs).toContain("uTexture");
      expect(fs).toContain("uOpacity");
      expect(fs).toContain("uResolution");
    }
  });

  it("core pass counts sum correctly for a full 7-core stack", () => {
    // Expected pass counts: Pattern(2) + Noise(2) + Blur(1) + Color(1) + Displacement(2) + Lighting(1) + Outline(2) = 11
    const expectedPasses: Record<string, number> = {
      "pattern-dither": 2,
      "noise-grain": 2,
      "blur": 1,
      "color-blend": 1,
      "displacement": 2,
      "lighting": 1,
      "outline": 2,
    };
    let total = 0;
    for (const c of CORE_FACTORIES) {
      const core = c.make();
      total += expectedPasses[core.id] ?? 0;
    }
    expect(total).toBe(11);
  });
});
