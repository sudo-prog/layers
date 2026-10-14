/**
 * Thumbnail renderer — produces a 128x128 PNG data URL for a preset stack.
 *
 * Uses the real @layers/engine + @layers/cores pipeline so thumbnails are
 * faithful previews of the actual render output. A small offscreen canvas
 * is used; the renderer draws into it and toDataURL() captures the result.
 *
 * For testing, a ThumbnailFactory can be injected to bypass WebGL2 entirely.
 */

import { Renderer, type Pass } from "@layers/engine";
import {
  PatternDitherCore,
  NoiseGrainCore,
  BlurCore,
  ColorBlendCore,
  DisplacementCore,
  LightingCore,
  OutlineCore,
} from "@layers/cores";
import { getEnabledItems, type StackState } from "@layers/stack";

// ── Types ────────────────────────────────────────────────────────────────

export interface ThumbnailFactory {
  /**
   * Create a renderer + canvas pair ready for thumbnail rendering.
   * Returns null when WebGL2 is unavailable (caller handles gracefully).
   */
  createRenderer(): { renderer: Renderer; canvas: HTMLCanvasElement } | null;
}

// ── Core param conversion ────────────────────────────────────────────────

/**
 * Convert a stack item's params into the shape a core constructor expects.
 * Mirrors the logic in main.ts but standalone for the thumbnail path.
 */
function buildCoreParams(
  coreName: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    out[key] = value;
  }
  return out;
}

/**
 * Create a Pass instance for a stack item's core, or null if the core is
 * unknown. Matches the core registry in main.ts.
 */
function createPassForItem(
  core: string,
  params: Record<string, unknown>,
): Pass | null {
  switch (core) {
    case "pattern-dither":
      return new PatternDitherCore(params);
    case "noise-grain":
      return new NoiseGrainCore(params);
    case "blur":
      return new BlurCore(params);
    case "color-blend":
      return new ColorBlendCore(params);
    case "displacement":
      return new DisplacementCore(params);
    case "lighting":
      return new LightingCore(params);
    case "outline":
      return new OutlineCore(params);
    default:
      return null;
  }
}

// ── Default factory ──────────────────────────────────────────────────────

const THUMBNAIL_SIZE = 128;

/**
 * Default factory: creates a real HTMLCanvasElement + Renderer backed by
 * WebGL2. Used in the browser. Returns null when WebGL2 is unavailable.
 */
const defaultFactory: ThumbnailFactory = {
  createRenderer() {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = THUMBNAIL_SIZE;
    canvas.height = THUMBNAIL_SIZE;

    let renderer: Renderer;
    try {
      renderer = new Renderer(canvas, {
        width: THUMBNAIL_SIZE,
        height: THUMBNAIL_SIZE,
        preserveDrawingBuffer: true,
        alpha: false,
        antialias: false,
        premultipliedAlpha: false,
      });
    } catch {
      return null;
    }

    return { renderer, canvas };
  },
};

// ── Render ───────────────────────────────────────────────────────────────

/**
 * Draw a simple gradient + shapes onto a canvas to serve as the source
 * image for thumbnail rendering. Matches the default source in main.ts.
 */
function drawSourceImage(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#ff6b6b");
  grad.addColorStop(0.5, "#feca57");
  grad.addColorStop(1, "#48dbfb");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w * 0.25, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.fillRect(w * 0.2, h * 0.2, w * 0.3, h * 0.3);
}

/**
 * Render a 128x128 thumbnail PNG data URL for the given stack.
 *
 * Returns null when:
 * - WebGL2 is unavailable
 * - The renderer or canvas cannot be created
 * - Any error occurs during rendering
 *
 * An empty stack produces a valid thumbnail (just the source image).
 * Disabled items are skipped; unknown core types are silently ignored.
 */
export function renderThumbnail(
  stack: StackState,
  factory: ThumbnailFactory = defaultFactory,
): string | null {
  try {
    const created = factory.createRenderer();
    if (!created) return null;

    const { renderer, canvas } = created;

    // Draw the source image onto the canvas, then upload it.
    drawSourceImage(canvas);
    renderer.uploadSource(canvas, THUMBNAIL_SIZE, THUMBNAIL_SIZE);

    // Build passes from enabled items only.
    const enabledItems = getEnabledItems(stack);
    for (const item of enabledItems) {
      const pass = createPassForItem(
        item.core,
        buildCoreParams(item.core, item.params),
      );
      if (pass) {
        renderer.addPass(pass);
      }
    }

    renderer.warmUp();
    renderer.render(0);

    const dataUrl = canvas.toDataURL("image/png");

    // Clean up GL resources.
    renderer.dispose();

    return dataUrl;
  } catch {
    return null;
  }
}
