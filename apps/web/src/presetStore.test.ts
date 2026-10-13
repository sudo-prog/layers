// @vitest-environment jsdom
/**
 * Tests for the preset store (Stage 0.6 Feature 1).
 *
 * Uses an in-memory fake of IndexedDBProvider (same shape as the mock in
 * packages/sync/test/sync.test.ts) so the store runs under jsdom.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  PresetStore,
  PresetStoreError,
  type PresetRecord,
} from "./presetStore";
import { canonicalizePreset } from "@layers/schema";
import { createStackState, type StackState } from "@layers/stack";

// ── In-memory fake of IndexedDBProvider ────────────────────────────────

class FakeProvider {
  private store = new Map<string, { id: string; version: string; data: unknown; updatedAt: string }>();

  async save(doc: { id: string; version: string; data: unknown; updatedAt: string }): Promise<void> {
    this.store.set(doc.id, { ...doc });
  }

  async restore(id: string): Promise<{ id: string; version: string; data: unknown; updatedAt: string } | null> {
    return this.store.get(id) ?? null;
  }

  async queueStatus(): Promise<unknown[]> {
    return [];
  }

  async link(): Promise<void> {}

  get size(): number {
    return this.store.size;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function makeStack(n = 1): StackState {
  const state = createStackState();
  for (let i = 0; i < n; i++) {
    state.items.push({
      id: `item-${i}`,
      core: "blur",
      params: { radius: 2 },
      opacity: 1,
      blend: "normal",
      mask: null,
      enabled: true,
    });
  }
  return state;
}

function validV0Json(): string {
  return JSON.stringify({
    name: "Imported Look",
    version: "1.0.0",
    effectStack: [{ core: "blur", params: { radius: 3 }, opacity: 1, blend: "normal", enabled: true }],
    schemaVersion: 0,
    description: "brought in from v0",
    tags: ["imported"],
  });
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("PresetStore", () => {
  let provider: FakeProvider;
  let store: PresetStore;

  beforeEach(() => {
    provider = new FakeProvider();
    store = new PresetStore(provider as never);
  });

  it("init() opens the store and reports availability", async () => {
    await expect(store.init()).resolves.toBe(true);
    expect(store.available).toBe(true);
  });

  describe("savePreset + loadPreset round-trip", () => {
    it("saves a preset and loads the stack back", async () => {
      await store.init();
      const stack = makeStack(2);
      const record = await store.savePreset("My Look", stack);

      expect(record.id).toBe("layers-preset:my look");
      expect(record.name).toBe("My Look");
      expect(record.schemaVersion).toBe(1);

      const loaded = await store.loadPreset(record.id);
      expect(loaded).not.toBeNull();
      expect(loaded!.items).toHaveLength(2);
      expect(loaded!.items[0].core).toBe("blur");
      expect(loaded!.items[0].params).toEqual({ radius: 2 });
    });

    it("stores description and tags from meta", async () => {
      await store.init();
      const record = await store.savePreset("Tagged", makeStack(1), {
        description: "soft blur",
        tags: ["soft", "blur"],
      });
      expect(record.description).toBe("soft blur");
      expect(record.tags).toEqual(["soft", "blur"]);
    });

    it("overwrites a preset saved under the same name", async () => {
      await store.init();
      await store.savePreset("Dupe", makeStack(1));
      await store.savePreset("Dupe", makeStack(3));
      const presets = await store.listPresets();
      expect(presets).toHaveLength(1);
      expect(presets[0].stack.items).toHaveLength(3);
    });

    it("rejects an empty name", async () => {
      await store.init();
      await expect(store.savePreset("   ", makeStack(1))).rejects.toBeInstanceOf(PresetStoreError);
    });

    it("rejects an invalid stack (bad blend mode)", async () => {
      await store.init();
      const bad = makeStack(1);
      bad.items[0].blend = "not-a-blend-mode";
      await expect(store.savePreset("Bad", bad)).rejects.toBeInstanceOf(PresetStoreError);
    });

    it("loadPreset returns null for an unknown id", async () => {
      await store.init();
      expect(await store.loadPreset("nope")).toBeNull();
    });
  });

  describe("listPresets", () => {
    it("returns an empty list before anything is saved", async () => {
      await store.init();
      expect(await store.listPresets()).toEqual([]);
    });

    it("orders presets newest first by updatedAt", async () => {
      await store.init();
      const older = await store.savePreset("Older", makeStack(1));
      // Force a newer timestamp by saving again with a different stack.
      const newer = await store.savePreset("Newer", makeStack(2));
      // Re-save "Older" so its updatedAt becomes the newest.
      const r = await store.savePreset("Older", makeStack(1));
      expect(r.updatedAt >= older.updatedAt).toBe(true);

      const presets = await store.listPresets();
      expect(presets.map((p) => p.name)).toEqual(["Older", "Newer"]);
    });
  });

  describe("deletePreset", () => {
    it("removes the preset so it no longer lists", async () => {
      await store.init();
      const record = await store.savePreset("Doomed", makeStack(1));
      await store.deletePreset(record.id);
      expect(await store.listPresets()).toHaveLength(0);
      expect(await store.loadPreset(record.id)).toBeNull(); // tombstone doc has no stack → null
    });
  });

  describe("import / export", () => {
    it("imports a v0 preset and migrates it to v1", async () => {
      await store.init();
      const record = await store.importPresetJson(validV0Json());
      expect(record.schemaVersion).toBe(1);
      expect(record.name).toBe("Imported Look");
      expect(record.tags).toEqual(["imported"]);
      expect(record.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      // category is set by the v0→v1 migration; verify via the exported JSON.
      const exported = JSON.parse(await store.exportPresetJson(record.id));
      expect(exported.category).toBe("style");

      // Round-trips back through the store.
      const loaded = await store.loadPreset(record.id);
      expect(loaded!.items[0].params).toEqual({ radius: 3 });
    });

    it("exportPresetJson produces canonical (key-sorted) JSON", async () => {
      await store.init();
      const record = await store.savePreset("Canonical", makeStack(1), { description: "x", tags: ["t"] });
      const json = await store.exportPresetJson(record.id);
      const parsed = JSON.parse(json);
      const keys = Object.keys(parsed);
      expect([...keys].sort()).toEqual(keys);
      // canonicalizePreset is deterministic — re-parse and re-serialize.
      expect(json).toBe(canonicalizePreset(parsed));
    });

    it("rejects invalid JSON on import", async () => {
      await store.init();
      await expect(store.importPresetJson("not json {")).rejects.toBeInstanceOf(PresetStoreError);
    });

    it("rejects an unsupported schema version", async () => {
      await store.init();
      const future = JSON.stringify({ name: "Future", version: "1.0.0", effectStack: [], schemaVersion: 99 });
      await expect(store.importPresetJson(future)).rejects.toBeInstanceOf(PresetStoreError);
    });
  });
});
