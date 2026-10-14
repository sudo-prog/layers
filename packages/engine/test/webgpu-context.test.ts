import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isWebGPUSupported,
  createContext,
  type WebGPUContext,
} from "../src/webgpu-context.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function createMockGPUDevice() {
  return {
    createBindGroupLayout: vi.fn().mockReturnValue({ id: "bgl" }),
    createRenderPipeline: vi.fn().mockReturnValue({ id: "pipeline" }),
  };
}

function createMockGPUAdapter(device: unknown) {
  return {
    requestDevice: vi.fn().mockResolvedValue(device),
  };
}

// ── isWebGPUSupported ───────────────────────────────────────────────────────

describe("isWebGPUSupported", () => {
  it("returns false when navigator.gpu is undefined", () => {
    vi.stubGlobal("navigator", { gpu: undefined });
    expect(isWebGPUSupported()).toBe(false);
  });

  it("returns true when navigator.gpu is defined", () => {
    vi.stubGlobal("navigator", { gpu: {} });
    expect(isWebGPUSupported()).toBe(true);
  });

  it("returns false when navigator itself is undefined", () => {
    vi.stubGlobal("navigator", undefined);
    expect(isWebGPUSupported()).toBe(false);
  });
});

// ── createContext — null cases ─────────────────────────────────────────────

describe("createContext — returns null when WebGPU unavailable", () => {
  it("returns null when navigator.gpu is undefined", async () => {
    vi.stubGlobal("navigator", { gpu: undefined });
    const canvas = document.createElement("canvas");
    const result = await createContext(canvas);
    expect(result).toBeNull();
  });

  it("returns null when requestAdapter returns null", async () => {
    vi.stubGlobal("navigator", {
      gpu: {
        requestAdapter: vi.fn().mockResolvedValue(null),
      },
    });
    const canvas = document.createElement("canvas");
    const result = await createContext(canvas);
    expect(result).toBeNull();
  });

  it("returns null when canvas.getContext('webgpu') returns null", async () => {
    const mockDevice = createMockGPUDevice();
    vi.stubGlobal("navigator", {
      gpu: {
        requestAdapter: vi.fn().mockResolvedValue(
          createMockGPUAdapter(mockDevice)
        ),
        getPreferredCanvasFormat: vi.fn().mockReturnValue("bgra8unorm"),
      },
    });
    const canvas = document.createElement("canvas");
    canvas.getContext = vi.fn().mockReturnValue(null) as unknown as typeof canvas.getContext;
    const result = await createContext(canvas);
    expect(result).toBeNull();
  });

  it("returns null when requestAdapter throws", async () => {
    vi.stubGlobal("navigator", {
      gpu: {
        requestAdapter: vi.fn().mockRejectedValue(new Error("no adapter")),
      },
    });
    const canvas = document.createElement("canvas");
    const result = await createContext(canvas);
    expect(result).toBeNull();
  });
});

// ── createContext — success case ───────────────────────────────────────────

describe("createContext — returns WebGPUContext when available", () => {
  function setupMockGPU() {
    const mockDevice = createMockGPUDevice();
    const mockAdapter = createMockGPUAdapter(mockDevice);
    const mockCanvasContext = { configure: vi.fn() };
    const canvas = document.createElement("canvas");
    canvas.getContext = vi
      .fn()
      .mockReturnValue(mockCanvasContext) as unknown as typeof canvas.getContext;

    vi.stubGlobal("navigator", {
      gpu: {
        requestAdapter: vi.fn().mockResolvedValue(mockAdapter),
        getPreferredCanvasFormat: vi.fn().mockReturnValue("bgra8unorm"),
      },
    });

    return { mockDevice, mockAdapter, mockCanvasContext, canvas };
  }

  it("returns a context with device and format", async () => {
    const { mockDevice, canvas } = setupMockGPU();
    const result = await createContext(canvas);
    expect(result).not.toBeNull();
    expect(result!.device).toBe(mockDevice);
    expect(result!.format).toBe("bgra8unorm");
  });

  it("configures the canvas context with device and format", async () => {
    const { mockDevice, mockCanvasContext, canvas } = setupMockGPU();
    await createContext(canvas);
    expect(mockCanvasContext.configure).toHaveBeenCalledWith(
      expect.objectContaining({
        device: mockDevice,
        format: "bgra8unorm",
      })
    );
  });

  it("exposes createBindGroupLayout and createPipeline as functions", async () => {
    const { canvas } = setupMockGPU();
    const result = await createContext(canvas);
    expect(typeof result!.createBindGroupLayout).toBe("function");
    expect(typeof result!.createPipeline).toBe("function");
  });
});

// ── WebGPUContext method delegation ─────────────────────────────────────────

describe("WebGPUContext method delegation", () => {
  function setupMockGPU() {
    const mockDevice = createMockGPUDevice();
    const mockAdapter = createMockGPUAdapter(mockDevice);
    const mockCanvasContext = { configure: vi.fn() };
    const canvas = document.createElement("canvas");
    canvas.getContext = vi
      .fn()
      .mockReturnValue(mockCanvasContext) as unknown as typeof canvas.getContext;

    vi.stubGlobal("navigator", {
      gpu: {
        requestAdapter: vi.fn().mockResolvedValue(mockAdapter),
        getPreferredCanvasFormat: vi.fn().mockReturnValue("bgra8unorm"),
      },
    });

    return { mockDevice, mockAdapter, mockCanvasContext, canvas };
  }

  it("createBindGroupLayout delegates to device.createBindGroupLayout", async () => {
    const { mockDevice, canvas } = setupMockGPU();
    const ctx = await createContext(canvas);
    const descriptor = { bindings: [] } as GPUBindGroupLayoutDescriptor;
    ctx!.createBindGroupLayout(descriptor);
    expect(mockDevice.createBindGroupLayout).toHaveBeenCalledWith(descriptor);
  });

  it("createPipeline delegates to device.createRenderPipeline", async () => {
    const { mockDevice, canvas } = setupMockGPU();
    const ctx = await createContext(canvas);
    const descriptor = {} as GPURenderPipelineDescriptor;
    ctx!.createPipeline(descriptor);
    expect(mockDevice.createRenderPipeline).toHaveBeenCalledWith(descriptor);
  });
});