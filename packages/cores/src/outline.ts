/**
 * Core 7: Outline/Edge
 *
 * Variables: strength, width, roughness, ink-bleed
 * Looks: ink outline, edge detect
 *
 * Note: This core requires 2 passes (edge detection + composite).
 * On mobile, it counts as 2 passes against the budget.
 */

import type { Pass, PassParams } from "@layers/engine";
import { QUAD_VERTEX_SHADER, createQuadVAO, createPassUniforms } from "@layers/engine";

export interface OutlineParams {
  strength: number;
  width: number;
  roughness: number;
  inkBleed: boolean;
}

const OUTLINE_FRAGMENT = `#version 300 es
precision highp float;

uniform sampler2D uTexture;
uniform sampler2D uMask;
uniform float uOpacity;
uniform vec2 uResolution;
uniform float uTime;
uniform float uStrength;
uniform float uWidth;
uniform float uRoughness;
uniform int uInkBleed;

in vec2 vTexCoord;
out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = vTexCoord;
  vec2 texel = 1.0 / uResolution;

  vec4 center = texture(uTexture, uv);
  float edge = 0.0;

  // Sample neighbors
  for (int i = -2; i <= 2; i++) {
    for (int j = -2; j <= 2; j++) {
      if (i == 0 && j == 0) continue;
      vec2 offset = vec2(float(i), float(j)) * texel * uWidth;
      vec4 neighbor = texture(uTexture, uv + offset);
      float diff = length(center.rgb - neighbor.rgb);
      edge = max(edge, diff);
    }
  }

  // Apply roughness — perturb the edge field with a spatial hash so the ink
  // line becomes broken/uneven. NOTE: on a binary checkerboard edge is
  // already ~0 or ~1, so a plain mix() is a no-op; the threshold must move.
  if (uRoughness > 0.0) {
    float n = hash(uv * uResolution * 0.5);
    edge = mix(edge, edge * (0.35 + 1.3 * n), uRoughness);
  }

  // Threshold
  float outline = smoothstep(0.1, 0.3, edge) * uStrength;

  // Ink bleed — a WIDER, lower threshold band that extends the ink outward and
  // at reduced strength, so it must be combined (not subsumed by outline).
  if (uInkBleed == 1) {
    float bleed = smoothstep(0.02, 0.18, edge) * 0.45 * uStrength;
    outline = max(outline, bleed);
  }

  vec3 inkColor = vec3(0.0);
  vec3 result = mix(center.rgb, inkColor, outline);

  fragColor = vec4(result, center.a * uOpacity);
}
`;

export class OutlineCore implements Pass {
  readonly id = "outline";
  readonly name = "Outline/Edge";
  enabled = true;

  private _program: WebGLProgram | null = null;
  private _vao: WebGLVertexArrayObject | null = null;
  private _uniforms: ReturnType<typeof createPassUniforms> | null = null;
  private _params: OutlineParams = {
    strength: 1,
    width: 1,
    roughness: 0,
    inkBleed: false,
  };

  constructor(params: Partial<OutlineParams> = {}) {
    this._params = { ...this._params, ...params };
  }

  getFragmentShader(): string {
    return OUTLINE_FRAGMENT;
  }

  getVertexShader(): string {
    return QUAD_VERTEX_SHADER;
  }

  compile(gl: WebGL2RenderingContext): WebGLProgram | null {
    const vs = this._compileShader(gl, gl.VERTEX_SHADER, QUAD_VERTEX_SHADER);
    const fs = this._compileShader(gl, gl.FRAGMENT_SHADER, OUTLINE_FRAGMENT);
    if (!vs || !fs) return null;

    const program = gl.createProgram();
    if (!program) return null;

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Outline program link error:", gl.getProgramInfoLog(program));
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

    gl.uniform1f(gl.getUniformLocation(program, "uStrength"), this._params.strength);
    gl.uniform1f(gl.getUniformLocation(program, "uWidth"), this._params.width);
    gl.uniform1f(gl.getUniformLocation(program, "uRoughness"), this._params.roughness);
    gl.uniform1i(gl.getUniformLocation(program, "uInkBleed"), this._params.inkBleed ? 1 : 0);
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
