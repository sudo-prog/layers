import { describe, it, expect } from 'vitest';
import {
  MemorySyncProvider,
  GitHubSyncProvider,
  type Document,
  type SyncQueue,
} from '../src/index';

function makeDoc(override: Partial<Document> = {}): Document {
  return {
    id: 'doc-1',
    version: '1.0.0',
    data: { hello: 'world' },
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...override,
  };
}

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
