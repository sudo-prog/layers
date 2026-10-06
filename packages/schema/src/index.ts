import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import * as fs from 'fs';
import * as path from 'path';

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

export function canonicalizePreset(preset: Preset): string {
  // Canonical key ordering for reproducible JSON
  return JSON.stringify(preset, Object.keys(preset).sort());
}

export function estimatePasses(effectStack: EffectStack): number {
  // Rough pass estimation: each core = 1 pass, blend modes may add passes
  // TODO: per-core pass costs from [[03-Reference/Cores]]
  return effectStack.length;
}

export function mobileOk(passes: number): boolean {
  return passes <= 8; // Mobile budget ≤ 8 passes
}
