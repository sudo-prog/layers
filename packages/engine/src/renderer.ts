/**
 * Main multi-pass renderer.
 *
 * Orchestrates the render pipeline:
 * 1. Upload source texture
 * 2. For each enabled pass: bind write FBO, run shader, swap
 * 3. Composite final result to screen
 *
 * Performance: pass programs and the blit program are compiled ONCE and
 * cached. `compile()` on a Pass is only called when the program has not been
 * cached yet, so the per-frame hot path performs zero shader compilation.
 */

import { GLContext, type ContextOptions } from "./context.js";
import { PingPongFBO } from "./fbo.js";
import type { Pass, PassParams } from "./pass.js";
import { createQuadVAO } from "./pass.js";

export interface RendererOptions extends ContextOptions {
  passes?: Pass[];
}

const DEFAULT_RENDERER_OPTIONS: ContextOptions = {
  width: 1024,
  height: 1024,
  preserveDrawingBuffer: true,
  alpha: false,
  antialias: false,
  premultipliedAlpha: false,
};

const BLIT_VS = `#version 300 es
precision highp float;
// Explicit attribute locations — must match createQuadVAO()'s hardcoded slots.
layout(location = 0) in vec2 aPosition;
layout(location = 1) in vec2 aTexCoord;
out vec2 vTexCoord;
void main() {
  vTexCoord = aTexCoord;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const BLIT_FS = `#version 300 es
precision highp float;
uniform sampler2D uTexture;
in vec2 vTexCoord;
out vec4 fragColor;
void main() {
  fragColor = texture(uTexture, vTexCoord);
}`;

export class Renderer {
  private ctx: GLContext;
  private fbo: PingPongFBO;
  private _passes: Pass[] = [];
  private _vao: WebGLVertexArrayObject | null = null;
  private _sourceTexture: WebGLTexture | null = null;
  private _startTime = performance.now();

  /** Pass id -> compiled WebGLProgram. Compiled lazily, once. */
  private _programCache = new Map<string, WebGLProgram>();
  /** Lazily-created, long-lived blit program (never deleted per frame). */
  private _blitProgram: WebGLProgram | null = null;

  constructor(canvas: HTMLCanvasElement, options: RendererOptions = {}) {
    const opts = { ...DEFAULT_RENDERER_OPTIONS, ...options };
    this.ctx = new GLContext(canvas, opts);
    this.fbo = new PingPongFBO(this.ctx);
    this.fbo.init(this.ctx.width, this.ctx.height);

    const gl = this.ctx.context;
    this._vao = createQuadVAO(gl);

    if (options.passes) {
      this._passes = options.passes;
    }
  }

  get context(): GLContext {
    return this.ctx;
  }

  get passes(): readonly Pass[] {
    return this._passes;
  }

  addPass(pass: Pass): void {
    this._passes.push(pass);
  }

  removePass(id: string): void {
    const removed = this._passes.find((p) => p.id === id);
    if (removed) {
      const gl = this.ctx.context;
      const prog = this._programCache.get(id);
      if (prog) {
        gl.deleteProgram(prog);
        this._programCache.delete(id);
      }
      removed.dispose(gl);
    }
    this._passes = this._passes.filter((p) => p.id !== id);
  }

  setPasses(passes: Pass[]): void {
    this._passes = passes;
  }

  /** Pre-compile every pass program. Call after mutating the pass list. */
  warmUp(): void {
    const gl = this.ctx.context;
    for (const pass of this._passes) {
      this._getProgram(gl, pass);
    }
    this._getBlitProgram(gl);
  }

  uploadSource(source: TexImageSource, width: number, height: number): void {
    const gl = this.ctx.context;

    if (this._sourceTexture) {
      gl.deleteTexture(this._sourceTexture);
    }

    this._sourceTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._sourceTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Resize FBO if needed
    if (this.fbo.width !== width || this.fbo.height !== height) {
      this.fbo.init(width, height);
    }
  }

  render(time?: number, opacityMap?: Map<string, number>): void {
    const gl = this.ctx.context;
    const t = time ?? (performance.now() - this._startTime) / 1000;

    if (!this._sourceTexture) return;

    // Bind source texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._sourceTexture);

    // Run each pass
    for (const pass of this._passes) {
      if (!pass.enabled) continue;

      const program = this._getProgram(gl, pass);
      if (!program) continue;

      // Bind write FBO
      this.fbo.bindWrite();

      // Use program
      gl.useProgram(program);

      // Set uniforms — per-pass opacity from the stack overrides the default
      const opacity = opacityMap?.get(pass.id) ?? 1;
      const params: PassParams = { opacity, enabled: true };
      pass.setUniforms(gl, program, params, t);

      // Bind VAO and draw
      gl.bindVertexArray(this._vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Swap FBOs
      this.fbo.swap();
    }

    // Final pass: render to screen
    this.fbo.bindRead();
    gl.bindVertexArray(this._vao);

    const blitProgram = this._getBlitProgram(gl);
    if (blitProgram) {
      gl.useProgram(blitProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.fbo.readTexture);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    gl.bindVertexArray(null);
  }

  resize(width: number, height: number): void {
    this.ctx.resize(width, height);
    this.fbo.init(width, height);
  }

  /** Compile a pass program once and cache it by pass id. */
  private _getProgram(gl: WebGL2RenderingContext, pass: Pass): WebGLProgram | null {
    const cached = this._programCache.get(pass.id);
    if (cached) return cached;

    const program = pass.compile(gl);
    if (program) this._programCache.set(pass.id, program);
    return program;
  }

  private _getBlitProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
    if (this._blitProgram) return this._blitProgram;

    const vShader = gl.createShader(gl.VERTEX_SHADER);
    const fShader = gl.createShader(gl.FRAGMENT_SHADER);
    if (!vShader || !fShader) return null;

    gl.shaderSource(vShader, BLIT_VS);
    gl.compileShader(vShader);
    gl.shaderSource(fShader, BLIT_FS);
    gl.compileShader(fShader);

    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vShader);
      gl.deleteShader(fShader);
      return null;
    }

    gl.attachShader(program, vShader);
    gl.attachShader(program, fShader);
    gl.linkProgram(program);
    gl.deleteShader(vShader);
    gl.deleteShader(fShader);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return null;
    }

    // Bind uTexture to unit 0 once.
    gl.useProgram(program);
    gl.uniform1i(gl.getUniformLocation(program, "uTexture"), 0);

    this._blitProgram = program;
    return program;
  }

  dispose(): void {
    const gl = this.ctx.context;

    for (const prog of this._programCache.values()) {
      gl.deleteProgram(prog);
    }
    this._programCache.clear();

    if (this._blitProgram) {
      gl.deleteProgram(this._blitProgram);
      this._blitProgram = null;
    }

    this.fbo.dispose();
    if (this._vao) gl.deleteVertexArray(this._vao);
    if (this._sourceTexture) gl.deleteTexture(this._sourceTexture);
    this.ctx.dispose();
  }
}
