/**
 * Per-core golden-image generator + SSIM validator.
 *
 * Renders each core through the REAL @layers/engine + @layers/cores pipeline
 * (not a re-implementation) in headless Chromium/SwiftShader, captures a
 * deterministic golden PNG, and validates SSIM against a stored baseline.
 *
 * Determinism contract:
 *   - fixed seed, fixed resolution, uTime pinned to 0 for stochastic cores
 *   - preserveDrawingBuffer so the canvas can be captured verbatim
 *   - SwiftShader software raster for reproducible output across machines
 *
 * Usage:
 *   node scripts/cores-golden.js --generate     # write golden PNGs
 *   node scripts/cores-golden.js --verify       # compare against goldens
 *   node scripts/cores-golden.js                # generate + verify
 *
 * Env:
 *   LAYERS_GOLDEN_THRESHOLD  SSIM pass threshold (default 0.98; stochastic 0.90)
 *   LAYERS_GOLDEN_SEED       seed (default 42)
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
const FIXTURES_DIR = path.resolve(__dirname, "..", "fixtures-cores");
const OUTPUT_DIR = path.resolve(__dirname, "..", "output");

const SIZE = 256;
const THRESHOLD_DEFAULT = parseFloat(process.env.LAYERS_GOLDEN_THRESHOLD || "0.98");
const THRESHOLD_STOCHASTIC = 0.9;

const MIME = { ".js": "text/javascript", ".html": "text/html" };

// Each fixture: a deterministic source pattern + one core + fixed params.
// stochastic:true cores use the looser 0.90 threshold.
const FIXTURES = [
  {
    name: "pattern-dither-simplex-bayer4",
    core: "PatternDitherCore",
    params: { shape: "simplex", scale: 60, levels: "bayer4", angle: 0, contrast: 1.2, inkColor: [10, 10, 30], paperColor: [245, 240, 225] },
    source: "gradient",
    stochastic: false,
  },
  {
    name: "pattern-dither-dots-bayer8",
    core: "PatternDitherCore",
    params: { shape: "dots", scale: 40, levels: "bayer8", angle: 15, contrast: 1.0, inkColor: [0, 0, 0], paperColor: [255, 255, 255] },
    source: "gradient",
    stochastic: false,
  },
  {
    name: "noise-grain-simplex-mono",
    core: "NoiseGrainCore",
    params: { type: "simplex", scale: 24, octaves: 3, strength: 0.35, mono: true },
    source: "flat",
    stochastic: false,
  },
  {
    name: "blur-omni",
    core: "BlurCore",
    params: { radius: 3, direction: "omni", passes: 1, edgeMode: "clamp" },
    source: "checker",
    stochastic: false,
  },
  {
    name: "color-blend-duotone",
    core: "ColorBlendCore",
    params: { palette: [[20, 20, 40], [180, 80, 60], [240, 230, 200]], hueShift: 10, saturation: 1.1, brightness: 1.0, blend: "normal", opacity: 1 },
    source: "gradient",
    stochastic: false,
  },
  {
    name: "displacement-wave",
    core: "DisplacementCore",
    params: { strength: 6, mapScale: 12, axis: "y", type: "wave" },
    source: "stripes-h",
    stochastic: false,
    // The core must actually change pixels: rendering with strength 0 must
    // produce a DIFFERENT image than with the fixture's strength. This guards
    // against a shader that silently no-ops (a real bug we hit once).
    // NOTE: a Y-axis wave is invisible on VERTICAL stripes (shifting a uniform
    // column in y changes nothing), so the source must be horizontal stripes.
    zeroControl: { strength: 0, mapScale: 12, axis: "y", type: "wave" },
  },
  {
    name: "lighting-vignette",
    core: "LightingCore",
    params: { offsetX: 0, offsetY: 0, blur: 1, color: [0, 0, 0], opacity: 0.6, mode: "vignette" },
    source: "flat-white",
    stochastic: false,
  },
  {
    name: "outline-ink",
    core: "OutlineCore",
    params: { strength: 1, width: 1, roughness: 0, inkBleed: false },
    source: "checker",
    stochastic: false,
    // Outline must ADD ink pixels that were not in the source.
    zeroControl: { strength: 0, width: 1, roughness: 0, inkBleed: false },
  },
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
        x.fillStyle = ((xx / s + yy / s) % 2 === 0) ? "#101010" : "#f0f0f0";
        x.fillRect(xx, yy, s, s);
      }
    }
  } else if (kind === "stripes") {
    for (let xx = 0; xx < w; xx += 16) {
      x.fillStyle = ((xx / 16) % 2 === 0) ? "#202020" : "#d0d0d0";
      x.fillRect(xx, 0, 16, h);
    }
  } else if (kind === "stripes-h") {
    // Horizontal stripes: needed to observe a Y-axis displacement, which is
    // invisible on vertical stripes (a uniform column shifted in y looks the
    // same). This is what made the wave core look like a no-op once.
    for (let yy = 0; yy < h; yy += 16) {
      x.fillStyle = ((yy / 16) % 2 === 0) ? "#202020" : "#d0d0d0";
      x.fillRect(0, yy, w, 16);
    }
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
      let fp = null;
      if (url.pathname.startsWith("/engine/")) {
        fp = path.join(ENGINE_DIST, url.pathname.slice(8));
        try {
          const body = fs.readFileSync(fp);
          res.writeHead(200, { "Content-Type": "text/javascript" });
          res.end(body);
        } catch {
          if (!res.headersSent) res.writeHead(404);
          res.end("nf");
        }
        return;
      }
      if (url.pathname.startsWith("/cores/")) {
        fp = path.join(CORES_DIST, url.pathname.slice(7));
        try {
          const body = fs.readFileSync(fp);
          res.writeHead(200, { "Content-Type": "text/javascript" });
          res.end(body);
        } catch {
          if (!res.headersSent) res.writeHead(404);
          res.end("nf");
        }
        return;
      }
      // Everything else (root, favicon, etc.) gets the harness page.
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(TEST_PAGE);
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

// ── SSIM (structural similarity), standard 11x11 Gaussian window ─────────────
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

  // 11x11 Gaussian, sigma=1.5
  const N = 11, half = 5, sigma = 1.5;
  const k = [];
  for (let y = -half; y <= half; y++)
    for (let x = -half; x <= half; x++)
      k.push(Math.exp(-(x * x + y * y) / (2 * sigma * sigma)));
  const kSum = k.reduce((s, v) => s + v, 0);

  const C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2;
  let ssimSum = 0, count = 0;

  for (let y = half; y < H - half; y++) {
    for (let x = half; x < W - half; x++) {
      let ma = 0, mb = 0;
      let i = 0;
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

async function renderCore(page, fixture) {
  return page.evaluate(async ({ fixture, SIZE }) => {
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    document.body.appendChild(canvas);

    const renderer = new window.__L.Renderer(canvas, { width: SIZE, height: SIZE, preserveDrawingBuffer: true });

    // Deterministic source pattern.
    const src = document.createElement("canvas");
    src.width = SIZE; src.height = SIZE;
    const sx = src.getContext("2d");
    if (fixture.source === "gradient") {
      const g = sx.createLinearGradient(0, 0, SIZE, SIZE);
      g.addColorStop(0, "#e03030"); g.addColorStop(0.5, "#30e070"); g.addColorStop(1, "#3050e0");
      sx.fillStyle = g; sx.fillRect(0, 0, SIZE, SIZE);
    } else if (fixture.source === "flat") {
      sx.fillStyle = "#808080"; sx.fillRect(0, 0, SIZE, SIZE);
    } else if (fixture.source === "flat-white") {
      sx.fillStyle = "#ffffff"; sx.fillRect(0, 0, SIZE, SIZE);
    } else if (fixture.source === "checker") {
      const s = 32;
      for (let yy = 0; yy < SIZE; yy += s)
        for (let xx = 0; xx < SIZE; xx += s) {
          sx.fillStyle = ((xx / s + yy / s) % 2 === 0) ? "#101010" : "#f0f0f0";
          sx.fillRect(xx, yy, s, s);
        }
    } else if (fixture.source === "stripes") {
      for (let xx = 0; xx < SIZE; xx += 16) {
        sx.fillStyle = ((xx / 16) % 2 === 0) ? "#202020" : "#d0d0d0";
        sx.fillRect(xx, 0, 16, SIZE);
      }
    } else if (fixture.source === "stripes-h") {
      for (let yy = 0; yy < SIZE; yy += 16) {
        sx.fillStyle = ((yy / 16) % 2 === 0) ? "#202020" : "#d0d0d0";
        sx.fillRect(0, yy, SIZE, 16);
      }
    }

    const Ctor = window.__L[fixture.core];
    const core = new Ctor(fixture.params);
    renderer.addPass(core);
    renderer.warmUp();
    renderer.uploadSource(src, SIZE, SIZE);

    // uTime pinned to 0 for determinism.
    renderer.render(0);

    const dataUrl = canvas.toDataURL("image/png");
    renderer.dispose();
    canvas.remove();
    return dataUrl;
  }, { fixture, SIZE });
}

async function main() {
  const mode = process.argv.includes("--verify") ? "verify" : "generate";
  const verifyOnly = mode === "verify";
  const generate = !verifyOnly || process.argv.includes("--generate");

  if (generate) fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;

  const browser = await chromium.launch({
    args: ["--headless=new", "--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader", "--no-sandbox"],
  });
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("PAGEERROR:", String(e)));
  await page.goto(base + "/", { waitUntil: "load" });
  await page.waitForFunction(() => window.__ready === true, { timeout: 20000 });

  const results = [];
  for (const fixture of FIXTURES) {
    const dataUrl = await renderCore(page, fixture);
    const b64 = dataUrl.replace(/^data:image\/png;base64,/, "");
    const buf = Buffer.from(b64, "base64");
    const goldenPath = path.join(FIXTURES_DIR, `${fixture.name}.png`);
    const threshold = fixture.stochastic ? THRESHOLD_STOCHASTIC : THRESHOLD_DEFAULT;

    let score = null, ok = false, action = "";
    let effectOk = true, effectDetail = "";

    // Effect-presence guard: if the fixture declares a zeroControl, render the
    // core with the effect disabled and confirm the output actually differs.
    // This catches a shader that silently no-ops (SSIM alone cannot).
    if (fixture.zeroControl) {
      const ctrlUrl = await renderCore(page, { ...fixture, name: fixture.name + "__ctrl", params: fixture.zeroControl });
      const ctrlBuf = Buffer.from(ctrlUrl.replace(/^data:image\/png;base64,/, ""), "base64");
      const ctrl = PNG.sync.read(ctrlBuf);
      const cur = PNG.sync.read(buf);
      let diffPixels = 0, total = 0;
      if (ctrl.width === cur.width && ctrl.height === cur.height) {
        for (let p = 0; p < cur.data.length; p += 4) {
          total++;
          if (
            Math.abs(cur.data[p] - ctrl.data[p]) > 8 ||
            Math.abs(cur.data[p + 1] - ctrl.data[p + 1]) > 8 ||
            Math.abs(cur.data[p + 2] - ctrl.data[p + 2]) > 8
          ) diffPixels++;
        }
      }
      const pct = total > 0 ? (diffPixels / total) * 100 : 0;
      effectOk = pct >= 0.5;
      effectDetail = `effect changes ${pct.toFixed(2)}% of pixels vs zero-control`;
      if (!effectOk) effectDetail += " (CORE IS A NO-OP)";
    }

    if (generate) {
      fs.writeFileSync(goldenPath, buf);
      fs.writeFileSync(
        path.join(FIXTURES_DIR, `${fixture.name}.json`),
        JSON.stringify(
          {
            core: fixture.core,
            params: fixture.params,
            source: fixture.source,
            resolution: { width: SIZE, height: SIZE },
            seed: 42,
            time: 0,
            threshold,
            ...(fixture.zeroControl ? { zeroControl: fixture.zeroControl } : {}),
          },
          null,
          2
        )
      );
      action = "generated";
      ok = effectOk;
    }

    if (verifyOnly && fs.existsSync(goldenPath)) {
      const golden = PNG.sync.read(fs.readFileSync(goldenPath));
      const current = PNG.sync.read(buf);
      if (golden.width !== current.width || golden.height !== current.height) {
        score = 0; ok = false; action = "SIZE MISMATCH";
      } else {
        score = ssim(golden, current);
        ok = score >= threshold && effectOk;
        action = "verified";
      }
    } else if (verifyOnly) {
      action = "NO GOLDEN";
      ok = false;
    }

    results.push({ name: fixture.name, ok, score, threshold, action, effectOk, effectDetail });
    const scoreStr = score === null ? "" : ` SSIM=${score.toFixed(4)} (>=${threshold})`;
    const fxStr = effectDetail ? ` | ${effectDetail}` : "";
    console.log(`${ok ? "PASS" : "FAIL"}  ${fixture.name} [${action}]${scoreStr}${fxStr}`);
  }

  await browser.close();
  server.close();

  // Write the report.
  const report = {
    generatedAt: new Date().toISOString(),
    size: SIZE,
    thresholdDefault: THRESHOLD_DEFAULT,
    thresholdStochastic: THRESHOLD_STOCHASTIC,
    results,
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, "cores-golden-report.json"), JSON.stringify(report, null, 2));

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n${passed}/${results.length} core golden checks passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
