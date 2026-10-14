// @vitest-environment jsdom
/**
 * Tests for the Stage 1.6 consent-gated event emitter.
 *
 * The privacy contract under test: NOTHING is logged while consent is off —
 * that is the gate that makes Stage 1.6's "no pixels leave device without
 * opt-in" acceptance criterion true.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { emitEvent, getEventLog, clearEventLog } from "../src/eventEmitter";
import { giveConsent, revokeConsent } from "../src/consent";
import { storageGet, storageClear } from "../src/storage";

describe("eventEmitter", () => {
  beforeEach(() => {
    storageClear();
    clearEventLog();
  });

  it("logs NOTHING while consent is off", () => {
    emitEvent("stack_created", { core_type: "blur" });
    emitEvent("preset_saved");
    expect(getEventLog()).toEqual([]);
    expect(storageGet("layers-events-v1")).toBeNull();
  });

  it("logs events once consent is given", () => {
    giveConsent(["stack_events"]);
    emitEvent("stack_created", { core_type: "blur" });
    const log = getEventLog();
    expect(log.length).toBe(1);
    expect(log[0].type).toBe("stack_created");
    expect(log[0].payload).toEqual({ core_type: "blur" });
    expect(log[0].ts).toBeTruthy();
  });

  it("stops logging immediately after consent is revoked", () => {
    giveConsent(["stack_events"]);
    emitEvent("stack_created");
    const afterOptIn = getEventLog().length;
    expect(afterOptIn).toBe(1);

    revokeConsent();
    emitEvent("stack_created");
    expect(getEventLog().length).toBe(afterOptIn);
  });

  it("persists the log to localStorage only when consented", () => {
    giveConsent(["stack_events"]);
    emitEvent("photo_imported");
    const raw = storageGet("layers-events-v1");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)[0].type).toBe("photo_imported");
  });

  it("bounds the in-memory log so a long session cannot grow without limit", () => {
    giveConsent(["stack_events"]);
    for (let i = 0; i < 260; i++) emitEvent("stack_created", { i });
    const log = getEventLog();
    expect(log.length).toBeLessThanOrEqual(200);
    // The most recent event must be retained.
    expect(log[log.length - 1].payload).toEqual({ i: 259 });
  });

  it("accepts every declared event type", () => {
    giveConsent(["stack_events"]);
    const types = [
      "stack_created", "stack_applied", "stack_optimized", "stack_pruned",
      "preset_saved", "preset_applied", "photo_imported", "ai_search",
    ] as const;
    for (const t of types) emitEvent(t);
    expect(getEventLog().length).toBe(types.length);
  });
});
