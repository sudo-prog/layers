/**
 * Pure render-invalidation helpers and focus management.
 *
 * These live outside main.ts so they can be unit-tested without booting the
 * whole editor (main.ts performs DOM lookups at module scope).
 */

import { getEnabledItems, type StackState } from "@layers/stack";

/**
 * Build a signature for the parts of a stack that affect the rendered output.
 *
 * The renderer only compiles passes for ENABLED items, so the signature is
 * built from enabled items only — a disabled item's params cannot change the
 * image and must not force a recompile. Order matters: it is the pass order.
 *
 * Note: the signature intentionally does NOT include `enabled` per item,
 * because disabled items are filtered out entirely; toggling an item's
 * enabled flag changes the membership of this list, which changes the
 * signature. That is the correct invalidation signal.
 */
export function stackSignature(state: StackState): string {
  const enabled = getEnabledItems(state);
  return enabled
    .map((item) => {
      // Sort param keys so key insertion order cannot produce a false change.
      const params = Object.keys(item.params)
        .sort()
        .map((k) => `${k}=${JSON.stringify(item.params[k])}`)
        .join(",");
      return `${item.core}{${params}}:${item.opacity}:${item.blend}`;
    })
    .join("|");
}

/** Focusable-element selector for the focus trap. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Confine Tab/Shift+Tab to the given container while it is open, and return
 * the previously-focused element so the caller can restore it on close.
 *
 * Returns a `release()` function that removes the listener.
 */
export function createFocusTrap(container: HTMLElement): () => void {
  const previous = document.activeElement as HTMLElement | null;

  function onKeydown(e: KeyboardEvent): void {
    if (e.key !== "Tab") return;
    // Note: do not filter on offsetParent — jsdom always reports null, and a
    // real browser check would need getComputedStyle per node on every Tab.
    // Querying focusable, non-disabled elements is sufficient here.
    const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (nodes.length === 0) {
      e.preventDefault();
      return;
    }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement as HTMLElement | null;

    if (e.shiftKey) {
      if (active === first || !container.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last || !container.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  }

  container.addEventListener("keydown", onKeydown);

  // Move focus into the container if it is not already inside.
  const first = container.querySelector<HTMLElement>(FOCUSABLE);
  if (first && !container.contains(document.activeElement)) first.focus();

  return () => {
    container.removeEventListener("keydown", onKeydown);
    if (previous && typeof previous.focus === "function") previous.focus();
  };
}
