/**
 * Run all golden-image tests.
 * Iterates over fixtures/, renders each stack, compares against golden.
 *
 * Optionally runs the benchmark pipeline (curate-benchmark + metrics) if
 * the --benchmark flag is provided or LAYERS_RUN_BENCHMARK=1 is set.
 *
 * Usage: node scripts/run-all.js [--benchmark]
 *
 * Environment:
 *   LAYERS_GOLDEN_THRESHOLD=0.98
 *   LAYERS_GOLDEN_SEED=42
 *   LAYERS_RUN_BENCHMARK=1
 *
 * Exit codes:
 *   0 = all tests passed (and benchmark metrics within thresholds)
 *   1 = one or more tests failed
 *   2 = error
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

// Import metrics module
import { computeAllMetrics } from './metrics.js';

// Import benchmark curation
import { curateBenchmark } from './curate-benchmark.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '../fixtures');
const outputDir = path.resolve(__dirname, '../output');
const threshold = parseFloat(process.env.LAYERS_GOLDEN_THRESHOLD || '0.98');
const seed = parseInt(process.env.LAYERS_GOLDEN_SEED || '42', 10);

const runBenchmark = process.argv.includes('--benchmark') || process.env.LAYERS_RUN_BENCHMARK === '1';

if (!fs.existsSync(outputDir)) {
  try { fs.mkdirSync(outputDir, { recursive: true }); } catch (err) { console.error('Cannot create output dir:', err.message); process.exit(2); }
}

/**
 * Run golden-image fixture tests.
 * @returns {{passed: number, failed: number, total: number, results: Array}}
 */
function runGoldenTests() {
  const fixtures = fs.readdirSync(fixturesDir).filter(f => {
    return fs.statSync(path.join(fixturesDir, f)).isDirectory();
  });

  console.log(`Running ${fixtures.length} golden-image tests (threshold=${threshold}, seed=${seed})`);

  let passed = 0;
  let failed = 0;
  const results = [];

  for (const fixture of fixtures) {
    const fixtureDir = path.join(fixturesDir, fixture);
    const stackPath = path.join(fixtureDir, 'stack.json');
    const goldenPath = path.join(fixtureDir, 'golden.png');
    const outputPath = path.join(outputDir, `${fixture}.png`);

    if (!fs.existsSync(stackPath) || !fs.existsSync(goldenPath)) {
      console.log(`  SKIP ${fixture}: missing stack.json or golden.png`);
      continue;
    }

    try {
      // Render
      execSync(
        `node ${path.resolve(__dirname, 'render.js')} ${stackPath} ${outputPath}`,
        { stdio: 'pipe', encoding: 'utf-8', env: { ...process.env, LAYERS_RENDER_SEED: seed } }
      );

      // Compare using SSIM (via compare.js)
      const result = execSync(
        `node ${path.resolve(__dirname, 'compare.js')} ${outputPath} ${goldenPath} ${threshold}`,
        { encoding: 'utf-8', stdio: 'pipe' }
      );

      console.log(`  PASS ${fixture}`);
      passed++;
      results.push({ fixture, status: 'pass', output: result.trim() });
    } catch (err) {
      console.log(`  FAIL ${fixture}`);
      if (err.stdout) console.error(`  stdout: ${err.stdout}`);
      if (err.stderr) console.error(`  stderr: ${err.stderr}`);
      failed++;
      results.push({ fixture, status: 'fail', error: err.message });
    }
  }

  return { passed, failed, total: fixtures.length, results };
}

/**
 * Run the benchmark pipeline: curate manifest, render sample stacks, compute metrics.
 * @param {number} seed
 * @returns {Promise<object>} Benchmark report object.
 */
async function runBenchmarkPipeline(seed) {
  console.log('\n--- Running Benchmark Pipeline (Phase 0.7) ---');

  const benchDir = path.join(outputDir, 'benchmark');
  if (!fs.existsSync(benchDir)) {
    fs.mkdirSync(benchDir, { recursive: true });
  }

  // Step 1: Curate benchmark manifest
  console.log('Curating benchmark manifest...');
  const manifest = curateBenchmark({ seed });
  const manifestPath = path.join(benchDir, 'benchmark-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`  Manifest: ${manifestPath}`);
  console.log(`  Style sets: ${manifest.styleSetCount}`);
  console.log(`  Content images: ${manifest.contentImageCount}`);
  console.log(`  Total stacks: ${manifest.totalStacks}`);

  // Step 2: Run metrics on a sample of rendered stacks
  const sampleSize = Math.min(10, manifest.styleSetCount);
  console.log(`\nRunning metrics on ${sampleSize} sample style sets...`);

  const benchmarkResults = [];
  const metricsSummary = {
    lpips: { sum: 0, count: 0, min: Infinity, max: 0 },
    clip: { sum: 0, count: 0, min: Infinity, max: 0 },
    palette: { sum: 0, count: 0, min: Infinity, max: 0 },
    edge: { sum: 0, count: 0, min: Infinity, max: 0 },
    frequency: { sum: 0, count: 0, min: Infinity, max: 0 },
    composite: { sum: 0, count: 0, min: Infinity, max: 0 },
  };

  for (let i = 0; i < sampleSize; i++) {
    const styleSetId = manifest.styleSets[i].id;
    const styleStacks = manifest.stacks.filter(s => s.styleSet === styleSetId);
    if (styleStacks.length === 0) continue;

    // Use first content image for each sampled style set
    const stack = styleStacks[0];

    const stackPath = path.join(benchDir, `${stack.id}.json`);
    const renderedPath = path.join(benchDir, `${stack.id}.png`);
    const goldenPath = path.join(benchDir, `${stack.id}.golden.png`);

    // Write stack JSON
    fs.writeFileSync(stackPath, JSON.stringify(stack, null, 2));

    try {
      // Render the stack
      execSync(
        `node ${path.resolve(__dirname, 'render.js')} ${stackPath} ${renderedPath}`,
        { stdio: 'pipe', encoding: 'utf-8', env: { ...process.env, LAYERS_RENDER_SEED: seed } }
      );

      // If we have a golden, compare; otherwise use rendered as golden for first run
      if (!fs.existsSync(goldenPath)) {
        fs.copyFileSync(renderedPath, goldenPath);
        console.log(`  [${i + 1}/${sampleSize}] ${stack.id}: golden created`);
      } else {
        console.log(`  [${i + 1}/${sampleSize}] ${stack.id}: comparing...`);
      }

      // Compute metrics between rendered and golden
      const metrics = await computeAllMetrics(renderedPath, goldenPath);
      benchmarkResults.push({ stackId: stack.id, styleSet: stack.styleSet, metrics });

      // Aggregate
      for (const key of Object.keys(metricsSummary)) {
        const val = metrics[key];
        if (typeof val === 'number') {
          metricsSummary[key].sum += val;
          metricsSummary[key].count++;
          metricsSummary[key].min = Math.min(metricsSummary[key].min, val);
          metricsSummary[key].max = Math.max(metricsSummary[key].max, val);
        }
      }
    } catch (err) {
      console.error(`  [${i + 1}/${sampleSize}] ${stack.id}: FAILED - ${err.message}`);
      benchmarkResults.push({ stackId: stack.id, styleSet: stack.styleSet, error: err.message });
    }
  }

  // Compute averages
  const averages = {};
  for (const [key, stats] of Object.entries(metricsSummary)) {
    averages[key] = stats.count > 0 ? stats.sum / stats.count : 0;
  }

  const benchmarkReport = {
    timestamp: new Date().toISOString(),
    seed,
    sampleSize,
    styleSetsSampled: manifest.styleSets.slice(0, sampleSize).map(s => s.id),
    averages,
    ranges: Object.fromEntries(
      Object.entries(metricsSummary).map(([key, stats]) => [
        key,
        { min: stats.min === Infinity ? 0 : stats.min, max: stats.max }
      ])
    ),
    thresholds: manifest.thresholds,
    results: benchmarkResults,
  };

  fs.writeFileSync(
    path.join(benchDir, 'benchmark-metrics.json'),
    JSON.stringify(benchmarkReport, null, 2)
  );

  console.log('\n--- Benchmark Metrics Summary ---');
  for (const key of Object.keys(metricsSummary)) {
    const stats = metricsSummary[key];
    if (stats.count > 0) {
      console.log(`  ${key}: avg=${averages[key].toFixed(6)} min=${stats.min.toFixed(6)} max=${stats.max.toFixed(6)}`);
    }
  }
  console.log(`\n  Report: ${path.join(benchDir, 'benchmark-metrics.json')}`);

  return benchmarkReport;
}

// ─── Main Execution ──────────────────────────────────────────────────────────

async function main() {
  // Step 1: Run golden image tests
  const testResults = runGoldenTests();

  const report = {
    timestamp: new Date().toISOString(),
    threshold,
    seed,
    total: testResults.total,
    passed: testResults.passed,
    failed: testResults.failed,
    results: testResults.results,
  };

  fs.writeFileSync(
    path.join(outputDir, 'report.json'),
    JSON.stringify(report, null, 2)
  );

  console.log(`\nGolden Results: ${testResults.passed} passed, ${testResults.failed} failed, ${testResults.total} total`);

  // Step 2: Optionally run benchmark pipeline
  let benchmarkReport = null;
  if (runBenchmark) {
    try {
      benchmarkReport = await runBenchmarkPipeline(seed);
    } catch (err) {
      console.error('Benchmark pipeline error:', err.message);
    }
  }

  // Exit with appropriate code
  process.exit(testResults.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(2);
});
