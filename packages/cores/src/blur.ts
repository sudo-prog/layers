/**
 * Core 3: Blur/Convolution
 *
 * Variables: radius, direction, passes, edgeMode
 * Looks: soft focus, sharpen, emboss
 */

import type { Pass, PassParams } from "@layers/engine";
import { QUAD_VERTEX_SHADER, createQuadVAO, createPassUniforms } from "@layers/engine";

export interface BlurParams {
  radius: number;
  direction: "omni" | "horizontal" | "vertical" | "radial";
  passes: number;
  edgeMode: "clamp" | "wrap" | "mirror";
}

const BLUR_FRAGMENT = `#version 300 es
precision highp float;

uniform sampler2D uTexture;
uniform sampler2D uMask;
uniform float uOpacity;
uniform vec2 uResolution;
uniform float uTime;
uniform float uRadius;
uniform int uDirection;
uniform int uPasses;
uniform int uEdgeMode;

in vec2 vTexCoord;
out vec4 fragColor;

vec2 wrapUV(vec2 uv) {
  if (uEdgeMode == 1) return fract(uv);
  if (uEdgeMode == 2) {
    vec2 m = mod(uv, 2.0);
    return mix(m, 2.0 - m, step(1.0, m));
  }
  return clamp(uv, 0.0, 1.0);
}

void main() {
  vec2 uv = vTexCoord;
  vec4 src = texture(uTexture, uv);

  vec2 texel = 1.0 / uResolution;
  vec4 color = vec4(0.0);
  float total = 0.0;

  int passes = int(uPasses);
  for (int p = 0; p < 4; p++) {
    if (p >= passes) break;
    float radius = uRadius * (1.0 + float(p) * 0.5);

    for (int i = -4; i <= 4; i++) {
      for (int j = -4; j <= 4; j++) {
        vec2 offset = vec2(float(i), float(j)) * texel * radius;

        if (uDirection == 1) offset.y = 0.0;
        else if (uDirection == 2) offset.x = 0.0;
        else if (uDirection == 3) {
          vec2 dir = uv - 0.5;
          float len = length(dir);
          if (len > 0.001) offset = normalize(dir) * len * float(i) * texel.x * radius;
        }

        vec2 sampleUV = wrapUV(uv + offset);
        float weight = 1.0 - length(vec2(float(i), float(j))) / 5.0;
        weight = max(weight, 0.0);
        color += texture(uTexture, sampleUV) * weight;
        total += weight;
      }
    }
  }

  color /= total;
  fragColor = vec4(color.rgb, src.a * uOpacity);
}
`;

export class BlurCore implements Pass {
  readonly id = "blur";
  readonly name = "Blur/Convolution";
  enabled = true;

  private _program: WebGLProgram | null = null;
  private _vao: WebGLVertexArrayObject | null = null;
  private _uniforms: ReturnType<typeof createPassUniforms> | null = null;
  private _params: BlurParams = {
    radius: 2,
    direction: "omni",
    passes: 1,
    edgeMode: "clamp",
  };

  constructor(params: Partial<BlurParams> = {}) {
    this._params = { ...this._params, ...params };
  }

  getFragmentShader(): string {
    return BLUR_FRAGMENT;
  }

  getVertexShader(): string {
    return QUAD_VERTEX_SHADER;
  }

  compile(gl: WebGL2RenderingContext): WebGLProgram | null {
    const vs = this._compileShader(gl, gl.VERTEX_SHADER, QUAD_VERTEX_SHADER);
    const fs = this._compileShader(gl, gl.FRAGMENT_SHADER, BLUR_FRAGMENT);
    if (!vs || !fs) return null;

    const program = gl.createProgram();
    if (!program) return null;

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Blur program link error:", gl.getProgramInfoLog(program));
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

    gl.uniform1f(gl.getUniformLocation(program, "uRadius"), this._params.radius);
    gl.uniform1i(gl.getUniformLocation(program, "uDirection"), this._directionToInt(this._params.direction));
    gl.uniform1i(gl.getUniformLocation(program, "uPasses"), this._params.passes);
    gl.uniform1i(gl.getUniformLocation(program, "uEdgeMode"), this._edgeModeToInt(this._params.edgeMode));
  }

  private _directionToInt(dir: string): number {
    const map: Record<string, number> = { omni: 0, horizontal: 1, vertical: 2, radial: 3 };
    return map[dir] ?? 0;
  }

  private _edgeModeToInt(mode: string): number {
    const map: Record<string, number> = { clamp: 0, wrap: 1, mirror: 2 };
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
