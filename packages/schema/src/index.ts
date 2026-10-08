import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));

const contractsDir = path.resolve(__dirname, '../../../contracts');

const effectStackSchema = JSON.parse(fs.readFileSync(path.join(contractsDir, 'effect-stack.schema.json'), 'utf-8'));
const presetSchema = JSON.parse(fs.readFileSync(path.join(contractsDir, 'preset.schema.json'), 'utf-8'));
const documentSchema = JSON.parse(fs.readFileSync(path.join(contractsDir, 'document.schema.json'), 'utf-8'));

const ajvInstance = new (Ajv as any)({ strict: true, allErrors: true, coerceTypes: false });
(addFormats as any)(ajvInstance);

// Register all schemas with their $id so references resolve
ajvInstance.addSchema(effectStackSchema, effectStackSchema.$id);
ajvInstance.addSchema(presetSchema, presetSchema.$id);
ajvInstance.addSchema(documentSchema, documentSchema.$id);

const effectStackValidator = ajvInstance.compile(effectStackSchema);
const presetValidator = ajvInstance.compile(presetSchema);
const documentValidator = ajvInstance.compile(documentSchema);

export type EffectStack = typeof effectStackSchema;
export type Preset = typeof presetSchema;
export type Document = typeof documentSchema;

export function validateEffectStack(data: unknown): { valid: boolean; errors?: any[] } {
  const valid = effectStackValidator(data);
  return { valid: !!valid, errors: effectStackValidator.errors ?? undefined };
}

export function validatePreset(data: unknown): { valid: boolean; errors?: any[] } {
  const valid = presetValidator(data);
  return { valid: !!valid, errors: presetValidator.errors ?? undefined };
}

export function validateDocument(data: unknown): { valid: boolean; errors?: any[] } {
  const valid = documentValidator(data);
  return { valid: !!valid, errors: documentValidator.errors ?? undefined };
}

export const schemas = {
  effectStack: effectStackSchema,
  preset: presetSchema,
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

export function estimatePasses(effectStack: EffectStack): number {
  return effectStack.reduce((sum: number, item: any) => sum + (PASS_COSTS[item.core] ?? 1), 0);
}

export function mobileOk(passes: number): boolean {
  return passes <= 8; // Mobile budget ≤ 8 passes
}
