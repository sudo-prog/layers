// @vitest-environment jsdom
/**
 * Tests for the thumbnail renderer.
 *
 * WebGL2 is not available under jsdom, so the default path returns null
 * (graceful degradation). The data URL production path is tested by
 * injecting a mock ThumbnailFactory.
 */

import { describe, it, expect } from "vitest";
import { renderThumbnail } from "./thumbnailRenderer";
import { createStackState, type StackState } from "@layers/stack";
import type { Renderer, Pass } from "@layers/engine";

// ── Helpers ──────────────────────────────────────────────────────────────

function makeStack(): StackState {
  const state = createStackState();
  state.items.push({
    id: "item-0",
    core: "blur",
    params: { radius: 3 },
    opacity: 1,
    blend: "normal",
    mask: null,
    enabled: true,
  });
  return state;
}

function makeStackWithDisabled(): StackState {
  const state = makeStack();
  state.items.push({
    id: "item-1",
    core: "noise-grain",
    params: {},
    opacity: 1,
    blend: "normal",
    mask: null,
    enabled: false, // disabled — should be skipped
  });
  return state;
}

const mockDataUrl = "data:image/png;base64,iVBORw0KGgo=";

function makeMockRenderer(addedPasses?: string[]) {
  return {
    uploadSource: () => {},
    addPass: (pass: Pass) => {
      if (addedPasses) addedPasses.push(pass.id);
    },
    setPasses: () => {},
    warmUp: () => {},
    render: () => {},
    dispose: () => {},
    passes: [] as Pass[],
    removePass: () => {},
    context: { isLost: false },
  };
}

function makeMockCanvas() {
  return {
    width: 128,
    height: 128,
    getContext: () => null,
    toDataURL: () => mockDataUrl,
  };
}

function makeMockFactory(addedPasses?: string[]) {
  return {
    createRenderer: () => ({
      renderer: makeMockRenderer(addedPasses) as unknown as Renderer,
      canvas: makeMockCanvas() as unknown as HTMLCanvasElement,
    }),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("renderThumbnail", () => {
  it("returns null when WebGL2 is not available (jsdom default)", () => {
    const result = renderThumbnail(makeStack());
    expect(result).toBeNull();
  });

  it("returns null when factory returns null", () => {
    const factory = { createRenderer: () => null };
    const result = renderThumbnail(makeStack(), factory);
    expect(result).toBeNull();
  });

  it("produces a PNG data URL when rendering succeeds", () => {
    const factory = makeMockFactory();
    const result = renderThumbnail(makeStack(), factory);
    expect(result).toBe(mockDataUrl);
    expect(result).toMatch(/^data:image\/png;base64,/);
  });

  it("handles an empty stack (no enabled items)", () => {
    const factory = makeMockFactory();
    const result = renderThumbnail(createStackState(), factory);
    expect(result).toBe(mockDataUrl);
  });

  it("skips disabled items when building passes", () => {
    const addedPasses: string[] = [];
    const factory = makeMockFactory(addedPasses);
    renderThumbnail(makeStackWithDisabled(), factory);
    // Only the enabled blur item should produce a pass.
    expect(addedPasses).toHaveLength(1);
    expect(addedPasses[0]).toBe("blur");
  });

  it("handles unknown core types gracefully (skips them)", () => {
    const state = createStackState();
    state.items.push({
      id: "item-unknown",
      core: "nonexistent-core",
      params: {},
      opacity: 1,
      blend: "normal",
      mask: null,
      enabled: true,
    });

    const addedPasses: string[] = [];
    const factory = makeMockFactory(addedPasses);

    // Should not throw — just skip the unknown core.
    const result = renderThumbnail(state, factory);
    expect(result).toBe(mockDataUrl);
    expect(addedPasses).toHaveLength(0);
  });

  it("returns null if renderer.render throws", () => {
    const badRenderer = {
      uploadSource: () => {},
      addPass: () => {},
      setPasses: () => {},
      warmUp: () => {},
      render: () => {
        throw new Error("render failed");
      },
      dispose: () => {},
      passes: [] as Pass[],
      removePass: () => {},
      context: { isLost: false },
    };

    const factory = {
      createRenderer: () => ({
        renderer: badRenderer as unknown as Renderer,
        canvas: makeMockCanvas() as unknown as HTMLCanvasElement,
      }),
    };

    const result = renderThumbnail(makeStack(), factory);
    expect(result).toBeNull();
  });
});
