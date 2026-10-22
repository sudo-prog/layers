/**
 * @layers/engine — WebGL2 multi-pass render engine
 */

export { GLContext, type ContextOptions } from "./context.js";
export { PingPongFBO, type FBOPair } from "./fbo.js";
export {
  type Pass,
  type PassParams,
  type PassUniforms,
  QUAD_VERTEX_SHADER,
  createQuadVAO,
  createPassUniforms,
} from "./pass.js";
export { BlendPass, type BlendMode } from "./blend.js";
export { Renderer, type RendererOptions } from "./renderer.js";
export {
  ShaderCompileCache,
  computeShaderHash,
  base64ToArrayBuffer,
  type ShaderCacheEntry,
} from "./shader-compile-cache.js";
export {
  AdaptiveQuality,
  type AdaptiveQualityOptions,
} from "./adaptive-quality.js";
export {
  createDynamicDriver,
  hasDynamicProps,
  isDynamicProp,
  applyCurve,
  applyReach,
  pingPong,
  sawtooth,
  ease,
  clamp01,
  lerp,
  type DynamicProp,
  type DynamicDriver,
  type DriverInput,
  type DriverStackItem,
  type DriverOptions,
  type EasingName,
} from "./dynamic-driver.js";
