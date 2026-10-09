/**
 * An embedding vector produced by a model such as CLIP.
 *
 * - `id`      — stable identifier (matches the document / asset it represents).
 * - `values`  — the raw embedding coordinates.
 * - `metadata`— arbitrary caller-supplied context (label, source, etc.).
 */
export interface EmbeddingVector {
  id: string;
  values: number[];
  metadata: Record<string, unknown>;
}

/**
 * The interface every vector store must implement.
 *
 * - `add`    — insert (or upsert) a vector.
 * - `search` — return the top-`k` nearest vectors by cosine similarity.
 * - `delete` — remove a vector by id.
 */
export interface VectorStore {
  add(vec: EmbeddingVector): Promise<void>;
  search(query: number[], k: number): Promise<EmbeddingVector[]>;
  delete(id: string): Promise<void>;
}

/** Pure cosine similarity between two equal-length vectors. */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `dimension mismatch: query has ${a.length} dims, vector has ${b.length} dims`,
    );
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * MemoryVectorStore
 *
 * An in-memory {@link VectorStore} using cosine similarity. Intended for
 * tests and local development; a real deployment would back this with
 * PostgreSQL/IndexedDB or a dedicated vector DB (Qdrant, Pinecone).
 */
export class MemoryVectorStore implements VectorStore {
  private vectors: EmbeddingVector[] = [];

  async add(vec: EmbeddingVector): Promise<void> {
    // Upsert semantics: replace any existing vector with the same id.
    this.vectors = this.vectors.filter((v) => v.id !== vec.id);
    this.vectors.push({
      id: vec.id,
      values: [...vec.values],
      metadata: { ...vec.metadata },
    });
  }

  async search(query: number[], k: number): Promise<EmbeddingVector[]> {
    if (k <= 0) return [];
    if (this.vectors.length === 0) return [];

    return [...this.vectors]
      .map((v) => ({ vec: v, score: cosineSimilarity(query, v.values) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map((m) => m.vec);
  }

  async delete(id: string): Promise<void> {
    this.vectors = this.vectors.filter((v) => v.id !== id);
  }

  /** Number of vectors currently stored (test convenience). */
  count(): number {
    return this.vectors.length;
  }
}

export default MemoryVectorStore;
