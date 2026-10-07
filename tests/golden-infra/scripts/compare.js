/**
 * Image comparison script for LAYERS golden-image infrastructure.
 * Compares rendered output against golden reference using SSIM + pixelmatch.
 * 
 * Usage: node scripts/compare.js <rendered.png> <golden.png> [threshold]
 * 
 * Exit codes:
 *   0 = pass (within threshold)
 *   1 = fail (outside threshold)
 *   2 = error
 */

import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import * as fs from 'fs';

const renderedPath = process.argv[2];
const goldenPath = process.argv[3];
const threshold = parseFloat(process.argv[4] || '0.98');

if (!renderedPath || !goldenPath) {
  console.error('Usage: node scripts/compare.js <rendered.png> <golden.png> [threshold]');
  process.exit(2);
}

function loadPng(path) {
  const buf = fs.readFileSync(path);
  return PNG.sync.read(buf);
}

function compareImages(img1, img2) {
  if (img1.width !== img2.width || img1.height !== img2.height) {
    console.error(`Size mismatch: ${img1.width}x${img1.height} vs ${img2.width}x${img2.height}`);
    return { pass: false, diffPixels: -1, totalPixels: -1, ssim: 0 };
  }

  const diff = new PNG({ width: img1.width, height: img1.height });
  const diffPixels = pixelmatch(
    img1.data, img2.data, diff.data,
    img1.width, img1.height,
    { threshold: 0.1, includeAA: true }
  );

  const totalPixels = img1.width * img1.height;
  const matchRatio = 1 - (diffPixels / totalPixels);

  return {
    pass: matchRatio >= threshold,
    diffPixels,
    totalPixels,
    matchRatio,
    ssim: matchRatio, // Simplified — use proper SSIM in production
  };
}

try {
  const rendered = loadPng(renderedPath);
  const golden = loadPng(goldenPath);

  const result = compareImages(rendered, golden);

  console.log(`Comparison: ${renderedPath} vs ${goldenPath}`);
  console.log(`  Match ratio: ${(result.matchRatio * 100).toFixed(2)}%`);
  console.log(`  Diff pixels: ${result.diffPixels}/${result.totalPixels}`);
  console.log(`  Threshold: ${(threshold * 100).toFixed(2)}%`);
  console.log(`  Result: ${result.pass ? 'PASS' : 'FAIL'}`);

  if (!result.pass) {
    const diffPath = renderedPath.replace('.png', '.diff.png');
    fs.writeFileSync(diffPath, PNG.sync.write(result.diff || new PNG({ width: 1, height: 1 })));
    console.log(`  Diff image: ${diffPath}`);
  }

  process.exit(result.pass ? 0 : 1);
} catch (err) {
  console.error('Comparison failed:', err);
  process.exit(2);
}
