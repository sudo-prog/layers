/**
 * Mask brush system for LAYERS web app (Stage 0.5 Feature 2)
 *
 * Provides a 2D canvas-based mask editor with paint/erase tools,
 * brush size/opacity controls, and base64 PNG serialization.
 */

export type MaskMode = "paint" | "erase";

export interface MaskData {
  width: number;
  height: number;
  dataUrl: string;
}

export interface MaskBrush {
  getSize(): number;
  setSize(size: number): void;
  getOpacity(): number;
  setOpacity(opacity: number): void;
  getMode(): MaskMode;
  setMode(mode: MaskMode): void;
  paint(x: number, y: number): void;
  clear(): void;
  getMaskData(): string | null;
  loadMaskData(dataUrl: string): Promise<void>;
  isEmpty(): boolean;
  getCanvas(): HTMLCanvasElement;
}

/**
 * Creates a mask brush bound to a 2D canvas element.
 */
export function createMaskBrush(canvas: HTMLCanvasElement): MaskBrush {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  let brushSize = 20;
  let brushOpacity = 0.5;
  let mode: MaskMode = "paint";

  function getSize(): number {
    return brushSize;
  }

  function setSize(size: number): void {
    brushSize = Math.max(1, Math.min(200, size));
  }

  function getOpacity(): number {
    return brushOpacity;
  }

  function setOpacity(opacity: number): void {
    brushOpacity = Math.max(0, Math.min(1, opacity));
  }

  function getMode(): MaskMode {
    return mode;
  }

  function setMode(newMode: MaskMode): void {
    mode = newMode;
  }

  function paint(x: number, y: number): void {
    ctx.save();
    if (mode === "paint") {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = `rgba(255, 255, 255, ${brushOpacity})`;
    } else {
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = `rgba(0, 0, 0, ${brushOpacity})`;
    }
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function clear(): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function getMaskData(): string | null {
    if (isEmpty()) return null;
    return canvas.toDataURL("image/png");
  }

  async function loadMaskData(dataUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        resolve();
      };
      img.onerror = () => reject(new Error("Failed to load mask data"));
      img.src = dataUrl;
    });
  }

  function isEmpty(): boolean {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 3; i < imageData.data.length; i += 4) {
      if (imageData.data[i] > 0) return false;
    }
    return true;
  }

  function getCanvas(): HTMLCanvasElement {
    return canvas;
  }

  return {
    getSize,
    setSize,
    getOpacity,
    setOpacity,
    getMode,
    setMode,
    paint,
    clear,
    getMaskData,
    loadMaskData,
    isEmpty,
    getCanvas,
  };
}
