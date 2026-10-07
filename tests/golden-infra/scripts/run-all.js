/**
 * Run all golden-image tests.
 * Iterates over fixtures/, renders each stack, compares against golden.
 * 
 * Usage: node scripts/run-all.js
 * 
 * Environment:
 *   LAYERS_GOLDEN_THRESHOLD=0.98
 *   LAYERS_GOLDEN_SEED=42
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const fixturesDir = path.resolve(__dirname, '../fixtures');
const outputDir = path.resolve(__dirname, '../output');
const threshold = parseFloat(process.env.LAYERS_GOLDEN_THRESHOLD || '0.98');
const seed = parseInt(process.env.LAYERS_GOLDEN_SEED || '42', 10);

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

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
      { stdio: 'inherit', env: { ...process.env, LAYERS_RENDER_SEED: seed } }
    );

    // Compare
    const result = execSync(
      `node ${path.resolve(__dirname, 'compare.js')} ${outputPath} ${goldenPath} ${threshold}`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );

    console.log(`  PASS ${fixture}`);
    passed++;
    results.push({ fixture, status: 'pass', output: result.trim() });
  } catch (err) {
    console.log(`  FAIL ${fixture}`);
    failed++;
    results.push({ fixture, status: 'fail', error: err.message });
  }
}

const report = {
  timestamp: new Date().toISOString(),
  threshold,
  seed,
  total: fixtures.length,
  passed,
  failed,
  results,
};

fs.writeFileSync(
  path.join(outputDir, 'report.json'),
  JSON.stringify(report, null, 2)
);

console.log(`\nResults: ${passed} passed, ${failed} failed, ${fixtures.length} total`);
process.exit(failed > 0 ? 1 : 0);
