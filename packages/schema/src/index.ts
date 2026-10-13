import Ajv from 'ajv';
import addFormats from 'ajv-formats';

// Schemas are inlined as TypeScript constants so this package works in both
// Node.js and browser environments (no fs/path dependencies).
// These mirror contracts/*.json — keep them in sync.

const effectStackSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://layers.dev/schemas/effect-stack/v0",
  title: "EffectStack",
  type: "array",
  items: {
    type: "object",
    required: ["core", "params", "opacity", "blend", "enabled"],
    properties: {
      core: { type: "string", description: "Core identifier" },
      params: { type: "object", description: "Core-specific parameters", additionalProperties: true },
      opacity: { type: "number", minimum: 0, maximum: 1, default: 1 },
      blend: { type: "string", enum: ["normal", "multiply", "screen", "overlay", "soft-light", "hard-light", "color-dodge", "color-burn", "darken", "lighten", "difference", "exclusion", "hue", "saturation", "color", "luminosity"], default: "normal" },
      mask: { type: ["string", "null"], description: "Optional asset ID (Immich) for a mask texture" },
      enabled: { type: "boolean", default: true },
    },
    additionalProperties: false,
  },
  minItems: 0,
} as const;

const presetSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://layers.dev/schemas/preset/v0",
  title: "Preset",
  type: "object",
  required: ["name", "version", "effectStack", "schemaVersion"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 128 },
    version: { type: "string", pattern: "^\\d+\\.\\d+\\.\\d+$" },
    effectStack: { $ref: "https://layers.dev/schemas/effect-stack/v0" },
    schemaVersion: { type: "integer", const: 0 },
    description: { type: "string", maxLength: 512 },
    tags: { type: "array", items: { type: "string" }, maxItems: 10 },
    thumbnail: { type: ["string", "null"] },
  },
  additionalProperties: false,
} as const;

const presetSchemaV1 = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://layers.dev/schemas/preset/v1",
  title: "Preset",
  type: "object",
  required: ["name", "version", "effectStack", "schemaVersion", "tags", "createdAt", "updatedAt", "category"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 128 },
    version: { type: "string", pattern: "^\\d+\\.\\d+\\.\\d+$" },
    effectStack: { $ref: "https://layers.dev/schemas/effect-stack/v0" },
    schemaVersion: { type: "integer", const: 1 },
    description: { type: "string", maxLength: 512 },
    tags: { type: "array", items: { type: "string" }, maxItems: 10 },
    thumbnail: { type: ["string", "null"] },
    thumbnailUrl: { type: "string", format: "uri" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
    category: { type: "string", enum: ["style", "effect", "look", "experimental"] },
  },
  additionalProperties: false,
} as const;

const documentSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://layers.dev/schemas/document/v0",
  title: "Document",
  type: "object",
  required: ["schemaVersion", "layers", "canvas", "version"],
  properties: {
    schemaVersion: { type: "integer", const: 0 },
    version: { type: "string", pattern: "^\\d+\\.\\d+\\.\\d+$" },
    canvas: {
      type: "object",
      required: ["width", "height", "dpi"],
      properties: {
        width: { type: "integer", minimum: 1, maximum: 8192 },
        height: { type: "integer", minimum: 1, maximum: 8192 },
        dpi: { type: "number", minimum: 72, maximum: 600, default: 144 },
        colorSpace: { type: "string", enum: ["srgb", "display-p3", "a98rgb", "prophoto", "cmyk"], default: "srgb" },
      },
      additionalProperties: false,
    },
    layers: { type: "array", items: { $ref: "#/$defs/layer" } },
  },
  additionalProperties: false,
  $defs: {
    layer: {
      type: "object",
      required: ["id", "kind", "content", "effects", "transform", "visible", "locked", "opacity"],
      properties: {
        id: { type: "string", format: "uuid" },
        kind: { type: "string", enum: ["raster", "vector", "text", "group"] },
        content: { type: "object" },
        effects: { $ref: "https://layers.dev/schemas/effect-stack/v0" },
        transform: {
          type: "object",
          required: ["x", "y", "rotation", "scaleX", "scaleY"],
          properties: {
            x: { type: "number" },
            y: { type: "number" },
            rotation: { type: "number" },
            scaleX: { type: "number", default: 1 },
            scaleY: { type: "number", default: 1 },
          },
          additionalProperties: false,
        },
        visible: { type: "boolean", default: true },
        locked: { type: "boolean", default: false },
        opacity: { type: "number", minimum: 0, maximum: 1, default: 1 },
        children: { type: "array", items: { $ref: "#/$defs/layer" }, default: [] },
      },
      additionalProperties: false,
    },
  },
} as const;

const ajvInstance = new (Ajv as any)({ strict: true, allErrors: true, coerceTypes: false });
(addFormats as any)(ajvInstance);

// Register all schemas with their $id so references resolve
ajvInstance.addSchema(effectStackSchema, effectStackSchema.$id);
ajvInstance.addSchema(presetSchema, presetSchema.$id);
ajvInstance.addSchema(presetSchemaV1, presetSchemaV1.$id);
ajvInstance.addSchema(documentSchema, documentSchema.$id);

const effectStackValidator = ajvInstance.compile(effectStackSchema);
const presetValidator = ajvInstance.compile(presetSchema);
const presetV1Validator = ajvInstance.compile(presetSchemaV1);
const documentValidator = ajvInstance.compile(documentSchema);

export type EffectStack = typeof effectStackSchema;
export type Preset = typeof presetSchema;
export type PresetV1 = typeof presetSchemaV1;
export type Document = typeof documentSchema;

export function validateEffectStack(data: unknown): { valid: boolean; errors?: any[] } {
  const valid = effectStackValidator(data);
  return { valid: !!valid, errors: effectStackValidator.errors ?? undefined };
}

export function validatePreset(data: unknown): { valid: boolean; errors?: any[] } {
  const valid = presetValidator(data);
  return { valid: !!valid, errors: presetValidator.errors ?? undefined };
}

export function validatePresetV1(data: unknown): { valid: boolean; errors?: any[] } {
  const valid = presetV1Validator(data);
  return { valid: !!valid, errors: presetV1Validator.errors ?? undefined };
}

export function validateDocument(data: unknown): { valid: boolean; errors?: any[] } {
  const valid = documentValidator(data);
  return { valid: !!valid, errors: documentValidator.errors ?? undefined };
}

export const schemas = {
  effectStack: effectStackSchema,
  preset: presetSchema,
  presetV1: presetSchemaV1,
  document: documentSchema,
};

function deepSort(obj: any): any {
  if (Array.isArray(obj)) return obj.map(deepSort);
  if (obj && typeof obj === 'object') {
    return Object.keys(obj).sort().reduce((acc: any, key) => {
      if (obj[key] === undefined) return acc;
      acc[key] = deepSort(obj[key]);
      return acc;
    }, {});
  }
  return obj;
}

export function canonicalizePreset(preset: Preset): string {
  return JSON.stringify(deepSort(preset));
}

const PASS_COSTS: Record<string, number> = {
  'bevel-emboss': 2,
  'gradient-overlay': 1,
  'pattern-dither': 2,
  'noise-grain': 2,
  'gaussian-blur': 3,
  'displacement': 2,
  'color-adjust': 1,
};

export function estimatePasses(effectStack: readonly any[]): number {
  return effectStack.reduce((sum: number, item: any) => sum + (PASS_COSTS[item.core] ?? 1), 0);
}

export function mobileOk(passes: number): boolean {
  return passes <= 8; // Mobile budget ≤ 8 passes
}

// ─── Migration: v0 → v1 ──────────────────────────────────────────────────────

/**
 * Migrate a v0 preset to v1.
 *
 * - Sets createdAt/updatedAt to current timestamp if not present
 * - Sets category to 'style' if not present
 * - Ensures tags is an array (defaults to [])
 * - Preserves all existing fields
 * - Bumps schemaVersion to 1
 */
export function migratePresetV0ToV1(v0: unknown): PresetV1 {
  const src = (v0 ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();

  const result: Record<string, unknown> = {
    ...src,
    schemaVersion: 1,
    createdAt: (typeof src.createdAt === 'string' ? src.createdAt : now),
    updatedAt: (typeof src.updatedAt === 'string' ? src.updatedAt : now),
    category: (typeof src.category === 'string' ? src.category : 'style'),
    tags: (Array.isArray(src.tags) ? src.tags : []),
  };

  return result as unknown as PresetV1;
}

/**
 * Dispatch migration based on the source schema version.
 *
 * Currently supports:
 *   0 → 1
 *
 * For version 1 (already current), returns the input as-is.
 * Throws for unknown versions.
 */
export function migratePreset(preset: unknown, fromVersion: number): PresetV1 {
  switch (fromVersion) {
    case 0:
      return migratePresetV0ToV1(preset);
    case 1:
      return preset as PresetV1;
    default:
      throw new Error(`Unsupported preset schema version: ${fromVersion}`);
  }
}
