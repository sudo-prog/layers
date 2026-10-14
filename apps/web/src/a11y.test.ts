// @vitest-environment jsdom
/**
 * Tests for render-invalidation helpers and focus management.
 *
 * These live in ./renderState (not main.ts) precisely so they can be tested
 * without booting the editor — main.ts performs DOM lookups at module scope.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { stackSignature, createFocusTrap } from "./renderState";
import {
  createStackState,
  addStackItem,
  updateStackItem,
  toggleStackItem,
  moveStackItem,
} from "@layers/stack";

function makeItem(core: string, params: Record<string, unknown> = {}) {
  return {
    core,
    params: { scale: 10, ...params },
    opacity: 1,
    blend: "normal",
    mask: null,
    enabled: true,
  };
}

describe("stackSignature", () => {
  it("is stable for identical stacks", () => {
    expect(stackSignature(createStackState())).toBe(stackSignature(createStackState()));
  });

  it("changes when an item is added", () => {
    const empty = createStackState();
    const one = addStackItem(empty, makeItem("blur"));
    expect(stackSignature(empty)).not.toBe(stackSignature(one));
  });

  it("changes when a param changes", () => {
    const base = addStackItem(createStackState(), makeItem("blur"));
    const id = base.items[0].id;
    const changed = updateStackItem(base, id, { params: { scale: 99 } });
    expect(stackSignature(base)).not.toBe(stackSignature(changed));
  });

  it("changes when opacity or blend changes", () => {
    const base = addStackItem(createStackState(), makeItem("blur"));
    const id = base.items[0].id;
    expect(stackSignature(base)).not.toBe(
      stackSignature(updateStackItem(base, id, { opacity: 0.5 })),
    );
    expect(stackSignature(base)).not.toBe(
      stackSignature(updateStackItem(base, id, { blend: "multiply" })),
    );
  });

  it("changes when an item is disabled (membership of the enabled list changes)", () => {
    const base = addStackItem(createStackState(), makeItem("blur"));
    const id = base.items[0].id;
    const disabled = toggleStackItem(base, id);
    expect(stackSignature(base)).not.toBe(stackSignature(disabled));
  });

  it("changes when pass order changes", () => {
    let s = addStackItem(createStackState(), makeItem("blur"));
    s = addStackItem(s, makeItem("outline"));
    const id = s.items[0].id;
    const moved = moveStackItem(s, id, "down");
    expect(stackSignature(s)).not.toBe(stackSignature(moved));
  });

  it("is insensitive to param key insertion order", () => {
    const a = addStackItem(createStackState(), makeItem("blur", { scale: 5, radius: 2 }));
    const b = addStackItem(createStackState(), makeItem("blur", { radius: 2, scale: 5 }));
    expect(stackSignature(a)).toBe(stackSignature(b));
  });
});

describe("createFocusTrap", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("moves focus into the container on creation", () => {
    const outside = document.createElement("button");
    outside.textContent = "outside";
    document.body.appendChild(outside);
    outside.focus();

    const container = document.createElement("div");
    const inner = document.createElement("button");
    inner.textContent = "inner";
    container.appendChild(inner);
    document.body.appendChild(container);

    const release = createFocusTrap(container);
    expect(document.activeElement).toBe(inner);
    release();
  });

  it("wraps Tab from the last element back to the first", () => {
    const container = document.createElement("div");
    const a = document.createElement("button");
    const b = document.createElement("button");
    a.textContent = "a";
    b.textContent = "b";
    container.append(a, b);
    document.body.appendChild(container);

    const release = createFocusTrap(container);
    b.focus();

    const ev = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    container.dispatchEvent(ev);

    expect(document.activeElement).toBe(a);
    release();
  });

  it("wraps Shift+Tab from the first element back to the last", () => {
    const container = document.createElement("div");
    const a = document.createElement("button");
    const b = document.createElement("button");
    a.textContent = "a";
    b.textContent = "b";
    container.append(a, b);
    document.body.appendChild(container);

    const release = createFocusTrap(container);
    a.focus();

    const ev = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    container.dispatchEvent(ev);

    expect(document.activeElement).toBe(b);
    release();
  });

  it("restores the previously-focused element on release", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "trigger";
    document.body.appendChild(trigger);
    trigger.focus();

    const container = document.createElement("div");
    const inner = document.createElement("button");
    container.appendChild(inner);
    document.body.appendChild(container);

    const release = createFocusTrap(container);
    expect(document.activeElement).toBe(inner);

    release();
    expect(document.activeElement).toBe(trigger);
  });
});
