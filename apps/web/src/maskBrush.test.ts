// @vitest-environment jsdom
/**
 * Tests for mask brush system (Stage 0.5 Feature 2)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMaskBrush,
  type MaskBrush,
  type MaskData,
} from "./maskBrush";

// Mock canvas 2D context for jsdom
function createMockCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const mockCtx = {
    canvas,
    globalCompositeOperation: "source-over" as GlobalCompositeOperation,
    fillStyle: "" as string | CanvasGradient | CanvasPattern,
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn((x: number, y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    })),
    putImageData: vi.fn(),
    createImageData: vi.fn((w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    })),
  };
  return mockCtx as unknown as CanvasRenderingContext2D;
}

describe("mask brush", () => {
  let brush: MaskBrush;
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;

  beforeEach(() => {
    canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    // Override getContext to return a mock
    const mockCtx = createMockCanvasContext(canvas);
    vi.spyOn(canvas, "getContext").mockReturnValue(mockCtx);
    // Override toDataURL
    vi.spyOn(canvas, "toDataURL").mockReturnValue("data:image/png;base64,mockdata");
    ctx = mockCtx;
    brush = createMaskBrush(canvas);
  });

  describe("createMaskBrush", () => {
    it("creates a mask brush with default settings", () => {
      expect(brush).toBeDefined();
      expect(brush.getSize()).toBe(20);
      expect(brush.getOpacity()).toBe(0.5);
      expect(brush.getMode()).toBe("paint");
    });
  });

  describe("setSize", () => {
    it("sets the brush size", () => {
      brush.setSize(50);
      expect(brush.getSize()).toBe(50);
    });

    it("clamps size to minimum 1", () => {
      brush.setSize(0);
      expect(brush.getSize()).toBe(1);
    });

    it("clamps size to maximum 200", () => {
      brush.setSize(300);
      expect(brush.getSize()).toBe(200);
    });
  });

  describe("setOpacity", () => {
    it("sets the brush opacity", () => {
      brush.setOpacity(0.8);
      expect(brush.getOpacity()).toBe(0.8);
    });

    it("clamps opacity to 0-1 range", () => {
      brush.setOpacity(-0.5);
      expect(brush.getOpacity()).toBe(0);
      brush.setOpacity(1.5);
      expect(brush.getOpacity()).toBe(1);
    });
  });

  describe("setMode", () => {
    it("sets the brush mode", () => {
      brush.setMode("erase");
      expect(brush.getMode()).toBe("erase");
      brush.setMode("paint");
      expect(brush.getMode()).toBe("paint");
    });
  });

  describe("paint", () => {
    it("paints on the canvas in paint mode", () => {
      brush.setMode("paint");
      brush.paint(100, 100);
      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.beginPath).toHaveBeenCalled();
      expect(ctx.arc).toHaveBeenCalledWith(100, 100, 10, 0, Math.PI * 2);
      expect(ctx.fill).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
    });

    it("erases on the canvas in erase mode", () => {
      brush.setMode("erase");
      brush.paint(100, 100);
      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.beginPath).toHaveBeenCalled();
      expect(ctx.arc).toHaveBeenCalled();
      expect(ctx.fill).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
    });
  });

  describe("clear", () => {
    it("clears the entire canvas", () => {
      brush.clear();
      expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 512, 512);
    });
  });

  describe("getMaskData", () => {
    it("returns mask data as base64 PNG", () => {
      // Mock getImageData to return non-zero alpha
      (ctx.getImageData as any).mockReturnValueOnce({
        data: new Uint8ClampedArray([0, 0, 0, 255]),
        width: 1,
        height: 1,
      });
      const data = brush.getMaskData();
      expect(data).toBeDefined();
      expect(typeof data).toBe("string");
      expect(data).toBe("data:image/png;base64,mockdata");
    });

    it("returns null for empty mask", () => {
      const data = brush.getMaskData();
      expect(data).toBeNull();
    });
  });

  describe("loadMaskData", () => {
    it("loads mask data from base64 PNG", async () => {
      // Mock Image to immediately call onload
      const originalImage = global.Image;
      // @ts-expect-error - mocking Image
      global.Image = class {
        onload: (() => void) | null = null;
        onerror: ((e: Event) => void) | null = null;
        set src(_v: string) {
          // Simulate async load
          setTimeout(() => this.onload?.(), 0);
        }
      };
      // Mock getImageData to return non-zero alpha so isEmpty returns false
      (ctx.getImageData as any).mockReturnValue({
        data: new Uint8ClampedArray([0, 0, 0, 255]),
        width: 1,
        height: 1,
      });
      await brush.loadMaskData("data:image/png;base64,mockdata");
      expect(ctx.clearRect).toHaveBeenCalled();
      expect(ctx.drawImage).toHaveBeenCalled();
      global.Image = originalImage;
    });
  });

  describe("isEmpty", () => {
    it("returns true for empty mask", () => {
      expect(brush.isEmpty()).toBe(true);
    });

    it("returns false when getImageData returns non-zero alpha", () => {
      (ctx.getImageData as any).mockReturnValueOnce({
        data: new Uint8ClampedArray([0, 0, 0, 255]),
        width: 1,
        height: 1,
      });
      expect(brush.isEmpty()).toBe(false);
    });
  });
});
