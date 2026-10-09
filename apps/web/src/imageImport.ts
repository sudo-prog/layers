/**
 * Camera / photo import — pick a photo (camera or library) and decode it
 * into a canvas the renderer can upload as the source texture.
 *
 * Uses only browser APIs: <input type="file" capture> for camera,
 * createImageBitmap with an Image + object-URL fallback for decoding.
 */

export interface ImageSource {
  canvas: OffscreenCanvas | HTMLCanvasElement;
  width: number;
  height: number;
}

const MAX_EDGE = 1024;

/**
 * Open the device camera (mobile) or a file picker that defaults to the
 * camera on devices that support `capture`. Returns the chosen File, or
 * null when the user cancels.
 */
export function openCamera(): Promise<File | null> {
  return pickFile(true);
}

/**
 * Open a plain file picker for choosing an existing photo. No `capture`
 * attribute, so mobile browsers show the photo library.
 */
export function openFilePicker(): Promise<File | null> {
  return pickFile(false);
}

function pickFile(capture: boolean): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (capture) {
      // Hint to mobile browsers to open the rear camera directly.
      input.setAttribute("capture", "environment");
    }
    input.style.display = "none";

    let settled = false;
    const done = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };

    input.addEventListener("change", () => {
      done(input.files?.[0] ?? null);
    });
    // If the picker is dismissed without a choice, `change` never fires;
    // `cancel` fires on modern browsers. Fall back to a focus check.
    input.addEventListener("cancel", () => done(null));

    document.body.appendChild(input);
    input.click();

    // Safety net: if neither change nor cancel fires (older WebViews),
    // resolve null when focus returns to the window.
    window.addEventListener(
      "focus",
      () => {
        setTimeout(() => {
          if (!settled && (!input.files || input.files.length === 0)) {
            done(null);
          }
        }, 500);
      },
      { once: true },
    );
  });
}

/**
 * Decode a File into a bitmap, downscale so the long edge is at most
 * 1024px (preserving aspect ratio), and draw it onto a canvas.
 *
 * Uses createImageBitmap when available; falls back to an <img> with an
 * object URL (which is revoked afterwards).
 */
export async function loadImageAsSource(file: File): Promise<ImageSource> {
  const bitmap = await decode(file);
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_EDGE);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not acquire 2D canvas context");
    ctx.drawImage(bitmap, 0, 0, width, height);
    return { canvas, width, height };
  } finally {
    // Bitmaps hold native memory; close them when supported.
    if (typeof (bitmap as ImageBitmap).close === "function") {
      (bitmap as ImageBitmap).close();
    }
  }
}

function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file).catch(() => decodeWithImage(file));
  }
  return decodeWithImage(file);
}

function decodeWithImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // The object URL is no longer needed once the image is decoded.
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode image file"));
    };
    img.src = url;
  });
}

function fitWithin(
  srcW: number,
  srcH: number,
  maxEdge: number,
): { width: number; height: number } {
  const longEdge = Math.max(srcW, srcH);
  if (longEdge <= maxEdge) {
    return { width: srcW, height: srcH };
  }
  const scale = maxEdge / longEdge;
  return {
    width: Math.max(1, Math.round(srcW * scale)),
    height: Math.max(1, Math.round(srcH * scale)),
  };
}
