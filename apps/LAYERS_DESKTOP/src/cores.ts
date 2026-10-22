/**
 * Core catalogue for the desktop editor.
 *
 * Each core is a real GLSL shader from @layers/cores. `params` drives the props
 * panel; `defaults` builds the initial stack item.
 *
 * This is deliberately a separate declaration from the mobile app's CORE_DEFS:
 * the desktop surface exposes more parameters (the mobile build trims for the
 * phone panel) and groups them by category for the picker.
 */

import {
  PatternDitherCore,
  NoiseGrainCore,
  BlurCore,
  ColorBlendCore,
  DisplacementCore,
  LightingCore,
  OutlineCore,
} from "@layers/cores";

export interface ParamOption {
  value: string;
  label: string;
}

export interface ParamDef {
  key: string;
  label: string;
  type: "slider" | "select" | "color" | "toggle";
  min?: number;
  max?: number;
  step?: number;
  options?: ParamOption[];
  default: unknown;
}

export interface CoreDef {
  /** Stable id, also the stack item's `core`. */
  name: string;
  label: string;
  /** Picker category id. */
  category: CategoryId;
  /** One line, shown in the picker tile. */
  blurb: string;
  create: (params?: Record<string, unknown>) => unknown;
  params: ParamDef[];
}

export type CategoryId =
  | "textures"
  | "adjustments"
  | "blurs"
  | "distortions"
  | "light"
  | "edges";

export interface Category {
  id: CategoryId;
  label: string;
}

export const CATEGORIES: Category[] = [
  { id: "textures", label: "Textures" },
  { id: "adjustments", label: "Adjustments" },
  { id: "blurs", label: "Blurs" },
  { id: "distortions", label: "Distortions" },
  { id: "light", label: "Light & Shadow" },
  { id: "edges", label: "Edges" },
];

export const CORE_DEFS: CoreDef[] = [
  {
    name: "pattern-dither",
    label: "Pattern/Dither",
    category: "textures",
    blurb: "Halftone patterns and ordered dithering — simplex, dot and wave bases with Bayer matrices.",
    create: (p) => new PatternDitherCore(p as never),
    params: [
      {
        key: "shape",
        label: "Shape",
        type: "select",
        options: [
          { value: "simplex", label: "Simplex" },
          { value: "dots", label: "Dots" },
          { value: "wave", label: "Wave" },
        ],
        default: "simplex",
      },
      { key: "scale", label: "Scale", type: "slider", min: 1, max: 200, step: 1, default: 50 },
      {
        key: "levels",
        label: "Dither Type",
        type: "select",
        options: [
          { value: "random", label: "Random" },
          { value: "bayer2", label: "Bayer 2×2" },
          { value: "bayer4", label: "Bayer 4×4" },
          { value: "bayer8", label: "Bayer 8×8" },
        ],
        default: "bayer4",
      },
      { key: "angle", label: "Angle", type: "slider", min: 0, max: 360, step: 1, default: 0 },
      { key: "contrast", label: "Contrast", type: "slider", min: 0.1, max: 5, step: 0.1, default: 1.2 },
      { key: "inkColor", label: "Ink", type: "color", default: "#000000" },
      { key: "paperColor", label: "Paper", type: "color", default: "#ffffff" },
    ],
  },
  {
    name: "noise-grain",
    label: "Noise/Grain",
    category: "textures",
    blurb: "Procedural noise and film grain. Stack octaves and blend mono or colour grain.",
    create: (p) => new NoiseGrainCore(p as never),
    params: [
      { key: "scale", label: "Scale", type: "slider", min: 1, max: 100, step: 1, default: 20 },
      { key: "octaves", label: "Octaves", type: "slider", min: 1, max: 6, step: 1, default: 3 },
      { key: "strength", label: "Strength", type: "slider", min: 0, max: 1, step: 0.01, default: 0.3 },
      { key: "monochrome", label: "Monochrome", type: "toggle", default: true },
      { key: "seed", label: "Seed", type: "slider", min: 0, max: 999, step: 1, default: 1 },
    ],
  },
  {
    name: "blur",
    label: "Blur/Convolution",
    category: "blurs",
    blurb: "Separable Gaussian blur with omni and directional modes.",
    create: (p) => new BlurCore(p as never),
    params: [
      { key: "radius", label: "Radius", type: "slider", min: 0.5, max: 20, step: 0.5, default: 2 },
      {
        key: "direction",
        label: "Direction",
        type: "select",
        options: [
          { value: "omni", label: "Omni" },
          { value: "horizontal", label: "Horizontal" },
          { value: "vertical", label: "Vertical" },
        ],
        default: "omni",
      },
      { key: "passes", label: "Passes", type: "slider", min: 1, max: 4, step: 1, default: 2 },
    ],
  },
  {
    name: "color-blend",
    label: "Color/Blend",
    category: "adjustments",
    blurb: "Hue, saturation and brightness in a single pass.",
    create: (p) => new ColorBlendCore(p as never),
    params: [
      { key: "hueShift", label: "Hue Shift", type: "slider", min: -180, max: 180, step: 1, default: 0 },
      { key: "saturation", label: "Saturation", type: "slider", min: 0, max: 3, step: 0.01, default: 1 },
      { key: "brightness", label: "Brightness", type: "slider", min: 0, max: 3, step: 0.01, default: 1 },
    ],
  },
  {
    name: "displacement",
    label: "Displacement",
    category: "distortions",
    blurb: "Push pixels along a procedural field. Ripple, turbulence and wave types.",
    create: (p) => new DisplacementCore(p as never),
    params: [
      { key: "strength", label: "Strength", type: "slider", min: 0, max: 0.2, step: 0.001, default: 0.02 },
      { key: "mapScale", label: "Map Scale", type: "slider", min: 1, max: 50, step: 0.5, default: 8 },
      {
        key: "type",
        label: "Type",
        type: "select",
        options: [
          { value: "ripple", label: "Ripple" },
          { value: "turbulence", label: "Turbulence" },
          { value: "wave", label: "Wave" },
        ],
        default: "ripple",
      },
      {
        key: "axis",
        label: "Axis",
        type: "select",
        options: [
          { value: "both", label: "Both" },
          { value: "x", label: "X" },
          { value: "y", label: "Y" },
        ],
        default: "both",
      },
    ],
  },
  {
    name: "lighting",
    label: "Lighting",
    category: "light",
    blurb: "Directional or omni light with a coloured falloff and optional blur.",
    create: (p) => new LightingCore(p as never),
    params: [
      { key: "offsetX", label: "Offset X", type: "slider", min: -1, max: 1, step: 0.01, default: 0.3 },
      { key: "offsetY", label: "Offset Y", type: "slider", min: -1, max: 1, step: 0.01, default: 0.3 },
      { key: "blur", label: "Blur", type: "slider", min: 0, max: 10, step: 0.1, default: 0 },
      { key: "color", label: "Color", type: "color", default: "#ffffff" },
    ],
  },
  {
    name: "outline",
    label: "Outline/Edge",
    category: "edges",
    blurb: "Edge detection with variable thickness and a colour wash.",
    create: (p) => new OutlineCore(p as never),
    params: [
      { key: "thickness", label: "Thickness", type: "slider", min: 1, max: 10, step: 1, default: 1 },
      { key: "threshold", label: "Threshold", type: "slider", min: 0, max: 1, step: 0.01, default: 0.1 },
      { key: "color", label: "Color", type: "color", default: "#ffffff" },
    ],
  },
];

export function coreDef(name: string): CoreDef | undefined {
  return CORE_DEFS.find((d) => d.name === name);
}

/** Default params for a fresh stack item. */
export function defaultParams(def: CoreDef): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of def.params) out[p.key] = p.default;
  return out;
}
