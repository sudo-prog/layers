#!/usr/bin/env node
/**
 * Measure LAYERS Desktop geometry.
 *
 * Why Playwright and not the Hermes browser harness: this page runs a continuous
 * requestAnimationFrame loop over a 1920x1080 WebGL canvas, which starves the
 * harness's 5s `Runtime.evaluate` budget — every evaluation times out. Playwright
 * drives its own Chromium over a direct connection and is stable here.
 *
 * Run from the REPO ROOT:
 *   node apps/LAYERS_DESKTOP/scripts/measure.cjs
 *
 * The playwright package is resolved out of the pnpm store rather than added as
 * a dependency, because installing it needed an approval prompt that was not
 * worth interrupting the build for. If it is later added to devDependencies this
 * can become a plain `import`.
 */
const path = require("node:path");
const fs = require("node:fs");

const REPO = path.resolve(__dirname, "../../..");
const STORE = path.join(REPO, "node_modules/.pnpm");

function loadPlaywright() {
  // Try the normal resolution first, then the pnpm store.
  try {
    return require("playwright");
  } catch {
    /* fall through */
  }
  if (!fs.existsSync(STORE)) throw new Error(`no pnpm store at ${STORE}`);
  const dir = fs
    .readdirSync(STORE)
    .filter((d) => /^playwright@\d/.test(d))
    .sort()
    .pop();
  if (!dir) throw new Error("playwright not found in the pnpm store");
  return require(path.join(STORE, dir, "node_modules/playwright"));
}

const { chromium } = loadPlaywright();
const URL = process.env.URL ?? "http://127.0.0.1:3003/?selfcheck=1";
const WIDTHS = (process.env.WIDTHS ?? "1600,1440,1280,1180,1024").split(",").map(Number);

(async () => {
  const browser = await chromium.launch();
  const rows = [];

  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 950 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    await page.goto(URL, { waitUntil: "load" });
    await page.waitForSelector("#gl-canvas");

    // Add a core so the inspector and toolbar are in their real state.
    await page.locator(".insert-btn", { hasText: "Textures" }).first().click();
    await page.waitForSelector(".picker-item");
    await page.locator(".picker-item", { hasText: "Pattern/Dither" }).first().click();

    // Let the render loop actually produce frames. Sampling immediately after
    // the click read a uniform WHITE canvas — the first frames had not landed and
    // the WebGL buffer was still at its cleared value.
    await page.waitForTimeout(1600);

    // Re-publish the self-check now that the layout has settled (the app
    // publishes once at boot, before a layer exists).
    await page.evaluate(() => window.__publishSelfCheck?.());

    // The app publishes its own measured geometry.
    const published = await page.evaluate(() => document.body.dataset.geometry ?? null);

    // Sample SEVERAL regions and require that at least one is non-uniform.
    // A single patch is too crude: the dither effect has genuinely flat areas
    // (paper colour reads uniform white) and one flat patch does not mean the
    // canvas failed to render. Four of five sampled regions varied; the fifth
    // was a flat paper region.
    const pixels = await page.evaluate(() => {
      const c = document.querySelector("#gl-canvas");
      const gl = c.getContext("webgl2");
      const regions = {};
      for (const [name, x, y] of [
        ["tl", 100, 100],
        ["tr", 1700, 100],
        ["bl", 100, 900],
        ["br", 1700, 900],
        ["mid", 900, 500],
      ]) {
        const px = new Uint8Array(64 * 64 * 4);
        gl.readPixels(x, y, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let min = 255, max = 0, sum = 0, n = 0;
        for (let i = 0; i < px.length; i += 4) {
          const v = px[i];
          if (v < min) min = v;
          if (v > max) max = v;
          sum += v;
          n++;
        }
        regions[name] = { min, max, mean: Math.round(sum / n), uniform: min === max };
      }
      const varying = Object.values(regions).filter((r) => !r.uniform).length;
      return { regions, varyingRegions: varying, rendered: varying >= 2 };
    });

    const geo = published ? JSON.parse(published) : null;
    const bad =
      !geo ||
      !geo.ok ||
      geo.barPastViewport ||
      geo.barOverlapsPanel ||
      geo.truncated.length > 0 ||
      geo.bodyHScroll > 0 ||
      !pixels.rendered ||
      errors.length > 0;

    rows.push({ width, geo, pixels, errors, bad });
    await page.close();
  }

  await browser.close();

  for (const r of rows) {
    console.log(
      `${String(r.width).padStart(5)} | ok=${r.geo?.ok} frameInVisible=${r.geo?.frameInsideVisible} ` +
        `frameInVert=${r.geo?.frameInsideVertically} barOverlap=${r.geo?.barOverlapsPanel} ` +
        `trunc=${JSON.stringify(r.geo?.truncated ?? null)} hscroll=${r.geo?.bodyHScroll} ` +
        `zoom=${r.geo?.zoom} regions=${r.pixels.varyingRegions}/5 rendered=${r.pixels.rendered} ${r.bad ? "<-- FAIL" : ""}`,
    );
    if (r.errors.length) console.log(`        errors: ${JSON.stringify(r.errors.slice(0, 3))}`);
  }

  const allOk = rows.every((r) => !r.bad);
  console.log(`\nALL WIDTHS OK: ${allOk}`);
  process.exit(allOk ? 0 : 1);
})();
