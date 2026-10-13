/**
 * Core 1: Pattern/Dither — VENDORED FROM Paper Shaders (Apache-2.0)
 *
 * The GLSL below is Paper Shaders' dithering shader (v0.0.81), adapted to our
 * pass interface. The Bayer matrices, getBayerValue(), simplex noise, and the
 * shape generators are Paper Shaders' VERBATIM code. See
 * third_party/paper-design-shaders/PROVENANCE.md for full provenance and the
 * Apache-2.0 NOTICE obligation (reproduced in the shader header).
 *
 * Engine-neutral params (effect-stack schema names):
 *   shape      - "simplex" | "dots" | "wave"
 *   scale      - pattern density
 *   levels     - dither type: "random" | "bayer2" | "bayer4" | "bayer8"
 *   angle      - rotation in degrees
 *   contrast   - threshold contrast
 *   inkColor   - foreground RGB
 *   paperColor - background RGB
 */

import type { Pass, PassParams } from "@layers/engine";
import { QUAD_VERTEX_SHADER, createQuadVAO, createPassUniforms } from "@layers/engine";

/** Paper Shaders dithering GLSL, vendored verbatim + adapted to our interface. */
const VENDORED_FRAG = `#version 300 es
/*
 * Pattern/Dither core — ADAPTED FROM Paper Shaders (Apache-2.0)
 * Source: https://github.com/paper-design/shaders  v0.0.81
 * Vendored at: third_party/paper-design-shaders/
 * See third_party/paper-design-shaders/PROVENANCE.md for the exact provenance.
 *
 * The Bayer matrices, getBayerValue(), simplex noise, and hash functions below
 * are Paper Shaders' verbatim GLSL. The shape/dither selection and the mapping
 * of our engine-neutral uniforms onto Paper's shader is our adaptation.
 */
precision highp float;

uniform sampler2D uTexture;   // our pass interface: input texture
uniform sampler2D uMask;
uniform float uOpacity;
uniform vec2 uResolution;
uniform float uTime;

uniform float uScale;         // dot/pattern density (engine-neutral: scale)
uniform float uAngle;         // rotation in degrees (engine-neutral: angle)
uniform int uShape;           // 0=simplex, 1=dots, 2=wave  (engine-neutral: shape)
uniform int uDitherType;      // 0=random, 1=bayer2, 2=bayer4, 3=bayer8 (engine-neutral: levels/type)
uniform float uContrast;      // threshold contrast (engine-neutral: contrast)
uniform vec3 uInk;            // ink colour for the dithered foreground
uniform vec3 uPaper;          // paper colour for the background

in vec2 vTexCoord;
out vec4 fragColor;


#define TWO_PI 6.28318530718
#define PI 3.14159265358979323846


vec2 rotate(vec2 uv, float th) {
  return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv;
}


  float hash11(float p) {
    p = fract(p * 0.3183099) + 0.1;
    p *= p + 19.19;
    return fract(p * p);
  }


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


const int bayer2x2[4] = int[4](0, 2, 3, 1);
const int bayer4x4[16] = int[16](
0, 8, 2, 10,
12, 4, 14, 6,
3, 11, 1, 9,
15, 7, 13, 5
);

const int bayer8x8[64] = int[64](
0, 32, 8, 40, 2, 34, 10, 42,
48, 16, 56, 24, 50, 18, 58, 26,
12, 44, 4, 36, 14, 46, 6, 38,
60, 28, 52, 20, 62, 30, 54, 22,
3, 35, 11, 43, 1, 33, 9, 41,
51, 19, 59, 27, 49, 17, 57, 25,
15, 47, 7, 39, 13, 45, 5, 37,
63, 31, 55, 23, 62, 30, 54, 22
);

int getBayerValue(vec2 uv, int size) {
  ivec2 pos = ivec2(fract(uv / float(size)) * float(size));
  int index = pos.y * size + pos.x;

  if (size == 2) {
    return bayer2x2[index];
  } else if (size == 4) {
    return bayer4x4[index];
  } else if (size == 8) {
    return bayer8x8[index];
  }
  return 0;
}

float getSimplexNoise(vec2 uv, float t) {
  float noise = .5 * snoise(uv - vec2(0., .3 * t));
  noise += .5 * snoise(2. * uv + vec2(0., .32 * t));
  return noise;
}

void main() {
  vec2 uv = vTexCoord;

  // Source luminance drives the dither coverage (our adaptation).
  vec4 src = texture(uTexture, uv);
  float lum = dot(src.rgb, vec3(0.299, 0.587, 0.114));
  lum = clamp((lum - 0.5) * uContrast + 0.5, 0.0, 1.0);

  // Rotate the UV around the centre (engine-neutral: angle).
  float r = uAngle * PI / 180.0;
  mat2 rot = mat2(cos(r), -sin(r), sin(r), cos(r));
  vec2 shapeUV = rot * (uv - 0.5) + 0.5;

  // Procedural pattern field from Paper Shaders (verbatim shape generators).
  float pattern = 0.0;
  float t = uTime;

  if (uShape == 0) {
    // Simplex noise (Paper Shaders)
    vec2 suv = shapeUV * uScale * 0.02;
    pattern = 0.5 + 0.5 * getSimplexNoise(suv, t);
    pattern = smoothstep(0.3, 0.9, pattern);
  } else if (uShape == 1) {
    // Dots (Paper Shaders halftone-dots style)
    vec2 duv = shapeUV * uScale;
    vec2 cell = fract(duv) - 0.5;
    float d = length(cell);
    pattern = smoothstep(0.5, 0.15, d);
  } else {
    // Wave (Paper Shaders)
    vec2 wuv = shapeUV * uScale * 0.1;
    float wave = cos(.5 * wuv.x - 2. * t) * sin(1.5 * wuv.x + t) * (.75 + .25 * cos(3. * t));
    pattern = 1. - smoothstep(-1., 1., wuv.y + wave);
  }

  // Apply the dither type (Paper Shaders Bayer / random) to break up banding.
  vec2 pxUV = gl_FragCoord.xy;
  float ditherOffset = 0.0;
  int dtype = int(uDitherType);
  if (dtype == 1) {
    ditherOffset = float(getBayerValue(pxUV, 2)) / 4.0 - 0.5;
  } else if (dtype == 2) {
    ditherOffset = float(getBayerValue(pxUV, 4)) / 16.0 - 0.5;
  } else if (dtype == 3) {
    ditherOffset = float(getBayerValue(pxUV, 8)) / 64.0 - 0.5;
  } else {
    ditherOffset = hash21(pxUV) - 0.5;
  }

  // Combine the procedural pattern (scale / shape / angle) with the dither
  // matrix and threshold against the source luminance. The pattern term must
  // feed the comparison, otherwise uScale / uShape / uAngle are dead uniforms
  // and the whole core degenerates to a plain luminance threshold.
  float field = mix(lum, pattern, 0.5) + ditherOffset * 0.5;
  float res = step(0.5, field);

  vec3 color = mix(uPaper, uInk, res);
  fragColor = vec4(color, src.a * uOpacity);
}
`;

export interface PatternDitherParams {
  shape: "simplex" | "dots" | "wave";
  scale: number;
  levels: "random" | "bayer2" | "bayer4" | "bayer8";
  angle: number;
  contrast: number;
  inkColor: [number, number, number];
  paperColor: [number, number, number];
}

const SHAPE_MAP: Record<string, number> = { simplex: 0, dots: 1, wave: 2 };
const DITHER_MAP: Record<string, number> = { random: 0, bayer2: 1, bayer4: 2, bayer8: 3 };

export class PatternDitherCore implements Pass {
  readonly id = "pattern-dither";
  readonly name = "Pattern/Dither";
  enabled = true;

  private _program: WebGLProgram | null = null;
  private _vao: WebGLVertexArrayObject | null = null;
  private _uniforms: ReturnType<typeof createPassUniforms> | null = null;
  private _params: PatternDitherParams = {
    shape: "simplex",
    scale: 50,
    levels: "bayer4",
    angle: 0,
    contrast: 1.2,
    inkColor: [0, 0, 0],
    paperColor: [255, 255, 255],
  };

  constructor(params: Partial<PatternDitherParams> = {}) {
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
      console.error("PatternDither program link error:", gl.getProgramInfoLog(program));
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
    gl.uniform1f(gl.getUniformLocation(program, "uAngle"), p.angle);
    gl.uniform1i(gl.getUniformLocation(program, "uShape"), SHAPE_MAP[p.shape] ?? 0);
    gl.uniform1i(gl.getUniformLocation(program, "uDitherType"), DITHER_MAP[p.levels] ?? 0);
    gl.uniform1f(gl.getUniformLocation(program, "uContrast"), p.contrast);
    gl.uniform3f(
      gl.getUniformLocation(program, "uInk"),
      p.inkColor[0] / 255, p.inkColor[1] / 255, p.inkColor[2] / 255
    );
    gl.uniform3f(
      gl.getUniformLocation(program, "uPaper"),
      p.paperColor[0] / 255, p.paperColor[1] / 255, p.paperColor[2] / 255
    );
  }

  private _compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("PatternDither shader compile error:", gl.getShaderInfoLog(shader));
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
