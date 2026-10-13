/**
 * @layers/cores — Shader core implementations
 *
 * Each core is a self-contained GLSL shader with:
 * - Uniform parameters matching the effect-stack schema
 * - A compile() method that returns a WebGLProgram
 * - A setUniforms() method for per-frame updates
 */

export { PatternDitherCore, type PatternDitherParams } from "./pattern-dither.js";
export { NoiseGrainCore, type NoiseGrainParams } from "./noise-grain.js";
export { BlurCore, type BlurParams } from "./blur.js";
export { ColorBlendCore, type ColorBlendParams } from "./color-blend.js";
export { DisplacementCore, type DisplacementParams } from "./displacement.js";
export { LightingCore, type LightingParams } from "./lighting.js";
export { OutlineCore, type OutlineParams } from "./outline.js";
