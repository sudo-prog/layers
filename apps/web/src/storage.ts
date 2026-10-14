/**
 * Safe local storage accessor.
 *
 * `localStorage` is not always usable: Safari private mode throws on writes,
 * some embedded webviews omit it entirely, and jsdom >= 30 does not provide it.
 * Every consumer of persisted state goes through this shim so a hostile or
 * missing storage backend degrades to in-memory rather than throwing.
 */

const memory = new Map<string, string>();

/** True when a real, working localStorage is available. */
function hasLocalStorage(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    // Probe: Safari private mode exposes the object but throws on write.
    const probe = "__layers_probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

const usable = hasLocalStorage();

export function storageGet(key: string): string | null {
  if (usable) {
    try {
      return localStorage.getItem(key);
    } catch {
      /* fall through to memory */
    }
  }
  return memory.has(key) ? memory.get(key)! : null;
}

export function storageSet(key: string, value: string): void {
  if (usable) {
    try {
      localStorage.setItem(key, value);
      return;
    } catch {
      /* fall through to memory */
    }
  }
  memory.set(key, value);
}

export function storageRemove(key: string): void {
  if (usable) {
    try {
      localStorage.removeItem(key);
      return;
    } catch {
      /* fall through to memory */
    }
  }
  memory.delete(key);
}

/** Clear persisted state (used by tests and the "clear" affordance). */
export function storageClear(): void {
  if (usable) {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  }
  memory.clear();
}

/** Exposed for tests: whether a real localStorage backend is in use. */
export const storageIsPersistent = usable;
