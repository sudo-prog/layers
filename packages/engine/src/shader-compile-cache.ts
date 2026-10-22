/**
 * Persistent shader compile cache.
 *
 * Caches compiled shader program metadata (binary format + base64-encoded
 * binary) in localStorage so that reloading the page does not require
 * re-compiling every shader from scratch. The cache stores the hash of the
 * vertex + fragment shader sources as the key, and the compiled binary
 * + format as the value.
 *
 * On retrieval, if the cached binary is available, the caller can use
 * gl.programBinary() to restore the program directly without re-compiling.
 */

export interface ShaderCacheEntry {
  hash: string;
  binary: string; // base64-encoded ArrayBuffer
  binaryFormat: number;
}

const STORAGE_PREFIX = "layers:shader-cache:v1:";

/**
 * Compute a deterministic hash from vertex + fragment shader sources.
 * Uses a simple FNV-1a style hash on the concatenated string.
 */
export function computeShaderHash(vsSource: string, fsSource: string): string {
  const combined = vsSource + "\0" + fsSource;
  let hash = 0x811c9dc5;
  for (let i = 0; i < combined.length; i++) {
    hash ^= combined.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Convert to unsigned 32-bit hex string
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Encode an ArrayBuffer to a base64 string.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Decode a base64 string back to an ArrayBuffer.
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export class ShaderCompileCache {
  private _memoryCache = new Map<string, ShaderCacheEntry>();

  constructor() {
    this._loadFromStorage();
  }

  /**
   * Get a cached entry by shader hash. Returns null if not found.
   */
  get(hash: string): ShaderCacheEntry | null {
    // Check in-memory first
    const mem = this._memoryCache.get(hash);
    if (mem) return mem;

    // Check localStorage
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + hash);
      if (!raw) return null;
      const entry = JSON.parse(raw) as ShaderCacheEntry;
      // Populate memory cache
      this._memoryCache.set(hash, entry);
      return entry;
    } catch {
      return null;
    }
  }

  /**
   * Store a compiled program entry.
   */
  set(hash: string, binary: ArrayBuffer, binaryFormat: number): void {
    const entry: ShaderCacheEntry = {
      hash,
      binary: arrayBufferToBase64(binary),
      binaryFormat,
    };

    this._memoryCache.set(hash, entry);

    try {
      localStorage.setItem(STORAGE_PREFIX + hash, JSON.stringify(entry));
    } catch {
      // localStorage full or unavailable — keep in-memory only
    }
  }

  /**
   * Clear all cached entries.
   */
  clear(): void {
    this._memoryCache.clear();
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_PREFIX)) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
        localStorage.removeItem(key);
      }
    } catch {
      // ignore
    }
  }

  /**
   * Load all localStorage entries into memory cache at construction time.
   */
  private _loadFromStorage(): void {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_PREFIX)) {
          const raw = localStorage.getItem(key);
          if (raw) {
            try {
              const entry = JSON.parse(raw) as ShaderCacheEntry;
              this._memoryCache.set(entry.hash, entry);
            } catch {
              // Skip malformed entries
            }
          }
        }
      }
    } catch {
      // localStorage unavailable
    }
  }
}
