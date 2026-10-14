// @vitest-environment jsdom
/**
 * Tests for the Stage 1.6 opt-in consent model.
 *
 * The privacy contract under test: consent is OFF by default, nothing is
 * implicitly opted in, and revoking clears the feature list.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  getConsent,
  giveConsent,
  revokeConsent,
  checkConsent,
} from "../src/consent";
import { storageGet, storageSet, storageClear } from "../src/storage";

const KEY = "layers-consent-v1";

describe("consent", () => {
  beforeEach(() => {
    storageClear();
  });

  it("defaults to OFF with no stored state (opt-in, never opt-out)", () => {
    const state = getConsent();
    expect(state.consentGiven).toBe(false);
    expect(state.consentTimestamp).toBeNull();
    expect(state.optInFeatures).toEqual([]);
    expect(checkConsent()).toBe(false);
  });

  it("does not write anything to storage merely by reading", () => {
    getConsent();
    checkConsent();
    expect(storageGet(KEY)).toBeNull();
  });

  it("giveConsent turns consent on, stamps a timestamp and records features", () => {
    const state = giveConsent(["stack_events"]);
    expect(state.consentGiven).toBe(true);
    expect(state.consentTimestamp).toBeTruthy();
    expect(state.optInFeatures).toEqual(["stack_events"]);
    expect(checkConsent()).toBe(true);
    expect(JSON.parse(storageGet(KEY)!).consentGiven).toBe(true);
  });

  it("persists across reads (survives a reload)", () => {
    giveConsent(["acceptance_rates"]);
    const reread = getConsent();
    expect(reread.consentGiven).toBe(true);
    expect(reread.optInFeatures).toEqual(["acceptance_rates"]);
  });

  it("revokeConsent clears the opt-in feature list", () => {
    giveConsent(["stack_events", "acceptance_rates"]);
    const revoked = revokeConsent();
    expect(revoked.consentGiven).toBe(false);
    expect(revoked.optInFeatures).toEqual([]);
    expect(checkConsent()).toBe(false);
  });

  it("defaults dataRetentionDays to a bounded positive value", () => {
    expect(getConsent().dataRetentionDays).toBeGreaterThan(0);
  });

  it("recovers from corrupt stored JSON without throwing", () => {
    storageSet(KEY, "{not valid json");
    expect(() => getConsent()).not.toThrow();
    expect(checkConsent()).toBe(false);
  });
});
