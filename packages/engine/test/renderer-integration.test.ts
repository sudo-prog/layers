import { describe, it, expect, vi, beforeEach } from "vitest";
import { Renderer } from "../src/renderer.js";
import { BlendPass } from "../src/blend.js";

function createMockCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  return canvas;
}

function createMockGL(): WebGL2RenderingContext {
  let textureCounter = 0;
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
    TEXTURE_2D: 0x0de1,
    TEXTURE0: 0x84c0,
    TEXTURE1: 0x84c1,
    RGBA8: 0x8058,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    LINEAR: 0x2601,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    CLAMP_TO_EDGE: 0x812f,
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88e4,
    FLOAT: 0x1406,
    FRAMEBUFFER: 0x8d40,
    COLOR_ATTACHMENT0: 0x8ce0,
    FRAMEBUFFER_COMPLETE: 36053,
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    TRIANGLE_STRIP: 0x0005,
    PROGRAM_BINARY_LENGTH: 0x8742,
    PROGRAM_BINARY_FORMATS: 0x87ff,
  };
  return gl as unknown as WebGL2RenderingContext;
}

beforeEach(() => {
  localStorage.clear();
});

describe("Renderer + ShaderCompileCache integration", () => {
  it("exposes shaderCache instance", () => {
    const canvas = createMockCanvas();
    const gl = createMockGL();
    canvas.getContext = vi.fn().mockReturnValue(gl);
    (gl as { canvas: HTMLCanvasElement }).canvas = canvas;

    const renderer = new Renderer(canvas, { width: 256, height: 256 });
    expect(renderer.shaderCache).toBeDefined();
  });

  it("stores compiled program binary in cache after warmUp", () => {
    const canvas = createMockCanvas();
    const gl = createMockGL();
    canvas.getContext = vi.fn().mockReturnValue(gl);
    (gl as { canvas: HTMLCanvasElement }).canvas = canvas;

    const renderer = new Renderer(canvas, { width: 256, height: 256 });
    const pass = new BlendPass("normal");
    renderer.addPass(pass);
    renderer.warmUp();

    // The cache should have an entry for this pass
    // We can verify by checking localStorage was populated
    const cacheKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) cacheKeys.push(key);
    }
    expect(cacheKeys.length).toBeGreaterThan(0);
  });

  it("uses cached binary on subsequent warmUp (simulates page reload)", () => {
    const canvas = createMockCanvas();
    const gl = createMockGL();
    canvas.getContext = vi.fn().mockReturnValue(gl);
    (gl as { canvas: HTMLCanvasElement }).canvas = canvas;

    // First session: compile and cache
    const renderer1 = new Renderer(canvas, { width: 256, height: 256 });
    const pass1 = new BlendPass("normal");
    renderer1.addPass(pass1);
    renderer1.warmUp();

    const programBinarySpy = gl.programBinary as unknown as ReturnType<typeof vi.fn>;
    programBinarySpy.mockClear();

    // Second session: should use cached binary, not recompile
    const renderer2 = new Renderer(canvas, { width: 256, height: 256 });
    const pass2 = new BlendPass("normal");
    const compileSpy = vi.spyOn(pass2, "compile");
    renderer2.addPass(pass2);
    renderer2.warmUp();

    // compile should NOT have been called — programBinary used instead
    expect(compileSpy).not.toHaveBeenCalled();
    expect(programBinarySpy).toHaveBeenCalled();
  });
});

describe("Renderer + AdaptiveQuality integration", () => {
  it("exposes adaptiveQuality instance", () => {
    const canvas = createMockCanvas();
    const gl = createMockGL();
    canvas.getContext = vi.fn().mockReturnValue(gl);
    (gl as { canvas: HTMLCanvasElement }).canvas = canvas;

    const renderer = new Renderer(canvas, { width: 256, height: 256 });
    expect(renderer.adaptiveQuality).toBeDefined();
    expect(renderer.adaptiveQuality.scale).toBe(1.0);
  });

  it("starts at full resolution", () => {
    const canvas = createMockCanvas();
    const gl = createMockGL();
    canvas.getContext = vi.fn().mockReturnValue(gl);
    (gl as { canvas: HTMLCanvasElement }).canvas = canvas;

    const renderer = new Renderer(canvas, { width: 512, height: 512 });
    expect(renderer.context.width).toBe(512);
    expect(renderer.context.height).toBe(512);
  });
});
