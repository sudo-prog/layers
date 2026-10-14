/**
 * Preset sharing — deep links and portable JSON.
 *
 * A preset link is a fragment URL (`#/preset/<id>`) so it works from any
 * static host with no server round-trip. The id is the store's
 * `layers-preset:<slug>` key, which is already URL-safe.
 *
 * Imported presets ALWAYS default to `visibility: "private"` — a file found
 * in the wild must never publish itself onto a machine unasked.
 */

import type { PresetRecord } from "./presetStore";

const HASH_PREFIX = "#/preset/";

export type Visibility = PresetRecord["visibility"];

/** Build a deep link that opens this preset in the editor. */
export function exportPresetLink(record: PresetRecord): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}${HASH_PREFIX}${encodeURIComponent(record.id)}`;
}

/** Serialise a preset to portable JSON (schema-valid v1). */
export function exportPresetFile(record: PresetRecord): string {
  return JSON.stringify(
    {
      name: record.name,
      version: "1.0.0",
      effectStack: record.stack.items.map((item) => ({
        core: item.core,
        params: item.params,
        opacity: item.opacity,
        blend: item.blend,
        mask: item.mask ?? null,
        enabled: item.enabled,
      })),
      schemaVersion: record.schemaVersion,
      description: record.description,
      tags: record.tags,
      thumbnail: record.thumbnail ?? null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      category: record.category ?? "style",
      visibility: record.visibility,
    },
    null,
    2,
  );
}

/**
 * Parse a preset file. Returns null for anything malformed — callers must
 * never have to catch.
 */
export function importPresetFile(json: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.name !== "string" || obj.name.trim().length === 0) return null;
  if (!Array.isArray(obj.effectStack)) return null;
  return obj;
}

/** Extract a preset id from a `#/preset/<id>` hash, or null. */
export function presetIdFromHash(hash: string): string | null {
  if (!hash.startsWith(HASH_PREFIX)) return null;
  const raw = hash.slice(HASH_PREFIX.length);
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/** True when the hash is a preset deep link. */
export function isPresetHash(hash: string): boolean {
  return presetIdFromHash(hash) !== null;
}

/** Copy text to the clipboard, falling back for non-secure contexts. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
