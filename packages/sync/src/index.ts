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
 * Commits are debounced in a real implementation; this stub logs every
 * action without performing real API calls so the package stays
 * testable offline and free of credentials.
 */
export class GitHubSyncProvider implements SyncProvider {
  public readonly owner: string;
  public readonly repo: string;
  public readonly branch: string;
  public readonly token: string;

  private queue: SyncQueue[] = [];

  constructor(opts: {
    owner: string;
    repo: string;
    branch?: string;
    token?: string;
  }) {
    this.owner = opts.owner;
    this.repo = opts.repo;
    this.branch = opts.branch ?? 'main';
    this.token = opts.token ?? '';
    console.debug(
      `[GitHubSyncProvider] initialized for ${this.owner}/${this.repo}@${this.branch}`,
    );
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
    this.enqueue('save', { id: doc.id, version: doc.version });
    console.debug('[GitHubSyncProvider] save (stub) ->', doc.id);
  }

  async restore(id: string): Promise<Document | null> {
    console.debug(`[GitHubSyncProvider] restore (stub) -> ${id}`);
    return null;
  }

  async queueStatus(): Promise<SyncQueue[]> {
    return [...this.queue];
  }

  async link(assetId: string, documentId: string): Promise<void> {
    this.enqueue('save', { assetId, documentId });
    console.debug(
      `[GitHubSyncProvider] link (stub) asset ${assetId} -> doc ${documentId}`,
    );
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

export default GitHubSyncProvider;
