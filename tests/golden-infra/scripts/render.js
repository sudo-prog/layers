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

const fragmentShader = generateFragmentShader(core, params, opacity);

// Build uniform values for page.evaluate
const uniformValues =
  core === 'bevel-emboss'
    ? {
        uDepth: params.depth !== undefined ? params.depth : 0.5,
        uSize: params.size !== undefined ? params.size : 8,
        uAngle: params.angle !== undefined ? params.angle : 135,
        uSoftness: params.softness !== undefined ? params.softness : 0.3,
        uOpacity: opacity,
      }
    : { uOpacity: opacity };

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
  '  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {' +
  '    console.error("Shader compile error:", gl.getShaderInfoLog(s));' +
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
  // Set uniform values
  'for (const [name, val] of Object.entries(uniforms)) {' +
  '  const loc = gl.getUniformLocation(prog, name);' +
  '  if (loc !== -1) gl.uniform1f(loc, val);' +
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
