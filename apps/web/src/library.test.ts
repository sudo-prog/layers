// @vitest-environment jsdom
/**
 * Stage 2.2 — preset sharing, search and the visibility migration contract.
 *
 * The migration contract is the important part: a preset saved before
 * `visibility` existed must read back as "private", never as shareable.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { PresetStore, PresetStoreError } from "./presetStore";
import { createStackState, type StackItem } from "@layers/stack";
import {
  exportPresetFile,
  exportPresetLink,
  importPresetFile,
  isPresetHash,
  presetIdFromHash,
} from "./presetShare";

function makeItem(core: string, params: Record<string, unknown> = {}): StackItem {
  return {
    id: `it-${Math.random().toString(36).slice(2)}`,
    core,
    params,
    opacity: 1,
    blend: "normal",
    mask: null,
    enabled: true,
  };
}

/** A minimal in-memory provider, same shape as the test doubles elsewhere. */
function fakeProvider(seed: Array<{ id: string; data: Record<string, unknown> }> = []) {
  const docs = new Map<string, { id: string; version: string; data: unknown; updatedAt: string }>();
  for (const d of seed) {
    docs.set(d.id, {
      id: d.id,
      version: "1.0.0",
      data: d.data,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  }
  return {
    docs,
    async save(doc: { id: string; version: string; data: unknown; updatedAt: string }) {
      docs.set(doc.id, { ...doc });
    },
    async restore(id: string) {
      return docs.get(id) ?? null;
    },
  };
}

function storeWith(seed: Parameters<typeof fakeProvider>[0]) {
  return new PresetStore(fakeProvider(seed) as never);
}

const INDEX = "layers-preset:index";

describe("visibility migration", () => {
  it("defaults a legacy record with no visibility to private", async () => {
    const id = "layers-preset:legacy";
    const store = storeWith([
      { id: INDEX, data: { ids: [id] } },
      {
        id,
        data: {
          id,
          name: "Legacy",
          tags: [],
          schemaVersion: 1,
          stack: { items: [] },
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    ]);
    await store.init();
    const [record] = await store.listPresets();
    expect(record?.visibility).toBe("private");
  });

  it("treats an unrecognised visibility value as private", async () => {
    const id = "layers-preset:weird";
    const store = storeWith([
      { id: INDEX, data: { ids: [id] } },
      {
        id,
        data: {
          id,
          name: "Weird",
          tags: [],
          schemaVersion: 1,
          stack: { items: [] },
          visibility: "super-public",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    ]);
    await store.init();
    const [record] = await store.listPresets();
    expect(record?.visibility).toBe("private");
  });

  it("preserves an explicit visibility that is valid", async () => {
    const id = "layers-preset:shared";
    const store = storeWith([
      { id: INDEX, data: { ids: [id] } },
      {
        id,
        data: {
          id,
          name: "Shared",
          tags: [],
          schemaVersion: 1,
          stack: { items: [] },
          visibility: "unlisted",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    ]);
    await store.init();
    const [record] = await store.listPresets();
    expect(record?.visibility).toBe("unlisted");
  });

  it("new presets default to private when no visibility is supplied", async () => {
    const store = storeWith([]);
    await store.init();
    const record = await store.savePreset("Fresh", createStackState([makeItem("blur")]));
    expect(record.visibility).toBe("private");
  });
});

describe("searchPresets", () => {
  async function seeded() {
    const store = storeWith([]);
    await store.init();
    await store.savePreset("Warm sunset", createStackState([makeItem("blur")]), {
      tags: ["warm", "photo"],
      category: "style",
      visibility: "public",
    });
    await store.savePreset("Cool blur", createStackState([makeItem("outline")]), {
      tags: ["cool"],
      visibility: "unlisted",
    });
    await store.savePreset("Private draft", createStackState([]), {
      visibility: "private",
    });
    return store;
  }

  it("matches a case-insensitive substring against name", async () => {
    const store = await seeded();
    const hits = await store.searchPresets("warm");
    expect(hits.map((r) => r.name)).toEqual(["Warm sunset"]);
  });

  it("matches against tags and description", async () => {
    const store = await seeded();
    expect((await store.searchPresets("cool")).map((r) => r.name)).toEqual(["Cool blur"]);
    expect((await store.searchPresets("photo")).map((r) => r.name)).toEqual(["Warm sunset"]);
  });

  it("filters by visibility", async () => {
    const store = await seeded();
    expect((await store.searchPresets("", { visibility: "public" })).map((r) => r.name)).toEqual([
      "Warm sunset",
    ]);
    expect((await store.searchPresets("", { visibility: "private" })).map((r) => r.name)).toEqual([
      "Private draft",
    ]);
  });

  it("filters by tag and category", async () => {
    const store = await seeded();
    expect((await store.searchPresets("", { tags: ["warm"] })).map((r) => r.name)).toEqual([
      "Warm sunset",
    ]);
    expect((await store.searchPresets("", { category: "style" })).map((r) => r.name)).toEqual([
      "Warm sunset",
    ]);
  });

  it("combines a query with filters", async () => {
    const store = await seeded();
    expect(
      (await store.searchPresets("sunset", { visibility: "public" })).map((r) => r.name),
    ).toEqual(["Warm sunset"]);
    expect(
      (await store.searchPresets("sunset", { visibility: "private" })).map((r) => r.name),
    ).toEqual([]);
  });
});

describe("updatePreset / setVisibility", () => {
  it("changes visibility and stamps updatedAt", async () => {
    const store = storeWith([]);
    await store.init();
    const created = await store.savePreset("Share me", createStackState([makeItem("blur")]));
    const before = created.updatedAt;

    const updated = await store.setVisibility(created.id, "public");
    expect(updated.visibility).toBe("public");
    expect(updated.updatedAt >= before).toBe(true);

    const [reread] = await store.listPresets();
    expect(reread?.visibility).toBe("public");
  });

  it("rejects an invalid visibility value", async () => {
    const store = storeWith([]);
    await store.init();
    const created = await store.savePreset("Nope", createStackState([]));
    await expect(store.setVisibility(created.id, "everyone" as never)).rejects.toBeInstanceOf(
      PresetStoreError,
    );
  });

  it("patches tags without touching the stack", async () => {
    const store = storeWith([]);
    await store.init();
    const stack = createStackState([makeItem("blur")]);
    const created = await store.savePreset("Tagged", stack);
    const updated = await store.updatePreset(created.id, { tags: ["a", "b"] });
    expect(updated.tags).toEqual(["a", "b"]);
    expect(await store.loadPreset(created.id)).toEqual(stack);
  });
});

describe("preset share links and files", () => {
  function record(overrides: Record<string, unknown> = {}) {
    return {
      id: "layers-preset:my-preset",
      name: "My preset",
      description: "desc",
      tags: ["x"],
      schemaVersion: 1,
      stack: createStackState([makeItem("blur")]),
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      thumbnail: undefined,
      visibility: "unlisted",
      category: "style",
      ...overrides,
    } as never;
  }

  it("builds a #/preset/<id> deep link", () => {
    const link = exportPresetLink(record());
    expect(link).toContain("#/preset/layers-preset%3Amy-preset");
    const hash = link.slice(link.indexOf("#"));
    expect(isPresetHash(hash)).toBe(true);
  });

  it("round-trips a preset through export -> import", () => {
    const json = exportPresetFile(record());
    const parsed = importPresetFile(json) as Record<string, unknown>;
    expect(parsed).not.toBeNull();
    expect(parsed.name).toBe("My preset");
    expect(parsed.visibility).toBe("unlisted");
    expect(Array.isArray(parsed.effectStack)).toBe(true);
  });

  it("returns null for malformed JSON", () => {
    expect(importPresetFile("{nope")).toBeNull();
    expect(importPresetFile("")).toBeNull();
  });

  it("returns null for non-object or schema-invalid payloads", () => {
    expect(importPresetFile("[1,2,3]")).toBeNull();
    expect(importPresetFile('"just a string"')).toBeNull();
    expect(importPresetFile(JSON.stringify({ name: "" }))).toBeNull();
    expect(importPresetFile(JSON.stringify({ name: "ok" }))).toBeNull(); // no effectStack
  });

  it("extracts and validates preset ids from hashes", () => {
    expect(presetIdFromHash("#/preset/layers-preset%3Aabc")).toBe("layers-preset:abc");
    expect(presetIdFromHash("#/preset/")).toBeNull();
    expect(presetIdFromHash("#/other/thing")).toBeNull();
    expect(presetIdFromHash("")).toBeNull();
  });
});
