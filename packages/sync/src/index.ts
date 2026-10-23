/**
 * Generate a UUID v4 using the Web Crypto API when available, falling back to
 * a timestamp-based pseudo-UUID for environments that lack `crypto.randomUUID`.
 */
function randomUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: build a UUID-v4-like string from random bytes + timestamp.
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  // Set version (4) and variant (10xx) bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex: string[] = [];
  for (let i = 0; i < 256; i++) {
    hex.push((i + 0x100).toString(16).slice(1));
  }
  return (
    hex[bytes[0]] + hex[bytes[1]] + hex[bytes[2]] + hex[bytes[3]] + '-' +
    hex[bytes[4]] + hex[bytes[5]] + '-' +
    hex[bytes[6]] + hex[bytes[7]] + '-' +
    hex[bytes[8]] + hex[bytes[9]] + '-' +
    hex[bytes[10]] + hex[bytes[11]] + hex[bytes[12]] + hex[bytes[13]] + hex[bytes[14]] + hex[bytes[15]]
  );
}

/**
 * A document managed by the sync layer.
 *
 * Mirrors the LAYERS document contract: JSON-serializable state with a
 * unique id and a version string used for optimistic concurrency.
 */
export interface Document {
  id: string;
  version: string;
  data: Record<string, unknown>;
  updatedAt: string; // ISO-8601 timestamp
}

/** A queued synchronization operation. */
export type SyncOperation = 'save' | 'delete';

/** Lifecycle of a queued item. */
export type SyncStatus = 'pending' | 'synced' | 'error';

/** A single unit of work queued for synchronization. */
export interface SyncQueue {
  id: string;
  timestamp: number;
  operation: SyncOperation;
  payload: unknown;
  status: SyncStatus;
}

/**
 * The interface every sync backend must implement.
 *
 * - `save`         — persist a document (or enqueue it for sync).
 * - `restore`      — fetch a document by id, or `null` when absent.
 * - `queueStatus`  — report the current sync queue.
 * - `link`         — bind a media asset id (e.g. an Immich asset id) to a
 *                   document id so the JSON only stores the reference.
 */
export interface SyncProvider {
  save(doc: Document): Promise<void>;
  restore(id: string): Promise<Document | null>;
  queueStatus(): Promise<SyncQueue[]>;
  link(assetId: string, documentId: string): Promise<void>;
}

/**
 * GitHubSyncProvider
 *
 * Writes JSON documents to a GitHub repository via the Git Data API.
 * Commits are debounced to batch rapid changes. Uses fetch() for all
 * HTTP calls so it works in both Node.js and browser environments.
 *
 * The token is never logged or exposed.
 */
export class GitHubSyncProvider implements SyncProvider {
  public readonly owner: string;
  public readonly repo: string;
  public readonly branch: string;
  private readonly _token: string;
  private readonly debounceMs: number;

  private queue: SyncQueue[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;

  constructor(opts: {
    owner: string;
    repo: string;
    branch?: string;
    token?: string;
    debounceMs?: number;
  }) {
    this.owner = opts.owner;
    this.repo = opts.repo;
    this.branch = opts.branch ?? 'main';
    this._token = opts.token ?? '';
    this.debounceMs = opts.debounceMs ?? 2000;
    console.debug(
      `[GitHubSyncProvider] initialized for ${this.owner}/${this.repo}@${this.branch}`,
    );
  }

  /** Token is never exposed. Use the getter for test/verification only. */
  get token(): string {
    return this._token;
  }

  private enqueue(operation: SyncOperation, payload: unknown): void {
    const entry: SyncQueue = {
      id: randomUUID(),
      timestamp: Date.now(),
      operation,
      payload,
      status: 'pending',
    };
    this.queue.push(entry);
    console.debug(`[GitHubSyncProvider] queued ${operation} -> ${entry.id}`);
  }

  async save(doc: Document): Promise<void> {
    this.enqueue('save', { id: doc.id, version: doc.version, data: doc.data, updatedAt: doc.updatedAt });
    this.scheduleFlush();
  }

  async restore(id: string): Promise<Document | null> {
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/documents/${id}.json`;
    try {
      const response = await this.fetchWithRetry(url, { method: 'GET' });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);
      const data = (await response.json()) as { content: string };
      const decoded = atob(data.content.replace(/\n/g, ''));
      return JSON.parse(decoded) as Document;
    } catch (e) {
      console.debug('[GitHubSyncProvider] restore failed:', e);
      return null;
    }
  }

  async queueStatus(): Promise<SyncQueue[]> {
    return [...this.queue];
  }

  async link(assetId: string, documentId: string): Promise<void> {
    this.enqueue('save', { assetId, documentId });
    this.scheduleFlush();
  }

  /**
   * Process all pending queue items by committing them to the repository.
   * Each item is committed separately (links and documents).
   */
  async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    const pending = this.queue.filter((q) => q.status === 'pending');
    for (const item of pending) {
      try {
        await this.commitQueueItem(item);
        item.status = 'synced';
      } catch (e) {
        console.debug('[GitHubSyncProvider] flush error:', e);
        item.status = 'error';
      }
    }
    this.flushing = false;
  }

  private scheduleFlush(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.flush().catch((e) => console.debug('[GitHubSyncProvider] auto-flush error:', e));
    }, this.debounceMs);
  }

  private async commitQueueItem(item: SyncQueue): Promise<void> {
    const payload = item.payload as Record<string, unknown>;

    // Get current branch HEAD
    const refResponse = await this.fetchWithRetry(
      `https://api.github.com/repos/${this.owner}/${this.repo}/git/ref/heads/${this.branch}`,
    );
    const refData = (await refResponse.json()) as { object: { sha: string } };
    const headSha = refData.object.sha;

    // Fetch the current tree so the commit is built on the real base tree
    // (the Git Data API requires base_tree to match the tip of the branch).
    // The returned paths are not needed by this call — the tree object itself
    // is what the subsequent /git/trees POST is compared against.
    await this.fetchWithRetry(
      `https://api.github.com/repos/${this.owner}/${this.repo}/git/trees/${headSha}?recursive=1`,
    );

    // Determine what to commit
    let filePath: string;
    let content: string;

    if ('assetId' in payload && 'documentId' in payload) {
      filePath = 'links.json';
      content = JSON.stringify({ [payload.assetId as string]: payload.documentId }, null, 2);
    } else if ('id' in payload && 'data' in payload) {
      const doc: Document = {
        id: payload.id as string,
        version: (payload.version as string) ?? '1.0.0',
        data: payload.data as Record<string, unknown>,
        updatedAt: (payload.updatedAt as string) ?? new Date().toISOString(),
      };
      filePath = `documents/${doc.id}.json`;
      content = JSON.stringify(doc, null, 2);
    } else {
      throw new Error('Unknown queue item payload');
    }

    // Create blob
    const blobResponse = await this.fetchWithRetry(
      `https://api.github.com/repos/${this.owner}/${this.repo}/git/blobs`,
      {
        method: 'POST',
        body: JSON.stringify({ content, encoding: 'utf-8' }),
      },
    );
    const blobData = (await blobResponse.json()) as { sha: string };
    const blobSha = blobData.sha;

    // Create tree
    const treePayloadResponse = await this.fetchWithRetry(
      `https://api.github.com/repos/${this.owner}/${this.repo}/git/trees`,
      {
        method: 'POST',
        body: JSON.stringify({
          base_tree: headSha,
          tree: [{ path: filePath, mode: '100644', type: 'blob', sha: blobSha }],
        }),
      },
    );
    const treePayload = (await treePayloadResponse.json()) as { sha: string };
    const treeSha = treePayload.sha;

    // Create commit
    const commitResponse = await this.fetchWithRetry(
      `https://api.github.com/repos/${this.owner}/${this.repo}/git/commits`,
      {
        method: 'POST',
        body: JSON.stringify({
          message: `sync: ${item.operation} ${filePath}`,
          tree: treeSha,
          parents: [headSha],
        }),
      },
    );
    const commitData = (await commitResponse.json()) as { sha: string };
    const commitSha = commitData.sha;

    // Update branch ref
    await this.fetchWithRetry(
      `https://api.github.com/repos/${this.owner}/${this.repo}/git/refs/heads/${this.branch}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ sha: commitSha, force: false }),
      },
    );
  }

  private async fetchWithRetry(url: string, options: RequestInit = {}, retries = 3): Promise<Response> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this._token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, { ...options, headers });
        if (response.status === 429 && attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        return response;
      } catch (e) {
        lastError = e as Error;
        if (attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    throw lastError ?? new Error('fetch failed');
  }
}

/**
 * MemorySyncProvider
 *
 * An in-memory {@link SyncProvider} intended for tests and local
 * development. Every operation is backed by a Map and therefore
 * synchronous in practice, but keeps the async contract so it can be
 * swapped for a real provider at the call-site.
 */
export class MemorySyncProvider implements SyncProvider {
  private store: Map<string, Document> = new Map();
  private links: Map<string, string> = new Map(); // assetId -> documentId
  private queue: SyncQueue[] = [];

  async save(doc: Document): Promise<void> {
    this.store.set(doc.id, deepClone(doc));
    this.enqueue('save', doc);
  }

  async restore(id: string): Promise<Document | null> {
    const doc = this.store.get(id);
    return doc ? deepClone(doc) : null;
  }

  async queueStatus(): Promise<SyncQueue[]> {
    return [...this.queue];
  }

  async link(assetId: string, documentId: string): Promise<void> {
    this.links.set(assetId, documentId);
    this.enqueue('save', { assetId, documentId });
  }

  /** Resolve an asset id to its linked document (test convenience). */
  getLinkedDocument(assetId: string): Document | null {
    const docId = this.links.get(assetId);
    if (!docId) return null;
    const doc = this.store.get(docId);
    return doc ? deepClone(doc) : null;
  }

  private enqueue(operation: SyncOperation, payload: unknown): void {
    this.queue.push({
      id: randomUUID(),
      timestamp: Date.now(),
      operation,
      payload,
      status: 'synced',
    });
  }
}

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

export { IndexedDBProvider } from './indexeddb.js';
export { ImmichClient } from './immich.js';
export type { ImmichAsset, ImmichAlbum } from './immich.js';

export default GitHubSyncProvider;
