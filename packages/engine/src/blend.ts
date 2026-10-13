/**
 * Blend composite pass.
 *
 * Combines the current pass output with the previous pass output using
 * the specified blend mode. Supports all 14 blend modes from the
 * effect-stack schema.
 */

import type { GLContext } from "./context.js";
import type { Pass, PassParams } from "./pass.js";
import { QUAD_VERTEX_SHADER, createQuadVAO, createPassUniforms } from "./pass.js";

export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "soft-light"
  | "hard-light"
  | "color-dodge"
  | "color-burn"
  | "darken"
  | "lighten"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity";

const BLEND_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D uTexture;
uniform sampler2D uMask;
uniform float uOpacity;
uniform vec2 uResolution;
uniform float uTime;
uniform int uBlendMode;

in vec2 vTexCoord;
out vec4 fragColor;

vec3 blendNormal(vec3 base, vec3 blend) { return blend; }
vec3 blendMultiply(vec3 base, vec3 blend) { return base * blend; }
vec3 blendScreen(vec3 base, vec3 blend) { return 1.0 - (1.0 - base) * (1.0 - blend); }
vec3 blendOverlay(vec3 base, vec3 blend) {
  return mix(2.0 * base * blend, 1.0 - 2.0 * (1.0 - base) * (1.0 - blend), step(0.5, base));
}
vec3 blendSoftLight(vec3 base, vec3 blend) {
  return mix(2.0 * base * blend + base * base * (1.0 - 2.0 * blend),
             sqrt(base) * (2.0 * blend - 1.0) + 2.0 * base * (1.0 - blend),
             step(0.5, blend));
}
vec3 blendHardLight(vec3 base, vec3 blend) {
  return mix(2.0 * base * blend, 1.0 - 2.0 * (1.0 - base) * (1.0 - blend), step(0.5, blend));
}
vec3 blendColorDodge(vec3 base, vec3 blend) {
  return min(base / (1.0 - blend + 0.001), vec3(1.0));
}
vec3 blendColorBurn(vec3 base, vec3 blend) {
  return 1.0 - min((1.0 - base) / (blend + 0.001), vec3(1.0));
}
vec3 blendDarken(vec3 base, vec3 blend) { return min(base, blend); }
vec3 blendLighten(vec3 base, vec3 blend) { return max(base, blend); }
vec3 blendDifference(vec3 base, vec3 blend) { return abs(base - blend); }
vec3 blendExclusion(vec3 base, vec3 blend) { return base + blend - 2.0 * base * blend; }

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec3 blendHue(vec3 base, vec3 blend) {
  vec3 hsv = rgb2hsv(blend);
  vec3 baseHsv = rgb2hsv(base);
  return hsv2rgb(vec3(hsv.x, baseHsv.y, baseHsv.z));
}
vec3 blendSaturation(vec3 base, vec3 blend) {
  vec3 hsv = rgb2hsv(blend);
  vec3 baseHsv = rgb2hsv(base);
  return hsv2rgb(vec3(baseHsv.x, hsv.y, baseHsv.z));
}
vec3 blendColor(vec3 base, vec3 blend) {
  vec3 hsv = rgb2hsv(blend);
  vec3 baseHsv = rgb2hsv(base);
  return hsv2rgb(vec3(hsv.x, hsv.y, baseHsv.z));
}
vec3 blendLuminosity(vec3 base, vec3 blend) {
  vec3 hsv = rgb2hsv(blend);
  vec3 baseHsv = rgb2hsv(base);
  return hsv2rgb(vec3(baseHsv.x, baseHsv.y, hsv.z));
}

void main() {
  vec4 base = texture(uTexture, vTexCoord);
  vec4 blend = texture(uMask, vTexCoord);

  vec3 result;
  switch (uBlendMode) {
    case 0: result = blendNormal(base.rgb, blend.rgb); break;
    case 1: result = blendMultiply(base.rgb, blend.rgb); break;
    case 2: result = blendScreen(base.rgb, blend.rgb); break;
    case 3: result = blendOverlay(base.rgb, blend.rgb); break;
    case 4: result = blendSoftLight(base.rgb, blend.rgb); break;
    case 5: result = blendHardLight(base.rgb, blend.rgb); break;
    case 6: result = blendColorDodge(base.rgb, blend.rgb); break;
    case 7: result = blendColorBurn(base.rgb, blend.rgb); break;
    case 8: result = blendDarken(base.rgb, blend.rgb); break;
    case 9: result = blendLighten(base.rgb, blend.rgb); break;
    case 10: result = blendDifference(base.rgb, blend.rgb); break;
    case 11: result = blendExclusion(base.rgb, blend.rgb); break;
    case 12: result = blendHue(base.rgb, blend.rgb); break;
    case 13: result = blendSaturation(base.rgb, blend.rgb); break;
    case 14: result = blendColor(base.rgb, blend.rgb); break;
    case 15: result = blendLuminosity(base.rgb, blend.rgb); break;
    default: result = blend.rgb; break;
  }

  fragColor = vec4(result, base.a * uOpacity);
}
`;

const BLEND_MODE_MAP: Record<BlendMode, number> = {
  "normal": 0,
  "multiply": 1,
  "screen": 2,
  "overlay": 3,
  "soft-light": 4,
  "hard-light": 5,
  "color-dodge": 6,
  "color-burn": 7,
  "darken": 8,
  "lighten": 9,
  "difference": 10,
  "exclusion": 11,
  "hue": 12,
  "saturation": 13,
  "color": 14,
  "luminosity": 15,
};

export class BlendPass implements Pass {
  readonly id = "blend-composite";
  readonly name = "Blend Composite";
  enabled = true;

  private _program: WebGLProgram | null = null;
  private _vao: WebGLVertexArrayObject | null = null;
  private _uniforms: ReturnType<typeof createPassUniforms> | null = null;
  private _blendMode: BlendMode = "normal";

  constructor(blendMode: BlendMode = "normal") {
    this._blendMode = blendMode;
  }

  getFragmentShader(): string {
    return BLEND_FRAGMENT_SHADER;
  }

  getVertexShader(): string {
    return QUAD_VERTEX_SHADER;
  }

  compile(gl: WebGL2RenderingContext): WebGLProgram | null {
    const vs = this._compileShader(gl, gl.VERTEX_SHADER, QUAD_VERTEX_SHADER);
    const fs = this._compileShader(gl, gl.FRAGMENT_SHADER, BLEND_FRAGMENT_SHADER);
    if (!vs || !fs) return null;

    const program = gl.createProgram();
    if (!program) return null;

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Blend program link error:", gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }

    this._program = program;
    this._vao = createQuadVAO(gl);
    this._uniforms = createPassUniforms(gl, program);

    gl.deleteShader(vs);
    gl.deleteShader(fs);

    return program;
  }

  setUniforms(gl: WebGL2RenderingContext, program: WebGLProgram, params: PassParams, time: number): void {
    if (!this._uniforms) return;

    gl.uniform1i(this._uniforms.uTexture, 0);
    gl.uniform1i(this._uniforms.uMask, 1);
    gl.uniform1f(this._uniforms.uOpacity, params.opacity);
    gl.uniform2f(this._uniforms.uResolution, gl.canvas.width, gl.canvas.height);
    gl.uniform1f(this._uniforms.uTime, time);
    gl.uniform1i(gl.getUniformLocation(program, "uBlendMode"), BLEND_MODE_MAP[this._blendMode]);
  }

  private _compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Shader compile error:", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  dispose(gl: WebGL2RenderingContext): void {
    if (this._program) gl.deleteProgram(this._program);
    if (this._vao) gl.deleteVertexArray(this._vao);
    this._program = null;
    this._vao = null;
    this._uniforms = null;
  }
}
