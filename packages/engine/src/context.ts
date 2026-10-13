/**
 * WebGL2 context manager with context-loss recovery.
 *
 * Handles:
 * - Context creation with deterministic flags
 * - Context-loss detection and recovery
 * - Resize handling
 * - GL state tracking
 */

export interface ContextOptions {
  width?: number;
  height?: number;
  preserveDrawingBuffer?: boolean;
  alpha?: boolean;
  antialias?: boolean;
  premultipliedAlpha?: boolean;
}

const DEFAULT_OPTIONS: Required<ContextOptions> = {
  width: 1024,
  height: 1024,
  // alpha:false is the right default for golden-image determinism (the backing
  // store is opaque, so no compositing variance). Cores that need source
  // transparency (e.g. a drop shadow casting from a silhouette) must opt in
  // with { alpha: true } — with alpha:false the alpha channel is forced to 1.0
  // and any alpha-driven effect silently renders blank.
  preserveDrawingBuffer: true,
  alpha: false,
  antialias: false,
  premultipliedAlpha: false,
};

export class GLContext {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private options: Required<ContextOptions>;
  private _lost = false;
  private _onLostCallbacks: Array<() => void> = [];
  private _onRestoredCallbacks: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement, options: ContextOptions = {}) {
    this.canvas = canvas;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.canvas.width = this.options.width;
    this.canvas.height = this.options.height;

    const gl = this.canvas.getContext("webgl2", {
      preserveDrawingBuffer: this.options.preserveDrawingBuffer,
      alpha: this.options.alpha,
      antialias: this.options.antialias,
      premultipliedAlpha: this.options.premultipliedAlpha,
    });

    if (!gl) {
      throw new Error("WebGL2 not supported");
    }

    this.gl = gl;
    this._setupContextLossHandlers();
  }

  get context(): WebGL2RenderingContext {
    return this.gl;
  }

  get width(): number {
    return this.canvas.width;
  }

  get height(): number {
    return this.canvas.height;
  }

  get isLost(): boolean {
    return this._lost;
  }

  onContextLost(cb: () => void): void {
    this._onLostCallbacks.push(cb);
  }

  onContextRestored(cb: () => void): void {
    this._onRestoredCallbacks.push(cb);
  }

  resize(width: number, height: number): void {
    this.options.width = width;
    this.options.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  private _setupContextLossHandlers(): void {
    this.canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this._lost = true;
      for (const cb of this._onLostCallbacks) cb();
    });

    this.canvas.addEventListener("webglcontextrestored", () => {
      this._lost = false;
      // Re-create context attributes
      const gl = this.canvas.getContext("webgl2", {
        preserveDrawingBuffer: this.options.preserveDrawingBuffer,
        alpha: this.options.alpha,
        antialias: this.options.antialias,
        premultipliedAlpha: this.options.premultipliedAlpha,
      });
      if (gl) {
        this.gl = gl;
      }
      for (const cb of this._onRestoredCallbacks) cb();
    });
  }

  dispose(): void {
    // Release all GL resources
    const ext = this.gl.getExtension("WEBGL_lose_context");
    if (ext) ext.loseContext();
  }
}
