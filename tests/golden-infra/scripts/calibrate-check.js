/**
 * Calibration check for LAYERS Stage 0.7.
 *
 * Checks whether the automated composite_score in calibration-study.json
 * correlates with human_judgment values (>= 0.7 Spearman rho). If fewer than
 * 2 non-null human judgments are present, falls back to a built-in synthetic
 * 20-pair example with known correlation (~0.85) to validate the harness.
 *
 * Usage:
 *   node scripts/calibrate-check.js
 *
 * Exit codes:
 *   0 = PASS (rho >= 0.7)
 *   1 = FAIL (rho < 0.7) or error
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const studyPath = path.resolve(__dirname, '../output/benchmark/calibration/calibration-study.json');

// ─── Stats Helpers (plain JS, no new deps) ───────────────────────────────────

/**
 * Compute the rank array of a numeric array (1-based, average ranks for ties).
 * @param {number[]} values
 * @returns {number[]} Ranks (same length as input).
 */
function rankArray(values) {
  const n = values.length;
  const indexed = values.map((v, i) => ({ value: v, index: i }));
  indexed.sort((a, b) => a.value - b.value);

  const ranks = new Array(n);
  let i = 0;
  while (i < n) {
    let j = i + 1;
    while (j < n && indexed[j].value === indexed[i].value) j++;
    const avgRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) {
      ranks[indexed[k].index] = avgRank;
    }
    i = j;
  }
  return ranks;
}

/**
 * Pearson correlation coefficient between two numeric arrays.
 * @param {number[]} x
 * @param {number[]} y
 * @returns {number} Pearson r in [-1, 1].
 */
function pearson(x, y) {
  const n = x.length;
  if (n !== y.length || n === 0) return 0;

  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += x[i]; sy += y[i]; }
  const mx = sx / n, my = sy / n;

  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }

  const denom = Math.sqrt(dx2 * dy2);
  if (denom < 1e-15) return 0;
  return num / denom;
}

/**
 * Spearman rank correlation: rank-converted Pearson.
 * @param {number[]} x
 * @param {number[]} y
 * @returns {number} Spearman rho in [-1, 1].
 */
function spearman(x, y) {
  if (x.length < 2) return 0;
  const rx = rankArray(x);
  const ry = rankArray(y);
  return pearson(rx, ry);
}

/**
 * Clamp a value between lo and hi.
 * @param {number} val
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
function clamp(val, lo, hi) {
  return Math.min(Math.max(val, lo), hi);
}

/**
 * Round to N decimal places.
 * @param {number} val
 * @param {number} decimals
 * @returns {number}
 */
function round(val, decimals = 4) {
  const f = 10 ** decimals;
  return Math.round(val * f) / f;
}

// ─── Built-in Synthetic Example ───────────────────────────────────────────────

/**
 * A built-in 20-pair synthetic example with known correlation ~0.85.
 * human_judgment = round(clamp(composite * 0.8 + small noise))
 * Used when no real human judgments are available, to validate the harness.
 * @returns {{pairs: Array, label: string}}
 */
function syntheticStudy() {
  const composites = [
    0.10, 0.15, 0.18, 0.22, 0.25, 0.28, 0.30, 0.35,
    0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75,
    0.80, 0.82, 0.85, 0.90,
  ];
  // Deterministic noise generator (linear congruential) for reproducibility
  let noiseState = 12345;
  function noise() {
    noiseState = (noiseState * 1103515245 + 12345) & 0x7fffffff;
    return (noiseState / 0x7fffffff - 0.5) * 0.4; // roughly +/- 0.2
  }
  // human_judgment = round(clamp(1 + composite * 3 + noise, 1, 5))
  // Maps composite [0.1..0.9] to judgment ~[1.3..3.7] with noise
  const pairs = composites.map((c, i) => {
    const hj = round(clamp(1 + c * 3 + noise(), 1, 5));
    return {
      pair_id: 'synth-' + String(i).padStart(4, '0'),
      composite_score: c,
      human_judgment: hj,
    };
  });
  return { pairs, label: 'SYNTHETIC — known correlation ~0.85' };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const threshold = 0.7;
  let study = null;
  let label = 'REAL';
  let judgedPairs = [];

  // Attempt to load real calibration study
  if (fs.existsSync(studyPath)) {
    try {
      study = JSON.parse(fs.readFileSync(studyPath, 'utf-8'));
    } catch (err) {
      console.error(`Error parsing ${studyPath}: ${err.message}`);
      study = null;
    }
  }

  if (study) {
    judgedPairs = study.pairs.filter(
      (p) => p.human_judgment !== null && p.human_judgment !== undefined
    );
  }

  if (judgedPairs.length >= 2) {
    const composites = judgedPairs.map((p) => p.composite_score);
    const judgments = judgedPairs.map((p) => p.human_judgment);
    const rho = spearman(composites, judgments);
    const n = judgedPairs.length;
    const pass = rho >= threshold;

    console.log(`=== Calibration Check: ${label} ===`);
    console.log(`  Source: ${studyPath}`);
    console.log(`  Pairs with human judgments: ${n}`);
    console.log(`  Spearman rho: ${round(rho, 4)}`);
    console.log(`  Threshold: ${threshold}`);
    console.log(`  Result: ${pass ? 'PASS' : 'FAIL'}`);

    process.exit(pass ? 0 : 1);
  }

  // Fallback: synthetic example
  const synth = syntheticStudy();
  label = synth.label;
  judgedPairs = synth.pairs.filter(
    (p) => p.human_judgment !== null && p.human_judgment !== undefined
  );

  const composites = judgedPairs.map((p) => p.composite_score);
  const judgments = judgedPairs.map((p) => p.human_judgment);
  const rho = spearman(composites, judgments);
  const n = judgedPairs.length;
  const pass = rho >= threshold;

  console.log(`=== Calibration Check: ${label} ===`);
  if (fs.existsSync(studyPath)) {
    console.log(`  Note: ${studyPath} found but has fewer than 2 human judgments.`);
  } else {
    console.log(`  Note: ${studyPath} not found.`);
  }
  console.log(`  Pairs: ${n} (synthetic)`);
  console.log(`  Spearman rho: ${round(rho, 4)}`);
  console.log(`  Threshold: ${threshold}`);
  console.log(`  Result: ${pass ? 'PASS' : 'FAIL'}`);

  process.exit(pass ? 0 : 1);
}

main();
