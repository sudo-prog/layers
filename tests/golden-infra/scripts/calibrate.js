/**
 * Human-calibration harness for LAYERS Stage 0.7.
 *
 * Selects N deterministic pairs of stacks (two DIFFERENT style sets applied to
 * the SAME content image) from the benchmark manifest, renders each pair,
 * computes composite similarity metrics, and writes a calibration-study.json
 * that human annotators fill with 1-5 similarity judgments.
 *
 * Usage:
 *   node scripts/calibrate.js
 *
 * Environment:
 *   LAYERS_CALIBRATION_N          - Number of pairs to select (default: 30)
 *   LAYERS_CALIBRATION_DETERMINISM - If "1", run the determinism check:
 *                                    computeAllMetrics on the same pair twice
 *                                    (two renders, same seed), print composites +
 *                                    delta + PASS/FAIL vs 1%. Print only; never
 *                                    fails the script.
 *   LAYERS_RENDER_SEED            - Passed to render.js for deterministic output.
 *
 * Output:
 *   output/benchmark/calibration/calibration-study.json
 *   output/benchmark/calibration/pairs/pair-0000/  (a.png, b.png, stack-a.json, stack-b.json)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

import { computeAllMetrics } from './metrics.js';
import { curateBenchmark } from './curate-benchmark.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(__dirname, '../output');
const benchDir = path.join(outputDir, 'benchmark');
const calibrationDir = path.join(benchDir, 'calibration');
const pairsRoot = path.join(calibrationDir, 'pairs');

const manifestPath = path.join(benchDir, 'benchmark-manifest.json');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Ensure a directory exists.
 * @param {string} dir
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Seeded PRNG (mulberry32) — same as curate-benchmark.js.
 * @param {number} seed
 * @returns {function(): number}
 */
function createRng(seed) {
  let state = seed >>> 0;
  return function () {
    state |= 0;
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build a lookup table: (styleSetId, contentImageId) -> stack object.
 * @param {Array} stacks
 * @returns {Map<string, object>}
 */
function buildStackIndex(stacks) {
  const index = new Map();
  for (const stack of stacks) {
    const key = stack.styleSet + '|' + stack.contentImage;
    index.set(key, stack);
  }
  return index;
}

/**
 * Render a single stack.json to a PNG via render.js.
 * Uses execSync with a shell command matching the pattern in run-all.js.
 * Safe: stackPath and outPath are internally-generated deterministic paths.
 * @param {string} stackPath - Path to the stack JSON file.
 * @param {string} outPath   - Path for the output PNG.
 * @param {number} seed
 */
function renderStack(stackPath, outPath, seed) {
  execSync(
    `node ${path.resolve(__dirname, 'render.js')} ${stackPath} ${outPath}`,
    {
      stdio: 'pipe',
      encoding: 'utf-8',
      env: { ...process.env, LAYERS_RENDER_SEED: String(seed) },
    }
  );
}

// ─── Determinism Check ────────────────────────────────────────────────────────

/**
 * When LAYERS_CALIBRATION_DETERMINISM=1: render the same pair twice (same
 * seed), compute composite metrics on each render, and print both composite
 * values, the delta, and PASS/FAIL vs 1% tolerance. Print only — never fails.
 *
 * @param {object} manifest
 * @param {Map} stackIndex
 * @param {number} seed
 */
async function runDeterminismCheck(manifest, stackIndex, seed) {
  console.log('\n=== Determinism Check (LAYERS_CALIBRATION_DETERMINISM=1) ===');

  // Pick the first style-set pair for content-000 deterministically
  const styleA = manifest.styleSets[0];
  const styleB = manifest.styleSets[1];
  const contentId = manifest.contentImages[0].id;
  const keyA = styleA.id + '|' + contentId;
  const keyB = styleB.id + '|' + contentId;
  const stackA = stackIndex.get(keyA);
  const stackB = stackIndex.get(keyB);

  if (!stackA || !stackB) {
    console.log('  ERROR: Could not locate stacks for determinism check.');
    return;
  }

  const detDir = path.join(calibrationDir, 'determinism');
  ensureDir(detDir);

  const stackAPath = path.join(detDir, 'stack-a.json');
  const out1Path = path.join(detDir, 'run1-a.png');
  const out2Path = path.join(detDir, 'run2-a.png');

  // Write the same stack twice
  fs.writeFileSync(stackAPath, JSON.stringify(stackA, null, 2));

  // Render twice — same seed, same stack (two independent renders)
  const t0 = Date.now();
  renderStack(stackAPath, out1Path, seed);
  const t1 = Date.now();
  renderStack(stackAPath, out2Path, seed);
  const t2 = Date.now();

  // computeAllMetrics on the same pair twice (two renders, same seed)
  const metrics1 = await computeAllMetrics(out1Path, out2Path);
  const c1 = metrics1.composite;

  const metrics2 = await computeAllMetrics(out1Path, out2Path);
  const c2 = metrics2.composite;

  const delta = Math.abs(c1 - c2);
  const tolerance = 0.01; // 1%
  const pass = delta <= tolerance;

  console.log(`  Render 1 composite: ${c1.toFixed(8)} (${t1 - t0}ms)`);
  console.log(`  Render 2 composite: ${c2.toFixed(8)} (${t2 - t1}ms)`);
  console.log(`  Delta: ${delta.toFixed(8)}`);
  console.log(`  Tolerance: ${tolerance}`);
  console.log(`  Result: ${pass ? 'PASS' : 'FAIL'} (determinism within 1%)`);

  // Write determinism report
  const report = {
    generated_at: new Date().toISOString(),
    seed,
    pair: {
      pair_id: 'determinism-check',
      style_a: styleA.id,
      style_b: styleB.id,
      content_image: contentId,
    },
    render1_composite: c1,
    render2_composite: c2,
    delta,
    tolerance,
    result: pass ? 'PASS' : 'FAIL',
    render_times_ms: {
      render1: t1 - t0,
      render2: t2 - t1,
    },
  };
  fs.writeFileSync(
    path.join(detDir, 'determinism-report.json'),
    JSON.stringify(report, null, 2)
  );
}

// ─── Main Calibration ─────────────────────────────────────────────────────────

/**
 * Main entry point.
 */
async function main() {
  const startTime = Date.now();

  // ── Load or generate benchmark manifest ──
  let manifest;
  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    console.log(`Loaded benchmark manifest from ${manifestPath}`);
  } else {
    console.log('benchmark-manifest.json not found — generating it…');
    manifest = curateBenchmark({ seed: 42 });
    ensureDir(benchDir);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`  Generated manifest: ${manifestPath}`);
    console.log(`  Style sets: ${manifest.styleSetCount}`);
    console.log(`  Content images: ${manifest.contentImageCount}`);
    console.log(`  Total stacks: ${manifest.totalStacks}`);
  }

  const seed = manifest.seed || 42;
  const nPairs = parseInt(process.env.LAYERS_CALIBRATION_N || '30', 10);

  // ── Build stack index ──
  const stackIndex = buildStackIndex(manifest.stacks);

  // ── Determinism check (print only, never fails) ──
  if (process.env.LAYERS_CALIBRATION_DETERMINISM === '1') {
    await runDeterminismCheck(manifest, stackIndex, seed);
    console.log('\nDeterminism check complete. Continuing with calibration pairs…');
  }

  // ── Deterministically select N pairs ──
  ensureDir(pairsRoot);

  const rng = createRng(seed);
  const selectedPairs = [];
  const usedPairKeys = new Set();

  // We want pairs of different style sets on the same content image.
  const styleSets = manifest.styleSets;
  const contentImages = manifest.contentImages;

  // Generate all possible style-set pairs (different styles, same content)
  const allTriplets = [];
  for (let i = 0; i < styleSets.length; i++) {
    for (let j = i + 1; j < styleSets.length; j++) {
      for (const content of contentImages) {
        allTriplets.push({
          styleA: styleSets[i],
          styleB: styleSets[j],
          contentId: content.id,
        });
      }
    }
  }

  // Shuffle deterministically and pick N
  const indices = Array.from({ length: allTriplets.length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  let pairIdx = 0;
  for (const idx of indices) {
    if (selectedPairs.length >= nPairs) break;
    const triplet = allTriplets[idx];
    const key = triplet.styleA.id + '|' + triplet.styleB.id + '|' + triplet.contentId;
    if (usedPairKeys.has(key)) continue;
    usedPairKeys.add(key);

    const keyA = triplet.styleA.id + '|' + triplet.contentId;
    const keyB = triplet.styleB.id + '|' + triplet.contentId;
    const stackA = stackIndex.get(keyA);
    const stackB = stackIndex.get(keyB);

    if (!stackA || !stackB) continue;

    selectedPairs.push({
      pairId: 'pair-' + String(pairIdx).padStart(4, '0'),
      styleA: triplet.styleA,
      styleB: triplet.styleB,
      contentId: triplet.contentId,
      stackA,
      stackB,
    });
    pairIdx++;
  }

  console.log(`\nSelected ${selectedPairs.length} calibration pairs (requested ${nPairs})`);

  // ── Render + metric computation (SEQUENTIAL) ──
  const studyPairs = [];
  let compositeScores = [];
  let errorCount = 0;

  for (let i = 0; i < selectedPairs.length; i++) {
    const pair = selectedPairs[i];
    const pairId = pair.pairId;
    const pairDir = path.join(pairsRoot, pairId);
    ensureDir(pairDir);

    process.stdout.write(`  [${i + 1}/${selectedPairs.length}] ${pairId} (${pair.styleA.id} vs ${pair.styleB.id} on ${pair.contentId})… `);

    try {
      // Write stack JSONs
      const stackAPath = path.join(pairDir, 'stack-a.json');
      const stackBPath = path.join(pairDir, 'stack-b.json');
      fs.writeFileSync(stackAPath, JSON.stringify(pair.stackA, null, 2));
      fs.writeFileSync(stackBPath, JSON.stringify(pair.stackB, null, 2));

      // Render both stacks (same seed for determinism)
      const aPath = path.join(pairDir, 'a.png');
      const bPath = path.join(pairDir, 'b.png');
      renderStack(stackAPath, aPath, seed);
      renderStack(stackBPath, bPath, seed);

      // Compute metrics — SEQUENTIAL, never parallelize (memory-heavy)
      const metrics = await computeAllMetrics(aPath, bPath);
      const composite = metrics.composite;

      compositeScores.push(composite);

      studyPairs.push({
        pair_id: pairId,
        image: pair.contentId,
        style_a: pair.styleA.id,
        style_b: pair.styleB.id,
        composite_score: composite,
        image_a_path: 'calibration/pairs/' + pairId + '/a.png',
        image_b_path: 'calibration/pairs/' + pairId + '/b.png',
        human_judgment: null,
      });

      process.stdout.write(`composite=${composite.toFixed(6)} OK\n`);
    } catch (err) {
      errorCount++;
      process.stdout.write(`ERROR: ${err.message}\n`);
      studyPairs.push({
        pair_id: pairId,
        image: pair.contentId,
        style_a: pair.styleA.id,
        style_b: pair.styleB.id,
        error: err.message,
        human_judgment: null,
      });
    }
  }

  // ── Write calibration study ──
  const study = {
    generated_at: new Date().toISOString(),
    seed,
    n_pairs: selectedPairs.length,
    pairs: studyPairs,
  };

  const studyPath = path.join(calibrationDir, 'calibration-study.json');
  fs.writeFileSync(studyPath, JSON.stringify(study, null, 2));

  // ── Summary ──
  const elapsed = Date.now() - startTime;
  const meanComposite =
    compositeScores.length > 0
      ? compositeScores.reduce((a, b) => a + b, 0) / compositeScores.length
      : 0;

  console.log('\n=== Calibration Summary ===');
  console.log(`  Pairs generated: ${selectedPairs.length}`);
  console.log(`  Errors: ${errorCount}`);
  console.log(`  Mean composite score: ${meanComposite.toFixed(6)}`);
  console.log(`  Elapsed: ${(elapsed / 1000).toFixed(1)}s`);
  console.log(`  Study written: ${studyPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
