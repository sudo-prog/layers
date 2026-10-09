/**
 * Preset store — persistence layer for named effect-stack presets.
 *
 * Built on IndexedDBProvider from @layers/sync (zero new dependencies).
 * Each preset is stored as a Document whose `data` is a validated,
 * canonicalised v1 preset record.
 *
 * Because IndexedDBProvider has no key-listing API, a lightweight index
 * document (`layers-preset:index`) tracks the set of stored preset ids.
 * On `init()` the index is read back from IndexedDB so `listPresets()`
 * works across reloads without localStorage.
 */

import { IndexedDBProvider, type Document } from "@layers/sync";
import {
  canonicalizePreset,
  validatePresetV1,
  migratePreset,
} from "@layers/schema";
import { createStackState, type StackState } from "@layers/stack";

const INDEX_DOC_ID = "layers-preset:index";

/** The v1 preset data shape (the schema package's PresetV1 is a schema literal). */
interface PresetV1Data {
  name: string;
  version: string;
  effectStack: Array<{
    core: string;
    params: Record<string, unknown>;
    opacity: number;
    blend: string;
    mask?: string | null;
    enabled: boolean;
  }>;
  schemaVersion: number;
  description?: string;
  tags: string[];
  thumbnail?: string | null;
  createdAt: string;
  updatedAt: string;
  category: string;
}

export interface PresetRecord {
  id: string;
  name: string;
  description?: string;
  tags: string[];
  schemaVersion: number;
  stack: StackState;
  createdAt: string;
  updatedAt: string;
  thumbnail?: string;
}

export interface SavePresetMeta {
  description?: string;
  tags?: string[];
}

export class PresetStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PresetStoreError";
  }
}

function presetIdForName(name: string): string {
  return `layers-preset:${name.trim().toLowerCase()}`;
}

function recordFromDoc(doc: Document): PresetRecord | null {
  const data = doc.data as Record<string, unknown>;
  if (!data || typeof data !== "object" || !("name" in data) || !("stack" in data)) {
    return null;
  }
  return data as unknown as PresetRecord;
}

function buildV1Preset(
  name: string,
  stack: StackState,
  meta?: SavePresetMeta,
): PresetV1Data {
  const now = new Date().toISOString();
  const v0 = {
    name,
    version: "1.0.0",
    effectStack: stack.items.map((item) => ({
      core: item.core,
      params: item.params,
      opacity: item.opacity,
      blend: item.blend,
      mask: item.mask ?? null,
      enabled: item.enabled,
    })),
    schemaVersion: 0,
    description: meta?.description ?? undefined,
    tags: meta?.tags ?? [],
    thumbnail: undefined,
  };
  return migratePreset(v0, 0) as unknown as PresetV1Data;
}

function stackToEffectStack(stack: StackState) {
  return stack.items.map((item) => ({
    core: item.core,
    params: item.params,
    opacity: item.opacity,
    blend: item.blend,
    mask: item.mask ?? null,
    enabled: item.enabled,
  }));
}

export class PresetStore {
  private provider: IndexedDBProvider;
  private _available = false;
  private readonly customProvider: boolean;

  get available(): boolean {
    return this._available;
  }

  constructor(provider?: IndexedDBProvider) {
    this.customProvider = provider !== undefined;
    this.provider = provider ?? new IndexedDBProvider();
  }

  /**
   * Open the underlying IndexedDB connection and load the preset index.
   * Returns false when IndexedDB is unavailable (e.g. private mode).
   * When a custom provider is injected (tests), the indexedDB check is skipped.
   */
  async init(): Promise<boolean> {
    if (!this.customProvider && typeof indexedDB === "undefined") return false;
    try {
      // Probe the provider; a null result (no index yet) is fine.
      await this.provider.restore(INDEX_DOC_ID);
      this._available = true;
      return true;
    } catch {
      // Some providers throw on missing keys — treat that as "available
      // but empty" so the store still works with simple fakes.
      this._available = true;
      return true;
    }
  }

  // ── Index helpers ─────────────────────────────────────────────────────

  private async readIndex(): Promise<string[]> {
    const doc = await this.provider.restore(INDEX_DOC_ID);
    if (!doc) return [];
    const ids = (doc.data as Record<string, unknown>).ids;
    return Array.isArray(ids) ? (ids as string[]) : [];
  }

  private async writeIndex(ids: string[]): Promise<void> {
    await this.provider.save({
      id: INDEX_DOC_ID,
      version: "1.0.0",
      data: { ids },
      updatedAt: new Date().toISOString(),
    });
  }

  // ── CRUD ─────────────────────────────────────────────────────────────

  async savePreset(
    name: string,
    stack: StackState,
    meta?: SavePresetMeta,
  ): Promise<PresetRecord> {
    if (!this._available) {
      throw new PresetStoreError("Preset store is not available (IndexedDB unavailable)");
    }
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new PresetStoreError("Preset name cannot be empty");
    }

    // Build the v1 preset payload and validate before persisting.
    const v1 = buildV1Preset(trimmed, stack, meta);
    const validation = validatePresetV1(v1);
    if (!validation.valid) {
      const detail = (validation.errors ?? [])
        .map((e) => `${e.instancePath} ${e.message}`)
        .join("; ");
      throw new PresetStoreError(`Invalid preset: ${detail}`);
    }

    const record: PresetRecord = {
      id: presetIdForName(trimmed),
      name: trimmed,
      description: v1.description,
      tags: v1.tags,
      schemaVersion: v1.schemaVersion,
      stack,
      createdAt: v1.createdAt,
      updatedAt: v1.updatedAt,
      thumbnail: v1.thumbnail ?? undefined,
    };

    await this.provider.save({
      id: record.id,
      version: "1.0.0",
      data: record as unknown as Record<string, unknown>,
      updatedAt: record.updatedAt,
    });

    const ids = await this.readIndex();
    if (!ids.includes(record.id)) {
      await this.writeIndex([...ids, record.id]);
    }
    return record;
  }

  async listPresets(): Promise<PresetRecord[]> {
    if (!this._available) return [];
    const ids = await this.readIndex();
    const records: PresetRecord[] = [];
    for (const id of ids) {
      const doc = await this.provider.restore(id);
      if (!doc) continue;
      const record = recordFromDoc(doc);
      if (record) records.push(record);
    }
    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async loadPreset(id: string): Promise<StackState | null> {
    if (!this._available) return null;
    const doc = await this.provider.restore(id);
    if (!doc) return null;
    const record = recordFromDoc(doc);
    return record ? record.stack : null;
  }

  async deletePreset(id: string): Promise<void> {
    if (!this._available) return;
    const ids = await this.readIndex();
    const next = ids.filter((x) => x !== id);
    await this.writeIndex(next);
    // Write a tombstone so the preset doc is no longer loadable.
    await this.provider.save({
      id,
      version: "1.0.0",
      data: { deleted: true, id },
      updatedAt: new Date().toISOString(),
    });
  }

  // ── Import / Export ───────────────────────────────────────────────────

  async exportPresetJson(id: string): Promise<string> {
    if (!this._available) {
      throw new PresetStoreError("Preset store is not available (IndexedDB unavailable)");
    }
    const doc = await this.provider.restore(id);
    if (!doc) {
      throw new PresetStoreError(`Preset not found: ${id}`);
    }
    const record = recordFromDoc(doc);
    if (!record) {
      throw new PresetStoreError(`Preset not found: ${id}`);
    }
    const v1: PresetV1Data = {
      name: record.name,
      version: "1.0.0",
      effectStack: stackToEffectStack(record.stack),
      schemaVersion: record.schemaVersion,
      description: record.description,
      tags: record.tags ?? [],
      thumbnail: record.thumbnail ?? null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      category: "style",
    };
    return canonicalizePreset(v1 as never);
  }

  async importPresetJson(json: string): Promise<PresetRecord> {
    if (!this._available) {
      throw new PresetStoreError("Preset store is not available (IndexedDB unavailable)");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new PresetStoreError("Invalid JSON: could not parse preset file");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new PresetStoreError("Invalid preset: expected a JSON object");
    }
    const obj = parsed as Record<string, unknown>;
    const rawVersion = obj.schemaVersion;
    const fromVersion = typeof rawVersion === "number" ? rawVersion : 0;

    let v1: PresetV1Data;
    try {
      v1 = migratePreset(parsed, fromVersion) as unknown as PresetV1Data;
    } catch (e) {
      throw new PresetStoreError(
        `Migration failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const validation = validatePresetV1(v1);
    if (!validation.valid) {
      const detail = (validation.errors ?? [])
        .map((e) => `${e.instancePath} ${e.message}`)
        .join("; ");
      throw new PresetStoreError(`Invalid preset: ${detail}`);
    }

    const stack: StackState = createStackState(v1.effectStack);

    const record: PresetRecord = {
      id: presetIdForName(v1.name),
      name: v1.name,
      description: v1.description,
      tags: v1.tags,
      schemaVersion: v1.schemaVersion,
      stack,
      createdAt: v1.createdAt,
      updatedAt: v1.updatedAt,
      thumbnail: v1.thumbnail ?? undefined,
    };

    await this.provider.save({
      id: record.id,
      version: "1.0.0",
      data: record as unknown as Record<string, unknown>,
      updatedAt: record.updatedAt,
    });

    const ids = await this.readIndex();
    if (!ids.includes(record.id)) {
      await this.writeIndex([...ids, record.id]);
    }
    return record;
  }
}

/** Singleton preset store for the app. */
export const presetStore = new PresetStore();
