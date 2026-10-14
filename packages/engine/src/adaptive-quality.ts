/**
 * Adaptive quality controller.
 *
 * Monitors a rolling FPS average and adjusts render resolution scale
 * to maintain a target frame rate.
 *
 * Scale steps down when FPS drops below `lowFpsThreshold` for longer
 * than `lowFpsDuration` seconds. Steps back up when FPS exceeds
 * `highFpsThreshold` for longer than `highFpsDuration` seconds.
 */

export interface AdaptiveQualityOptions {
  /** FPS below this triggers step-down after lowFpsDuration */
  lowFpsThreshold?: number;
  /** Seconds below lowFpsThreshold before stepping down */
  lowFpsDuration?: number;
  /** FPS above this triggers step-up after highFpsDuration */
  highFpsThreshold?: number;
  /** Seconds above highFpsThreshold before stepping up */
  highFpsDuration?: number;
  /** Minimum resolution scale */
  minScale?: number;
  /** Maximum resolution scale (native resolution) */
  maxScale?: number;
  /** Amount to step up or down */
  scaleStep?: number;
  /** EMA smoothing factor (0..1), lower = smoother */
  fpsSmoothing?: number;
}

const DEFAULT_OPTIONS: Required<AdaptiveQualityOptions> = {
  lowFpsThreshold: 30,
  lowFpsDuration: 2,
  highFpsThreshold: 45,
  highFpsDuration: 5,
  minScale: 0.5,
  maxScale: 1.0,
  scaleStep: 0.25,
  fpsSmoothing: 0.1,
};

export class AdaptiveQuality {
  private _scale: number;
  private _fpsAvg = 0;
  private _lowTime = 0;
  private _highTime = 0;
  private _opts: Required<AdaptiveQualityOptions>;

  /** Called when scale changes: (newScale, oldScale) */
  onScaleChange: ((newScale: number, oldScale: number) => void) | null = null;

  constructor(options: AdaptiveQualityOptions = {}) {
    this._opts = { ...DEFAULT_OPTIONS, ...options };
    this._scale = this._opts.maxScale;
  }

  /** Current resolution scale (0.5 – 1.0) */
  get scale(): number {
    return this._scale;
  }

  /** Current smoothed FPS average */
  get currentFps(): number {
    return this._fpsAvg;
  }

  /** True when rendering at reduced resolution */
  get isLowQuality(): boolean {
    return this._scale < this._opts.maxScale;
  }

  /**
   * Feed a frame delta time (seconds). Call once per rendered frame.
   */
  frame(dt: number): void {
    if (dt <= 0) return;

    const instantFps = 1 / dt;
    this._fpsAvg =
      this._fpsAvg === 0
        ? instantFps
        : this._fpsAvg * (1 - this._opts.fpsSmoothing) +
          instantFps * this._opts.fpsSmoothing;

    if (this._fpsAvg < this._opts.lowFpsThreshold) {
      this._lowTime += dt;
      this._highTime = 0;
      if (this._lowTime >= this._opts.lowFpsDuration) {
        this._stepDown();
        this._lowTime = 0;
      }
    } else if (this._fpsAvg > this._opts.highFpsThreshold) {
      this._highTime += dt;
      this._lowTime = 0;
      if (this._highTime >= this._opts.highFpsDuration) {
        this._stepUp();
        this._highTime = 0;
      }
    } else {
      this._lowTime = 0;
      this._highTime = 0;
    }
  }

  private _stepDown(): void {
    const oldScale = this._scale;
    this._scale = Math.max(
      this._opts.minScale,
      this._scale - this._opts.scaleStep
    );
    if (this._scale !== oldScale && this.onScaleChange) {
      this.onScaleChange(this._scale, oldScale);
    }
  }

  private _stepUp(): void {
    const oldScale = this._scale;
    this._scale = Math.min(
      this._opts.maxScale,
      this._scale + this._opts.scaleStep
    );
    if (this._scale !== oldScale && this.onScaleChange) {
      this.onScaleChange(this._scale, oldScale);
    }
  }

  /** Reset to max scale and clear all tracking state */
  reset(): void {
    this._scale = this._opts.maxScale;
    this._fpsAvg = 0;
    this._lowTime = 0;
    this._highTime = 0;
  }
}
