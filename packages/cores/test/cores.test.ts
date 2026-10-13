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

// ── Mock WebGL2 context ──────────────────────────────────────────────────────

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

// ── Every core: shared contract tests ────────────────────────────────────────

const ALL_CORES: Array<{
  label: string;
  id: string;
  name: string;
  make: () => { id: string; name: string; compile(g: WebGL2RenderingContext): WebGLProgram | null; getFragmentShader(): string };
}> = [
  { label: "PatternDither", id: "pattern-dither", name: "Pattern/Dither", make: () => new PatternDitherCore() },
  { label: "NoiseGrain", id: "noise-grain", name: "Noise/Grain", make: () => new NoiseGrainCore() },
  { label: "Blur", id: "blur", name: "Blur/Convolution", make: () => new BlurCore() },
  { label: "ColorBlend", id: "color-blend", name: "Color/Palette/Blend", make: () => new ColorBlendCore() },
  { label: "Displacement", id: "displacement", name: "Displacement/Warp", make: () => new DisplacementCore() },
  { label: "Lighting", id: "lighting", name: "Lighting/Atmosphere", make: () => new LightingCore() },
  { label: "Outline", id: "outline", name: "Outline/Edge", make: () => new OutlineCore() },
];

describe("All 7 cores — shared contract", () => {
  for (const c of ALL_CORES) {
    it(`${c.label}: has the expected id and name`, () => {
      const core = c.make();
      expect(core.id).toBe(c.id);
      expect(core.name).toBe(c.name);
    });

    it(`${c.label}: compiles its program`, () => {
      const gl = createMockGL();
      const core = c.make();
      expect(core.compile(gl)).not.toBeNull();
    });

    it(`${c.label}: fragment shader is valid GLSL ES 3.0`, () => {
      const core = c.make();
      const frag = core.getFragmentShader();
      expect(frag).toContain("#version 300 es");
      expect(frag).toContain("out vec4 fragColor;");
      expect(frag).toContain("void main()");
    });

    it(`${c.label}: setUniforms does not throw`, () => {
      const gl = createMockGL();
      const core = c.make() as unknown as {
        compile(g: WebGL2RenderingContext): WebGLProgram | null;
        setUniforms(g: WebGL2RenderingContext, p: WebGLProgram, params: { opacity: number; enabled: boolean }, t: number): void;
      };
      const program = core.compile(gl)!;
      expect(() => core.setUniforms(gl, program, { opacity: 1, enabled: true }, 0)).not.toThrow();
    });
  }
});

// ── Pattern/Dither: vendored Paper Shaders assertions ────────────────────────

describe("PatternDitherCore — vendored Paper Shaders (Apache-2.0)", () => {
  it("vendors the real Paper Shaders Bayer matrices", () => {
    const frag = new PatternDitherCore().getFragmentShader();
    expect(frag).toContain("bayer2x2");
    expect(frag).toContain("bayer4x4");
    expect(frag).toContain("bayer8x8");
    expect(frag).toContain("getBayerValue");
  });

  it("vendors the Paper Shaders simplex noise", () => {
    const frag = new PatternDitherCore().getFragmentShader();
    expect(frag).toContain("permute");
    expect(frag).toContain("snoise");
  });

  it("carries the Apache-2.0 provenance header", () => {
    const frag = new PatternDitherCore().getFragmentShader();
    expect(frag).toContain("Paper Shaders");
    expect(frag).toContain("Apache-2.0");
  });

  it("maps shape/levels params without throwing", () => {
    const gl = createMockGL();
    const core = new PatternDitherCore({ shape: "dots", levels: "bayer8", scale: 30 });
    const program = core.compile(gl)!;
    expect(() => core.setUniforms(gl, program, { opacity: 1, enabled: true }, 0)).not.toThrow();
  });
});

describe("NoiseGrainCore — Paper Shaders simplex", () => {
  it("vendors the Paper Shaders snoise", () => {
    const frag = new NoiseGrainCore().getFragmentShader();
    expect(frag).toContain("permute");
    expect(frag).toContain("snoise");
  });
});
