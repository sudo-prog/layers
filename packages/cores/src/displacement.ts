/**
 * Core 4: Displacement/Warp
 *
 * Variables: strength, mapScale, axis, type
 * Looks: liquid, fluted glass, wave, heat haze
 */

import type { Pass, PassParams } from "@layers/engine";
import { QUAD_VERTEX_SHADER, createQuadVAO, createPassUniforms } from "@layers/engine";

export interface DisplacementParams {
  strength: number;
  mapScale: number;
  axis: "x" | "y" | "both" | "radial";
  type: "liquid" | "fluted" | "wave" | "heat";
}

const DISPLACEMENT_FRAGMENT = `#version 300 es
precision highp float;

uniform sampler2D uTexture;
uniform sampler2D uMask;
uniform float uOpacity;
uniform vec2 uResolution;
uniform float uTime;
uniform float uStrength;
uniform float uMapScale;
uniform int uAxis;
uniform int uType;

in vec2 vTexCoord;
out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 uv = vTexCoord;
  vec2 centered = uv - 0.5;

  vec2 offset = vec2(0.0);

  // Offsets are in NORMALISED units (fraction of canvas) so uStrength is
  // resolution-independent. Do NOT quantise sampleUV to whole texels — that
  // snaps small offsets away entirely.
  if (uType == 0) {
    // Liquid
    float n1 = noise(uv * uMapScale + uTime * 0.3);
    float n2 = noise(uv * uMapScale + 100.0 + uTime * 0.2);
    offset = vec2(n1 - 0.5, n2 - 0.5) * uStrength * 0.02;
  } else if (uType == 1) {
    // Fluted glass
    float n = noise(vec2(uv.x * uMapScale, 0.0));
    offset = vec2((n - 0.5) * uStrength * 0.04, 0.0);
  } else if (uType == 2) {
    // Wave — vertical sine displacement driven by x
    float wave = sin(uv.x * uMapScale * 6.28 + uTime) * uStrength * 0.02;
    offset = vec2(0.0, wave);
  } else {
    // Heat haze
    float n = noise(uv * uMapScale + vec2(0.0, uTime * 0.5));
    offset = vec2((n - 0.5) * uStrength * 0.01, 0.0);
  }

  // Axis filter: which components of the offset survive.
  //  axis "x"  -> only horizontal displacement (offset.y killed)
  //  axis "y"  -> only vertical displacement   (offset.x killed)
  //  axis "both"-> unchanged
  if (uAxis == 0) offset.y = 0.0;
  else if (uAxis == 1) offset.x = 0.0;
  else if (uAxis == 3) {
    float len = length(centered);
    if (len > 0.001) offset = normalize(centered) * len * uStrength * 0.02;
  }

  vec2 sampleUV = clamp(uv + offset, vec2(0.0), vec2(1.0));
  vec4 src = texture(uTexture, sampleUV);
  fragColor = vec4(src.rgb, src.a * uOpacity);
}
`;

export class DisplacementCore implements Pass {
  readonly id = "displacement";
  readonly name = "Displacement/Warp";
  enabled = true;

  private _program: WebGLProgram | null = null;
  private _vao: WebGLVertexArrayObject | null = null;
  private _uniforms: ReturnType<typeof createPassUniforms> | null = null;
  private _params: DisplacementParams = {
    strength: 5,
    mapScale: 10,
    axis: "both",
    type: "liquid",
  };

  constructor(params: Partial<DisplacementParams> = {}) {
    this._params = { ...this._params, ...params };
  }

  getFragmentShader(): string {
    return DISPLACEMENT_FRAGMENT;
  }

  getVertexShader(): string {
    return QUAD_VERTEX_SHADER;
  }

  compile(gl: WebGL2RenderingContext): WebGLProgram | null {
    const vs = this._compileShader(gl, gl.VERTEX_SHADER, QUAD_VERTEX_SHADER);
    const fs = this._compileShader(gl, gl.FRAGMENT_SHADER, DISPLACEMENT_FRAGMENT);
    if (!vs || !fs) return null;

    const program = gl.createProgram();
    if (!program) return null;

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Displacement program link error:", gl.getProgramInfoLog(program));
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
    gl.uniform1f(gl.getUniformLocation(program, "uMapScale"), this._params.mapScale);
    gl.uniform1i(gl.getUniformLocation(program, "uAxis"), this._axisToInt(this._params.axis));
    gl.uniform1i(gl.getUniformLocation(program, "uType"), this._typeToInt(this._params.type));
  }

  private _axisToInt(axis: string): number {
    const map: Record<string, number> = { x: 0, y: 1, both: 2, radial: 3 };
    return map[axis] ?? 2;
  }

  private _typeToInt(type: string): number {
    const map: Record<string, number> = { liquid: 0, fluted: 1, wave: 2, heat: 3 };
    return map[type] ?? 0;
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
