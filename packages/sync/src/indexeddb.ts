import type { Document, SyncQueue, SyncOperation, SyncStatus } from './index.js';

/**
 * IndexedDBProvider
 *
 * A {@link SyncProvider} backed by IndexedDB. Uses the raw IndexedDB API
 * (no external dependencies) so it works in any modern browser.
 *
 * Database: `layers-sync` (version 1)
 * Object stores:
 *   - `documents` (keyPath: `id`)  — persisted documents
 *   - `queue`      (keyPath: `id`)  — sync queue entries
 *   - `links`     (keyPath: `assetId`) — assetId → documentId mappings
 */
export class IndexedDBProvider {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly dbName: string = 'layers-sync',
    private readonly dbVersion: number = 1,
  ) {}

  // ── Public API ──────────────────────────────────────────────────────────

  async save(doc: Document): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(['documents', 'queue'], 'readwrite');

    // Store the document.
    const docStore = tx.objectStore('documents');
    docStore.put(doc);

    // Enqueue a sync operation.
    const queueStore = tx.objectStore('queue');
    const entry: SyncQueue = {
      id: this.generateId(),
      timestamp: Date.now(),
      operation: 'save',
      payload: { id: doc.id, version: doc.version },
      status: 'pending',
    };
    queueStore.put(entry);

    await txDone(tx);
  }

  async restore(id: string): Promise<Document | null> {
    const db = await this.getDB();
    const tx = db.transaction('documents', 'readonly');
    const store = tx.objectStore('documents');
    const result = await reqToPromise<Document | undefined>(store.get(id));
    return result ?? null;
  }

  async queueStatus(): Promise<SyncQueue[]> {
    const db = await this.getDB();
    const tx = db.transaction('queue', 'readonly');
    const store = tx.objectStore('queue');
    return reqToPromise<SyncQueue[]>(store.getAll());
  }

  async link(assetId: string, documentId: string): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction(['links', 'queue'], 'readwrite');

    // Store the link mapping.
    const linkStore = tx.objectStore('links');
    linkStore.put({ assetId, documentId });

    // Enqueue a sync operation for the link.
    const queueStore = tx.objectStore('queue');
    const entry: SyncQueue = {
      id: this.generateId(),
      timestamp: Date.now(),
      operation: 'save',
      payload: { assetId, documentId },
      status: 'pending',
    };
    queueStore.put(entry);

    await txDone(tx);
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('documents')) {
          db.createObjectStore('documents', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('queue')) {
          db.createObjectStore('queue', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('links')) {
          db.createObjectStore('links', { keyPath: 'assetId' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  private generateId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // Fallback pseudo-UUID.
    const bytes = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex: string[] = [];
    for (let i = 0; i < 256; i++) hex.push((i + 0x100).toString(16).slice(1));
    return (
      hex[bytes[0]] + hex[bytes[1]] + hex[bytes[2]] + hex[bytes[3]] + '-' +
      hex[bytes[4]] + hex[bytes[5]] + '-' +
      hex[bytes[6]] + hex[bytes[7]] + '-' +
      hex[bytes[8]] + hex[bytes[9]] + '-' +
      hex[bytes[10]] + hex[bytes[11]] + hex[bytes[12]] + hex[bytes[13]] + hex[bytes[14]] + hex[bytes[15]]
    );
  }
}

// ── Promise wrappers for IDB requests ─────────────────────────────────────

function reqToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
