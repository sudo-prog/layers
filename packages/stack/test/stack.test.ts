import { describe, it, expect } from "vitest";
import {
  createStackState,
  addStackItem,
  removeStackItem,
  updateStackItem,
  moveStackItem,
  toggleStackItem,
  selectStackItem,
  getEnabledItems,
  estimatePasses,
  isMobileOk,
} from "../src/index.js";

describe("StackState", () => {
  it("creates empty state", () => {
    const state = createStackState();
    expect(state.items).toHaveLength(0);
    expect(state.selectedId).toBeNull();
  });

  it("creates from effect stack", () => {
    const stack = [
      { core: "pattern-dither", params: { scale: 10 }, opacity: 1, blend: "normal", enabled: true },
      { core: "noise-grain", params: { strength: 0.3 }, opacity: 0.5, blend: "overlay", enabled: true },
    ];
    const state = createStackState(stack);
    expect(state.items).toHaveLength(2);
    expect(state.items[0].core).toBe("pattern-dither");
    expect(state.selectedId).toBe(state.items[0].id);
  });

  it("adds items", () => {
    let state = createStackState();
    state = addStackItem(state, {
      core: "blur",
      params: { radius: 2 },
      opacity: 1,
      blend: "normal",
      mask: null,
      enabled: true,
    });
    expect(state.items).toHaveLength(1);
    expect(state.selectedId).toBe(state.items[0].id);
  });

  it("removes items", () => {
    let state = createStackState();
    state = addStackItem(state, {
      core: "blur",
      params: {},
      opacity: 1,
      blend: "normal",
      mask: null,
      enabled: true,
    });
    const id = state.items[0].id;
    state = removeStackItem(state, id);
    expect(state.items).toHaveLength(0);
  });

  it("updates items", () => {
    let state = createStackState();
    state = addStackItem(state, {
      core: "blur",
      params: { radius: 2 },
      opacity: 1,
      blend: "normal",
      mask: null,
      enabled: true,
    });
    const id = state.items[0].id;
    state = updateStackItem(state, id, { opacity: 0.5 });
    expect(state.items[0].opacity).toBe(0.5);
  });

  it("moves items", () => {
    let state = createStackState();
    state = addStackItem(state, { core: "blur", params: {}, opacity: 1, blend: "normal", mask: null, enabled: true });
    state = addStackItem(state, { core: "noise-grain", params: {}, opacity: 1, blend: "normal", mask: null, enabled: true });
    const firstId = state.items[0].id;
    state = moveStackItem(state, firstId, "down");
    expect(state.items[0].core).toBe("noise-grain");
  });

  it("toggles items", () => {
    let state = createStackState();
    state = addStackItem(state, { core: "blur", params: {}, opacity: 1, blend: "normal", mask: null, enabled: true });
    const id = state.items[0].id;
    state = toggleStackItem(state, id);
    expect(state.items[0].enabled).toBe(false);
  });

  it("selects items", () => {
    let state = createStackState();
    state = addStackItem(state, { core: "blur", params: {}, opacity: 1, blend: "normal", mask: null, enabled: true });
    const id = state.items[0].id;
    state = selectStackItem(state, id);
    expect(state.selectedId).toBe(id);
  });

  it("gets enabled items", () => {
    let state = createStackState();
    state = addStackItem(state, { core: "blur", params: {}, opacity: 1, blend: "normal", mask: null, enabled: true });
    state = addStackItem(state, { core: "noise-grain", params: {}, opacity: 1, blend: "normal", mask: null, enabled: false });
    const enabled = getEnabledItems(state);
    expect(enabled).toHaveLength(1);
  });
});

describe("Pass estimation", () => {
  it("estimates passes correctly", () => {
    const items = [
      { id: "1", core: "pattern-dither", params: {}, opacity: 1, blend: "normal", mask: null, enabled: true },
      { id: "2", core: "noise-grain", params: {}, opacity: 1, blend: "normal", mask: null, enabled: true },
    ];
    expect(estimatePasses(items)).toBe(4);
  });

  it("checks mobile budget", () => {
    expect(isMobileOk(6)).toBe(true);
    expect(isMobileOk(8)).toBe(true);
    expect(isMobileOk(9)).toBe(false);
  });
});
