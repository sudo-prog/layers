import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

// ── GitHub provider test helpers ───────────────────────────────────────────

function setupSuccessfulCommitFetch(fetchMock: ReturnType<typeof vi.fn>) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('/git/ref/heads/')) {
      return Response.json({ object: { sha: 'head-sha' } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({ tree: [] });
    }
    if (url.includes('/git/blobs')) {
      return Response.json({ sha: 'blob-sha' });
    }
    if (url.match(/api\.github\.com\/repos\/[^/]+\/[^/]+\/git\/trees$/)) {
      return Response.json({ sha: 'tree-sha' });
    }
    if (url.includes('/git/commits')) {
      return Response.json({ sha: 'commit-sha' });
    }
    if (url.includes('/git/refs/heads/')) {
      return Response.json({ object: { sha: 'commit-sha' } });
    }
    return new Response('Not found', { status: 404 });
  });
}

describe('GitHubSyncProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

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

  it('save enqueues a pending entry', async () => {
    const provider = new GitHubSyncProvider({
      owner: 'sudo-prog',
      repo: 'layers-vault',
      debounceMs: 60_000, // Prevent accidental flush
    });
    await provider.save(makeDoc());
    const queue = await provider.queueStatus();
    expect(queue).toHaveLength(1);
    expect(queue[0].operation).toBe('save');
    expect(queue[0].status).toBe('pending');
    const payload = queue[0].payload as Record<string, unknown>;
    expect(payload.id).toBe('doc-1');
    expect(payload.version).toBe('1.0.0');
  });

  it('flush commits document via Git Data API', async () => {
    setupSuccessfulCommitFetch(fetchMock);
    const provider = new GitHubSyncProvider({
      owner: 'sudo-prog',
      repo: 'layers-vault',
      token: 'test-token',
      debounceMs: 60_000,
    });
    await provider.save(makeDoc());
    await provider.flush();

    // Verify the correct sequence of API calls was made
    const calls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(calls.some((u) => u.includes('/git/ref/heads/main'))).toBe(true);
    expect(calls.some((u) => u.includes('/git/trees/head-sha'))).toBe(true);
    expect(calls.some((u) => u.includes('/git/blobs'))).toBe(true);
    expect(calls.some((u) => u.match(/\/git\/trees$/))).toBe(true);
    expect(calls.some((u) => u.includes('/git/commits'))).toBe(true);
    expect(calls.some((u) => u.includes('/git/refs/heads/main'))).toBe(true);
  });

  it('flush marks queue item as synced on success', async () => {
    setupSuccessfulCommitFetch(fetchMock);
    const provider = new GitHubSyncProvider({
      owner: 'sudo-prog',
      repo: 'layers-vault',
      debounceMs: 60_000,
    });
    await provider.save(makeDoc());
    await provider.flush();
    const queue = await provider.queueStatus();
    expect(queue[0].status).toBe('synced');
  });

  it('flush marks queue item as error on failure', async () => {
    fetchMock.mockImplementation(async () => {
      return new Response('Server error', { status: 500 });
    });
    const provider = new GitHubSyncProvider({
      owner: 'sudo-prog',
      repo: 'layers-vault',
      debounceMs: 60_000,
    });
    await provider.save(makeDoc());
    await provider.flush();
    const queue = await provider.queueStatus();
    expect(queue[0].status).toBe('error');
  });

  it('restore fetches and decodes document', async () => {
    const doc = makeDoc();
    const encoded = btoa(JSON.stringify(doc));
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/contents/documents/doc-1.json')) {
        return Response.json({ content: encoded });
      }
      return new Response('Not found', { status: 404 });
    });

    const provider = new GitHubSyncProvider({
      owner: 'sudo-prog',
      repo: 'layers-vault',
    });
    const result = await provider.restore('doc-1');
    expect(result).toEqual(doc);
  });

  it('restore returns null for 404', async () => {
    fetchMock.mockImplementation(async () => {
      return new Response('Not found', { status: 404 });
    });
    const provider = new GitHubSyncProvider({
      owner: 'sudo-prog',
      repo: 'layers-vault',
    });
    expect(await provider.restore('missing')).toBeNull();
  });

  it('link commits links.json', async () => {
    setupSuccessfulCommitFetch(fetchMock);
    const provider = new GitHubSyncProvider({
      owner: 'sudo-prog',
      repo: 'layers-vault',
      debounceMs: 60_000,
    });
    await provider.link('asset-7', 'doc-1');
    await provider.flush();

    const calls = fetchMock.mock.calls.map((c) => c[0] as string);
    // Should have committed links.json
    expect(calls.some((u) => u.includes('/git/blobs'))).toBe(true);
  });

  it('debounce batches rapid changes', async () => {
    vi.useFakeTimers();
    setupSuccessfulCommitFetch(fetchMock);
    const provider = new GitHubSyncProvider({
      owner: 'sudo-prog',
      repo: 'layers-vault',
      debounceMs: 2000,
    });

    await provider.save(makeDoc({ id: 'doc-1' }));
    await provider.save(makeDoc({ id: 'doc-2' }));

    // Before debounce fires, both should be pending
    let queue = await provider.queueStatus();
    expect(queue).toHaveLength(2);
    expect(queue[0].status).toBe('pending');
    expect(queue[1].status).toBe('pending');

    // Advance timers to trigger debounce
    vi.advanceTimersByTime(2000);
    await vi.runAllTimersAsync();

    // After debounce, both should be synced
    queue = await provider.queueStatus();
    expect(queue[0].status).toBe('synced');
    expect(queue[1].status).toBe('synced');
  });

  it('retries on rate limit', async () => {
    let callCount = 0;
    fetchMock.mockImplementation(async (url: string) => {
      callCount++;
      if (callCount <= 2) {
        return new Response('Rate limited', { status: 429 });
      }
      if (url.includes('/git/ref/heads/')) {
        return Response.json({ object: { sha: 'head-sha' } });
      }
      if (url.includes('/git/trees/')) {
        return Response.json({ tree: [] });
      }
      if (url.includes('/git/blobs')) {
        return Response.json({ sha: 'blob-sha' });
      }
      if (url.match(/api\.github\.com\/repos\/[^/]+\/[^/]+\/git\/trees$/)) {
        return Response.json({ sha: 'tree-sha' });
      }
      if (url.includes('/git/commits')) {
        return Response.json({ sha: 'commit-sha' });
      }
      if (url.includes('/git/refs/heads/')) {
        return Response.json({ object: { sha: 'commit-sha' } });
      }
      return new Response('Not found', { status: 404 });
    });

    const provider = new GitHubSyncProvider({
      owner: 'sudo-prog',
      repo: 'layers-vault',
      debounceMs: 60_000,
    });
    await provider.save(makeDoc());
    await provider.flush();

    // Should have retried and eventually succeeded
    expect(callCount).toBeGreaterThan(2);
    const queue = await provider.queueStatus();
    expect(queue[0].status).toBe('synced');
  });

  it('token is never logged', async () => {
    const consoleSpy = vi.spyOn(console, 'log');
    const consoleDebugSpy = vi.spyOn(console, 'debug');
    setupSuccessfulCommitFetch(fetchMock);
    const provider = new GitHubSyncProvider({
      owner: 'sudo-prog',
      repo: 'layers-vault',
      token: 'super-secret-token',
      debounceMs: 60_000,
    });
    await provider.save(makeDoc());
    await provider.flush();

    const allLogs = [
      ...consoleSpy.mock.calls.map((c) => c.join(' ')),
      ...consoleDebugSpy.mock.calls.map((c) => c.join(' ')),
    ].join(' ');
    expect(allLogs).not.toContain('super-secret-token');
    consoleSpy.mockRestore();
    consoleDebugSpy.mockRestore();
  });
});

describe('IndexedDBProvider', () => {
  let provider: IndexedDBProvider;

  beforeEach(() => {
    vi.stubGlobal('indexedDB', mock.indexedDB);
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
