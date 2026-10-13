/**
 * Core 5: Color/Palette/Blend
 *
 * Variables: palette, matrix/HSL, blend, opacity
 * Looks: duotone, vintage, LUT
 */

import type { Pass, PassParams } from "@layers/engine";
import { QUAD_VERTEX_SHADER, createQuadVAO, createPassUniforms } from "@layers/engine";

export interface ColorBlendParams {
  palette: [number, number, number][];
  hueShift: number;
  saturation: number;
  brightness: number;
  blend: "normal" | "multiply" | "screen" | "overlay" | "soft-light" | "hard-light";
  opacity: number;
}

const COLOR_BLEND_FRAGMENT = `#version 300 es
precision highp float;

uniform sampler2D uTexture;
uniform sampler2D uMask;
uniform float uOpacity;
uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uColor0;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform float uHueShift;
uniform float uSaturation;
uniform float uBrightness;
uniform int uBlend;

in vec2 vTexCoord;
out vec4 fragColor;

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

void main() {
  vec2 uv = vTexCoord;
  vec4 src = texture(uTexture, uv);

  // Convert to HSV, apply shifts
  vec3 hsv = rgb2hsv(src.rgb);
  hsv.x = fract(hsv.x + uHueShift / 360.0);
  hsv.y = clamp(hsv.y * uSaturation, 0.0, 1.0);
  hsv.z = clamp(hsv.z * uBrightness, 0.0, 1.0);
  vec3 adjusted = hsv2rgb(hsv);

  // Map to palette
  float lum = dot(adjusted, vec3(0.299, 0.587, 0.114));
  vec3 paletteColor;
  if (lum < 0.33) {
    paletteColor = mix(uColor0, uColor1, lum * 3.0);
  } else if (lum < 0.66) {
    paletteColor = mix(uColor1, uColor2, (lum - 0.33) * 3.0);
  } else {
    paletteColor = mix(uColor2, uColor0, (lum - 0.66) * 3.0);
  }

  // Blend
  vec3 result;
  if (uBlend == 0) result = paletteColor;
  else if (uBlend == 1) result = adjusted * paletteColor;
  else if (uBlend == 2) result = 1.0 - (1.0 - adjusted) * (1.0 - paletteColor);
  else if (uBlend == 3) result = mix(2.0 * adjusted * paletteColor, 1.0 - 2.0 * (1.0 - adjusted) * (1.0 - paletteColor), step(0.5, adjusted));
  else if (uBlend == 4) result = mix(2.0 * adjusted * paletteColor + adjusted * adjusted * (1.0 - 2.0 * paletteColor), sqrt(adjusted) * (2.0 * paletteColor - 1.0) + 2.0 * adjusted * (1.0 - paletteColor), step(0.5, paletteColor));
  else result = mix(2.0 * adjusted * paletteColor, 1.0 - 2.0 * (1.0 - adjusted) * (1.0 - paletteColor), step(0.5, paletteColor));

  fragColor = vec4(result, src.a * uOpacity);
}
`;

export class ColorBlendCore implements Pass {
  readonly id = "color-blend";
  readonly name = "Color/Palette/Blend";
  enabled = true;

  private _program: WebGLProgram | null = null;
  private _vao: WebGLVertexArrayObject | null = null;
  private _uniforms: ReturnType<typeof createPassUniforms> | null = null;
  private _params: ColorBlendParams = {
    palette: [[0, 0, 0], [128, 128, 128], [255, 255, 255]],
    hueShift: 0,
    saturation: 1,
    brightness: 1,
    blend: "normal",
    opacity: 1,
  };

  constructor(params: Partial<ColorBlendParams> = {}) {
    this._params = { ...this._params, ...params };
  }

  getFragmentShader(): string {
    return COLOR_BLEND_FRAGMENT;
  }

  getVertexShader(): string {
    return QUAD_VERTEX_SHADER;
  }

  compile(gl: WebGL2RenderingContext): WebGLProgram | null {
    const vs = this._compileShader(gl, gl.VERTEX_SHADER, QUAD_VERTEX_SHADER);
    const fs = this._compileShader(gl, gl.FRAGMENT_SHADER, COLOR_BLEND_FRAGMENT);
    if (!vs || !fs) return null;

    const program = gl.createProgram();
    if (!program) return null;

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("ColorBlend program link error:", gl.getProgramInfoLog(program));
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

    const p = this._params;
    gl.uniform3f(gl.getUniformLocation(program, "uColor0"), p.palette[0][0] / 255, p.palette[0][1] / 255, p.palette[0][2] / 255);
    gl.uniform3f(gl.getUniformLocation(program, "uColor1"), p.palette[1][0] / 255, p.palette[1][1] / 255, p.palette[1][2] / 255);
    gl.uniform3f(gl.getUniformLocation(program, "uColor2"), p.palette[2][0] / 255, p.palette[2][1] / 255, p.palette[2][2] / 255);
    gl.uniform1f(gl.getUniformLocation(program, "uHueShift"), p.hueShift);
    gl.uniform1f(gl.getUniformLocation(program, "uSaturation"), p.saturation);
    gl.uniform1f(gl.getUniformLocation(program, "uBrightness"), p.brightness);
    gl.uniform1i(gl.getUniformLocation(program, "uBlend"), this._blendToInt(p.blend));
  }

  private _blendToInt(blend: string): number {
    const map: Record<string, number> = { normal: 0, multiply: 1, screen: 2, overlay: 3, "soft-light": 4, "hard-light": 5 };
    return map[blend] ?? 0;
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
