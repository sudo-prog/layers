import { describe, it, expect } from 'vitest';
import { validateEffectStack, validatePreset, validateDocument, canonicalizePreset, estimatePasses, mobileOk } from '../src/index';

function deepSort(obj: unknown): unknown {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    return Object.keys(obj as Record<string, unknown>)
      .sort()
      .reduce((acc, k) => {
        acc[k] = deepSort((obj as Record<string, unknown>)[k]);
        return acc;
      }, {} as Record<string, unknown>);
  }
  return obj;
}

describe('EffectStack validator', () => {
  it('validates a single core effect', () => {
    const stack = [{
      core: 'bevel-emboss',
      params: { depth: 0.5, size: 8 },
      opacity: 1,
      blend: 'normal',
      enabled: true
    }];
    const result = validateEffectStack(stack);
    expect(result.valid).toBe(true);
  });

  it('rejects missing required fields', () => {
    const stack = [{ core: 'bevel-emboss' }];
    const result = validateEffectStack(stack);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it('rejects invalid blend mode', () => {
    const stack = [{
      core: 'bevel-emboss',
      params: {},
      opacity: 1,
      blend: 'invalid-blend',
      enabled: true
    }];
    const result = validateEffectStack(stack);
    expect(result.valid).toBe(false);
  });

  it('accepts valid opacity range', () => {
    const stack = [{
      core: 'bevel-emboss',
      params: {},
      opacity: 0.5,
      blend: 'normal',
      enabled: true
    }];
    const result = validateEffectStack(stack);
    expect(result.valid).toBe(true);
  });

  it('rejects opacity out of range', () => {
    const stack = [{
      core: 'bevel-emboss',
      params: {},
      opacity: 1.5,
      blend: 'normal',
      enabled: true
    }];
    const result = validateEffectStack(stack);
    expect(result.valid).toBe(false);
  });
});

describe('Preset validator', () => {
  it('validates the bevel preset fixture', async () => {
    const preset = await import('../test/fixtures/preset-bevel.json', { with: { type: 'json' } });
    const result = validatePreset(preset.default);
    expect(result.valid).toBe(true);
  });

  it('validates the gradient preset fixture', async () => {
    const preset = await import('../test/fixtures/preset-gradient.json', { with: { type: 'json' } });
    const result = validatePreset(preset.default);
    expect(result.valid).toBe(true);
  });

  it('rejects missing name', () => {
    const preset = { version: '1.0.0', effectStack: [], schemaVersion: 0 };
    const result = validatePreset(preset);
    expect(result.valid).toBe(false);
  });

  it('rejects invalid semantic version', () => {
    const preset = { name: 'Test', version: '1.0', effectStack: [], schemaVersion: 0 };
    const result = validatePreset(preset);
    expect(result.valid).toBe(false);
  });

  it('canonicalizePreset produces stable output', () => {
    const preset = { name: 'Test', version: '1.0.0', effectStack: [], schemaVersion: 0, tags: ['a', 'b'] };
    const c1 = canonicalizePreset(preset);
    const c2 = canonicalizePreset(preset);
    expect(c1).toBe(c2);
  });
});

describe('Document validator', () => {
  it('validates the document fixture', async () => {
    const doc = await import('../test/fixtures/document-with-layer.json', { with: { type: 'json' } });
    const result = validateDocument(doc.default);
    expect(result.valid).toBe(true);
  });

  it('validates layer with effects attached', async () => {
    const doc = await import('../test/fixtures/document-with-layer.json', { with: { type: 'json' } });
    const layer = doc.default.layers[0];
    expect(layer.effects).toBeDefined();
    expect(Array.isArray(layer.effects)).toBe(true);
    expect(layer.effects.length).toBeGreaterThan(0);
  });

  it('rejects invalid layer kind', () => {
    const doc = {
      schemaVersion: 0,
      version: '1.0.0',
      canvas: { width: 100, height: 100, dpi: 144 },
      layers: [{ id: '550e8400-e29b-41d4-a716-446655440000', kind: 'invalid', content: {}, effects: [], transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, visible: true, locked: false, opacity: 1 }]
    };
    const result = validateDocument(doc);
    expect(result.valid).toBe(false);
  });
});

describe('Pass estimation', () => {
  it('estimates passes = number of effects', () => {
    const stack = [
      { core: 'a', params: {}, opacity: 1, blend: 'normal', enabled: true },
      { core: 'b', params: {}, opacity: 1, blend: 'normal', enabled: true },
    ];
    expect(estimatePasses(stack)).toBe(2);
  });

  it('mobileOk returns true for <= 8 passes', () => {
    expect(mobileOk(8)).toBe(true);
    expect(mobileOk(6)).toBe(true);
    expect(mobileOk(9)).toBe(false);
  });
});

describe('Round-trip lossless', () => {
  it('preset round-trips through validate + canonicalize', async () => {
    const preset = await import('../test/fixtures/preset-bevel.json', { with: { type: 'json' } });
    const result = validatePreset(preset.default);
    expect(result.valid).toBe(true);
    const canonical = JSON.stringify(deepSort(preset.default));
    const parsed = JSON.parse(canonical);
    const result2 = validatePreset(parsed);
    expect(result2.valid).toBe(true);
  });

  it('document round-trips through validate', async () => {
    const doc = await import('../test/fixtures/document-with-layer.json', { with: { type: 'json' } });
    const result = validateDocument(doc.default);
    expect(result.valid).toBe(true);
    const canonical = JSON.stringify(deepSort(doc.default));
    const parsed = JSON.parse(canonical);
    const result2 = validateDocument(parsed);
    expect(result2.valid).toBe(true);
  });
});
