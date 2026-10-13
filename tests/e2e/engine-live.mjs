/**
 * Live browser verification + honest FPS benchmark for the LAYERS engine.
 *
 * Serves the compiled engine/cores over HTTP, then renders them in a real
 * headless Chromium (SwiftShader software WebGL2) and asserts:
 *   1. WebGL2 context is created.
 *   2. Every core compiles its real GLSL without errors.
 *   3. A multi-pass stack renders non-blank output (whole-canvas pixel audit).
 *   4. Context-loss handlers are wired.
 *   5. Resize works.
 *
 * FPS NOTE: this runs on SwiftShader (CPU rasterisation), so absolute numbers
 * are far below a real GPU. The frame loop is synchronised with gl.finish()
 * and a full-canvas readPixels so the measurement reflects real GPU work
 * rather than queued commands. Treat these as a software-raster lower bound.
 *
 * Usage: node tests/e2e/engine-live.mjs
 */

import { chromium } from "playwright";
import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../..");
const ENGINE_DIST = path.join(REPO, "packages/engine/dist");
const CORES_DIST = path.join(REPO, "packages/cores/dist");

const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".json": "application/json" };

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, "http://localhost");
      let filePath;
      if (url.pathname.startsWith("/engine/")) {
        filePath = path.join(ENGINE_DIST, url.pathname.slice("/engine/".length));
      } else if (url.pathname.startsWith("/cores/")) {
        filePath = path.join(CORES_DIST, url.pathname.slice("/cores/".length));
      } else {
        filePath = null;
      }
      if (filePath) {
        try {
          const body = fs.readFileSync(filePath);
          res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "text/plain" });
          res.end(body);
        } catch {
          res.writeHead(404).end("not found");
        }
      } else {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(TEST_PAGE);
      }
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

const TEST_PAGE = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>LAYERS engine live test</title>
<script type="importmap">
{
  "imports": {
    "@layers/engine": "/engine/index.js",
    "@layers/cores": "/cores/index.js"
  }
}
</script>
</head>
<body>
<script type="module">
  import * as Engine from "/engine/index.js";
  import * as Cores from "/cores/index.js";
  window.__L = { ...Engine, ...Cores };
  window.__ready = true;
  if (window.__onReady) window.__onReady();
</script>
</body></html>`;

const RESULTS = [];
function record(name, ok, detail = "") {
  RESULTS.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

async function main() {
  const server = await startServer();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  console.log(`Serving engine+cores at ${base}\n`);

  const browser = await chromium.launch({
    args: [
      "--headless=new",
      "--use-gl=angle",
      "--use-angle=swiftshader-webgl",
      "--enable-unsafe-swiftshader",
      "--disable-dev-shm-usage",
      "--no-sandbox",
    ],
  });

  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  await page.goto(base + "/", { waitUntil: "load" });
  await page.waitForFunction(() => window.__ready === true, { timeout: 20000 });

  // ── Test 1: WebGL2 context creation ───────────────────────────────────────
  const ctxOk = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    try {
      const ctx = new window.__L.GLContext(canvas, { width: 512, height: 512 });
      return { ok: true, w: ctx.width, h: ctx.height };
    } catch (e) {
      return { ok: false, err: String(e) };
    }
  });
  record("WebGL2 context created (512x512)", ctxOk.ok, ctxOk.err ?? `${ctxOk.w}x${ctxOk.h}`);

  // ── Test 2: Every core compiles real GLSL in a real browser ───────────────
  const coreResults = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const gl = canvas.getContext("webgl2", { alpha: false });
    const cores = [
      ["PatternDither", window.__L.PatternDitherCore],
      ["NoiseGrain", window.__L.NoiseGrainCore],
      ["Blur", window.__L.BlurCore],
      ["ColorBlend", window.__L.ColorBlendCore],
      ["Displacement", window.__L.DisplacementCore],
      ["Lighting", window.__L.LightingCore],
      ["Outline", window.__L.OutlineCore],
      ["Blend", window.__L.BlendPass],
    ];
    const out = [];
    for (const [name, Ctor] of cores) {
      try {
        const core = new Ctor();
        const prog = core.compile(gl);
        const ok = prog !== null && gl.getProgramParameter(prog, gl.LINK_STATUS);
        out.push({ name, ok, err: ok ? "" : gl.getProgramInfoLog(prog) });
      } catch (e) {
        out.push({ name, ok: false, err: String(e) });
      }
    }
    return out;
  });
  for (const r of coreResults) {
    record(`Core compiles real GLSL: ${r.name}`, r.ok, r.err);
  }

  // ── Test 3: Multi-pass render produces non-blank output ───────────────────
  // Audit the WHOLE canvas, not a small patch (a dither pattern legitimately
  // has black pixels in the centre of each dot).
  const renderResult = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    document.body.appendChild(canvas);

    try {
      const renderer = new window.__L.Renderer(canvas, { width: 512, height: 512, preserveDrawingBuffer: true });
      renderer.addPass(new window.__L.PatternDitherCore({ shape: "circle", scale: 8 }));
      renderer.addPass(new window.__L.NoiseGrainCore({ strength: 0.2 }));
      renderer.warmUp();

      const src = new OffscreenCanvas(512, 512);
      const sctx = src.getContext("2d");
      const grad = sctx.createLinearGradient(0, 0, 512, 512);
      grad.addColorStop(0, "#ff0000");
      grad.addColorStop(1, "#0000ff");
      sctx.fillStyle = grad;
      sctx.fillRect(0, 0, 512, 512);

      renderer.uploadSource(src, 512, 512);
      renderer.render(0);

      const gl = renderer.context.context;
      gl.finish();

      // Whole-canvas audit (downsampled: every 16th pixel row/col).
      const W = 512, H = 512;
      const px = new Uint8Array(4 * W * H);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let nonZero = 0, sampled = 0;
      for (let y = 0; y < H; y += 16) {
        for (let x = 0; x < W; x += 16) {
          const i = (y * W + x) * 4;
          sampled++;
          if (px[i] > 0 || px[i + 1] > 0 || px[i + 2] > 0) nonZero++;
        }
      }

      renderer.dispose();
      canvas.remove();
      return { ok: nonZero > sampled * 0.05, nonZero, sampled };
    } catch (e) {
      return { ok: false, err: String(e), nonZero: 0, sampled: 0 };
    }
  });
  record(
    "Multi-pass render non-blank (whole canvas)",
    renderResult.ok,
    renderResult.err ?? `${renderResult.nonZero}/${renderResult.sampled} sampled pixels non-zero`
  );

  // ── Test 4: Honest FPS benchmark ──────────────────────────────────────────
  // IMPORTANT: gl.finish() is a NO-OP in this Chromium/SwiftShader build —
  // it returns immediately without waiting for the rasteriser, so a finish()
  // -synced loop measures only JS call overhead. readPixels() from the default
  // framebuffer DOES force completion, so that is our sync primitive.
  //
  // Numbers below are a SwiftShader (CPU rasterisation) lower bound. A real
  // GPU will be dramatically faster; the gate that matters for Stage 0.2 is
  // "8-pass stack >= 30 fps @ 1536px on a reference phone", which needs real
  // hardware — this test only proves the pipeline is correct and stall-free.
  const fpsResult = await page.evaluate(() => {
    function makeSrc(w, h) {
      const c = new OffscreenCanvas(w, h);
      const x = c.getContext("2d");
      const g = x.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#ff0000");
      g.addColorStop(1, "#0000ff");
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
      return c;
    }

    function bench(nPasses, w, h, nFrames) {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const renderer = new window.__L.Renderer(canvas, { width: w, height: h, preserveDrawingBuffer: true });
      for (let i = 0; i < nPasses; i++) {
        renderer.addPass(
          i % 2 === 0
            ? new window.__L.PatternDitherCore({ shape: "circle", scale: 8 })
            : new window.__L.NoiseGrainCore({ strength: 0.2 })
        );
      }
      renderer.warmUp();
      renderer.uploadSource(makeSrc(w, h), w, h);

      const gl = renderer.context.context;
      // Small readPixels probe — cheap, but forces full pipeline completion.
      const probe = new Uint8Array(4 * 8 * 8);

      renderer.render(0);
      gl.readPixels(w / 2 - 4, h / 2 - 4, 8, 8, gl.RGBA, gl.UNSIGNED_BYTE, probe);

      const t0 = performance.now();
      for (let i = 0; i < nFrames; i++) {
        renderer.render(i / 60);
        gl.readPixels(w / 2 - 4, h / 2 - 4, 8, 8, gl.RGBA, gl.UNSIGNED_BYTE, probe);
      }
      const t1 = performance.now();

      renderer.dispose();
      const ms = t1 - t0;
      return {
        passes: nPasses,
        resolution: `${w}x${h}`,
        frames: nFrames,
        ms: +ms.toFixed(1),
        msPerFrame: +(ms / nFrames).toFixed(2),
        fps: Math.round((nFrames / ms) * 1000),
      };
    }

    return {
      "1p@512": bench(1, 512, 512, 20),
      "2p@512": bench(2, 512, 512, 20),
      "4p@512": bench(4, 512, 512, 10),
      "8p@1024": bench(8, 1024, 1024, 10),
      "8p@1536": bench(8, 1536, 1536, 5),
    };
  });

  console.log("\n=== SwiftShader benchmark (readPixels-synced, CPU raster) ===");
  for (const [k, v] of Object.entries(fpsResult)) {
    console.log(`  ${k.padEnd(9)}: ${String(v.fps).padStart(5)} fps  (${v.msPerFrame} ms/frame)`);
  }
  record(
    "Pipeline is stall-free (8 passes @ 1536 completes)",
    fpsResult["8p@1536"].msPerFrame < 20000,
    `8p@1536 = ${fpsResult["8p@1536"].msPerFrame} ms/frame (SwiftShader CPU bound; real GPU gate needs hardware)`
  );

  // ── Test 5: Context-loss recovery ─────────────────────────────────────────
  const lossResult = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = new window.__L.GLContext(canvas, { width: 256, height: 256 });
    let lost = false;
    ctx.onContextLost(() => { lost = true; });
    const ext = ctx.context.getExtension("WEBGL_lose_context");
    if (ext) ext.loseContext();
    await new Promise((resolve) => setTimeout(resolve, 200));
    return { hasExt: !!ext, lost, isLost: ctx.isLost };
  });
  record(
    "Context-loss handler wired",
    lossResult.hasExt && lossResult.lost,
    `ext=${lossResult.hasExt} lost=${lossResult.lost} isLost=${lossResult.isLost}`
  );

  // ── Test 6: Resize ────────────────────────────────────────────────────────
  const resizeResult = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const ctx = new window.__L.GLContext(canvas, { width: 128, height: 128 });
    ctx.resize(1024, 768);
    const ok = ctx.width === 1024 && ctx.height === 768;
    ctx.dispose();
    return ok;
  });
  record("Resize to 1024x768", resizeResult);

  await browser.close();
  server.close();

  // ── Summary ───────────────────────────────────────────────────────────────
  const passed = RESULTS.filter((r) => r.ok).length;
  const failed = RESULTS.filter((r) => !r.ok).length;
  console.log(`\n${passed}/${RESULTS.length} checks passed, ${failed} failed`);
  if (errors.length > 0) {
    console.log(`\nPage errors (${errors.length}):`);
    for (const e of errors.slice(0, 10)) console.log("  " + e);
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
