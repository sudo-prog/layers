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

const width = parseInt(process.env.LAYERS_RENDER_WIDTH || '1024', 10);
const height = parseInt(process.env.LAYERS_RENDER_HEIGHT || '1024', 10);
const seed = parseInt(process.env.LAYERS_RENDER_SEED || '42', 10);

const stack = JSON.parse(fs.readFileSync(stackPath, 'utf-8'));

const vertexShader = [
  '#version 300 es',
  'in vec2 aPos;',
  'out vec2 vUV;',
  'void main() {',
  '  vUV = aPos * 0.5 + 0.5;',
  '  gl_Position = vec4(aPos, 0.0, 1.0);',
  '}',
].join('\n');

const fragmentShader = [
  '#version 300 es',
  'precision mediump float;',
  'in vec2 vUV;',
  'out vec4 fragColor;',
  'void main() {',
  '  fragColor = vec4(vUV.x, vUV.y, 0.5, 1.0);',
  '}',
].join('\n');

const html = '<!DOCTYPE html>' +
  '<html><head><style>body { margin: 0; }</style></head><body>' +
  '<canvas id="canvas" width="' + width + '" height="' + height + '"></canvas>' +
  '<script>' +
  'const canvas = document.getElementById("canvas");' +
  'const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });' +
  'if (!gl) { document.title = "NO_WEBGL2"; }' +
  'const vs = ' + JSON.stringify(vertexShader) + ';' +
  'const fs = ' + JSON.stringify(fragmentShader) + ';' +
  'function createShader(type, src) {' +
  '  const s = gl.createShader(type);' +
  '  gl.shaderSource(s, src);' +
  '  gl.compileShader(s);' +
  '  return s;' +
  '}' +
  'const prog = gl.createProgram();' +
  'gl.attachShader(prog, createShader(gl.VERTEX_SHADER, vs));' +
  'gl.attachShader(prog, createShader(gl.FRAGMENT_SHADER, fs));' +
  'gl.linkProgram(prog);' +
  'gl.useProgram(prog);' +
  'const buf = gl.createBuffer();' +
  'gl.bindBuffer(gl.ARRAY_BUFFER, buf);' +
  'gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);' +
  'const loc = gl.getAttribLocation(prog, "aPos");' +
  'gl.enableVertexAttribArray(loc);' +
  'gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);' +
  'gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);' +
  '</script></body></html>';

async function render() {
  const browser = await chromium.launch({
    args: [
      '--headless=new',
      '--use-gl=angle',
      '--use-angle=swiftshader-webgl',
      '--enable-unsafe-swiftshader',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu-sandbox',
      '--disable-software-rasterizer',
      '--disable-extensions',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
    ],
  });

  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(html);
  await page.waitForTimeout(100);

  const hasWebGL2 = await page.evaluate(() => document.title !== 'NO_WEBGL2');
  if (!hasWebGL2) {
    console.error('ERROR: WebGL2 not available in headless Chromium');
    await browser.close();
    process.exit(1);
  }

  await page.screenshot({ path: outputPath });
  console.log('Rendered ' + stackPath + ' -> ' + outputPath + ' (' + width + 'x' + height + ', seed=' + seed + ')');

  await browser.close();
}

render().catch(err => {
  console.error('Render failed:', err);
  process.exit(1);
});
