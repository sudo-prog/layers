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
const ssimThreshold = parseFloat(process.argv[4] || '0.98');

if (!renderedPath || !goldenPath) {
  console.error('Usage: node scripts/compare.js <rendered.png> <golden.png> [threshold]');
  process.exit(2);
}

function loadPng(path) {
  const buf = fs.readFileSync(path);
  return PNG.sync.read(buf);
}

/**
 * Generate a 2D Gaussian kernel of size (windowSize x windowSize) with given sigma.
 * The kernel is normalized so that all weights sum to 1.
 */
function gaussianKernel(windowSize, sigma) {
  const kernel = [];
  const center = (windowSize - 1) / 2;
  const s2 = 2 * sigma * sigma;
  let sum = 0;

  for (let i = 0; i < windowSize; i++) {
    const row = [];
    for (let j = 0; j < windowSize; j++) {
      const d = Math.sqrt((i - center) ** 2 + (j - center) ** 2);
      const g = Math.exp(-(d * d) / s2);
      row.push(g);
      sum += g;
    }
    kernel.push(row);
  }

  // Normalize
  for (let i = 0; i < windowSize; i++) {
    for (let j = 0; j < windowSize; j++) {
      kernel[i][j] /= sum;
    }
  }

  return kernel;
}

/**
 * Apply a 2D Gaussian filter to a grayscale image (Float32Array of 0..255 values).
 * Uses zero-padding at boundaries.
 */
function filter2D(image, width, height, kernel) {
  const kSize = kernel.length;
  const center = (kSize - 1) / 2;
  const result = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let weightSum = 0;

      for (let ky = 0; ky < kSize; ky++) {
        for (let kx = 0; kx < kSize; kx++) {
          const px = x + kx - center;
          const py = y + ky - center;

          if (px >= 0 && px < width && py >= 0 && py < height) {
            const weight = kernel[ky][kx];
            sum += image[py * width + px] * weight;
            weightSum += weight;
          }
        }
      }

      // Renormalize for edge pixels where weights were missing
      result[y * width + x] = weightSum > 0 ? sum / weightSum : 0;
    }
  }

  return result;
}

/**
 * Convert RGBA PNG data to grayscale Float32Array (luminance, 0..255 range).
 * Uses Rec. 601 luma: L = 0.299*R + 0.587*G + 0.114*B
 */
function toGrayscale(img) {
  const gray = new Float32Array(img.width * img.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const r = img.data[i];
    const g = img.data[i + 1];
    const b = img.data[i + 2];
    gray[i / 4] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return gray;
}

/**
 * Compute the mean of a Float32Array.
 */
function mean(arr) {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  return sum / arr.length;
}

/**
 * Compute the variance of a Float32Array given its mean.
 */
function variance(arr, mu) {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - mu;
    sum += d * d;
  }
  return sum / arr.length;
}

/**
 * Compute the Structural Similarity Index (SSIM) between two images.
 *
 * Uses a 11x11 Gaussian window (sigma=1.5). For each window position,
 * computes the SSIM between local patches of the two images and averages.
 *
 * SSIM(x, y) = (2*mu_x*mu_y + C1) * (2*sigma_xy + C2) /
 *              ((mu_x^2 + mu_y^2 + C1) * (sigma_x^2 + sigma_y^2 + C2))
 *
 * Returns a value between 0 and 1 (1 = identical).
 */
function ssim(img1, img2) {
  const WIDTH = img1.width;
  const HEIGHT = img1.height;
  const WINDOW_SIZE = 11;
  const SIGMA = 1.5;
  const K1 = 0.01;
  const K2 = 0.03;
  const L = 255;
  const C1 = (K1 * L) ** 2;
  const C2 = (K2 * L) ** 2;

  // Convert to grayscale
  const gray1 = toGrayscale(img1);
  const gray2 = toGrayscale(img2);

  // Build Gaussian window
  const window = gaussianKernel(WINDOW_SIZE, SIGMA);
  const halfW = (WINDOW_SIZE - 1) / 2;

  // Compute local means via Gaussian-weighted averaging
  const mu1 = filter2D(gray1, WIDTH, HEIGHT, window);
  const mu2 = filter2D(gray2, WIDTH, HEIGHT, window);

  // Compute local variances and covariances
  const var1 = new Float32Array(WIDTH * HEIGHT);
  const var2 = new Float32Array(WIDTH * HEIGHT);
  const covar = new Float32Array(WIDTH * HEIGHT);

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      let s1 = 0, s2 = 0, scov = 0;
      let wSum = 0;

      for (let ky = 0; ky < WINDOW_SIZE; ky++) {
        for (let kx = 0; kx < WINDOW_SIZE; kx++) {
          const px = x + kx - halfW;
          const py = y + ky - halfW;

          if (px >= 0 && px < WIDTH && py >= 0 && py < HEIGHT) {
            const w = window[ky][kx];
            const d1 = gray1[py * WIDTH + px] - mu1[y * WIDTH + x];
            const d2 = gray2[py * WIDTH + px] - mu2[y * WIDTH + x];
            s1 += w * d1 * d1;
            s2 += w * d2 * d2;
            scov += w * d1 * d2;
            wSum += w;
          }
        }
      }

      // Renormalize edge weights
      const invW = wSum > 0 ? 1 / wSum : 0;
      const idx = y * WIDTH + x;
      var1[idx] = s1 * invW;
      var2[idx] = s2 * invW;
      covar[idx] = scov * invW;
    }
  }

  // Compute SSIM map and average
  let ssimSum = 0;
  let pixelCount = 0;

  for (let i = 0; i < WIDTH * HEIGHT; i++) {
    const m1 = mu1[i];
    const m2 = mu2[i];
    const v1 = var1[i];
    const v2 = var2[i];
    const c = covar[i];

    const num = (2 * m1 * m2 + C1) * (2 * c + C2);
    const den = (m1 * m1 + m2 * m2 + C1) * (v1 + v2 + C2);

    if (den !== 0) {
      ssimSum += num / den;
      pixelCount++;
    }
  }

  return pixelCount > 0 ? ssimSum / pixelCount : 1;
}

/**
 * Compare two PNG images using SSIM and pixelmatch.
 * Returns pass/fail based on SSIM threshold.
 */
function compareImages(img1, img2) {
  if (img1.width !== img2.width || img1.height !== img2.height) {
    console.error(`Size mismatch: ${img1.width}x${img1.height} vs ${img2.width}x${img2.height}`);
    return { pass: false, diffPixels: -1, totalPixels: -1, ssim: 0, ssimThreshold };
  }

  // SSIM comparison
  const ssimValue = ssim(img1, img2);

  // pixelmatch for diff image generation
  const diff = new PNG({ width: img1.width, height: img1.height });
  const diffPixels = pixelmatch(
    img1.data, img2.data, diff.data,
    img1.width, img1.height,
    { threshold: 0.1, includeAA: true }
  );

  const totalPixels = img1.width * img1.height;

  return {
    pass: ssimValue >= ssimThreshold,
    diffPixels,
    totalPixels,
    ssim: ssimValue,
    ssimThreshold,
    diff,
  };
}

try {
  const rendered = loadPng(renderedPath);
  const golden = loadPng(goldenPath);

  const result = compareImages(rendered, golden);

  console.log(`Comparison: ${renderedPath} vs ${goldenPath}`);
  console.log(`  SSIM: ${result.ssim.toFixed(6)}`);
  console.log(`  SSIM threshold: ${result.ssimThreshold}`);
  console.log(`  Diff pixels: ${result.diffPixels}/${result.totalPixels}`);
  console.log(`  Result: ${result.pass ? 'PASS' : 'FAIL'}`);

  const diffPath = renderedPath.replace('.png', '.diff.png');
  fs.writeFileSync(diffPath, PNG.sync.write(result.diff || new PNG({ width: 1, height: 1 })));
  console.log(`  Diff image: ${diffPath}`);

  process.exit(result.pass ? 0 : 1);
} catch (err) {
  console.error('Comparison failed:', err);
  process.exit(2);
}
