/**
 * Benchmark curation script for LAYERS golden-image infrastructure.
 *
 * Generates a deterministic benchmark manifest containing:
 *   - 40 style sets: combinations of layer cores and effect parameters
 *   - 20 held-out content images: generated procedurally as placeholder stack.json files
 *
 * Usage:
 *   node scripts/curate-benchmark.js [outputDir]
 *   node scripts/curate-benchmark.js --manifest-out <path>
 *
 * Environment:
 *   LAYERS_BENCH_SEED   - Random seed (default: 42)
 *   LAYERS_BENCH_WIDTH  - Image width (default: 512)
 *   LAYERS_BENCH_HEIGHT - Image height (default: 512)
 *
 * Exit codes:
 *   0 = success
 *   1 = error
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Seeded PRNG (mulberry32) ────────────────────────────────────────────────

/**
 * Create a seeded PRNG using the mulberry32 algorithm.
 * @param {number} seed
 * @returns {function(): number} Returns a function that generates values in [0, 1).
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

// ─── Style Set Definitions ───────────────────────────────────────────────────

/**
 * Available layer cores for style set generation.
 * Each core maps to a shader generator in render.js.
 */
const CORES = [
  { name: 'bevel-emboss', category: 'effect', paramRanges: {
    depth: [0.1, 1.0],
    size: [2, 32],
    angle: [0, 360],
    softness: [0.0, 1.0],
  }},
  { name: 'gradient-overlay', category: 'fill', paramRanges: {
    angle: [0, 360],
    opacity: [0.3, 1.0],
  }},
  { name: 'noise-grain', category: 'texture', paramRanges: {
    scale: [1, 12],
    octaves: [1, 5],
    strength: [0.05, 0.8],
  }},
  { name: 'solid-color', category: 'fill', paramRanges: {
    opacity: [0.1, 1.0],
  }},
  { name: 'radial-gradient', category: 'fill', paramRanges: {
    angle: [0, 360],
    softness: [0.0, 1.0],
  }},
];

/**
 * Effect layers that can be stacked on top of style cores.
 * These represent blend modes and additional passes.
 */
const EFFECTS = [
  { name: 'shadow', category: 'effect', paramRanges: {
    distance: [0, 20],
    blur: [0, 10],
    opacity: [0.1, 0.8],
  }},
  { name: 'glow', category: 'effect', paramRanges: {
    radius: [1, 15],
    intensity: [0.1, 1.0],
    opacity: [0.2, 0.9],
  }},
  { name: 'color-adjust', category: 'effect', paramRanges: {
    hueShift: [-180, 180],
    saturation: [0.5, 2.0],
    brightness: [-0.5, 0.5],
  }},
  { name: 'texture-overlay', category: 'texture', paramRanges: {
    scale: [1, 8],
    opacity: [0.05, 0.4],
  }},
  { name: 'wave-distort', category: 'effect', paramRanges: {
    amplitude: [0, 0.15],
    frequency: [1, 10],
    opacity: [0.3, 1.0],
  }},
];

/**
 * Blend modes available for layer composition.
 */
const BLEND_MODES = [
  'normal', 'multiply', 'screen', 'overlay', 'soft-light',
  'hard-light', 'color-dodge', 'color-burn', 'difference',
  'exclusion', 'hue', 'saturation', 'luminosity',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Pick a random element from an array using the seeded RNG.
 * @param {Array} arr
 * @param {function(): number} rng
 * @returns {*}
 */
function pickRandom(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Generate a random parameter value within a range [min, max].
 * @param {number} min
 * @param {number} max
 * @param {function(): number} rng
 * @returns {number}
 */
function randomInRange([min, max], rng) {
  return min + rng() * (max - min);
}

/**
 * Round a value to a specified number of decimal places.
 * @param {number} val
 * @param {number} decimals
 * @returns {number}
 */
function round(val, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(val * factor) / factor;
}

/**
 * Generate a random hex color.
 * @param {function(): number} rng
 * @returns {string} Hex color string like "#a1b2c3".
 */
function randomHexColor(rng) {
  const r = Math.floor(rng() * 256);
  const g = Math.floor(rng() * 256);
  const b = Math.floor(rng() * 256);
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

// ─── Style Set Generation ────────────────────────────────────────────────────

/**
 * Generate a single style set (a layer configuration).
 * A style set consists of:
 *   - One core layer with specific parameters
 *   - Zero or more effect layers stacked on top
 *   - Global blend mode and opacity
 *
 * @param {number} index - Style set index (for deterministic naming).
 * @param {function(): number} rng - Seeded PRNG.
 * @returns {object} Style set definition.
 */
function generateStyleSet(index, rng) {
  const id = `style-${String(index).padStart(3, '0')}`;

  // Pick core
  const coreDef = pickRandom(CORES, rng);
  const coreParams = {};
  for (const [param, range] of Object.entries(coreDef.paramRanges)) {
    coreParams[param] = round(randomInRange(range, rng), 3);
  }

  // Special: gradient-overlay and radial-gradient need color params
  if (coreDef.name === 'gradient-overlay' || coreDef.name === 'radial-gradient') {
    coreParams.color1 = randomHexColor(rng);
    coreParams.color2 = randomHexColor(rng);
  }

  // Pick 1-3 effects
  const numEffects = Math.floor(rng() * 3) + 1;
  const effects = [];
  for (let i = 0; i < numEffects; i++) {
    const effectDef = pickRandom(EFFECTS, rng);
    const effectParams = {};
    for (const [param, range] of Object.entries(effectDef.paramRanges)) {
      effectParams[param] = round(randomInRange(range, rng), 3);
    }
    effects.push({
      name: effectDef.name,
      category: effectDef.category,
      params: effectParams,
      blend: pickRandom(BLEND_MODES, rng),
      opacity: round(0.3 + rng() * 0.7, 3),
    });
  }

  return {
    id,
    core: {
      name: coreDef.name,
      category: coreDef.category,
      params: coreParams,
    },
    effects,
    blend: pickRandom(BLEND_MODES, rng),
    opacity: round(0.5 + rng() * 0.5, 3),
  };
}

/**
 * Generate 40 style sets deterministically.
 * @param {function(): number} rng
 * @returns {Array<object>}
 */
function generateStyleSets(rng) {
  const styleSets = [];
  for (let i = 0; i < 40; i++) {
    styleSets.push(generateStyleSet(i, rng));
  }
  return styleSets;
}

// ─── Content Image Generation ────────────────────────────────────────────────

/**
 * Generate 20 held-out content image definitions.
 * These are procedural pattern definitions used as content layers for testing.
 *
 * @param {number} width
 * @param {number} height
 * @param {function(): number} rng
 * @returns {Array<object>} Array of content image definitions.
 */
function generateContentImages(width, height, rng) {
  const contentImages = [];

  // Define procedural pattern types
  const patternTypes = [
    {
      name: 'checkerboard',
      params: {
        cellSize: [8, 64],
        color1: true, // flag: generate random color
        color2: true,
      },
    },
    {
      name: 'gradient-horizontal',
      params: {
        color1: true,
        color2: true,
      },
    },
    {
      name: 'gradient-vertical',
      params: {
        color1: true,
        color2: true,
      },
    },
    {
      name: 'radial-sweep',
      params: {
        centerX: [0.2, 0.8],
        centerY: [0.2, 0.8],
        color1: true,
        color2: true,
      },
    },
    {
      name: 'noise-field',
      params: {
        scale: [1, 6],
        seed: true, // flag: generate random seed
      },
    },
    {
      name: 'diagonal-stripes',
      params: {
        stripeWidth: [4, 32],
        angle: [0, 360],
        color1: true,
        color2: true,
      },
    },
  ];

  for (let i = 0; i < 20; i++) {
    const pattern = pickRandom(patternTypes, rng);
    const params = {};

    for (const [key, range] of Object.entries(pattern.params)) {
      if (range === true) {
        // Color or seed param
        if (key === 'color1' || key === 'color2') {
          params[key] = randomHexColor(rng);
        } else if (key === 'seed') {
          params[key] = Math.floor(rng() * 10000);
        }
      } else if (Array.isArray(range)) {
        params[key] = round(randomInRange(range, rng), 3);
        // For integer params
        if (key === 'cellSize' || key === 'scale' || key === 'stripeWidth' || key === 'seed') {
          params[key] = Math.floor(params[key]);
        }
      }
    }

    contentImages.push({
      id: `content-${String(i).padStart(3, '0')}`,
      name: pattern.name,
      width,
      height,
      params,
    });
  }

  return contentImages;
}

// ─── Stack JSON Generation ───────────────────────────────────────────────────

/**
 * Generate a stack.json for a style set applied to a content image.
 * @param {object} styleSet
 * @param {object} contentImage
 * @returns {object} Stack definition compatible with render.js.
 */
function generateStack(styleSet, contentImage) {
  const layers = [];

  // Content layer
  layers.push({
    id: 'content',
    core: contentImage.name,
    params: { ...contentImage.params },
    opacity: 1,
    blend: 'normal',
    enabled: true,
  });

  // Style core layer
  layers.push({
    id: 'style-core',
    core: styleSet.core.name,
    params: { ...styleSet.core.params },
    opacity: styleSet.opacity,
    blend: styleSet.blend,
    enabled: true,
  });

  // Effect layers
  for (const effect of styleSet.effects) {
    layers.push({
      id: `effect-${effect.name}`,
      core: effect.name,
      params: { ...effect.params },
      opacity: effect.opacity,
      blend: effect.blend,
      enabled: true,
    });
  }

  return {
    layers,
    width: contentImage.width,
    height: contentImage.height,
    styleSet: styleSet.id,
    contentImage: contentImage.id,
  };
}

// ─── Main Curation ───────────────────────────────────────────────────────────

/**
 * Generate the full benchmark manifest.
 * @param {object} opts
 * @param {number} opts.seed
 * @param {number} opts.width
 * @param {number} opts.height
 * @returns {object} Benchmark manifest.
 */
function curateBenchmark(opts = {}) {
  const seed = opts.seed || parseInt(process.env.LAYERS_BENCH_SEED || '42', 10);
  const width = opts.width || parseInt(process.env.LAYERS_BENCH_WIDTH || '512', 10);
  const height = opts.height || parseInt(process.env.LAYERS_BENCH_HEIGHT || '512', 10);

  const rng = createRng(seed);

  // Generate 40 style sets
  const styleSets = generateStyleSets(rng);

  // Generate 20 content images
  const contentImages = generateContentImages(width, height, rng);

  // Generate all 40 × 20 = 800 stack combinations
  const allStacks = [];
  let stackIndex = 0;

  for (const styleSet of styleSets) {
    for (const contentImage of contentImages) {
      const stack = generateStack(styleSet, contentImage);
      stack.id = `stack-${String(stackIndex).padStart(4, '0')}`;
      stack.seed = seed;
      allStacks.push(stack);
      stackIndex++;
    }
  }

  // Build the manifest
  const manifest = {
    version: '0.7.0',
    generatedAt: new Date().toISOString(),
    seed,
    resolution: { width, height },
    styleSetCount: styleSets.length,
    contentImageCount: contentImages.length,
    totalStacks: allStacks.length,
    heldOut: true,
    // Summary metadata for quick reference
    styleSets: styleSets.map(ss => ({
      id: ss.id,
      core: ss.core.name,
      effectCount: ss.effects.length,
      blend: ss.blend,
      opacity: ss.opacity,
    })),
    contentImages: contentImages.map(ci => ({
      id: ci.id,
      name: ci.name,
      width: ci.width,
      height: ci.height,
    })),
    // The cross-product stacks
    stacks: allStacks,
    // Metric thresholds for evaluation
    thresholds: {
      ssim: 0.95,
      composite: 0.90,
      lpips: 0.05,
      frequency: 0.10,
    },
  };

  return manifest;
}

// ─── CLI Entry Point ─────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  // Parse args
  let outputPath = null;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--manifest-out' || args[i] === '--out' || args[i] === '-o') {
      outputPath = args[i + 1];
      i++;
    } else if (!args[i].startsWith('-')) {
      outputPath = args[i];
    }
  }

  const manifest = curateBenchmark();

  if (!outputPath) {
    const defaultDir = path.resolve(__dirname, '../output/benchmark');
    if (!fs.existsSync(defaultDir)) {
      fs.mkdirSync(defaultDir, { recursive: true });
    }
    outputPath = path.join(defaultDir, 'benchmark-manifest.json');
  } else {
    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
  }

  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));
  console.log(`Benchmark manifest written to: ${outputPath}`);
  console.log(`  Seed: ${manifest.seed}`);
  console.log(`  Resolution: ${manifest.resolution.width}x${manifest.resolution.height}`);
  console.log(`  Style sets: ${manifest.styleSetCount}`);
  console.log(`  Content images: ${manifest.contentImageCount}`);
  console.log(`  Total stacks: ${manifest.totalStacks}`);
  console.log(`  Held-out: ${manifest.heldOut}`);
  process.exit(0);
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export {
  curateBenchmark,
  generateStyleSets,
  generateContentImages,
  generateStack,
  createRng,
  CORES,
  EFFECTS,
  BLEND_MODES,
};
