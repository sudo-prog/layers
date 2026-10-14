// WebGPU type declarations for TypeScript
// These types are not yet in the default TypeScript lib.dom.d.ts

interface GPU {
  requestAdapter(options?: GPURequestAdapterOptions): Promise<GPUAdapter | null>;
  getPreferredCanvasFormat(): GPUTextureFormat;
}

interface GPURequestAdapterOptions {
  powerPreference?: GPUPowerPreference;
}

type GPUPowerPreference = 'low-power' | 'high-performance';

interface GPUAdapter {
  requestDevice(descriptor?: GPUDeviceDescriptor): Promise<GPUDevice>;
}

interface GPUDeviceDescriptor {
  label?: string;
  requiredFeatures?: GPUFeatureName[];
  requiredLimits?: Record<string, number>;
}

type GPUFeatureName = string;

interface GPUDevice {
  createBindGroupLayout(descriptor: GPUBindGroupLayoutDescriptor): GPUBindGroupLayout;
  createRenderPipeline(descriptor: GPURenderPipelineDescriptor): GPURenderPipeline;
  createShaderModule(descriptor: GPUShaderModuleDescriptor): GPUShaderModule;
  createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer;
  createTexture(descriptor: GPUTextureDescriptor): GPUTexture;
  queue: GPUQueue;
  lost: Promise<GPUDeviceLostInfo>;
}

interface GPUBindGroupLayoutDescriptor {
  label?: string;
  entries: GPUBindGroupLayoutEntry[];
}

interface GPUBindGroupLayoutEntry {
  binding: number;
  visibility: number;
  buffer?: GPUBufferBindingLayout;
  sampler?: GPUSamplerBindingLayout;
  texture?: GPUTextureBindingLayout;
  storageTexture?: GPUStorageTextureBindingLayout;
}

interface GPUBufferBindingLayout {
  type?: 'uniform' | 'storage' | 'read-only-storage';
  hasDynamicOffset?: boolean;
  minBindingSize?: number;
}

interface GPUSamplerBindingLayout {
  type?: 'filtering' | 'non-filtering' | 'comparison';
}

interface GPUTextureBindingLayout {
  sampleType?: 'float' | 'unfilterable-float' | 'depth' | 'sint' | 'uint';
  viewDimension?: '1d' | '2d' | '2d-array' | 'cube' | 'cube-array' | '3d';
  multisampled?: boolean;
}

interface GPUStorageTextureBindingLayout {
  access?: 'write-only';
  format: GPUTextureFormat;
  viewDimension?: '1d' | '2d' | '2d-array' | 'cube' | 'cube-array' | '3d';
}

interface GPUBindGroupLayout {
  label?: string;
}

interface GPURenderPipelineDescriptor {
  label?: string;
  layout: GPUPipelineLayout | 'auto';
  vertex: GPUVertexState;
  fragment?: GPUFragmentState;
  primitive?: GPUPrimitiveState;
  depthStencil?: GPUDepthStencilState;
  multisample?: GPUMultisampleState;
}

interface GPUPipelineLayout {
  label?: string;
}

interface GPUVertexState {
  module: GPUShaderModule;
  entryPoint: string;
  buffers?: GPUVertexBufferLayout[];
}

interface GPUVertexBufferLayout {
  arrayStride: number;
  stepMode?: 'vertex' | 'instance';
  attributes: GPUVertexAttribute[];
}

interface GPUVertexAttribute {
  format: GPUVertexFormat;
  offset: number;
  shaderLocation: number;
}

type GPUVertexFormat =
  | 'uint8x2' | 'uint8x4' | 'sint8x2' | 'sint8x4'
  | 'unorm8x2' | 'unorm8x4' | 'snorm8x2' | 'snorm8x4'
  | 'uint16x2' | 'uint16x4' | 'sint16x2' | 'sint16x4'
  | 'unorm16x2' | 'unorm16x4' | 'snorm16x2' | 'snorm16x4'
  | 'float16x2' | 'float16x4' | 'float32' | 'float32x2'
  | 'float32x3' | 'float32x4' | 'uint32' | 'uint32x2'
  | 'uint32x3' | 'uint32x4' | 'sint32' | 'sint32x2'
  | 'sint32x3' | 'sint32x4';

interface GPUFragmentState {
  module: GPUShaderModule;
  entryPoint: string;
  targets: GPUColorTargetState[];
}

interface GPUColorTargetState {
  format: GPUTextureFormat;
  blend?: GPUBlendState;
  writeMask?: number;
}

interface GPUBlendState {
  color: GPUBlendComponent;
  alpha: GPUBlendComponent;
}

interface GPUBlendComponent {
  srcFactor?: GPUBlendFactor;
  dstFactor?: GPUBlendFactor;
  operation?: GPUBlendOperation;
}

type GPUBlendFactor =
  | 'zero' | 'one' | 'src' | 'one-minus-src'
  | 'src-alpha' | 'one-minus-src-alpha'
  | 'dst' | 'one-minus-dst'
  | 'dst-alpha' | 'one-minus-dst-alpha'
  | 'src-alpha-saturated'
  | 'constant' | 'one-minus-constant';

type GPUBlendOperation = 'add' | 'subtract' | 'reverse-subtract' | 'min' | 'max';

interface GPUPrimitiveState {
  topology?: 'point-list' | 'line-list' | 'line-strip' | 'triangle-list' | 'triangle-strip';
  stripIndexFormat?: GPUIndexFormat;
  frontFace?: 'ccw' | 'cw';
  cullMode?: 'none' | 'front' | 'back';
  unclippedDepth?: boolean;
}

type GPUIndexFormat = 'uint16' | 'uint32';

interface GPUDepthStencilState {
  format: GPUTextureFormat;
  depthWriteEnabled: boolean;
  depthCompare: GPUCompareFunction;
  stencilFront?: GPUStencilFaceState;
  stencilBack?: GPUStencilFaceState;
  stencilReadMask?: number;
  stencilWriteMask?: number;
  depthBias?: number;
  depthBiasSlopeScale?: number;
  depthBiasClamp?: number;
}

type GPUCompareFunction =
  | 'never' | 'less' | 'equal' | 'less-equal'
  | 'greater' | 'not-equal' | 'greater-equal' | 'always';

interface GPUStencilFaceState {
  compare?: GPUCompareFunction;
  failOp?: GPUStencilOperation;
  depthFailOp?: GPUStencilOperation;
  passOp?: GPUStencilOperation;
}

type GPUStencilOperation = 'keep' | 'zero' | 'replace' | 'invert' | 'increment-clamp' | 'decrement-clamp' | 'increment-wrap' | 'decrement-wrap';

interface GPUMultisampleState {
  count?: number;
  mask?: number;
  alphaToCoverageEnabled?: boolean;
}

interface GPURenderPipeline {
  label?: string;
  getBindGroupLayout(index: number): GPUBindGroupLayout;
}

interface GPUShaderModule {
  label?: string;
}

interface GPUShaderModuleDescriptor {
  label?: string;
  code: string;
}

interface GPUBuffer {
  label?: string;
}

interface GPUBufferDescriptor {
  label?: string;
  size: number;
  usage: number;
  mappedAtCreation?: boolean;
}

interface GPUTexture {
  label?: string;
}

interface GPUTextureDescriptor {
  label?: string;
  size: GPUExtent3D;
  format: GPUTextureFormat;
  usage: number;
}

interface GPUExtent3D {
  width: number;
  height?: number;
  depthOrArrayLayers?: number;
}

type GPUTextureFormat = string;

interface GPUQueue {
  submit(commandBuffers: GPUCommandBuffer[]): void;
  writeBuffer(buffer: GPUBuffer, bufferOffset: number, data: SharedArrayBuffer | ArrayBuffer): void;
}

interface GPUCommandBuffer {
  label?: string;
}

interface GPUDeviceLostInfo {
  reason: string;
  message: string;
}

interface GPUCanvasContext {
  configure(configuration: GPUCanvasConfiguration): void;
  unconfigure(): void;
  getCurrentTexture(): GPUTexture;
}

interface GPUCanvasConfiguration {
  device: GPUDevice;
  format: GPUTextureFormat;
  usage?: number;
  alphaMode?: 'opaque' | 'premultiplied';
}

interface Navigator {
  readonly gpu?: GPU;
}
