import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MemorySyncProvider,
  GitHubSyncProvider,
  IndexedDBProvider,
  type Document,
  type SyncQueue,
} from '../src/index';

// ── Minimal IndexedDB mock ────────────────────────────────────────────────

class MockIDBRequest<T> {
  result: T;
  error: Error | null = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(result: T) {
    this.result = result;
    // Fire onsuccess asynchronously to mimic real IndexedDB behavior.
    Promise.resolve().then(() => this.onsuccess?.());
  }
}

class MockIDBObjectStore {
  private data: Map<string, unknown> = new Map();
  private keyPath: string;

  constructor(keyPath: string) {
    this.keyPath = keyPath;
  }

  put(value: unknown): MockIDBRequest<undefined> {
    const key = (value as Record<string, unknown>)[this.keyPath] as string;
    this.data.set(key, value);
    return new MockIDBRequest(undefined);
  }

  get(key: string): MockIDBRequest<unknown> {
    return new MockIDBRequest(this.data.get(key));
  }

  getAll(): MockIDBRequest<unknown[]> {
    return new MockIDBRequest([...this.data.values()]);
  }
}

class MockIDBTransaction {
  private stores: Map<string, MockIDBObjectStore>;
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  error: Error | null = null;

  constructor(stores: Map<string, MockIDBObjectStore>) {
    this.stores = stores;
    // Complete after all synchronous operations are done (microtask).
    Promise.resolve().then(() => this.oncomplete?.());
  }

  objectStore(name: string): MockIDBObjectStore {
    const store = this.stores.get(name);
    if (!store) throw new Error(`Object store "${name}" not found`);
    return store;
  }
}

class MockIDBDatabase {
  objectStoreNames: string[] & { contains: (name: string) => boolean } = Object.assign([] as string[], {
    contains(this: string[], name: string) {
      return this.includes(name);
    },
  });
  private stores: Map<string, MockIDBObjectStore> = new Map();

  createObjectStore(name: string, options: { keyPath: string }): MockIDBObjectStore {
    const store = new MockIDBObjectStore(options.keyPath);
    this.stores.set(name, store);
    this.objectStoreNames.push(name);
    return store;
  }

  transaction(storeNames: string | string[], _mode: string): MockIDBTransaction {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    const stores = new Map<string, MockIDBObjectStore>();
    for (const name of names) {
      const store = this.stores.get(name);
      if (store) stores.set(name, store);
    }
    return new MockIDBTransaction(stores);
  }
}

class MockIDBOpenDBRequest {
  result!: MockIDBDatabase;
  error: Error | null = null;
  onupgradeneeded: (() => void) | null = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
}

function createMockIndexedDB() {
  const databases = new Map<string, MockIDBDatabase>();

  const indexedDB = {
    open(name: string, _version: number): MockIDBOpenDBRequest {
      const request = new MockIDBOpenDBRequest();
      let db = databases.get(name);
      const isNew = !db;
      if (isNew) {
        db = new MockIDBDatabase();
        databases.set(name, db);
      }
      request.result = db;
      // Defer success callback so handlers can be attached first.
      Promise.resolve().then(() => {
        if (isNew) {
          request.onupgradeneeded?.();
        }
        request.onsuccess?.();
      });
      return request;
    },
  };

  return { indexedDB, databases };
}

// Install the mock globally.
const mock = createMockIndexedDB();
vi.stubGlobal('indexedDB', mock.indexedDB);

// ── Helpers ────────────────────────────────────────────────────────────────

function makeDoc(override: Partial<Document> = {}): Document {
  return {
    id: 'doc-1',
    version: '1.0.0',
    data: { hello: 'world' },
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...override,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('MemorySyncProvider', () => {
  it('save + restore round-trips a document', async () => {
    const provider = new MemorySyncProvider();
    const doc = makeDoc();
    await provider.save(doc);
    expect(await provider.restore(doc.id)).toEqual(doc);
  });

  it('restore returns null for unknown id', async () => {
    const provider = new MemorySyncProvider();
    expect(await provider.restore('missing')).toBeNull();
  });

  it('save overwrites the previous version by id', async () => {
    const provider = new MemorySyncProvider();
    await provider.save(makeDoc({ version: '1.0.0', data: { v: 1 } }));
    await provider.save(makeDoc({ version: '1.0.1', data: { v: 2 } }));
    const restored = await provider.restore('doc-1');
    expect(restored?.version).toBe('1.0.1');
    expect(restored?.data).toEqual({ v: 2 });
  });

  it('restore returns an independent copy (no shared references)', async () => {
    const provider = new MemorySyncProvider();
    await provider.save(makeDoc());
    const restored = await provider.restore('doc-1')!;
    restored.data.tampered = true;
    const again = await provider.restore('doc-1');
    expect(again?.data.tampered).toBeUndefined();
  });

  it('queueStatus reports a synced save entry after save', async () => {
    const provider = new MemorySyncProvider();
    await provider.save(makeDoc());
    const queue: SyncQueue[] = await provider.queueStatus();
    expect(queue).toHaveLength(1);
    expect(queue[0].operation).toBe('save');
    expect(queue[0].status).toBe('synced');
    expect(queue[0].payload).toBeInstanceOf(Object);
  });

  it('queue grows with every operation', async () => {
    const provider = new MemorySyncProvider();
    await provider.save(makeDoc());
    await provider.link('asset-1', 'doc-1');
    const queue = await provider.queueStatus();
    expect(queue).toHaveLength(2);
  });

  it('link binds an asset id to a document id', async () => {
    const provider = new MemorySyncProvider();
    await provider.save(makeDoc());
    await provider.link('asset-42', 'doc-1');
    const linked = provider.getLinkedDocument('asset-42');
    expect(linked).not.toBeNull();
    expect(linked?.id).toBe('doc-1');
  });

  it('link does not create a document link when the doc is absent', async () => {
    const provider = new MemorySyncProvider();
    await provider.link('asset-42', 'doc-1');
    expect(provider.getLinkedDocument('asset-42')).toBeNull();
  });
});

describe('GitHubSyncProvider', () => {
  it('constructor stores options and defaults branch to main', () => {
    const provider = new GitHubSyncProvider({
      owner: 'sudo-prog',
      repo: 'layers-vault',
      token: 'secret',
    });
    expect(provider.owner).toBe('sudo-prog');
    expect(provider.repo).toBe('layers-vault');
    expect(provider.branch).toBe('main');
    expect(provider.token).toBe('secret');
  });

  it('queueStatus starts empty', async () => {
    const provider = new GitHubSyncProvider({
      owner: 'sudo-prog',
      repo: 'layers-vault',
    });
    expect(await provider.queueStatus()).toEqual([]);
  });

  it('save enqueues a pending entry without performing a real commit', async () => {
    const provider = new GitHubSyncProvider({
      owner: 'sudo-prog',
      repo: 'layers-vault',
    });
    await provider.save(makeDoc());
    const queue = await provider.queueStatus();
    expect(queue).toHaveLength(1);
    expect(queue[0].operation).toBe('save');
    expect(queue[0].status).toBe('pending');
    expect(queue[0].payload).toEqual({ id: 'doc-1', version: '1.0.0' });
  });

  it('restore is a stub returning null', async () => {
    const provider = new GitHubSyncProvider({
      owner: 'sudo-prog',
      repo: 'layers-vault',
    });
    expect(await provider.restore('anything')).toBeNull();
  });

  it('link enqueues a pending entry referencing the asset and document', async () => {
    const provider = new GitHubSyncProvider({
      owner: 'sudo-prog',
      repo: 'layers-vault',
    });
    await provider.link('asset-7', 'doc-1');
    const queue = await provider.queueStatus();
    expect(queue).toHaveLength(1);
    expect(queue[0].operation).toBe('save');
    expect(queue[0].status).toBe('pending');
    expect(queue[0].payload).toEqual({ assetId: 'asset-7', documentId: 'doc-1' });
  });
});

describe('IndexedDBProvider', () => {
  let provider: IndexedDBProvider;

  beforeEach(() => {
    // Reset the mock database between tests.
    mock.databases.clear();
    provider = new IndexedDBProvider();
  });

  it('save + restore round-trips a document', async () => {
    const doc = makeDoc();
    await provider.save(doc);
    const restored = await provider.restore(doc.id);
    expect(restored).toEqual(doc);
  });

  it('restore returns null for unknown id', async () => {
    const restored = await provider.restore('missing');
    expect(restored).toBeNull();
  });

  it('save overwrites the previous version by id', async () => {
    await provider.save(makeDoc({ version: '1.0.0', data: { v: 1 } }));
    await provider.save(makeDoc({ version: '1.0.1', data: { v: 2 } }));
    const restored = await provider.restore('doc-1');
    expect(restored?.version).toBe('1.0.1');
    expect(restored?.data).toEqual({ v: 2 });
  });

  it('queueStatus returns pending entries after save', async () => {
    await provider.save(makeDoc());
    const queue = await provider.queueStatus();
    expect(queue).toHaveLength(1);
    expect(queue[0].operation).toBe('save');
    expect(queue[0].status).toBe('pending');
    expect(queue[0].payload).toEqual({ id: 'doc-1', version: '1.0.0' });
  });

  it('queue grows with every operation', async () => {
    await provider.save(makeDoc());
    await provider.link('asset-1', 'doc-1');
    const queue = await provider.queueStatus();
    expect(queue).toHaveLength(2);
  });

  it('link stores the assetId → documentId mapping', async () => {
    await provider.save(makeDoc());
    await provider.link('asset-42', 'doc-1');
    // Verify the link was stored by checking the database directly.
    const db = mock.databases.get('layers-sync');
    expect(db).toBeDefined();
    const tx = db!.transaction('links', 'readonly');
    const store = tx.objectStore('links');
    const result = store.get('asset-42') as MockIDBRequest<{ assetId: string; documentId: string }>;
    expect(result.result).toEqual({ assetId: 'asset-42', documentId: 'doc-1' });
  });

  it('link enqueues a sync operation', async () => {
    await provider.save(makeDoc());
    await provider.link('asset-7', 'doc-1');
    const queue = await provider.queueStatus();
    expect(queue).toHaveLength(2);
    const linkEntry = queue.find(
      (q) =>
        (q.payload as Record<string, unknown>).assetId === 'asset-7' &&
        (q.payload as Record<string, unknown>).documentId === 'doc-1',
    );
    expect(linkEntry).toBeDefined();
    expect(linkEntry?.status).toBe('pending');
  });

  it('queueStatus starts empty', async () => {
    const queue = await provider.queueStatus();
    expect(queue).toEqual([]);
  });

  it('uses the correct database name and version', async () => {
    const customProvider = new IndexedDBProvider('custom-db', 1);
    await customProvider.save(makeDoc());
    expect(mock.databases.has('custom-db')).toBe(true);
  });

  it('creates all three object stores on first open', async () => {
    await provider.save(makeDoc());
    const db = mock.databases.get('layers-sync');
    expect(db).toBeDefined();
    expect(db!.objectStoreNames).toContain('documents');
    expect(db!.objectStoreNames).toContain('queue');
    expect(db!.objectStoreNames).toContain('links');
  });
});
