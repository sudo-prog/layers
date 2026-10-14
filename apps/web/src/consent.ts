/**
 * Consent management — local-first opt-in model for data collection.
 *
 * Persists consent state under key 'layers-consent-v1'.
 * Default is opt-in: consentGiven: false (never auto-opt-in).
 *
 * Storage goes through ./storage so a missing or throwing localStorage
 * (Safari private mode, jsdom) degrades to in-memory instead of crashing.
 */

import { storageGet, storageSet, storageRemove } from "./storage";

const CONSENT_KEY = "layers-consent-v1";

export interface ConsentState {
  /** Whether the user has given consent for data collection */
  consentGiven: boolean;
  /** Timestamp when consent was given (ISO string) */
  consentTimestamp: string | null;
  /** Number of days to retain collected data */
  dataRetentionDays: number;
  /** List of specific features the user has opted into */
  optInFeatures: string[];
}

/** The default state: no consent. Never auto-opt-in. */
function defaultConsent(): ConsentState {
  return {
    consentGiven: false,
    consentTimestamp: null,
    dataRetentionDays: 90,
    optInFeatures: [],
  };
}

/**
 * Get the current consent state.
 * Returns the default (no consent) state if none is stored or it is unreadable.
 */
export function getConsent(): ConsentState {
  try {
    const stored = storageGet(CONSENT_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<ConsentState>;
      // Never trust stored shape: a malformed record must not read as consent.
      return {
        consentGiven: parsed.consentGiven === true,
        consentTimestamp: typeof parsed.consentTimestamp === "string" ? parsed.consentTimestamp : null,
        dataRetentionDays:
          typeof parsed.dataRetentionDays === "number" && parsed.dataRetentionDays > 0
            ? parsed.dataRetentionDays
            : 90,
        optInFeatures: Array.isArray(parsed.optInFeatures) ? parsed.optInFeatures : [],
      };
    }
  } catch (e) {
    console.warn("Failed to parse consent state:", e);
  }
  return defaultConsent();
}

/**
 * Record that the user has given consent.
 * @param features Optional list of specific features to opt into
 */
export function giveConsent(features: string[] = []): ConsentState {
  const state: ConsentState = {
    consentGiven: true,
    consentTimestamp: new Date().toISOString(),
    dataRetentionDays: 90,
    optInFeatures: [...features],
  };
  storageSet(CONSENT_KEY, JSON.stringify(state));
  return state;
}

/**
 * Revoke consent and clear opt-in features.
 */
export function revokeConsent(): ConsentState {
  const state: ConsentState = {
    consentGiven: false,
    consentTimestamp: new Date().toISOString(), // timestamp of the revocation
    dataRetentionDays: 90,
    optInFeatures: [],
  };
  storageSet(CONSENT_KEY, JSON.stringify(state));
  return state;
}

/**
 * Check if consent has been given.
 * @returns true only when the user has explicitly opted in
 */
export function checkConsent(): boolean {
  return getConsent().consentGiven;
}

/** Remove all stored consent state (used by tests). */
export function clearConsent(): void {
  storageRemove(CONSENT_KEY);
}
