/**
 * Performance benchmark script for LAYERS golden-image infrastructure.
 * Renders the bevel-emboss fixture 10 times and reports timing statistics.
 *
 * Usage: node scripts/benchmark.js
 *
 * Exit codes:
 *   0 = pass (avg render time < 5000ms threshold from S-0.7)
 *   1 = fail (avg render time >= 5000ms)
 *   2 = error
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RENDER_COUNT = 10;
const THRESHOLD_MS = 5000; // S-0.7 performance gate

const fixturesDir = path.resolve(__dirname, '../fixtures');
const outputDir = path.resolve(__dirname, '../output');
const benchmarkDir = path.join(outputDir, 'benchmark');

// Ensure output directories exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}
if (!fs.existsSync(benchmarkDir)) {
  fs.mkdirSync(benchmarkDir, { recursive: true });
}

const fixtureDir = path.join(fixturesDir, 'bevel-emboss');
const stackPath = path.join(fixtureDir, 'stack.json');
const goldenPath = path.join(fixtureDir, 'golden.png');

if (!fs.existsSync(stackPath) || !fs.existsSync(goldenPath)) {
  console.error('ERROR: bevel-emboss fixture missing stack.json or golden.png');
  process.exit(2);
}

console.log(`Benchmarking: bevel-emboss (rendering ${RENDER_COUNT} times)`);
console.log(`Threshold: ${THRESHOLD_MS}ms (S-0.7)\n`);

const times = [];

for (let i = 0; i < RENDER_COUNT; i++) {
  const outputPath = path.join(benchmarkDir, `bench-${i}.png`);

  const start = process.hrtime.bigint();

  try {
    execSync(
      `node ${path.resolve(__dirname, 'render.js')} ${stackPath} ${outputPath}`,
      { stdio: 'pipe', encoding: 'utf-8', env: { ...process.env, LAYERS_RENDER_SEED: '42' } }
    );
  } catch (err) {
    console.error(`Render ${i + 1} failed: ${err.message}`);
    process.exit(2);
  }

  const end = process.hrtime.bigint();
  const elapsedMs = Number(end - start) / 1_000_000;
  times.push(elapsedMs);
  console.log(`  Run ${i + 1}/${RENDER_COUNT}: ${elapsedMs.toFixed(2)}ms`);
}

// Compute statistics
const sum = times.reduce((a, b) => a + b, 0);
const avgMs = sum / times.length;
const minMs = Math.min(...times);
const maxMs = Math.max(...times);
const variance = times.reduce((acc, t) => acc + (t - avgMs) ** 2, 0) / times.length;
const stdMs = Math.sqrt(variance);

console.log('\n--- Benchmark Results ---');
console.log(`  Average: ${avgMs.toFixed(2)}ms`);
console.log(`  Min:     ${minMs.toFixed(2)}ms`);
console.log(`  Max:     ${maxMs.toFixed(2)}ms`);
console.log(`  Std Dev: ${stdMs.toFixed(2)}ms`);
console.log(`  Threshold (S-0.7): ${THRESHOLD_MS}ms`);
console.log(`  Result: ${avgMs < THRESHOLD_MS ? 'PASS' : 'FAIL'}`);

const report = {
  fixture: 'bevel-emboss',
  renderCount: RENDER_COUNT,
  thresholdMs: THRESHOLD_MS,
  avgMs,
  minMs,
  maxMs,
  stdMs,
  passed: avgMs < THRESHOLD_MS,
  times: times.map((t, i) => ({ run: i + 1, ms: t })),
};

fs.writeFileSync(
  path.join(benchmarkDir, 'benchmark.json'),
  JSON.stringify(report, null, 2)
);
console.log(`  Report: ${path.join(benchmarkDir, 'benchmark.json')}`);

process.exit(avgMs < THRESHOLD_MS ? 0 : 1);
