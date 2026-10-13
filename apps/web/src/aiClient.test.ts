// @vitest-environment jsdom
/**
 * Tests for aiClient.ts — adapter functions and request helpers.
 *
 * fetch is mocked so no real network calls are made.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { stackToApi, apiToStack, extractFeatures, searchStacks, optimizeStack, pruneStack, checkHealth, setAiBaseUrl } from "./aiClient";
import type { StackItem } from "@layers/stack";
import type { ApiLayer, FeatureVector, RankedStack, PruneReport } from "./aiClient";

// ── Helpers ──────────────────────────────────────────────────────────────

function makeFeatureVector(): FeatureVector {
  return {
    palette: [[255, 0, 0], [0, 255, 0]],
    edges: { magnitude: 0.5, direction: 0, edge_density: 0.3 },
    frequency: { low: 0.4, mid: 0.3, high: 0.3 },
    tone: { mean: 0.5, std: 0.1, histogram: new Array(256).fill(0) },
    clip_embedding: new Array(512).fill(0.1),
  };
}

function makeStackItem(overrides: Partial<StackItem> = {}): StackItem {
  return {
    id: "stack-0",
    core: "blur",
    params: { radius: 5 },
    opacity: 1,
    blend: "normal",
    mask: null,
    enabled: true,
    ...overrides,
  };
}

function makeApiLayer(overrides: Partial<ApiLayer> = {}): ApiLayer {
  return {
    core: "blur",
    params: { radius: 5 },
    opacity: 1,
    blend: "normal",
    mask: null,
    enabled: true,
    ...overrides,
  };
}

function mockFetchResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("stackToApi", () => {
  it("strips the id field and keeps all other fields", () => {
    const stack: StackItem[] = [
      makeStackItem({ id: "my-id-1", core: "pattern-dither", opacity: 0.8, blend: "multiply" }),
      makeStackItem({ id: "my-id-2", core: "noise-grain", mask: "data-url" }),
    ];
    const api = stackToApi(stack);
    expect(api).toHaveLength(2);
    expect(api[0]).not.toHaveProperty("id");
    expect(api[1]).not.toHaveProperty("id");
    expect(api[0].core).toBe("pattern-dither");
    expect(api[0].opacity).toBe(0.8);
    expect(api[0].blend).toBe("multiply");
    expect(api[1].mask).toBe("data-url");
  });

  it("returns empty array for empty stack", () => {
    expect(stackToApi([])).toEqual([]);
  });

  it("preserves params object reference shape (deep, not shallow)", () => {
    const stack: StackItem[] = [makeStackItem({ params: { radius: 5, direction: "x" } })];
    const api = stackToApi(stack);
    expect(api[0].params).toEqual({ radius: 5, direction: "x" });
  });
});

describe("apiToStack", () => {
  it("adds an id to each layer", () => {
    const layers: ApiLayer[] = [
      makeApiLayer({ core: "blur" }),
      makeApiLayer({ core: "noise-grain" }),
    ];
    const stack = apiToStack(layers);
    expect(stack).toHaveLength(2);
    for (const item of stack) {
      expect(item.id).toMatch(/^stack-\d+-\d+$/);
    }
  });

  it("does not carry over unexpected fields", () => {
    const layers: ApiLayer[] = [makeApiLayer()];
    const stack = apiToStack(layers);
    expect(stack[0]).toHaveProperty("id");
    expect(stack[0]).toHaveProperty("core");
    expect(stack[0]).toHaveProperty("params");
    expect(stack[0]).toHaveProperty("opacity");
    expect(stack[0]).toHaveProperty("blend");
    expect(stack[0]).toHaveProperty("mask");
    expect(stack[0]).toHaveProperty("enabled");
  });

  it("round-trips through stackToApi", () => {
    const original: StackItem[] = [
      makeStackItem({ id: "ignored-id", core: "lighting", opacity: 0.5, params: { offsetX: 10 } }),
    ];
    const api = stackToApi(original);
    const roundTripped = apiToStack(api);
    expect(roundTripped).toHaveLength(1);
    expect(roundTripped[0].core).toBe("lighting");
    expect(roundTripped[0].opacity).toBe(0.5);
    expect(roundTripped[0].params).toEqual({ offsetX: 10 });
    expect(roundTripped[0].blend).toBe("normal");
    expect(roundTripped[0].mask).toBeNull();
    expect(roundTripped[0].enabled).toBe(true);
  });
});

describe("checkHealth", () => {
  beforeEach(() => {
    setAiBaseUrl("/v1");
    vi.restoreAllMocks();
  });

  it("returns true when status is ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchResponse({ status: "ok", modelLoaded: true, uptime: 10 })));
    const result = await checkHealth();
    expect(result).toBe(true);
  });

  it("returns false when status is degraded", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchResponse({ status: "degraded", modelLoaded: false, uptime: 0 }, 503)));
    const result = await checkHealth();
    expect(result).toBe(false);
  });

  it("returns false on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const result = await checkHealth();
    expect(result).toBe(false);
  });
});

describe("extractFeatures", () => {
  beforeEach(() => {
    setAiBaseUrl("/v1");
    vi.restoreAllMocks();
  });

  it("strips data-URI prefix and sends base64 payload", async () => {
    const fv = makeFeatureVector();
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse({ features: [fv] }));
    vi.stubGlobal("fetch", fetchMock);

    const dataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
    const result = await extractFeatures(dataUri);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body).toHaveProperty("image_data", "iVBORw0KGgoAAAANSUhEUg==");
    expect(result).toEqual(fv);
  });

  it("passes through plain base64 without a prefix", async () => {
    const fv = makeFeatureVector();
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse({ features: [fv] }));
    vi.stubGlobal("fetch", fetchMock);

    const plain = "iVBORw0KGgoAAAANSUhEUg==";
    await extractFeatures(plain);

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.image_data).toBe(plain);
  });

  it("throws when no features returned", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchResponse({ features: [] })));
    await expect(extractFeatures("data:image/png;base64,abc")).rejects.toThrow("No features");
  });

  it("throws on HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchResponse({ error: "bad image" }, 400)));
    await expect(extractFeatures("data:image/png;base64,abc")).rejects.toThrow("400");
  });
});

describe("searchStacks", () => {
  beforeEach(() => {
    setAiBaseUrl("/v1");
    vi.restoreAllMocks();
  });

  it("returns candidates from the response", async () => {
    const features = makeFeatureVector();
    const ranked: RankedStack[] = [
      { stack: [makeApiLayer({ core: "blur" })], fidelity: 0.9, passes: 1, params_count: 1, confidence: 0.8 },
      { stack: [makeApiLayer({ core: "noise-grain" })], fidelity: 0.7, passes: 2, params_count: 2, confidence: 0.6 },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchResponse({ candidates: ranked, count: 2 })));

    const result = await searchStacks(features);
    expect(result).toHaveLength(2);
    expect(result[0].fidelity).toBe(0.9);
    expect(result[1].core).toBeUndefined(); // not a field on the layer
    expect(result[1].stack[0].core).toBe("noise-grain");
  });

  it("passes beam_width in the request body", async () => {
    const features = makeFeatureVector();
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse({ candidates: [], count: 0 }));
    vi.stubGlobal("fetch", fetchMock);

    await searchStacks(features, 4);
    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.beam_width).toBe(4);
  });

  it("defaults beam_width to 8", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse({ candidates: [], count: 0 }));
    vi.stubGlobal("fetch", fetchMock);
    await searchStacks(makeFeatureVector());
    const [, options] = fetchMock.mock.calls[0];
    expect(JSON.parse(options.body).beam_width).toBe(8);
  });
});

describe("optimizeStack", () => {
  beforeEach(() => {
    setAiBaseUrl("/v1");
    vi.restoreAllMocks();
  });

  it("sends stackToApi and returns StackItem result", async () => {
    const features = makeFeatureVector();
    const stack: StackItem[] = [makeStackItem({ core: "blur", params: { radius: 5 } })];
    const apiResponse = {
      optimized_stack: [makeApiLayer({ core: "blur", params: { radius: 8 } })],
      score: 0.95,
      trace: [0.5, 0.7, 0.95],
      passes: 1,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchResponse(apiResponse)));

    const result = await optimizeStack(features, stack);
    expect(result.score).toBe(0.95);
    expect(result.trace).toEqual([0.5, 0.7, 0.95]);
    expect(result.passes).toBe(1);
    expect(result.stack).toHaveLength(1);
    expect(result.stack[0].core).toBe("blur");
    expect(result.stack[0].params).toEqual({ radius: 8 });
    expect(result.stack[0]).toHaveProperty("id");

    // Verify the request body had the stack without id
    const fetchMock = vi.mocked(globalThis.fetch);
    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.feature).toEqual(features);
    expect(body.stack[0]).not.toHaveProperty("id");
    expect(body.stack[0].core).toBe("blur");
  });
});

describe("pruneStack", () => {
  beforeEach(() => {
    setAiBaseUrl("/v1");
    vi.restoreAllMocks();
  });

  it("returns pruned stack as StackItem[] with report fields", async () => {
    const features = makeFeatureVector();
    const stack: StackItem[] = [
      makeStackItem({ id: "a", core: "blur", params: { radius: 5 } }),
      makeStackItem({ id: "b", core: "noise-grain", params: { scale: 10 } }),
      makeStackItem({ id: "c", core: "outline", params: { strength: 1 } }),
    ];
    const report: PruneReport = {
      pruned_stack: [makeApiLayer({ core: "blur", params: { radius: 5 } })],
      removed_indices: [1, 2],
      fidelity_before: 0.85,
      fidelity_after: 0.84,
      passes_before: 3,
      passes_after: 1,
      params_before: 3,
      params_after: 1,
      layers_removed_pct: 0.667,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockFetchResponse({ report })));

    const result = await pruneStack(features, stack);
    expect(result.removed_indices).toEqual([1, 2]);
    expect(result.fidelity_before).toBe(0.85);
    expect(result.fidelity_after).toBe(0.84);
    expect(result.passes_before).toBe(3);
    expect(result.passes_after).toBe(1);
    expect(result.layers_removed_pct).toBeCloseTo(0.667, 2);
    expect(result.stack).toHaveLength(1);
    expect(result.stack[0].core).toBe("blur");
    expect(result.stack[0]).toHaveProperty("id");
  });
});
