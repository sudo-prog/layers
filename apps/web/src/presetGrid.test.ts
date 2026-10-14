// @vitest-environment jsdom
/**
 * Tests for the preset grid UI (Stage 0.6 Feature 2).
 *
 * The preset store module is mocked so the grid runs under jsdom without
 * IndexedDB.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mountPresetGrid, type PresetGridHandle } from "./presetGrid";
import type { PresetRecord } from "./presetStore";
import type { StackState } from "@layers/stack";

// ── Mock the preset store ────────────────────────────────────────────────

// vi.mock is hoisted, so the factory cannot reference outer `const` variables.
// vi.hoisted creates the mock object before the hoisted vi.mock runs.
const storeMock = vi.hoisted(() => ({
  listPresets: vi.fn(),
  loadPreset: vi.fn(),
  savePreset: vi.fn(),
  deletePreset: vi.fn(),
  exportPresetJson: vi.fn(),
  importPresetJson: vi.fn(),
}));

vi.mock("./presetStore", () => ({
  presetStore: storeMock,
}));

// ── Helpers ──────────────────────────────────────────────────────────────

function makeRecord(name: string, passCount: number, tags: string[] = []): PresetRecord {
  const items = Array.from({ length: passCount }, (_, i) => ({
    id: `${name}-item-${i}`,
    core: "blur", // 1 pass each in @layers/stack
    params: {},
    opacity: 1,
    blend: "normal",
    mask: null,
    enabled: true,
  }));
  return {
    id: `layers-preset:${name.toLowerCase()}`,
    name,
    tags,
    schemaVersion: 1,
    stack: { items, selectedId: items[0]?.id ?? null },
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  };
}

function makeContainer(): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return container;
}

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("mountPresetGrid", () => {
  let container: HTMLElement;
  let handle: PresetGridHandle | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    container = makeContainer();
    // Default: no presets.
    storeMock.listPresets.mockResolvedValue([]);
    storeMock.loadPreset.mockResolvedValue(null);
    storeMock.deletePreset.mockResolvedValue(undefined);
    storeMock.exportPresetJson.mockResolvedValue("{}");
  });

  it("renders the right number of cards", async () => {
    storeMock.listPresets.mockResolvedValue([
      makeRecord("One", 1),
      makeRecord("Two", 2),
      makeRecord("Three", 3),
    ]);
    handle = await mountPresetGrid(container, {
      onApply: () => {},
      getCurrentStack: () => ({ items: [], selectedId: null }),
    });
    const cards = container.querySelectorAll(".preset-card");
    expect(cards).toHaveLength(3);
    handle.destroy();
  });

  it("renders an empty state when there are no presets", async () => {
    storeMock.listPresets.mockResolvedValue([]);
    handle = await mountPresetGrid(container, {
      onApply: () => {},
      getCurrentStack: () => ({ items: [], selectedId: null }),
    });
    const empty = container.querySelector(".preset-grid-empty");
    expect(empty).not.toBeNull();
    expect(container.querySelectorAll(".preset-card")).toHaveLength(0);
    handle.destroy();
  });

  it("one-tap apply fires onApply with the loaded stack", async () => {
    const record = makeRecord("Tap Me", 2);
    storeMock.listPresets.mockResolvedValue([record]);
    const loadedStack: StackState = {
      items: [
        { id: "x", core: "blur", params: { radius: 5 }, opacity: 1, blend: "normal", mask: null, enabled: true },
      ],
      selectedId: "x",
    };
    storeMock.loadPreset.mockResolvedValue(loadedStack);

    const onApply = vi.fn();
    handle = await mountPresetGrid(container, {
      onApply,
      getCurrentStack: () => ({ items: [], selectedId: null }),
    });

    const card = container.querySelector(".preset-card") as HTMLElement;
    expect(card).not.toBeNull();
    card.click();
    await flush();

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(loadedStack);
    handle.destroy();
  });

  it("delete removes a card after confirm", async () => {
    const record = makeRecord("Doomed", 1);
    let presets = [record];
    storeMock.listPresets.mockImplementation(async () => presets);
    storeMock.deletePreset.mockImplementation(async (id: string) => {
      presets = presets.filter((p) => p.id !== id);
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    handle = await mountPresetGrid(container, {
      onApply: () => {},
      getCurrentStack: () => ({ items: [], selectedId: null }),
    });

    expect(container.querySelectorAll(".preset-card")).toHaveLength(1);

    const delBtn = container.querySelector(".preset-card-delete") as HTMLElement;
    expect(delBtn).not.toBeNull();
    delBtn.click();
    await flush();

    expect(storeMock.deletePreset).toHaveBeenCalledWith(record.id);
    expect(container.querySelectorAll(".preset-card")).toHaveLength(0);
    handle.destroy();
  });

  it("does not delete when confirm is cancelled", async () => {
    storeMock.listPresets.mockResolvedValue([makeRecord("Safe", 1)]);
    vi.spyOn(window, "confirm").mockReturnValue(false);

    handle = await mountPresetGrid(container, {
      onApply: () => {},
      getCurrentStack: () => ({ items: [], selectedId: null }),
    });

    const delBtn = container.querySelector(".preset-card-delete") as HTMLElement;
    delBtn.click();
    await flush();

    expect(storeMock.deletePreset).not.toHaveBeenCalled();
    expect(container.querySelectorAll(".preset-card")).toHaveLength(1);
    handle.destroy();
  });

  it("shows an over-budget badge when passes exceed 8", async () => {
    // 9 blur items = 9 passes > 8 budget.
    storeMock.listPresets.mockResolvedValue([makeRecord("Heavy", 9)]);
    handle = await mountPresetGrid(container, {
      onApply: () => {},
      getCurrentStack: () => ({ items: [], selectedId: null }),
    });

    const badge = container.querySelector(".preset-card-badge");
    expect(badge).not.toBeNull();
    expect(badge!.classList.contains("over-budget")).toBe(true);
    expect(badge!.textContent).toContain("9");
    handle.destroy();
  });

  it("does not mark a within-budget preset as over-budget", async () => {
    storeMock.listPresets.mockResolvedValue([makeRecord("Light", 4)]);
    handle = await mountPresetGrid(container, {
      onApply: () => {},
      getCurrentStack: () => ({ items: [], selectedId: null }),
    });

    const badge = container.querySelector(".preset-card-badge");
    expect(badge).not.toBeNull();
    expect(badge!.classList.contains("over-budget")).toBe(false);
    handle.destroy();
  });

  it("renders tags on the card", async () => {
    storeMock.listPresets.mockResolvedValue([makeRecord("Tagged", 1, ["soft", "warm"])]);
    handle = await mountPresetGrid(container, {
      onApply: () => {},
      getCurrentStack: () => ({ items: [], selectedId: null }),
    });

    const tags = container.querySelectorAll(".preset-card-tag");
    expect(tags).toHaveLength(2);
    expect(tags[0].textContent).toBe("soft");
    expect(tags[1].textContent).toBe("warm");
    handle.destroy();
  });

  it("renders a thumbnail image when the preset has a thumbnail", async () => {
    const record = makeRecord("WithThumb", 1);
    record.thumbnail = "data:image/png;base64,abc123";
    storeMock.listPresets.mockResolvedValue([record]);
    handle = await mountPresetGrid(container, {
      onApply: () => {},
      getCurrentStack: () => ({ items: [], selectedId: null }),
    });

    const img = container.querySelector(".preset-card-thumb") as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.src).toContain("data:image/png;base64");
    handle.destroy();
  });

  it("renders a gradient placeholder when the preset has no thumbnail", async () => {
    const record = makeRecord("NoThumb", 1);
    // record.thumbnail is undefined (legacy preset)
    storeMock.listPresets.mockResolvedValue([record]);
    handle = await mountPresetGrid(container, {
      onApply: () => {},
      getCurrentStack: () => ({ items: [], selectedId: null }),
    });

    const img = container.querySelector(".preset-card-thumb") as HTMLImageElement;
    expect(img).not.toBeNull();
    // Gradient placeholder is an SVG data URL.
    expect(img.src).toContain("data:image/svg+xml");
    handle.destroy();
  });

  it("destroy() clears the container", async () => {
    storeMock.listPresets.mockResolvedValue([makeRecord("X", 1)]);
    handle = await mountPresetGrid(container, {
      onApply: () => {},
      getCurrentStack: () => ({ items: [], selectedId: null }),
    });
    expect(container.innerHTML).not.toBe("");
    handle!.destroy();
    expect(container.innerHTML).toBe("");
  });
});
