/**
 * Ping-pong Framebuffer Objects (FBOs) for multi-pass rendering.
 *
 * Each FBO pair consists of two textures that alternate as read/write targets,
 * enabling sequential shader passes without intermediate CPU reads.
 */

import type { GLContext } from "./context.js";

export interface FBOPair {
  read: WebGLTexture;
  write: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
}

export class PingPongFBO {
  private gl: WebGL2RenderingContext;
  private _textures: [WebGLTexture, WebGLTexture] | null = null;
  private _fbo: WebGLFramebuffer | null = null;
  private _width = 0;
  private _height = 0;
  private _swap = false;

  constructor(private ctx: GLContext) {
    this.gl = ctx.context;
  }

  get width(): number {
    return this._width;
  }

  get height(): number {
    return this._height;
  }

  get readTexture(): WebGLTexture {
    if (!this._textures) throw new Error("FBO not initialized");
    return this._swap ? this._textures[1] : this._textures[0];
  }

  get writeTexture(): WebGLTexture {
    if (!this._textures) throw new Error("FBO not initialized");
    return this._swap ? this._textures[0] : this._textures[1];
  }

  get framebuffer(): WebGLFramebuffer {
    if (!this._fbo) throw new Error("FBO not initialized");
    return this._fbo;
  }

  init(width: number, height: number): void {
    this._width = width;
    this._height = height;
    this._swap = false;

    // Clean up old resources
    this.dispose();

    const gl = this.gl;

    // Create two textures
    const tex0 = this._createTexture(width, height);
    const tex1 = this._createTexture(width, height);
    this._textures = [tex0, tex1];

    // Create FBO
    this._fbo = gl.createFramebuffer();
    if (!this._fbo) throw new Error("Failed to create framebuffer");

    // Attach initial texture
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      tex0,
      0
    );

    // Check completeness
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("Framebuffer incomplete");
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  swap(): void {
    this._swap = !this._swap;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.writeTexture,
      0
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  bindWrite(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.writeTexture,
      0
    );
    gl.viewport(0, 0, this._width, this._height);
  }

  bindRead(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this._width, this._height);
  }

  private _createTexture(width: number, height: number): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture();
    if (!tex) throw new Error("Failed to create texture");

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    return tex;
  }

  dispose(): void {
    const gl = this.gl;
    if (this._textures) {
      gl.deleteTexture(this._textures[0]);
      gl.deleteTexture(this._textures[1]);
      this._textures = null;
    }
    if (this._fbo) {
      gl.deleteFramebuffer(this._fbo);
      this._fbo = null;
    }
  }
}
