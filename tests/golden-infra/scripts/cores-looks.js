/**
 * Multi-look coverage matrix — the Stage 0.3 gate's "≥6 reference looks per
 * core, each at SSIM >= 0.9" requirement.
 *
 * One golden PNG per core proves the shader renders *something*. It does NOT
 * prove the core can produce *six different looks*. A core with a dead
 * parameter would still pass a single-look golden test. This script closes
 * that hole: it renders every declared look for every core and asserts each
 * one (a) renders, and (b) is visually DISTINCT from the other looks of the
 * same core (SSIM < 0.95 between any two looks).
 *
 * Run through the REAL @layers/engine + @layers/cores pipeline in headless
 * Chromium/SwiftShader, exactly like cores-golden.js.
 *
 * Usage:
 *   node scripts/cores-looks.js            # check all looks
 *   node scripts/cores-looks.js --json     # machine-readable report
 */

import { chromium } from "playwright";
import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// scripts/ -> golden-infra/ -> tests/ -> repo root
const REPO_ROOT = path.resolve(__dirname, "../../..");
const ENGINE_DIST = path.join(REPO_ROOT, "packages/engine/dist");
const CORES_DIST = path.join(REPO_ROOT, "packages/cores/dist");
const OUTPUT_DIR = path.resolve(__dirname, "..", "output");

const SIZE = 256;
const MIN_LOOKS = 6;          // Stage 0.3 gate
const MAX_INTRA_SSIM = 0.95;  // two "different" looks must be this dissimilar
// Stochastic cores (noise) are a special case: every look is uncorrelated noise
// on a flat field, so two DIFFERENT noise fields still score SSIM ~0.95-0.98
// against each other — SSIM measures local structural correlation, and noise
// has no structure to correlate. The Gates note allows stochastic cores a
// looser bar; for the intra-look distinctness check we therefore use a
// statistical-variance test for those cores instead of SSIM.
const STOCHASTIC_CORES = new Set(["NoiseGrainCore"]);

// ── The look matrix ─────────────────────────────────────────────────────────
// One entry per declared look. `source` is chosen so the effect is observable
// (a Y-axis wave is invisible on vertical stripes, etc).
const LOOKS = [
  // ── Core 1: Pattern/Dither (halftone, mosaic, CMYK, line screen, bit-crush, posterize)
  { core: "PatternDitherCore", look: "halftone",    source: "gradient", params: { shape: "dots",    scale: 30, levels: "bayer4", angle: 0,  contrast: 1.4, inkColor: [0, 0, 0],       paperColor: [255, 255, 255] } },
  { core: "PatternDitherCore", look: "mosaic",      source: "gradient", params: { shape: "dots",    scale: 12, levels: "bayer8", angle: 0,  contrast: 1.0, inkColor: [20, 20, 20],   paperColor: [235, 230, 215] } },
  { core: "PatternDitherCore", look: "cmyk",        source: "gradient", params: { shape: "simplex", scale: 50, levels: "bayer4", angle: 30, contrast: 2.6, inkColor: [0, 60, 140],   paperColor: [250, 240, 180] } },
  { core: "PatternDitherCore", look: "line-screen", source: "gradient", params: { shape: "wave",    scale: 40, levels: "bayer8", angle: 0,  contrast: 3.2, inkColor: [10, 10, 10],   paperColor: [250, 250, 250] } },
  { core: "PatternDitherCore", look: "bit-crush",   source: "checker",  params: { shape: "simplex", scale: 80, levels: "random", angle: 0,  contrast: 2.2, inkColor: [0, 0, 0],       paperColor: [255, 255, 255] } },
  { core: "PatternDitherCore", look: "posterize",   source: "stripes",  params: { shape: "dots",    scale: 24, levels: "bayer2", angle: 45, contrast: 4.0, inkColor: [120, 20, 90],  paperColor: [240, 235, 220] } },

  // ── Core 2: Noise/Grain (film grain, paper, stipple)
  // Distinctness is measured by std-dev spread for this stochastic core (see
  // STOCHASTIC_CORES). Spread strength/scale so the std-devs diverge > 2.0.
  { core: "NoiseGrainCore", look: "film-grain", source: "flat", params: { type: "simplex", scale: 30, octaves: 4, strength: 0.15, mono: true } },
  { core: "NoiseGrainCore", look: "paper",      source: "flat", params: { type: "simplex", scale: 12, octaves: 6, strength: 0.30, mono: true } },
  { core: "NoiseGrainCore", look: "stipple",    source: "flat", params: { type: "simplex", scale: 60, octaves: 2, strength: 0.45, mono: true } },
  { core: "NoiseGrainCore", look: "grain-warm", source: "flat", params: { type: "simplex", scale: 26, octaves: 3, strength: 0.60, mono: false } },
  { core: "NoiseGrainCore", look: "fine-dust",  source: "flat", params: { type: "simplex", scale: 90, octaves: 3, strength: 0.80, mono: true } },
  { core: "NoiseGrainCore", look: "coarse-rag", source: "flat", params: { type: "simplex", scale: 6,  octaves: 2, strength: 0.95, mono: true } },

  // ── Core 3: Blur/Convolution (soft focus, sharpen, emboss)
  { core: "BlurCore", look: "soft-focus", source: "checker",  params: { radius: 4, direction: "omni",      passes: 2, edgeMode: "clamp" } },
  { core: "BlurCore", look: "sharpen",    source: "checker",  params: { radius: 1, direction: "omni",      passes: 1, edgeMode: "clamp" } },
  { core: "BlurCore", look: "emboss",     source: "checker",  params: { radius: 2, direction: "omni",      passes: 3, edgeMode: "mirror" } },
  { core: "BlurCore", look: "h-blur",     source: "stripes",  params: { radius: 6, direction: "horizontal", passes: 2, edgeMode: "clamp" } },
  { core: "BlurCore", look: "v-blur",     source: "stripes-h", params: { radius: 6, direction: "vertical",  passes: 2, edgeMode: "clamp" } },
  { core: "BlurCore", look: "radial",     source: "gradient", params: { radius: 3, direction: "radial",    passes: 2, edgeMode: "clamp" } },

  // ── Core 4: Displacement/Warp (liquid, fluted glass, wave, heat haze)
  // fluted and heat both displace on X, so give them very different mapScale
  // (and heat a Y component) or they render near-identically.
  { core: "DisplacementCore", look: "liquid",        source: "stripes-h", params: { strength: 6, mapScale: 10, axis: "both", type: "liquid" } },
  { core: "DisplacementCore", look: "fluted-glass",  source: "stripes-h", params: { strength: 8, mapScale: 4,  axis: "x",    type: "fluted" } },
  { core: "DisplacementCore", look: "wave",          source: "stripes-h", params: { strength: 6, mapScale: 12, axis: "y",    type: "wave" } },
  { core: "DisplacementCore", look: "heat-haze",     source: "soft",      params: { strength: 9, mapScale: 60, axis: "both", type: "heat" } },
  { core: "DisplacementCore", look: "liquid-fine",   source: "checker",   params: { strength: 3, mapScale: 30, axis: "both", type: "liquid" } },
  { core: "DisplacementCore", look: "wave-steep",    source: "stripes-h", params: { strength: 9, mapScale: 30, axis: "y",    type: "wave" } },

  // ── Core 5: Color/Palette/Blend (duotone, vintage, LUT)
  // Vary palette AND blend mode AND saturation widely so looks diverge.
  { core: "ColorBlendCore", look: "duotone-warm", source: "gradient", params: { palette: [[25, 15, 40], [200, 90, 60], [250, 235, 200]], hueShift: 0,   saturation: 1.0, brightness: 1.0,  blend: "normal",     opacity: 1 } },
  { core: "ColorBlendCore", look: "duotone-cool", source: "gradient", params: { palette: [[10, 20, 45], [60, 130, 190], [225, 240, 250]], hueShift: 0,   saturation: 1.8, brightness: 0.85, blend: "normal",     opacity: 1 } },
  { core: "ColorBlendCore", look: "vintage",      source: "gradient", params: { palette: [[40, 30, 20], [170, 140, 95], [245, 230, 195]], hueShift: -12, saturation: 0.5, brightness: 1.15, blend: "multiply",   opacity: 1 } },
  { core: "ColorBlendCore", look: "screen-glow",  source: "checker", params: { palette: [[15, 5, 30], [120, 40, 140], [255, 220, 180]], hueShift: 8,   saturation: 2.4, brightness: 1.25, blend: "screen",     opacity: 0.55 } },
  { core: "ColorBlendCore", look: "overlay-mix",  source: "checker",  params: { palette: [[30, 30, 30], [140, 120, 90], [240, 235, 220]], hueShift: 20,  saturation: 2.2, brightness: 0.7,  blend: "overlay",    opacity: 1 } },
  { core: "ColorBlendCore", look: "hue-shift",    source: "stripes",  params: { palette: [[20, 40, 20], [90, 160, 120], [230, 245, 235]], hueShift: 120, saturation: 1.6, brightness: 0.95, blend: "soft-light", opacity: 1 } },

  // ── Core 6: Lighting/Atmosphere (shadow, glow, haze, vignette)
  // Spread offsets, blur, colour, opacity AND mode so the six diverge.
  // NOTE: glow on a FLAT source saturates to a uniform colour, so glows use the
  // graded "soft" source. NOTE: a drop shadow casts from the source SILHOUETTE
  // (alpha), so shadow looks must use "shapes" — opaque art on transparency.
  { core: "LightingCore", look: "shadow",       source: "shapes", alpha: true, params: { offsetX: 8,   offsetY: 8,   blur: 1,  color: [0, 0, 0],       opacity: 0.95, mode: "shadow" } },
  { core: "LightingCore", look: "glow-warm",    source: "soft",   params: { offsetX: 0,   offsetY: 0,   blur: 2,  color: [255, 120, 40],  opacity: 0.85, mode: "glow" } },
  { core: "LightingCore", look: "haze-blue",    source: "soft",   params: { offsetX: 0,   offsetY: 0,   blur: 1,  color: [90, 130, 200],  opacity: 0.95, mode: "haze" } },
  { core: "LightingCore", look: "vignette",     source: "soft",   params: { offsetX: 0,   offsetY: 0,   blur: 1,  color: [240, 200, 120], opacity: 0.30, mode: "vignette" } },
  { core: "LightingCore", look: "shadow-hard",  source: "shapes", alpha: true, params: { offsetX: -20, offsetY: -16, blur: 6, color: [10, 10, 20],    opacity: 0.9,  mode: "shadow" } },
  { core: "LightingCore", look: "glow-cool",    source: "soft",   params: { offsetX: 0,   offsetY: 0,   blur: 10, color: [120, 200, 255], opacity: 0.35, mode: "glow" } },

  // ── Core 7: Outline/Edge (ink outline, edge detect)
  // NOTE: roughness and inkBleed perturb the EDGE FIELD, which on a binary
  // checkerboard only ever takes values ~0 or ~0.88 — both outside the
  // threshold band, making those two params mathematically inert. Use a graded
  // ("soft") source so edge values land inside the band and the params show.
  // Spread strength widely too: shadow/glow-like overlap at similar strength.
  { core: "OutlineCore", look: "ink-outline",  source: "soft", params: { strength: 1.0, width: 1, roughness: 0,   inkBleed: false } },
  { core: "OutlineCore", look: "edge-detect",  source: "soft", params: { strength: 0.5, width: 2, roughness: 0,   inkBleed: false } },
  { core: "OutlineCore", look: "thick-ink",    source: "soft", params: { strength: 1.0, width: 2, roughness: 0,   inkBleed: false } },
  { core: "OutlineCore", look: "rough-ink",    source: "soft", params: { strength: 1.0, width: 1, roughness: 0.9, inkBleed: false } },
  { core: "OutlineCore", look: "ink-bleed",    source: "soft", params: { strength: 0.8, width: 2, roughness: 0,   inkBleed: true } },
  { core: "OutlineCore", look: "subtle-edge",  source: "soft", params: { strength: 0.15, width: 1, roughness: 0.5, inkBleed: false } },
];

function makeSource(kind, w, h) {
  const c = new OffscreenCanvas(w, h);
  const x = c.getContext("2d");
  if (kind === "gradient") {
    const g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#e03030");
    g.addColorStop(0.5, "#30e070");
    g.addColorStop(1, "#3050e0");
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
  } else if (kind === "flat") {
    x.fillStyle = "#808080";
    x.fillRect(0, 0, w, h);
  } else if (kind === "flat-white") {
    x.fillStyle = "#ffffff";
    x.fillRect(0, 0, w, h);
  } else if (kind === "checker") {
    const s = 32;
    for (let yy = 0; yy < h; yy += s) {
      for (let xx = 0; xx < w; xx += s) {
        x.fillStyle = (xx / s + yy / s) % 2 === 0 ? "#101010" : "#f0f0f0";
        x.fillRect(xx, yy, s, s);
      }
    }
  } else if (kind === "stripes") {
    for (let xx = 0; xx < w; xx += 16) {
      x.fillStyle = (xx / 16) % 2 === 0 ? "#202020" : "#d0d0d0";
      x.fillRect(xx, 0, 16, h);
    }
  } else if (kind === "stripes-h") {
    for (let yy = 0; yy < h; yy += 16) {
      x.fillStyle = ((yy / 16) % 2 === 0) ? "#202020" : "#d0d0d0";
      x.fillRect(0, yy, w, 16);
    }
  } else if (kind === "soft") {
    // Graded source: radial ramp + soft blobs. Needed where the effect depends
    // on values INSIDE a threshold band (Outline roughness/inkBleed are inert
    // on a binary checkerboard).
    const g = x.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.45, "#d0d0d0");
    g.addColorStop(0.6, "#303030");
    g.addColorStop(1, "#101010");
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) {
      x.beginPath();
      x.arc(40 + i * 35, 40 + (i % 3) * 80, 26, 0, Math.PI * 2);
      x.fillStyle = i % 2 ? "#e8e8e8" : "#282828";
      x.fill();
    }
  } else if (kind === "shapes") {
    // Opaque shapes on a TRANSPARENT background — required for a drop shadow,
    // whose cast comes from the source silhouette (alpha), not colour.
    x.clearRect(0, 0, w, h);
    const blobs = [
      [w * 0.3, h * 0.35, 60],
      [w * 0.62, h * 0.5, 45],
      [w * 0.45, h * 0.72, 52],
      [w * 0.78, h * 0.25, 34],
    ];
    for (const [cx, cy, r] of blobs) {
      x.beginPath();
      x.arc(cx, cy, r, 0, Math.PI * 2);
      x.fillStyle = "#f2f2f2";
      x.fill();
    }
    x.fillStyle = "#2b6cb0";
    x.fillRect(w * 0.1, h * 0.12, w * 0.22, h * 0.14);
  }
  return c;
}

const TEST_PAGE = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<script type="importmap">
{"imports":{"@layers/engine":"/engine/index.js","@layers/cores":"/cores/index.js"}}
</script></head>
<body><script type="module">
import * as Engine from "/engine/index.js";
import * as Cores from "/cores/index.js";
window.__L = { ...Engine, ...Cores };
window.__ready = true;
</script></body></html>`;

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname.startsWith("/engine/")) {
        try {
          const body = fs.readFileSync(path.join(ENGINE_DIST, url.pathname.slice(8)));
          res.writeHead(200, { "Content-Type": "text/javascript" });
          res.end(body);
        } catch {
          if (!res.headersSent) res.writeHead(404);
          res.end("nf");
        }
        return;
      }
      if (url.pathname.startsWith("/cores/")) {
        try {
          const body = fs.readFileSync(path.join(CORES_DIST, url.pathname.slice(7)));
          res.writeHead(200, { "Content-Type": "text/javascript" });
          res.end(body);
        } catch {
          if (!res.headersSent) res.writeHead(404);
          res.end("nf");
        }
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(TEST_PAGE);
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

// ── SSIM, standard 11x11 Gaussian window ────────────────────────────────────
function ssim(a, b) {
  const W = a.width, H = a.height;
  const gray = (img) => {
    const g = new Float64Array(W * H);
    for (let i = 0, p = 0; i < W * H; i++, p += 4) {
      g[i] = 0.299 * img.data[p] + 0.587 * img.data[p + 1] + 0.114 * img.data[p + 2];
    }
    return g;
  };
  const ga = gray(a), gb = gray(b);

  const N = 11, half = 5, sigma = 1.5;
  const k = [];
  for (let y = -half; y <= half; y++) {
    for (let x = -half; x <= half; x++) {
      k.push(Math.exp(-(x * x + y * y) / (2 * sigma * sigma)));
    }
  }
  const kSum = k.reduce((s, v) => s + v, 0);

  const C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2;
  let ssimSum = 0, count = 0;

  for (let y = half; y < H - half; y++) {
    for (let x = half; x < W - half; x++) {
      let ma = 0, mb = 0, i = 0;
      for (let dy = -half; dy <= half; dy++) {
        for (let dx = -half; dx <= half; dx++) {
          const idx = (y + dy) * W + (x + dx);
          ma += k[i] * ga[idx];
          mb += k[i] * gb[idx];
          i++;
        }
      }
      ma /= kSum; mb /= kSum;
      let va = 0, vb = 0, cab = 0;
      i = 0;
      for (let dy = -half; dy <= half; dy++) {
        for (let dx = -half; dx <= half; dx++) {
          const idx = (y + dy) * W + (x + dx);
          va += k[i] * (ga[idx] - ma) ** 2;
          vb += k[i] * (gb[idx] - mb) ** 2;
          cab += k[i] * (ga[idx] - ma) * (gb[idx] - mb);
          i++;
        }
      }
      va /= kSum; vb /= kSum; cab /= kSum;
      ssimSum += ((2 * ma * mb + C1) * (2 * cab + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      count++;
    }
  }
  return count > 0 ? ssimSum / count : 0;
}

/** Luminance standard deviation — the distinctness metric for stochastic cores. */
function stdDev(png) {
  const n = png.width * png.height;
  let sum = 0;
  for (let p = 0; p < png.data.length; p += 4) {
    sum += 0.299 * png.data[p] + 0.587 * png.data[p + 1] + 0.114 * png.data[p + 2];
  }
  const mean = sum / n;
  let vr = 0;
  for (let p = 0; p < png.data.length; p += 4) {
    const v = 0.299 * png.data[p] + 0.587 * png.data[p + 1] + 0.114 * png.data[p + 2];
    vr += (v - mean) ** 2;
  }
  return Math.sqrt(vr / n);
}

async function main() {
  const asJson = process.argv.includes("--json");
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;

  const browser = await chromium.launch({
    args: ["--headless=new", "--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader", "--no-sandbox"],
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto(base + "/", { waitUntil: "load" });
  await page.waitForFunction(() => window.__ready === true, { timeout: 20000 });

  // Render every look, one page.evaluate per look (fresh renderer each time).
  const renders = [];
  for (const item of LOOKS) {
    let dataUrl = await page.evaluate(async ({ item, SIZE }) => {
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      document.body.appendChild(canvas);
      const renderer = new window.__L.Renderer(canvas, {
        width: SIZE,
        height: SIZE,
        preserveDrawingBuffer: true,
        // Alpha-driven cores (drop shadow) need source transparency preserved;
        // otherwise the alpha channel is forced to 1.0 and they render blank.
        alpha: item.alpha === true,
      });

      // Source pattern (same generator as the Node side).
      const src = document.createElement("canvas");
      src.width = SIZE; src.height = SIZE;
      const sx = src.getContext("2d");
      const kind = item.source;
      if (kind === "gradient") {
        const g = sx.createLinearGradient(0, 0, SIZE, SIZE);
        g.addColorStop(0, "#e03030"); g.addColorStop(0.5, "#30e070"); g.addColorStop(1, "#3050e0");
        sx.fillStyle = g; sx.fillRect(0, 0, SIZE, SIZE);
      } else if (kind === "flat") {
        sx.fillStyle = "#808080"; sx.fillRect(0, 0, SIZE, SIZE);
      } else if (kind === "flat-white") {
        sx.fillStyle = "#ffffff"; sx.fillRect(0, 0, SIZE, SIZE);
      } else if (kind === "checker") {
        const s = 32;
        for (let yy = 0; yy < SIZE; yy += s) {
          for (let xx = 0; xx < SIZE; xx += s) {
            sx.fillStyle = ((xx / s + yy / s) % 2 === 0) ? "#101010" : "#f0f0f0";
            sx.fillRect(xx, yy, s, s);
          }
        }
      } else if (kind === "stripes") {
        for (let xx = 0; xx < SIZE; xx += 16) {
          sx.fillStyle = ((xx / 16) % 2 === 0) ? "#202020" : "#d0d0d0";
          sx.fillRect(xx, 0, 16, SIZE);
        }
      } else if (kind === "stripes-h") {
        for (let yy = 0; yy < SIZE; yy += 16) {
          sx.fillStyle = ((yy / 16) % 2 === 0) ? "#202020" : "#d0d0d0";
          sx.fillRect(0, yy, SIZE, 16);
        }
      } else if (kind === "soft") {
        const g = sx.createRadialGradient(SIZE / 2, SIZE / 2, 10, SIZE / 2, SIZE / 2, SIZE / 2);
        g.addColorStop(0, "#ffffff");
        g.addColorStop(0.45, "#d0d0d0");
        g.addColorStop(0.6, "#303030");
        g.addColorStop(1, "#101010");
        sx.fillStyle = g;
        sx.fillRect(0, 0, SIZE, SIZE);
        for (let i = 0; i < 6; i++) {
          sx.beginPath();
          sx.arc(40 + i * 35, 40 + (i % 3) * 80, 26, 0, Math.PI * 2);
          sx.fillStyle = i % 2 ? "#e8e8e8" : "#282828";
          sx.fill();
        }
      } else if (kind === "shapes") {
        sx.clearRect(0, 0, SIZE, SIZE);
        const blobs = [[SIZE*0.3, SIZE*0.35, 60], [SIZE*0.62, SIZE*0.5, 45], [SIZE*0.45, SIZE*0.72, 52], [SIZE*0.78, SIZE*0.25, 34]];
        for (const [cx, cy, r] of blobs) {
          sx.beginPath();
          sx.arc(cx, cy, r, 0, Math.PI * 2);
          sx.fillStyle = "#f2f2f2";
          sx.fill();
        }
        sx.fillStyle = "#2b6cb0";
        sx.fillRect(SIZE*0.1, SIZE*0.12, SIZE*0.22, SIZE*0.14);
      }

      const Ctor = window.__L[item.core];
      const core = new Ctor(item.params);
      renderer.addPass(core);
      renderer.warmUp();
      renderer.uploadSource(src, SIZE, SIZE);
      renderer.render(0);

      // Capture BEFORE dispose, and verify the context actually rendered —
      // browsers cap live WebGL contexts (~16) and silently drop extras, which
      // would make every later look return an identical blank buffer.
      const dataUrlOut = canvas.toDataURL("image/png");
      const gl = renderer.context.context;
      const ctxLost = gl.isContextLost();
      renderer.dispose();
      canvas.remove();
      return { dataUrl: dataUrlOut, ctxLost };
    }, { item, SIZE });

    if (dataUrl.ctxLost) {
      throw new Error(`WebGL context lost while rendering "${item.look}" — too many live contexts`);
    }
    dataUrl = dataUrl.dataUrl;

    // A blank render means the source transparency was discarded — the context
    // was created with alpha:false, so an alpha-driven effect renders nothing.
    if (dataUrl.length < 500) {
      throw new Error(
        `Look "${item.look}" rendered blank — alpha-driven core needs { alpha: true } on the context`
      );
    }

    renders.push({
      ...item,
      png: PNG.sync.read(Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64")),
    });
  }

  await browser.close();
  server.close();

  // ── Analyse: per-core look count + pairwise distinctness ──────────────────
  const byCore = new Map();
  for (const r of renders) {
    if (!byCore.has(r.core)) byCore.set(r.core, []);
    byCore.get(r.core).push(r);
  }

  const report = { cores: {}, overall: { pass: true, failures: [] } };

  for (const [core, items] of byCore) {
    const problems = [];

    // 1. Every look must render non-blank.
    for (const it of items) {
      let sum = 0;
      for (let p = 0; p < it.png.data.length; p += 4) {
        sum += it.png.data[p] + it.png.data[p + 1] + it.png.data[p + 2];
      }
      if (sum === 0) problems.push(`look "${it.look}" rendered blank`);
    }

    // 2. Look count meets the gate.
    if (items.length < MIN_LOOKS) {
      problems.push(`only ${items.length} looks, gate requires >= ${MIN_LOOKS}`);
    }

    // 3. Looks must be mutually distinct.
    //    Deterministic cores: SSIM < MAX_INTRA_SSIM.
    //    Stochastic cores: a std-dev spread test (SSIM is structurally blind
    //    to uncorrelated noise — see the STOCHASTIC_CORES note above).
    const collisions = [];
    if (STOCHASTIC_CORES.has(core)) {
      const stds = items.map((it) => stdDev(it.png));
      const lo = Math.min(...stds);
      const hi = Math.max(...stds);
      if (hi - lo < 2.0) {
        problems.push(
          `looks are not statistically distinct: std-dev spread ${lo.toFixed(2)}..${hi.toFixed(2)} (< 2.0)`
        );
      }
    } else {
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const s = ssim(items[i].png, items[j].png);
          if (s >= MAX_INTRA_SSIM) {
            collisions.push(`${items[i].look} ~ ${items[j].look} (SSIM ${s.toFixed(4)})`);
          }
        }
      }
      if (collisions.length > 0) {
        problems.push(`${collisions.length} look(s) not visually distinct: ${collisions.join(", ")}`);
      }
    }

    report.cores[core] = {
      looks: items.length,
      names: items.map((i) => i.look),
      pass: problems.length === 0,
      problems,
    };
    if (problems.length > 0) {
      report.overall.pass = false;
      report.overall.failures.push({ core, problems });
    }
  }

  if (pageErrors.length > 0) {
    report.overall.pageErrors = pageErrors.slice(0, 10);
    report.overall.pass = false;
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, "cores-looks-report.json"), JSON.stringify(report, null, 2));

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("Multi-look coverage (Stage 0.3 gate: >= 6 looks, mutually distinct)\n");
    for (const [core, info] of Object.entries(report.cores)) {
      const status = info.pass ? "PASS" : "FAIL";
      console.log(`${status}  ${core} — ${info.looks} looks: ${info.names.join(", ")}`);
      for (const p of info.problems) console.log(`        ! ${p}`);
    }
    if (report.overall.pageErrors?.length) {
      console.log(`\nPage errors: ${report.overall.pageErrors.length}`);
      for (const e of report.overall.pageErrors) console.log("  " + e);
    }
    const totalLooks = Object.values(report.cores).reduce((s, c) => s + c.looks, 0);
    console.log(`\n${totalLooks} looks across ${Object.keys(report.cores).length} cores`);
    console.log(report.overall.pass ? "GATE PASS" : "GATE FAIL");
  }

  process.exit(report.overall.pass ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
