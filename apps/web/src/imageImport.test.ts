// @vitest-environment jsdom
/**
 * Tests for camera / photo import (Stage 0.6 Feature 3).
 *
 * createImageBitmap and URL.createObjectURL are mocked so the decode
 * paths run under jsdom.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  openCamera,
  openFilePicker,
  loadImageAsSource,
  type ImageSource,
} from "./imageImport";

// ── Mocks ────────────────────────────────────────────────────────────────

class FakeBitmap {
  width: number;
  height: number;
  closed = false;
  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
  }
  close() {
    this.closed = true;
  }
}

function mockObjectURL(): void {
  const createdUrls: string[] = [];
  const revokeSpy = vi.fn((url: string) => {
    const idx = createdUrls.indexOf(url);
    if (idx >= 0) createdUrls.splice(idx, 1);
  });
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => {
      const url = `blob:mock-${createdUrls.length}`;
      createdUrls.push(url);
      return url;
    }),
    revokeObjectURL: revokeSpy,
  });
  return revokeSpy;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function makeFile(name = "photo.jpg", type = "image/jpeg"): File {
  return new File(["binarydata"], name, { type });
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("openCamera / openFilePicker", () => {
  let createdInputs: HTMLInputElement[];

  beforeEach(() => {
    createdInputs = [];
    // Spy on input creation so we can inspect attributes and simulate clicks.
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string, options?: ElementCreationOptions) => {
      const el = origCreate(tag, options);
      if (tag === "input") createdInputs.push(el as HTMLInputElement);
      return el;
    });
    // Auto-resolve with no file when clicked (simulates a cancelled picker).
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
      // No `change` event → promise stays pending; tests that need a file
      // dispatch the event manually.
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("openCamera sets the capture attribute to environment", async () => {
    const promise = openCamera();
    const input = createdInputs[createdInputs.length - 1];
    expect(input.type).toBe("file");
    expect(input.accept).toBe("image/*");
    expect(input.getAttribute("capture")).toBe("environment");

    // Simulate the user choosing a file.
    Object.defineProperty(input, "files", { value: [makeFile()], configurable: true });
    input.dispatchEvent(new Event("change"));
    await expect(promise).resolves.toBeInstanceOf(File);
  });

  it("openFilePicker does not set the capture attribute", async () => {
    const promise = openFilePicker();
    const input = createdInputs[createdInputs.length - 1];
    expect(input.type).toBe("file");
    expect(input.accept).toBe("image/*");
    expect(input.getAttribute("capture")).toBeNull();

    Object.defineProperty(input, "files", { value: [makeFile()], configurable: true });
    input.dispatchEvent(new Event("change"));
    await expect(promise).resolves.toBeInstanceOf(File);
  });

  it("resolves null when the picker is cancelled", async () => {
    const promise = openCamera();
    const input = createdInputs[createdInputs.length - 1];
    input.dispatchEvent(new Event("cancel"));
    await expect(promise).resolves.toBeNull();
  });
});

describe("loadImageAsSource", () => {
  let revokeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    revokeSpy = mockObjectURL();
    // jsdom doesn't support canvas 2D — mock getContext.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      canvas: document.createElement("canvas"),
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("downscales a large image to <=1024 on the long edge", async () => {
    const bitmap = new FakeBitmap(4000, 2000);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));

    const result = await loadImageAsSource(makeFile());
    expect(result.width).toBe(1024);
    expect(result.height).toBe(512);
    // Long edge must be exactly 1024, aspect preserved.
    expect(Math.max(result.width, result.height)).toBe(1024);
    expect(result.canvas.width).toBe(1024);
    expect(result.canvas.height).toBe(512);
  });

  it("preserves aspect ratio when downscaling", async () => {
    const bitmap = new FakeBitmap(1000, 3000);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));

    const result = await loadImageAsSource(makeFile());
    // Long edge (3000) scaled to 1024; short edge 1000 → ~341.
    expect(result.width).toBe(341);
    expect(result.height).toBe(1024);
  });

  it("leaves a small image untouched", async () => {
    const bitmap = new FakeBitmap(512, 256);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));

    const result = await loadImageAsSource(makeFile());
    expect(result.width).toBe(512);
    expect(result.height).toBe(256);
  });

  it("closes the bitmap after drawing", async () => {
    const bitmap = new FakeBitmap(2000, 2000);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));

    await loadImageAsSource(makeFile());
    expect(bitmap.closed).toBe(true);
  });

  it("revokes the object URL on the fallback (Image) path", async () => {
    // Force the fallback by making createImageBitmap throw.
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new Error("not supported");
      }),
    );

    class FakeImage {
      onload: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      set src(_v: string) {
        setTimeout(() => this.onload?.(), 0);
      }
    }
    vi.stubGlobal("Image", FakeImage);

    const result = await loadImageAsSource(makeFile());
    expect(result).toBeDefined();
    // The fallback must revoke the object URL it created.
    expect(revokeSpy).toHaveBeenCalledTimes(1);
    expect(revokeSpy.mock.calls[0][0]).toMatch(/^blob:mock-/);
  });

  it("revokes the object URL when the Image fallback fails to decode", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new Error("not supported");
      }),
    );

    class FailingImage {
      onload: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      set src(_v: string) {
        setTimeout(() => this.onerror?.(new Error("decode failed")), 0);
      }
    }
    vi.stubGlobal("Image", FailingImage);

    await expect(loadImageAsSource(makeFile())).rejects.toThrow("Could not decode image file");
    expect(revokeSpy).toHaveBeenCalledTimes(1);
  });
});
