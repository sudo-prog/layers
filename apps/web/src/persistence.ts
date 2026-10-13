/**
 * Persistence layer for the LAYERS web app.
 *
 * Wraps IndexedDBProvider from @layers/sync to save/restore stack state.
 * Falls back to in-memory only when IndexedDB is unavailable.
 */

import { IndexedDBProvider, type Document, type SyncQueue } from "@layers/sync";
import type { StackState } from "@layers/stack";

const DOC_ID = "layers-stack-state";
const DOC_VERSION = "1.0";
const DEBOUNCE_MS = 500;

export interface PersistenceResult {
  ok: boolean;
  error?: string;
}

export class PersistenceManager {
  private provider: IndexedDBProvider | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _available = false;

  get available(): boolean {
    return this._available;
  }

  async init(): Promise<boolean> {
    if (typeof indexedDB === "undefined") {
      console.warn("[persistence] IndexedDB not available");
      return false;
    }
    try {
      this.provider = new IndexedDBProvider();
      await this.provider.restore(DOC_ID);
      this._available = true;
      console.info("[persistence] IndexedDB ready");
      return true;
    } catch (e) {
      console.warn("[persistence] IndexedDB init failed:", e);
      this.provider = null;
      return false;
    }
  }

  async save(state: StackState): Promise<PersistenceResult> {
    if (!this._available || !this.provider) {
      return { ok: false, error: "not available" };
    }
    try {
      const doc: Document = {
        id: DOC_ID,
        version: DOC_VERSION,
        data: { items: state.items, selectedId: state.selectedId },
        updatedAt: new Date().toISOString(),
      };
      await this.provider.save(doc);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  async restore(): Promise<StackState | null> {
    if (!this._available || !this.provider) return null;
    try {
      const doc = await this.provider.restore(DOC_ID);
      if (!doc) return null;
      const data = doc.data as { items: StackState["items"]; selectedId: string | null };
      if (!Array.isArray(data.items)) return null;
      return { items: data.items, selectedId: data.selectedId ?? null };
    } catch (e) {
      console.warn("[persistence] restore failed:", e);
      return null;
    }
  }

  async clear(): Promise<PersistenceResult> {
    if (!this._available || !this.provider) {
      return { ok: false, error: "not available" };
    }
    try {
      const doc: Document = {
        id: DOC_ID,
        version: DOC_VERSION,
        data: { items: [], selectedId: null },
        updatedAt: new Date().toISOString(),
      };
      await this.provider.save(doc);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  async queueStatus(): Promise<SyncQueue[]> {
    if (!this._available || !this.provider) return [];
    try {
      return await this.provider.queueStatus();
    } catch (e) {
      console.warn("[persistence] queueStatus failed:", e);
      return [];
    }
  }

  scheduleSave(state: StackState): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.save(state).then((r) => {
        if (!r.ok) console.warn("[persistence] save failed:", r.error);
      });
    }, DEBOUNCE_MS);
  }

  flush(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}

export const persistence = new PersistenceManager();