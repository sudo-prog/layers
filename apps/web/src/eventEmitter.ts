/**
 * Event emitter for telemetry and backend communication.
 *
 * Emits events to local storage and optionally to the backend AI service
 * based on user consent.
 */

import { checkConsent } from "./consent";
import { storageGet, storageSet } from "./storage";
import {
  recordApplication,
} from "./aiClient";

export type LayersEventType =
  | "stack_created"
  | "stack_applied"
  | "stack_optimized"
  | "stack_pruned"
  | "preset_saved"
  | "preset_applied"
  | "photo_imported"
  | "ai_search";

interface StoredEvent {
  type: LayersEventType;
  payload: Record<string, unknown>;
  ts: string; // ISO timestamp
}

// In-memory buffer (max 200 events)
let eventBuffer: StoredEvent[] = [];
const MAX_BUFFER_SIZE = 200;

/**
 * Emit an event.
 * If consent is not given, do nothing (no logging at all).
 * If consent is given, append to in-memory buffer and mirror to localStorage.
 * For stack_applied and stack_optimized, also fire the backend recordApplication call.
 */
export function emitEvent(type: LayersEventType, payload: Record<string, unknown> = {}): void {
  // Privacy gate: if no consent, do nothing
  if (!checkConsent()) {
    return;
  }

  const event: StoredEvent = {
    type,
    payload,
    ts: new Date().toISOString(),
  };

  // Add to in-memory buffer (bounded)
  eventBuffer.push(event);
  if (eventBuffer.length > MAX_BUFFER_SIZE) {
    // Remove oldest events to maintain size
    eventBuffer.splice(0, eventBuffer.length - MAX_BUFFER_SIZE);
  }

  // Mirror to persistent storage (via the safe shim)
  try {
    const stored = storageGet("layers-events-v1");
    let events: StoredEvent[] = [];
    if (stored) {
      events = JSON.parse(stored);
    }
    events.push(event);
    // Also bound persistent storage to same limit
    if (events.length > MAX_BUFFER_SIZE) {
      events.splice(0, events.length - MAX_BUFFER_SIZE);
    }
    storageSet("layers-events-v1", JSON.stringify(events));
  } catch (e) {
    console.warn("Failed to save event:", e);
  }

  // For stack_applied and stack_optimized, also fire backend recordApplication
  // Note: We need core_type and cluster from payload for these events
  if (type === 'stack_applied' || type === 'stack_optimized') {
    const { core_type, cluster } = payload as { core_type?: string; cluster?: string };
    if (core_type && cluster) {
      // Fire-and-forget: don't await, don't let errors affect the UI
      void recordApplication(core_type, cluster).catch((e) => {
        console.warn('Backend recordApplication failed:', e);
      });
    }
  }
}

/**
 * Get the current event log (copy of in-memory buffer).
 */
export function getEventLog(): Array<{type: LayersEventType; payload: Record<string, unknown>; ts: string}> {
  return [...eventBuffer];
}

/** Clear the in-memory event buffer (used by tests). */
export function clearEventLog(): void {
  eventBuffer = [];
}