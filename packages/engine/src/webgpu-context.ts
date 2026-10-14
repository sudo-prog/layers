/**
 * WebGPU detection and context creation.
 *
 * Exposes a factory that returns a WebGPUContext when WebGPU is available,
 * or null so the caller can fall back to WebGL2.
 */

export interface WebGPUContext {
  /** The GPUDevice obtained from the adapter. */
  device: GPUDevice;
  /** The preferred canvas pixel format (e.g. "bgra8unorm"). */
  format: GPUTextureFormat;
  /** Delegates to device.createBindGroupLayout. */
  createBindGroupLayout(
    descriptor: GPUBindGroupLayoutDescriptor
  ): GPUBindGroupLayout;
  /** Delegates to device.createRenderPipeline. */
  createPipeline(descriptor: GPURenderPipelineDescriptor): GPURenderPipeline;
}

/**
 * Feature-detect WebGPU support. Returns true if `navigator.gpu` is defined.
 */
export function isWebGPUSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.gpu !== "undefined";
}

/**
 * Create a WebGPU context for the given canvas.
 *
 * Returns a WebGPUContext when WebGPU is available and an adapter/device
 * can be acquired, or null when:
 *   - navigator.gpu is not defined
 *   - requestAdapter returns null or throws
 *   - the canvas cannot produce a "webgpu" context
 */
export async function createContext(
  canvas: HTMLCanvasElement
): Promise<WebGPUContext | null> {
  if (!isWebGPUSupported()) return null;

  const gpu = (navigator as Navigator & { gpu: GPU }).gpu;

  let adapter: GPUAdapter | null = null;
  try {
    adapter = await gpu.requestAdapter();
  } catch {
    return null;
  }

  if (!adapter) return null;

  let device: GPUDevice;
  try {
    device = await adapter.requestDevice();
  } catch {
    return null;
  }

  const gpuContext = canvas.getContext("webgpu") as GPUCanvasContext | null;
  if (!gpuContext) return null;

  const format = gpu.getPreferredCanvasFormat();
  gpuContext.configure({
    device,
    format,
    alphaMode: "opaque",
  });

  return {
    device,
    format,
    createBindGroupLayout(descriptor) {
      return device.createBindGroupLayout(descriptor);
    },
    createPipeline(descriptor) {
      return device.createRenderPipeline(descriptor);
    },
  };
}