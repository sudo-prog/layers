import { describe, it, expect, beforeEach, vi } from "vitest";
import { GLContext } from "../src/context.js";
import { PingPongFBO } from "../src/fbo.js";
import { BlendPass } from "../src/blend.js";
import { Renderer } from "../src/renderer.js";

beforeEach(() => {
  localStorage.clear();
});

// ── Mock WebGL2 context for headless testing ────────────────────────────────

function createMockCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  return canvas;
}

function createMockGL(): WebGL2RenderingContext {
  let textureCounter = 0;
  // Minimal mock that satisfies the GLContext constructor
  const gl = {
    canvas: null as unknown as HTMLCanvasElement,
    getExtension: vi.fn().mockReturnValue(null),
    createShader: vi.fn().mockReturnValue({}),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn().mockReturnValue(true),
    getShaderInfoLog: vi.fn().mockReturnValue(""),
    createProgram: vi.fn().mockReturnValue({}),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn((program: object, pname: number) => {
      if (pname === 0x8742) return 16; // PROGRAM_BINARY_LENGTH
      return true; // LINK_STATUS etc
    }),
    getProgramInfoLog: vi.fn().mockReturnValue(""),
    getParameter: vi.fn().mockReturnValue([0x93a1]), // PROGRAM_BINARY_FORMATS
    deleteShader: vi.fn(),
    deleteProgram: vi.fn(),
    createVertexArray: vi.fn().mockReturnValue({}),
    bindVertexArray: vi.fn(),
    createBuffer: vi.fn().mockReturnValue({}),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    createFramebuffer: vi.fn().mockReturnValue({}),
    bindFramebuffer: vi.fn(),
    framebufferTexture2D: vi.fn(),
    checkFramebufferStatus: vi.fn().mockReturnValue(36053),
    createTexture: vi.fn(() => ({ _id: ++textureCounter })),
    bindTexture: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    deleteTexture: vi.fn(),
    deleteFramebuffer: vi.fn(),
    viewport: vi.fn(),
    useProgram: vi.fn(),
    getUniformLocation: vi.fn().mockReturnValue({}),
    uniform1i: vi.fn(),
    uniform1f: vi.fn(),
    uniform2f: vi.fn(),
    activeTexture: vi.fn(),
    drawArrays: vi.fn(),
    getProgramBinary: vi.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4]).buffer),
    programBinary: vi.fn().mockReturnValue(true),
    TEXTURE_2D: 0x0DE1,
    TEXTURE0: 0x84C0,
    TEXTURE1: 0x84C1,
    RGBA8: 0x8058,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    LINEAR: 0x2601,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    CLAMP_TO_EDGE: 0x812F,
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88E4,
    FLOAT: 0x1406,
    FRAMEBUFFER: 0x8D40,
    COLOR_ATTACHMENT0: 0x8CE0,
    FRAMEBUFFER_COMPLETE: 36053,
    VERTEX_SHADER: 0x8B31,
    FRAGMENT_SHADER: 0x8B30,
    COMPILE_STATUS: 0x8B81,
    LINK_STATUS: 0x8B82,
    TRIANGLE_STRIP: 0x0005,
    PROGRAM_BINARY_LENGTH: 0x8742,
    PROGRAM_BINARY_FORMATS: 0x87ff,
  };
  return gl as unknown as WebGL2RenderingContext;
}

// ── Simple custom pass with a unique shader ─────────────────────────────────

const SIMPLE_FS = `#version 300 es
precision highp float;
uniform sampler2D uTexture;
in vec2 vTexCoord;
out vec4 fragColor;
void main() { fragColor = texture(uTexture, vTexCoord) * 0.5; }`;

const SIMPLE_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPosition;
layout(location = 1) in vec2 aTexCoord;
out vec2 vTexCoord;
void main() { vTexCoord = aTexCoord; gl_Position = vec4(aPosition, 0.0, 1.0); }`;

class SimplePass {
  readonly id: string;
  readonly name: string;
  enabled = true;

  constructor(id: string) {
    this.id = id;
    this.name = id;
  }

  getFragmentShader() { return SIMPLE_FS; }
  getVertexShader() { return SIMPLE_VS; }

  compile(gl: WebGL2RenderingContext): WebGLProgram | null {
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(vs, SIMPLE_VS);
    gl.compileShader(vs);
    gl.shaderSource(fs, SIMPLE_FS);
    gl.compileShader(fs);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return prog;
  }

  setUniforms(_gl: WebGL2RenderingContext, _program: WebGLProgram, _params: unknown, _time: number): void {}

  dispose(_gl: WebGL2RenderingContext): void {}
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("GLContext", () => {
  it("creates a context with correct dimensions", () => {
    const canvas = createMockCanvas();
    const gl = createMockGL();
    canvas.getContext = vi.fn().mockReturnValue(gl);

    const ctx = new GLContext(canvas, { width: 512, height: 512 });
    expect(ctx.width).toBe(512);
    expect(ctx.height).toBe(512);
    expect(ctx.isLost).toBe(false);
  });

  it("resizes correctly", () => {
    const canvas = createMockCanvas();
    const gl = createMockGL();
    canvas.getContext = vi.fn().mockReturnValue(gl);

    const ctx = new GLContext(canvas, { width: 256, height: 256 });
    ctx.resize(1024, 768);
    expect(ctx.width).toBe(1024);
    expect(ctx.height).toBe(768);
  });

  it("throws when WebGL2 is not supported", () => {
    const canvas = createMockCanvas();
    canvas.getContext = vi.fn().mockReturnValue(null);
    expect(() => new GLContext(canvas)).toThrow("WebGL2 not supported");
  });
});

describe("PingPongFBO", () => {
  it("initializes with correct dimensions", () => {
    const canvas = createMockCanvas();
    const gl = createMockGL();
    canvas.getContext = vi.fn().mockReturnValue(gl);

    const ctx = new GLContext(canvas, { width: 256, height: 256 });
    const fbo = new PingPongFBO(ctx);
    fbo.init(512, 512);

    expect(fbo.width).toBe(512);
    expect(fbo.height).toBe(512);
  });

  it("swaps read/write textures", () => {
    const canvas = createMockCanvas();
    const gl = createMockGL();
    canvas.getContext = vi.fn().mockReturnValue(gl);

    const ctx = new GLContext(canvas, { width: 256, height: 256 });
    const fbo = new PingPongFBO(ctx);
    fbo.init(256, 256);

    const before = fbo.readTexture;
    fbo.swap();
    const after = fbo.readTexture;
    expect(before).not.toBe(after);
  });
});

describe("BlendPass", () => {
  it("compiles without errors", () => {
    const canvas = createMockCanvas();
    const gl = createMockGL();
    canvas.getContext = vi.fn().mockReturnValue(gl);

    const pass = new BlendPass("multiply");
    const program = pass.compile(gl);
    expect(program).not.toBeNull();
  });

  it("has correct id and name", () => {
    const pass = new BlendPass("screen");
    expect(pass.id).toBe("blend-composite");
    expect(pass.name).toBe("Blend Composite");
  });
});

describe("Renderer", () => {
  it("creates with default options", () => {
    const canvas = createMockCanvas();
    const gl = createMockGL();
    canvas.getContext = vi.fn().mockReturnValue(gl);

    const renderer = new Renderer(canvas, { width: 256, height: 256 });
    expect(renderer.context.width).toBe(256);
    expect(renderer.context.height).toBe(256);
    expect(renderer.passes).toHaveLength(0);
  });

  it("adds and removes passes", () => {
    const canvas = createMockCanvas();
    const gl = createMockGL();
    canvas.getContext = vi.fn().mockReturnValue(gl);

    const renderer = new Renderer(canvas, { width: 256, height: 256 });
    const pass = new BlendPass("normal");

    renderer.addPass(pass);
    expect(renderer.passes).toHaveLength(1);

    renderer.removePass("blend-composite");
    expect(renderer.passes).toHaveLength(0);
  });

  it("compiles each pass program only once across renders (no per-frame compile)", () => {
    const canvas = createMockCanvas();
    const gl = createMockGL();
    canvas.getContext = vi.fn().mockReturnValue(gl);

    const renderer = new Renderer(canvas, { width: 256, height: 256 });
    const pass = new BlendPass("normal");
    const compileSpy = vi.spyOn(pass, "compile");

    renderer.addPass(pass);
    renderer.warmUp();
    expect(compileSpy).toHaveBeenCalledTimes(1);

    // Simulate several frames — compile must NOT be called again.
    const createProgramSpy = gl.createProgram as unknown as ReturnType<typeof vi.fn>;
    const callsAfterWarmUp = createProgramSpy.mock.calls.length;

    for (let i = 0; i < 5; i++) {
      renderer.render(i / 60);
    }

    expect(compileSpy).toHaveBeenCalledTimes(1);
    expect(createProgramSpy.mock.calls.length).toBe(callsAfterWarmUp);
  });

  it("warmUp pre-compiles all passes", () => {
    const canvas = createMockCanvas();
    const gl = createMockGL();
    canvas.getContext = vi.fn().mockReturnValue(gl);

    const renderer = new Renderer(canvas, { width: 256, height: 256 });
    // Use two passes with distinct shader hashes so both compile independently.
    const p1 = new BlendPass("normal");
    const p2 = new SimplePass("simple-dim");
    const s1 = vi.spyOn(p1, "compile");
    const s2 = vi.spyOn(p2, "compile");

    renderer.addPass(p1);
    renderer.addPass(p2);
    renderer.warmUp();

    expect(s1).toHaveBeenCalledTimes(1);
    expect(s2).toHaveBeenCalledTimes(1);
  });

  it("propagates per-pass opacity from the stack to setUniforms", () => {
    const canvas = createMockCanvas();
    const gl = createMockGL();
    (gl as { canvas: HTMLCanvasElement }).canvas = canvas;
    canvas.getContext = vi.fn().mockReturnValue(gl);

    const renderer = new Renderer(canvas, { width: 256, height: 256 });
    const pass = new BlendPass("normal");
    const setUniformsSpy = vi.spyOn(pass, "setUniforms");

    renderer.addPass(pass);
    renderer.uploadSource(createMockCanvas(), 256, 256);

    // Provide a per-pass opacity map
    const opacityMap = new Map<string, number>([["blend-composite", 0.42]]);
    renderer.render(0, opacityMap);

    expect(setUniformsSpy).toHaveBeenCalledTimes(1);
    const params = setUniformsSpy.mock.calls[0][2] as { opacity: number };
    expect(params.opacity).toBe(0.42);
  });

  it("defaults opacity to 1 when no opacity map is provided", () => {
    const canvas = createMockCanvas();
    const gl = createMockGL();
    (gl as { canvas: HTMLCanvasElement }).canvas = canvas;
    canvas.getContext = vi.fn().mockReturnValue(gl);

    const renderer = new Renderer(canvas, { width: 256, height: 256 });
    const pass = new BlendPass("normal");
    const setUniformsSpy = vi.spyOn(pass, "setUniforms");

    renderer.addPass(pass);
    renderer.uploadSource(createMockCanvas(), 256, 256);

    renderer.render(0);

    expect(setUniformsSpy).toHaveBeenCalledTimes(1);
    const params = setUniformsSpy.mock.calls[0][2] as { opacity: number };
    expect(params.opacity).toBe(1);
  });
});
