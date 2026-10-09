import { describe, it, expect } from 'vitest';
import {
  validateEffectStack,
  validatePreset,
  validatePresetV1,
  validateDocument,
  canonicalizePreset,
  estimatePasses,
  mobileOk,
  migratePresetV0ToV1,
  migratePreset,
  schemas,
} from '../src/index';

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

// ─── v1 Schema Tests ─────────────────────────────────────────────────────────

describe('Preset v1 schema', () => {
  const validV1Preset = {
    name: 'Test Preset',
    version: '1.0.0',
    effectStack: [],
    schemaVersion: 1,
    description: 'A test preset',
    tags: ['test', 'v1'],
    thumbnail: null,
    thumbnailUrl: 'https://example.com/thumb.jpg',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z',
    category: 'style',
  };

  it('validates a complete v1 preset', () => {
    const result = validatePresetV1(validV1Preset);
    expect(result.valid).toBe(true);
  });

  it('validates v1 preset without optional fields', () => {
    const minimal = {
      name: 'Minimal',
      version: '1.0.0',
      effectStack: [],
      schemaVersion: 1,
      tags: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      category: 'effect',
    };
    const result = validatePresetV1(minimal);
    expect(result.valid).toBe(true);
  });

  it('rejects v1 preset with schemaVersion 0', () => {
    const result = validatePresetV1({ ...validV1Preset, schemaVersion: 0 });
    expect(result.valid).toBe(false);
  });

  it('rejects v1 preset missing required tags', () => {
    const { tags, ...noTags } = validV1Preset;
    const result = validatePresetV1(noTags);
    expect(result.valid).toBe(false);
  });

  it('rejects v1 preset missing createdAt', () => {
    const { createdAt, ...noCreatedAt } = validV1Preset;
    const result = validatePresetV1(noCreatedAt);
    expect(result.valid).toBe(false);
  });

  it('rejects v1 preset missing updatedAt', () => {
    const { updatedAt, ...noUpdatedAt } = validV1Preset;
    const result = validatePresetV1(noUpdatedAt);
    expect(result.valid).toBe(false);
  });

  it('rejects v1 preset missing category', () => {
    const { category, ...noCategory } = validV1Preset;
    const result = validatePresetV1(noCategory);
    expect(result.valid).toBe(false);
  });

  it('rejects v1 preset with invalid category', () => {
    const result = validatePresetV1({ ...validV1Preset, category: 'invalid' });
    expect(result.valid).toBe(false);
  });

  it('rejects v1 preset with invalid createdAt format', () => {
    const result = validatePresetV1({ ...validV1Preset, createdAt: 'not-a-date' });
    expect(result.valid).toBe(false);
  });

  it('rejects v1 preset with invalid thumbnailUrl format', () => {
    const result = validatePresetV1({ ...validV1Preset, thumbnailUrl: 'not-a-uri' });
    expect(result.valid).toBe(false);
  });

  it('accepts all valid category values', () => {
    for (const cat of ['style', 'effect', 'look', 'experimental']) {
      const result = validatePresetV1({ ...validV1Preset, category: cat });
      expect(result.valid).toBe(true);
    }
  });

  it('rejects v1 preset with tags exceeding maxItems', () => {
    const manyTags = Array.from({ length: 11 }, (_, i) => `tag${i}`);
    const result = validatePresetV1({ ...validV1Preset, tags: manyTags });
    expect(result.valid).toBe(false);
  });

  it('rejects v1 preset with non-string tags', () => {
    const result = validatePresetV1({ ...validV1Preset, tags: [1, 2, 3] });
    expect(result.valid).toBe(false);
  });

  it('has correct $id', () => {
    expect(schemas.presetV1.$id).toBe('https://layers.dev/schemas/preset/v1');
  });
});

// ─── Migration Tests ─────────────────────────────────────────────────────────

describe('migratePresetV0ToV1', () => {
  const v0Preset = {
    name: 'Legacy Preset',
    version: '1.0.0',
    effectStack: [],
    schemaVersion: 0,
    description: 'A v0 preset',
    tags: ['legacy'],
    thumbnail: null,
  };

  it('migrates a minimal v0 preset', () => {
    const result = migratePresetV0ToV1(v0Preset);
    expect(result.name).toBe('Legacy Preset');
    expect(result.version).toBe('1.0.0');
    expect(result.schemaVersion).toBe(1);
    expect(result.tags).toEqual(['legacy']);
    expect(result.category).toBe('style');
    expect(typeof result.createdAt).toBe('string');
    expect(typeof result.updatedAt).toBe('string');
  });

  it('sets createdAt and updatedAt to current timestamp if not present', () => {
    const before = Date.now();
    const result = migratePresetV0ToV1(v0Preset);
    const after = Date.now();

    const createdMs = new Date(result.createdAt as string).getTime();
    const updatedMs = new Date(result.updatedAt as string).getTime();

    expect(createdMs).toBeGreaterThanOrEqual(before);
    expect(createdMs).toBeLessThanOrEqual(after);
    expect(updatedMs).toBeGreaterThanOrEqual(before);
    expect(updatedMs).toBeLessThanOrEqual(after);
  });

  it('preserves existing createdAt and updatedAt if present', () => {
    const withDates = {
      ...v0Preset,
      createdAt: '2024-06-15T10:30:00.000Z',
      updatedAt: '2024-06-16T12:00:00.000Z',
    };
    const result = migratePresetV0ToV1(withDates);
    expect(result.createdAt).toBe('2024-06-15T10:30:00.000Z');
    expect(result.updatedAt).toBe('2024-06-16T12:00:00.000Z');
  });

  it('defaults category to style if not present', () => {
    const result = migratePresetV0ToV1(v0Preset);
    expect(result.category).toBe('style');
  });

  it('preserves existing category if present', () => {
    const withCategory = { ...v0Preset, category: 'experimental' };
    const result = migratePresetV0ToV1(withCategory);
    expect(result.category).toBe('experimental');
  });

  it('ensures tags is an array, defaulting to []', () => {
    const noTags = { name: 'No Tags', version: '1.0.0', effectStack: [], schemaVersion: 0 };
    const result = migratePresetV0ToV1(noTags);
    expect(result.tags).toEqual([]);
  });

  it('preserves existing tags array', () => {
    const result = migratePresetV0ToV1(v0Preset);
    expect(result.tags).toEqual(['legacy']);
  });

  it('preserves all existing fields', () => {
    const rich = {
      ...v0Preset,
      description: 'Rich preset',
      thumbnail: 'https://example.com/thumb.png',
      customField: 'preserved',
    };
    const result = migratePresetV0ToV1(rich);
    expect(result.description).toBe('Rich preset');
    expect(result.thumbnail).toBe('https://example.com/thumb.png');
    expect((result as any).customField).toBe('preserved');
  });

  it('handles null input gracefully', () => {
    const result = migratePresetV0ToV1(null);
    expect(result.schemaVersion).toBe(1);
    expect(result.tags).toEqual([]);
    expect(result.category).toBe('style');
  });

  it('handles undefined input gracefully', () => {
    const result = migratePresetV0ToV1(undefined);
    expect(result.schemaVersion).toBe(1);
    expect(result.tags).toEqual([]);
    expect(result.category).toBe('style');
  });

  it('handles empty object input', () => {
    const result = migratePresetV0ToV1({});
    expect(result.schemaVersion).toBe(1);
    expect(result.tags).toEqual([]);
    expect(result.category).toBe('style');
  });

  it('produces output that validates against v1 schema', () => {
    const result = migratePresetV0ToV1(v0Preset);
    const validation = validatePresetV1(result);
    expect(validation.valid).toBe(true);
  });

  it('handles v0 preset with tags as non-array', () => {
    const badTags = { ...v0Preset, tags: 'not-an-array' };
    const result = migratePresetV0ToV1(badTags);
    expect(result.tags).toEqual([]);
  });
});

// ─── migratePreset Dispatcher Tests ──────────────────────────────────────────

describe('migratePreset dispatcher', () => {
  const v0Preset = {
    name: 'Test',
    version: '1.0.0',
    effectStack: [],
    schemaVersion: 0,
    tags: ['test'],
  };

  it('dispatches v0 to v1 migration', () => {
    const result = migratePreset(v0Preset, 0);
    expect(result.schemaVersion).toBe(1);
    expect(result.category).toBe('style');
    expect(result.tags).toEqual(['test']);
  });

  it('returns v1 preset as-is when fromVersion is 1', () => {
    const v1Preset = {
      name: 'Already v1',
      version: '1.0.0',
      effectStack: [],
      schemaVersion: 1,
      tags: ['v1'],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      category: 'look',
    };
    const result = migratePreset(v1Preset, 1);
    expect(result).toEqual(v1Preset);
  });

  it('throws for unsupported version', () => {
    expect(() => migratePreset(v0Preset, 2)).toThrow('Unsupported preset schema version: 2');
  });

  it('throws for negative version', () => {
    expect(() => migratePreset(v0Preset, -1)).toThrow('Unsupported preset schema version: -1');
  });
});

// ─── Backward Compatibility Tests ────────────────────────────────────────────

describe('v0 backward compatibility', () => {
  it('v0 schema still validates v0 presets', () => {
    const v0Preset = {
      name: 'V0 Preset',
      version: '1.0.0',
      effectStack: [],
      schemaVersion: 0,
      description: 'Still works',
      tags: ['v0'],
      thumbnail: null,
    };
    const result = validatePreset(v0Preset);
    expect(result.valid).toBe(true);
  });

  it('v0 schema rejects v1-only fields', () => {
    const v1Preset = {
      name: 'V1 in v0',
      version: '1.0.0',
      effectStack: [],
      schemaVersion: 0,
      tags: ['test'],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      category: 'style',
    };
    const result = validatePreset(v1Preset);
    expect(result.valid).toBe(false);
  });

  it('v0 schema does not require tags', () => {
    const noTags = {
      name: 'No Tags',
      version: '1.0.0',
      effectStack: [],
      schemaVersion: 0,
    };
    const result = validatePreset(noTags);
    expect(result.valid).toBe(true);
  });

  it('v0 schema does not require createdAt/updatedAt/category', () => {
    const minimal = {
      name: 'Minimal V0',
      version: '1.0.0',
      effectStack: [],
      schemaVersion: 0,
    };
    const result = validatePreset(minimal);
    expect(result.valid).toBe(true);
  });

  it('v0 fixture still validates', async () => {
    const preset = await import('../test/fixtures/preset-bevel.json', { with: { type: 'json' } });
    const result = validatePreset(preset.default);
    expect(result.valid).toBe(true);
  });

  it('v0 schema has correct $id', () => {
    expect(schemas.preset.$id).toBe('https://layers.dev/schemas/preset/v0');
  });
});
