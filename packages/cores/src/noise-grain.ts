/**
 * Core 2: Noise/Grain — USES Paper Shaders simplex noise (Apache-2.0)
 *
 * The snoise()/permute() functions are Paper Shaders' verbatim GLSL (v0.0.81).
 * See third_party/paper-design-shaders/PROVENANCE.md for the Apache-2.0 NOTICE.
 *
 * Engine-neutral params (effect-stack schema names):
 *   type     - "simplex" (Paper) — extensible
 *   scale    - noise frequency
 *   octaves  - fBm octave count
 *   strength - blend strength [0,1]
 *   mono     - monochrome vs coloured noise
 */

import type { Pass, PassParams } from "@layers/engine";
import { QUAD_VERTEX_SHADER, createQuadVAO, createPassUniforms } from "@layers/engine";

const VENDORED_FRAG = `#version 300 es
/*
 * Noise/Grain core — USES Paper Shaders simplex noise (Apache-2.0)
 * snoise/permute is Paper Shaders' verbatim GLSL (v0.0.81).
 * See third_party/paper-design-shaders/PROVENANCE.md.
 */
precision highp float;

uniform sampler2D uTexture;
uniform sampler2D uMask;
uniform float uOpacity;
uniform vec2 uResolution;
uniform float uTime;

uniform float uScale;
uniform float uOctaves;
uniform float uStrength;
uniform int uMono;

in vec2 vTexCoord;
out vec4 fragColor;


#define TWO_PI 6.28318530718
#define PI 3.14159265358979323846


  float hash21(vec2 p) {
    p = fract(p * vec2(0.3183099, 0.3678794)) + 0.1;
    p += dot(p, p + 19.19);
    return fract(p.x * p.y);
  }


vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
    -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
    + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
      dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}


float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  for (int i = 0; i < 6; i++) {
    if (float(i) >= uOctaves) break;
    value += amplitude * snoise(p * frequency);
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = vTexCoord;
  vec4 src = texture(uTexture, uv);

  vec2 p = uv * uScale * 0.05;
  float n = fbm(p);

  vec3 noiseColor;
  if (uMono == 1) {
    noiseColor = vec3(n * 0.5 + 0.5);
  } else {
    noiseColor = vec3(
      fbm(p + 100.0) * 0.5 + 0.5,
      fbm(p + 200.0) * 0.5 + 0.5,
      fbm(p + 300.0) * 0.5 + 0.5
    );
  }

  vec3 result = mix(src.rgb, noiseColor, uStrength);
  fragColor = vec4(result, src.a * uOpacity);
}
`;

export interface NoiseGrainParams {
  type: "simplex";
  scale: number;
  octaves: number;
  strength: number;
  mono: boolean;
}

export class NoiseGrainCore implements Pass {
  readonly id = "noise-grain";
  readonly name = "Noise/Grain";
  enabled = true;

  private _program: WebGLProgram | null = null;
  private _vao: WebGLVertexArrayObject | null = null;
  private _uniforms: ReturnType<typeof createPassUniforms> | null = null;
  private _params: NoiseGrainParams = {
    type: "simplex",
    scale: 20,
    octaves: 3,
    strength: 0.3,
    mono: true,
  };

  constructor(params: Partial<NoiseGrainParams> = {}) {
    this._params = { ...this._params, ...params };
  }

  getFragmentShader(): string {
    return VENDORED_FRAG;
  }

  getVertexShader(): string {
    return QUAD_VERTEX_SHADER;
  }

  compile(gl: WebGL2RenderingContext): WebGLProgram | null {
    const vs = this._compileShader(gl, gl.VERTEX_SHADER, QUAD_VERTEX_SHADER);
    const fs = this._compileShader(gl, gl.FRAGMENT_SHADER, VENDORED_FRAG);
    if (!vs || !fs) return null;

    const program = gl.createProgram();
    if (!program) return null;

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("NoiseGrain program link error:", gl.getProgramInfoLog(program));
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

    const p = this._params;
    gl.uniform1i(this._uniforms.uTexture, 0);
    gl.uniform1i(this._uniforms.uMask, 1);
    gl.uniform1f(this._uniforms.uOpacity, params.opacity);
    gl.uniform2f(this._uniforms.uResolution, gl.canvas.width, gl.canvas.height);
    gl.uniform1f(this._uniforms.uTime, time);

    gl.uniform1f(gl.getUniformLocation(program, "uScale"), p.scale);
    gl.uniform1f(gl.getUniformLocation(program, "uOctaves"), p.octaves);
    gl.uniform1f(gl.getUniformLocation(program, "uStrength"), p.strength);
    gl.uniform1i(gl.getUniformLocation(program, "uMono"), p.mono ? 1 : 0);
  }

  private _compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("NoiseGrain shader compile error:", gl.getShaderInfoLog(shader));
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
