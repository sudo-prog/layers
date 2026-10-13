/**
 * Headless render script for LAYERS golden-image infrastructure.
 * Uses Playwright + Chromium with SwiftShader for software WebGL2 rendering.
 *
 * Usage: node scripts/render.js <stack.json> [output.png]
 *
 * Environment:
 *   LAYERS_RENDER_WIDTH=1024
 *   LAYERS_RENDER_HEIGHT=1024
 *   LAYERS_RENDER_SEED=42
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const stackPath = process.argv[2];
const outputPath = process.argv[3] || 'output/rendered.png';

if (!stackPath) {
  console.error('Usage: node scripts/render.js <stack.json> [output.png]');
  process.exit(1);
}

const stack = JSON.parse(fs.readFileSync(stackPath, 'utf-8'));
const stackDir = path.dirname(stackPath);
const metaPath = path.join(stackDir, 'meta.json');

let width = parseInt(process.env.LAYERS_RENDER_WIDTH || '0', 10);
let height = parseInt(process.env.LAYERS_RENDER_HEIGHT || '0', 10);
let seed = parseInt(process.env.LAYERS_RENDER_SEED || '0', 10);

// H-4: Load meta.json and use its resolution/seed as defaults (env vars take priority)
let meta = {};
if (fs.existsSync(metaPath)) {
  meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  if (width === 0 && meta.resolution) width = meta.resolution.width || 1024;
  if (height === 0 && meta.resolution) height = meta.resolution.height || 1024;
  if (seed === 0) seed = meta.seed || 42;
} else {
  if (width === 0) width = 1024;
  if (height === 0) height = 1024;
  if (seed === 0) seed = 42;
}

// CR-3: Shader generator driven by stack.json
// Two code paths, deliberately kept separate:
//   (1) LEGACY single-core path  — stack.core/params/opacity. Byte-for-byte
//       unchanged from the original implementation so the 3 committed fixture
//       goldens (bevel-emboss, gradient-overlay, noise-grain) still match
//       pixel-identically (verified: run-all.js 3/3 PASS, output hashes equal).
//   (2) LAYERED path  — stack.layers[]. The benchmark/curate-benchmark stacks
//       use this shape, and the legacy path silently read `stack.core`, which
//       is undefined for them, so EVERY stack rendered the same 'unknown'
//       solid colour and all composites came out 1.0. This path renders each
//       layer with its own GLSL and composites them with real blend modes.
function generateFragmentShader(core, params, opacity) {
  if (core === 'bevel-emboss') {
    const uDepth = params.depth !== undefined ? params.depth : 0.5;
    const uSize = params.size !== undefined ? params.size : 8;
    const uAngle = params.angle !== undefined ? params.angle : 135;
    const uSoftness = params.softness !== undefined ? params.softness : 0.3;
    const uOpacity = opacity !== undefined ? opacity : 1;
    return `
#version 300 es
precision mediump float;
in vec2 vUV;
out vec4 fragColor;
uniform float uDepth;
uniform float uSize;
uniform float uAngle;
uniform float uSoftness;
uniform float uOpacity;
void main() {
  // Simple bevel/emboss approximation
  float dx = cos(uAngle) * uSize * 0.01;
  float dy = sin(uAngle) * uSize * 0.01;
  float h = length(vUV - vec2(0.5));
  float bevel = smoothstep(0.5 - uSoftness, 0.5, h) * uDepth;
  vec3 color = vec3(bevel, bevel * 0.8, bevel * 0.6);
  fragColor = vec4(color, uOpacity);
}
    `.trim();
  } else {
    // Placeholder: simple colored output based on core type
    const hue = Math.abs(hashCode(core)) % 360;
    const r = Math.cos((hue / 360) * Math.PI * 2) * 0.5 + 0.5;
    const g = Math.cos(((hue + 120) / 360) * Math.PI * 2) * 0.5 + 0.5;
    const b = Math.cos(((hue + 240) / 360) * Math.PI * 2) * 0.5 + 0.5;
    const uOpacity = opacity !== undefined ? opacity : 1;
    return `
#version 300 es
precision mediump float;
in vec2 vUV;
out vec4 fragColor;
uniform float uOpacity;
void main() {
  fragColor = vec4(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)}, uOpacity);
}
    `.trim();
  }
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

// ─── Layered-path GLSL helpers ───────────────────────────────────────────────
// The layered cores need per-pixel randomness (noise, wave distort) that must be
// reproducible across machines, so they use a GLSL hash seeded from
// LAYERS_RENDER_SEED (uSeed) rather than any GPU nondeterminism.
// glslNum / glslVec3 / layerCoreGlsl / buildLayeredFragmentShader are defined
// further below, after the legacy single-core helpers.

// GLSL helpers shared by every layered core: deterministic hashes + simplex
// noise. snoise/permute follow the classic Ashima/IQ 2D simplex formulation
// used by the real @layers/cores noise implementation.
const LAYER_GLSL_COMMON = `
float lf_hash21(vec2 q) {
  vec2 p = fract(q * vec2(0.3183099, 0.3678794)) + 0.1;
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
}
vec3 lf_permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float lf_snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = lf_permute(lf_permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), vec3(0.0));
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
float lf_fbm(vec2 p, int octaves) {
  // Bounded fBm. "octaves" must be an integer LITERAL at the call site: GLSL ES
  // 3.0 requires loop bounds to be constant expressions, so a runtime break on
  // a float octave count will not link. layerCoreGlsl bakes the octave count in
  // as a literal, so this is always satisfied.
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    sum += amp * lf_snoise(p);
    norm += amp;
    amp *= 0.5;
    p *= 2.0;
  }
  return norm > 0.0 ? sum / norm : 0.0;
}
`;

/**
 * Build the GLSL body for ONE layer core, assigning `vec3 lc` (its colour).
 * Returns { body, uniforms } where `uniforms` is a list of {name, value}
 * declarations the caller must emit before main().
 *
 * @param {string} core  - Layer core name from the manifest.
 * @param {object} params - Layer params.
 * @returns {{body: string, uniforms: Array<{name: string, value: string}>}}
 */
/**
 * Format a JS number as a GLSL float literal.
 * @param {*} val
 * @param {number} fallback
 * @returns {string}
 */
function glslNum(val, fallback) {
  const n = typeof val === 'number' && Number.isFinite(val) ? val : fallback;
  return n.toFixed(6);
}

/**
 * Convert a hex colour "#rrggbb" to a GLSL vec3(...) literal (normalised 0..1).
 * Falls back to a deterministic mid-grey when the input is not a hex string.
 * @param {string} hex
 * @returns {string} e.g. "vec3(0.654902, 0.400000, 0.192157)"
 */
function glslVec3(hex) {
  let rgb = [0.5, 0.5, 0.5];
  if (typeof hex === 'string') {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
    if (m) {
      const v = parseInt(m[1], 16);
      rgb = [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
    }
  }
  return `vec3(${rgb[0].toFixed(6)}, ${rgb[1].toFixed(6)}, ${rgb[2].toFixed(6)})`;
}

/**
 * Format a JS value as a GLSL integer literal (for loop bounds / octave counts,
 * which GLSL ES 3.0 requires to be constant integer expressions).
 * @param {*} val
 * @param {number} fallback
 * @returns {string}
 */
function glslInt(val, fallback) {
  const n = typeof val === 'number' && Number.isFinite(val) ? Math.round(val) : fallback;
  return String(Math.max(0, Math.min(6, n)));
}

/**
 * Build the GLSL body for ONE layer core, assigning `vec3 lc` (its colour).
 *
 * All layer parameters are BAKED IN AS LITERALS rather than passed as uniforms.
 * Reason: GLSL ES 3.0 forbids `uniform` declarations inside a nested {} scope,
 * and giving every layer in a 5+ layer stack its own globally-unique uniform
 * names would force the host JS to thread a growing uniform map through
 * page.evaluate for no benefit — these values are fixed per stack. Only uSeed
 * stays a uniform because it is supplied per-render from LAYERS_RENDER_SEED.
 *
 * @param {string} core  - Layer core name from the manifest.
 * @param {object} params - Layer params.
 * @returns {string} GLSL statements (already indented) assigning `lc`.
 */
function layerCoreGlsl(core, params) {
  const p = params || {};

  // ── Content / source patterns ──
  if (core === 'checkerboard') {
    const c1 = glslVec3(p.color1), c2 = glslVec3(p.color2);
    const cell = glslNum(p.cellSize, 32);
    return `
    float cs = max(${cell}, 1.0);
    vec2 g = floor(vUV * (1024.0 / cs));
    lc = mix(${c1}, ${c2}, mod(g.x + g.y, 2.0));`;
  }
  if (core === 'gradient-horizontal' || core === 'gradient-vertical') {
    const c1 = glslVec3(p.color1), c2 = glslVec3(p.color2);
    const axis = core === 'gradient-horizontal' ? 'vUV.x' : 'vUV.y';
    return `    lc = mix(${c1}, ${c2}, ${axis});`;
  }
  if (core === 'radial-sweep' || core === 'radial-gradient') {
    const c1 = glslVec3(p.color1), c2 = glslVec3(p.color2);
    const cx = glslNum(p.centerX, 0.5), cy = glslNum(p.centerY, 0.5);
    return `
    float d = length(vUV - vec2(${cx}, ${cy}));
    lc = mix(${c1}, ${c2}, clamp(d * 2.0, 0.0, 1.0));`;
  }
  if (core === 'diagonal-stripes') {
    const c1 = glslVec3(p.color1), c2 = glslVec3(p.color2);
    const sw = glslNum(p.stripeWidth, 16), ang = glslNum(p.angle, 45);
    return `
    float a = radians(${ang});
    float proj = vUV.x * cos(a) + vUV.y * sin(a);
    float s = floor(proj * (1024.0 / max(${sw}, 1.0)));
    lc = mix(${c1}, ${c2}, mod(s, 2.0));`;
  }
  if (core === 'noise-field' || core === 'noise-grain') {
    const scale = glslNum(p.scale, 24), oct = glslInt(p.octaves, 3);
    const strength = glslNum(p.strength, 0.35);
    return `
    float n = lf_fbm(vUV * max(${scale}, 0.001) + uSeed, ${oct}) * 0.5 + 0.5;
    lc = vec3(mix(1.0, n, clamp(${strength}, 0.0, 1.0)));`;
  }
  if (core === 'solid-color') {
    return `    lc = vec3(clamp(${glslNum(p.opacity, 1)}, 0.0, 1.0));`;
  }

  // ── Effect cores ──
  if (core === 'gradient-overlay') {
    const c1 = glslVec3(p.color1), c2 = glslVec3(p.color2);
    const ang = glslNum(p.angle, 45), op = glslNum(p.opacity, 0.6);
    return `
    float a = radians(${ang});
    float t = clamp(vUV.x * cos(a) + vUV.y * sin(a), 0.0, 1.0);
    lc = mix(${c1}, ${c2}, t) * clamp(${op}, 0.0, 1.0);`;
  }
  if (core === 'bevel-emboss') {
    const depth = glslNum(p.depth, 0.5), size = glslNum(p.size, 8);
    const ang = glslNum(p.angle, 135), soft = glslNum(p.softness, 0.3);
    return `
    float dx = cos(radians(${ang})) * ${size} * 0.01;
    float dy = sin(radians(${ang})) * ${size} * 0.01;
    float h = length(vUV - vec2(0.5) + vec2(dx, dy));
    float bevel = smoothstep(0.5 - ${soft}, 0.5, h) * ${depth};
    lc = vec3(bevel, bevel * 0.8, bevel * 0.6);`;
  }
  if (core === 'shadow') {
    const dist = glslNum(p.distance, 8), blur = glslNum(p.blur, 4);
    const op = glslNum(p.opacity, 0.4);
    return `
    float r = length(vUV - vec2(0.5));
    float d = max(r - ${dist} * 0.01, 0.0);
    float a = clamp(${op}, 0.0, 1.0) * (1.0 - smoothstep(0.0, max(${blur}, 0.001) * 0.02, d));
    lc = vec3(0.0) * a;`;
  }
  if (core === 'glow') {
    const rad = glslNum(p.radius, 6), inten = glslNum(p.intensity, 0.5);
    const op = glslNum(p.opacity, 0.5);
    return `
    float r = length(vUV - vec2(0.5));
    float g = clamp(${inten}, 0.0, 1.0) * exp(-r / max(${rad}, 0.001) * 8.0) * clamp(${op}, 0.0, 1.0);
    lc = vec3(g);`;
  }
  if (core === 'color-adjust') {
    const hue = glslNum(p.hueShift, 0), sat = glslNum(p.saturation, 1);
    const bri = glslNum(p.brightness, 0);
    return `
    float s = clamp(${sat}, 0.0, 2.0);
    float lum = dot(vUV, vec2(0.299, 0.587)) + 0.114 * 0.5;
    vec3 tinted = vec3(lum) * vec3(1.0 + ${bri});
    lc = mix(vec3(lum + ${bri}), tinted, s) + vec3(${hue} / 360.0);`;
  }
  if (core === 'texture-overlay') {
    const scale = glslNum(p.scale, 4), op = glslNum(p.opacity, 0.2);
    return `
    float n = lf_fbm(vUV * max(${scale}, 0.001) + uSeed * 0.5, 3) * 0.5 + 0.5;
    lc = vec3(n) * clamp(${op}, 0.0, 1.0);`;
  }
  if (core === 'wave-distort') {
    const amp = glslNum(p.amplitude, 0.05), freq = glslNum(p.frequency, 4);
    const op = glslNum(p.opacity, 0.5);
    return `
    float w = sin(vUV.y * max(${freq}, 0.001) * 6.28318530718 + uSeed) * clamp(${amp}, 0.0, 0.15);
    float band = smoothstep(0.5 - abs(w), 0.5 + abs(w), vUV.x);
    lc = vec3(band) * clamp(${op}, 0.0, 1.0);`;
  }

  // Unknown core: deterministic grey so output stays reproducible.
  return '    lc = vec3(0.5);';
}

/**
 * GLSL expression for one of the 13 CSS-style blend modes, compositing a layer
 * colour over the accumulated base. `base` and `layer` are vec3 names in scope.
 * @param {string} mode
 * @returns {string} expression yielding the blended vec3
 */
function blendExpr(mode) {
  switch (mode) {
    case 'multiply':     return '(base * layer)';
    case 'screen':       return '(1.0 - (1.0 - base) * (1.0 - layer))';
    case 'overlay':      return 'mix(2.0 * base * layer, 1.0 - 2.0 * (1.0 - base) * (1.0 - layer), step(0.5, base))';
    case 'darken':       return 'min(base, layer)';
    case 'lighten':      return 'max(base, layer)';
    case 'color-dodge':  return 'clamp(base / max(1.0 - layer, 0.001), 0.0, 1.0)';
    case 'color-burn':   return 'clamp(1.0 - (1.0 - base) / max(layer, 0.001), 0.0, 1.0)';
    case 'hard-light':   return 'mix(2.0 * base * layer, 1.0 - 2.0 * (1.0 - base) * (1.0 - layer), step(0.5, layer))';
    case 'soft-light':   return 'mix(base, 2.0 * base * layer + base * base * (1.0 - 2.0 * layer), 0.5)';
    case 'difference':   return 'abs(base - layer)';
    case 'exclusion':    return '(base + layer - 2.0 * base * layer)';
    case 'hue':          return '(luma(layer) + (base - luma(base)))';
    case 'saturation':   return '(vec3(luma(base)) + (layer - vec3(luma(layer))))';
    case 'luminosity':   return '(luma(layer) + (base - luma(base)))';
    case 'normal':
    default:             return 'layer';
  }
}

/**
 * Build the full LAYERED fragment shader for a stack with a `layers` array.
 * Each layer is rendered to its own colour, blended onto the accumulator with
 * its blend mode, and its opacity applied as a lerp toward the layer result.
 *
 * @param {Array<object>} layers
 * @returns {string} complete GLSL ES 3.0 fragment shader source
 */
function buildLayeredFragmentShader(layers) {
  const active = layers.filter(l => l && l.enabled !== false);
  if (active.length === 0) {
    // Degenerate: no active layers -> deterministic grey.
    return `#version 300 es
precision mediump float;
in vec2 vUV;
out vec4 fragColor;
void main() { fragColor = vec4(0.5, 0.5, 0.5, 1.0); }`.trim();
  }

  const bodies = active.map((layer, i) => {
    const coreBody = layerCoreGlsl(layer.core, layer.params || {});
    const blended = blendExpr(layer.blend || 'normal');
    const lo = glslNum(layer.opacity, 1);
    return `
  // layer ${i}: ${layer.core} (blend=${layer.blend || 'normal'}, opacity=${layer.opacity})
  {
    vec3 lc;
${coreBody}
    vec3 layer = clamp(lc, 0.0, 1.0);
    vec3 blended = ${blended};
    base = mix(base, blended, clamp(${lo}, 0.0, 1.0));
  }`;
  }).join('\n');

  return `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform float uSeed;

${LAYER_GLSL_COMMON}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  vec3 base = vec3(0.0);
${bodies}
  fragColor = vec4(clamp(base, 0.0, 1.0), 1.0);
}`.trim();
}

const core = stack.core || 'unknown';

const params = stack.params || {};
const opacity = stack.opacity !== undefined ? stack.opacity : 1;
const blend = stack.blend || 'normal';

const vertexShader = [
  '#version 300 es',
  'in vec2 aPos;',
  'out vec2 vUV;',
  'void main() {',
  '  vUV = aPos * 0.5 + 0.5;',
  '  gl_Position = vec4(aPos, 0.0, 1.0);',
  '}',
].join('\n');

// CR-3: choose the shader. Layered stacks (the benchmark/calibration shape)
// take the multi-layer path; legacy single-core stacks keep the original path.
const isLayered = Array.isArray(stack.layers) && stack.layers.length > 0;
const fragmentShader = isLayered
  ? buildLayeredFragmentShader(stack.layers)
  : generateFragmentShader(core, params, opacity);


// Build uniform values for page.evaluate
// Layered stacks need uSeed (drives the deterministic noise/wave GLSL hashes);
// it is always supplied so the shader can never read an uninitialised uniform.
const uniformValues = isLayered
  ? { uSeed: seed }
  : (core === 'bevel-emboss'
    ? {
        uDepth: params.depth !== undefined ? params.depth : 0.5,
        uSize: params.size !== undefined ? params.size : 8,
        uAngle: params.angle !== undefined ? params.angle : 135,
        uSoftness: params.softness !== undefined ? params.softness : 0.3,
        uOpacity: opacity,
      }
    : { uOpacity: opacity });


const html = '<!DOCTYPE html>' +
  '<html><head><style>body { margin: 0; }</style></head><body>' +
  '<canvas id="canvas" width="' + width + '" height="' + height + '"></canvas>' +
  '<script>' +
  'document.title = "RENDERING";' +
  'const canvas = document.getElementById("canvas");' +
  // H-3: deterministic WebGL context flags
  'const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true, alpha: false, antialias: false, premultipliedAlpha: false });' +
  'if (!gl) { document.title = "NO_WEBGL2"; }' +
  // H-3: SwiftShader verification
  'const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");' +
  'const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);' +
  'console.log("Renderer:", renderer);' +
  'const vs = ' + JSON.stringify(vertexShader) + ';' +
  'const fs = ' + JSON.stringify(fragmentShader) + ';' +
  'const uniforms = ' + JSON.stringify(uniformValues) + ';' +
  'function createShader(type, src) {' +
  '  const s = gl.createShader(type);' +
  '  gl.shaderSource(s, src);' +
  '  gl.compileShader(s);' +
  // Surface shader failures instead of silently drawing a black frame — this
  // is exactly how the all-black layered renders went undiagnosed.
  '  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {' +
  '    const log = gl.getShaderInfoLog(s);' +
  '    console.error("Shader compile error:", log);' +
  '    document.title = "SHADER_ERROR";' +
  '    throw new Error("Shader compile error: " + log);' +
  '  }' +
  '  return s;' +
  '}' +
  'const prog = gl.createProgram();' +
  'gl.attachShader(prog, createShader(gl.VERTEX_SHADER, vs));' +
  'gl.attachShader(prog, createShader(gl.FRAGMENT_SHADER, fs));' +
  'gl.linkProgram(prog);' +
  'if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {' +
  '  console.error("Program link error:", gl.getProgramInfoLog(prog));' +
  '}' +
  'gl.useProgram(prog);' +
  'const buf = gl.createBuffer();' +
  'gl.bindBuffer(gl.ARRAY_BUFFER, buf);' +
  'gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);' +
  'const loc = gl.getAttribLocation(prog, "aPos");' +
  'gl.enableVertexAttribArray(loc);' +
  'gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);' +
  // Set uniform values — handles both scalars (uniform1f) and vec3 colours
  // (uniform3f). Array values are vec3; numbers are scalars.
  'for (const [name, val] of Object.entries(uniforms)) {' +
  '  const loc = gl.getUniformLocation(prog, name);' +
  '  if (loc === -1) continue;' +
  '  if (Array.isArray(val)) gl.uniform3f(loc, val[0], val[1], val[2]);' +
  '  else gl.uniform1f(loc, val);' +
  '}' +
  'gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);' +
  'document.title = "RENDER_DONE";' +
  '</script></body></html>';

async function render() {
  // M-3: Add timeout to chromium.launch
  const browser = await chromium.launch({
    timeout: 30000,
    args: [
      '--headless=new',
      '--use-gl=angle',
      '--use-angle=swiftshader-webgl',
      '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu-sandbox',
      '--disable-extensions',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
    ],
  });

  try {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.setContent(html);

    // M-3: Replace waitForTimeout(100) with waitForFunction checking render completion
    await page.waitForFunction(() => document.title !== 'RENDERING', { timeout: 10000 });

    const hasWebGL2 = await page.evaluate(() => document.title !== 'NO_WEBGL2');
    if (!hasWebGL2) {
      console.error('ERROR: WebGL2 not available in headless Chromium');
      process.exit(1);
    }

    await page.screenshot({ path: outputPath });
    console.log('Rendered ' + stackPath + ' -> ' + outputPath + ' (' + width + 'x' + height + ', seed=' + seed + ', core=' + core + ', blend=' + blend + ')');
  } finally {
    // M-3: Ensure browser.close() is called via try/finally
    await browser.close();
  }
}

render().catch(err => {
  console.error('Render failed:', err);
  process.exit(1);
});
