/**
 * Core 6: Lighting/Atmosphere
 *
 * Variables: offsetX/Y, blur, color, opacity, inner/outer
 * Looks: shadow, glow, haze, vignette
 */

import type { Pass, PassParams } from "@layers/engine";
import { QUAD_VERTEX_SHADER, createQuadVAO, createPassUniforms } from "@layers/engine";

export interface LightingParams {
  offsetX: number;
  offsetY: number;
  blur: number;
  color: [number, number, number];
  opacity: number;
  mode: "shadow" | "glow" | "haze" | "vignette";
}

const LIGHTING_FRAGMENT = `#version 300 es
precision highp float;

uniform sampler2D uTexture;
uniform sampler2D uMask;
uniform float uOpacity;   // renderer pass opacity (stack entry), NOT this core's own opacity
uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uOffset;
uniform float uBlur;
uniform vec3 uColor;
uniform float uStrength;  // this core's own opacity param
uniform int uMode;

in vec2 vTexCoord;
out vec4 fragColor;

void main() {
  vec2 uv = vTexCoord;
  vec4 src = texture(uTexture, uv);

  vec3 result = src.rgb;
  float o = uStrength * uOpacity;

  if (uMode == 0) {
    // Shadow — a drop shadow cast from the source's SILHOUETTE.
    //
    // The cast shape comes from the source alpha at an offset position, so it
    // works on any imagery (smooth gradients included — deriving the shape from
    // a luminance delta instead makes it vanish on smooth sources, which is a
    // bug we hit). uBlur widens the penumbra; uOffset sets the cast direction.
    vec2 offsetUV = clamp(uv + uOffset * 0.01, vec2(0.0), vec2(1.0));
    vec4 shadow = texture(uTexture, offsetUV);
    // Edge-based silhouette: how much the source changes across the offset,
    // combined with the source's own coverage.
    float baseA = src.a;
    float d = length((uv - offsetUV) * uResolution / min(uResolution.x, uResolution.y));
    float penumbra = max(0.01, uBlur * 0.02);
    // A texel is "in shadow" when it is NOT covered by the source but the
    // offset sample IS, plus a soft penumbra band around that boundary.
    float castAmt = clamp((shadow.a - baseA) * 1.5, 0.0, 1.0);
    float pen = smoothstep(penumbra, 0.0, d) * 0.35;
    float shadowAlpha = clamp(castAmt + pen, 0.0, 1.0);
    result = mix(result, uColor, clamp(shadowAlpha * o, 0.0, 1.0));
  } else if (uMode == 1) {
    // Glow — Gaussian falloff centred on the (optionally offset) point.
    // uBlur sets the radius. dist is normalised to the canvas half-width so
    // the result is resolution-independent: dist 1.0 == the corner.
    // sigma = blur * 0.09 gives blur 1 -> a tight core, blur 10 -> a broad haze
    // (a previous 0.08*blur scale made the falloff sub-pixel and the glow
    // covered almost nothing, collapsing the image to a flat colour).
    vec2 center = vec2(0.5, 0.5) + uOffset * 0.01;
    vec2 rel = (uv - center) * 2.0;              // -1..1 across the canvas
    float dist = length(rel);
    float sigma = max(0.06, uBlur * 0.09);
    float glow = exp(-(dist * dist) / (2.0 * sigma * sigma)) * o;
    result = mix(result, uColor, clamp(glow, 0.0, 1.0));
  } else if (uMode == 2) {
    // Haze
    float dist = length(uv - 0.5);
    float haze = smoothstep(0.3, 0.7, dist) * o;
    result = mix(result, uColor, haze);
  } else {
    // Vignette
    float dist = length(uv - 0.5);
    float vignette = smoothstep(0.4, 0.8, dist) * o;
    result = mix(result, uColor, vignette);
  }

  fragColor = vec4(result, src.a * uOpacity);
}
`;

export class LightingCore implements Pass {
  readonly id = "lighting";
  readonly name = "Lighting/Atmosphere";
  enabled = true;

  private _program: WebGLProgram | null = null;
  private _vao: WebGLVertexArrayObject | null = null;
  private _uniforms: ReturnType<typeof createPassUniforms> | null = null;
  private _params: LightingParams = {
    offsetX: 0,
    offsetY: 0,
    blur: 1,
    color: [0, 0, 0],
    opacity: 0.5,
    mode: "shadow",
  };

  constructor(params: Partial<LightingParams> = {}) {
    this._params = { ...this._params, ...params };
  }

  getFragmentShader(): string {
    return LIGHTING_FRAGMENT;
  }

  getVertexShader(): string {
    return QUAD_VERTEX_SHADER;
  }

  compile(gl: WebGL2RenderingContext): WebGLProgram | null {
    const vs = this._compileShader(gl, gl.VERTEX_SHADER, QUAD_VERTEX_SHADER);
    const fs = this._compileShader(gl, gl.FRAGMENT_SHADER, LIGHTING_FRAGMENT);
    if (!vs || !fs) return null;

    const program = gl.createProgram();
    if (!program) return null;

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Lighting program link error:", gl.getProgramInfoLog(program));
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

    gl.uniform2f(gl.getUniformLocation(program, "uOffset"), this._params.offsetX, this._params.offsetY);
    gl.uniform1f(gl.getUniformLocation(program, "uBlur"), this._params.blur);
    gl.uniform3f(gl.getUniformLocation(program, "uColor"), this._params.color[0] / 255, this._params.color[1] / 255, this._params.color[2] / 255);
    // uOpacity comes from the renderer (stack entry opacity). This core's own
    // opacity param goes through uStrength so it is not silently discarded.
    gl.uniform1f(gl.getUniformLocation(program, "uStrength"), this._params.opacity);
    gl.uniform1i(gl.getUniformLocation(program, "uMode"), this._modeToInt(this._params.mode));
  }

  private _modeToInt(mode: string): number {
    const map: Record<string, number> = { shadow: 0, glow: 1, haze: 2, vignette: 3 };
    return map[mode] ?? 0;
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
