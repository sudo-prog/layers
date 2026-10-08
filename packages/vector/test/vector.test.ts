import { describe, it, expect } from 'vitest';
import {
  MemoryVectorStore,
  type EmbeddingVector,
} from '../src/index';

function makeVector(
  id: string,
  values: number[],
  metadata: Record<string, unknown> = {},
): EmbeddingVector {
  return { id, values, metadata };
}

describe('MemoryVectorStore', () => {
  it('add stores a vector retrievable by search', async () => {
    const store = new MemoryVectorStore();
    const vec = makeVector('a', [0.1, 0.2, 0.3]);
    await store.add(vec);
    expect(store.count()).toBe(1);
    // query identical to the stored vector returns it with score 1
    const results = await store.search([0.1, 0.2, 0.3], 1);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('a');
  });

  it('search returns an empty array for an empty store', async () => {
    const store = new MemoryVectorStore();
    expect(await store.search([1, 0, 0], 5)).toEqual([]);
  });

  it('search with k <= 0 returns an empty array', async () => {
    const store = new MemoryVectorStore();
    await store.add(makeVector('a', [1, 0, 0]));
    expect(await store.search([1, 0, 0], 0)).toEqual([]);
    expect(await store.search([1, 0, 0], -1)).toEqual([]);
  });

  it('search returns top-k by cosine similarity', async () => {
    const store = new MemoryVectorStore();
    // query aligns most with 'b'
    await store.add(makeVector('a', [1, 0, 0]));
    await store.add(makeVector('b', [0.99, 0.01, 0]));
    await store.add(makeVector('c', [0, 0, 1]));

    const results = await store.search([1, 0.1, 0], 2);
    expect(results.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('search is idempotent and does not mutate stored vectors', async () => {
    const store = new MemoryVectorStore();
    await store.add(makeVector('a', [1, 0, 0]));
    const first = await store.search([1, 0, 0], 1);
    const second = await store.search([1, 0, 0], 1);
    expect(first).toEqual(second);
    expect(second[0].values).toEqual([1, 0, 0]);
  });

  it('add upserts: re-adding the same id replaces values', async () => {
    const store = new MemoryVectorStore();
    await store.add(makeVector('a', [1, 0, 0]));
    await store.add(makeVector('a', [0, 1, 0]));
    expect(store.count()).toBe(1);
    const result = (await store.search([0, 1, 0], 1))[0];
    expect(result.values).toEqual([0, 1, 0]);
  });

  it('add preserves metadata', async () => {
    const store = new MemoryVectorStore();
    await store.add(
      makeVector('a', [1, 0, 0], { label: 'north', source: 'clip' }),
    );
    const result = (await store.search([1, 0, 0], 1))[0];
    expect(result.metadata).toEqual({ label: 'north', source: 'clip' });
  });

  it('add stores independent copies of values and metadata', async () => {
    const store = new MemoryVectorStore();
    const values = [1, 0, 0];
    const metadata = { label: 'north' };
    await store.add(makeVector('a', values, metadata));
    values[0] = 9;
    metadata.label = 'south';
    const result = (await store.search([1, 0, 0], 1))[0];
    expect(result.values).toEqual([1, 0, 0]);
    expect(result.metadata).toEqual({ label: 'north' });
  });

  it('delete removes a vector by id', async () => {
    const store = new MemoryVectorStore();
    await store.add(makeVector('a', [1, 0, 0]));
    await store.add(makeVector('b', [0, 1, 0]));
    await store.delete('a');
    expect(store.count()).toBe(1);
    expect((await store.search([1, 0, 0], 1)).map((r) => r.id)).toEqual(['b']);
  });

  it('delete is idempotent when the id is absent', async () => {
    const store = new MemoryVectorStore();
    await store.add(makeVector('a', [1, 0, 0]));
    await expect(store.delete('missing')).resolves.toBeUndefined();
    expect(store.count()).toBe(1);
  });

  it('throws on dimension mismatch', async () => {
    const store = new MemoryVectorStore();
    await store.add(makeVector('a', [1, 0, 0]));
    await expect(store.search([1, 0], 1)).rejects.toThrow(/dimension mismatch/);
  });
});
