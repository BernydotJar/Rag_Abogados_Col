import { cosineSimilarity } from './embeddings.mjs';

function matchesFilter(metadata, filter) {
  if (!filter) return true;
  for (const [key, expected] of Object.entries(filter)) {
    const actual = metadata?.[key];
    if (typeof expected === 'function') {
      if (!expected(actual, metadata)) return false;
    } else if (Array.isArray(expected)) {
      if (Array.isArray(actual)) {
        if (!actual.some((value) => expected.includes(value))) return false;
      } else if (!expected.includes(actual)) return false;
    } else if (actual !== expected) return false;
  }
  return true;
}

export class InMemoryVectorStore {
  constructor() { this.records = new Map(); this.dimension = null; }

  upsert(record) {
    if (!record?.id || !record.vector || !record.text) throw new Error('record requires id, vector and text');
    if (!Number.isInteger(record.vector.length) || record.vector.length < 1) throw new Error('record vector must have a dimension');
    if (this.dimension === null) this.dimension = record.vector.length;
    if (record.vector.length !== this.dimension) throw new Error(`vector dimension mismatch: expected ${this.dimension}, got ${record.vector.length}`);
    this.records.set(record.id, { ...record, metadata: { ...(record.metadata ?? {}) } });
  }

  upsertMany(records) { for (const record of records) this.upsert(record); }

  search(queryVector, { limit = 8, filter = null, minScore = -1 } = {}) {
    if (this.dimension !== null && queryVector.length !== this.dimension) throw new Error(`query vector dimension mismatch: expected ${this.dimension}, got ${queryVector.length}`);
    return [...this.records.values()]
      .filter((record) => matchesFilter(record.metadata, filter))
      .map((record) => ({ ...record, vector_score: cosineSimilarity(queryVector, record.vector) }))
      .filter((record) => record.vector_score >= minScore)
      .sort((a, b) => b.vector_score - a.vector_score || a.id.localeCompare(b.id))
      .slice(0, limit);
  }

  deleteWhere(predicate) {
    let deleted = 0;
    for (const [id, record] of this.records) {
      if (predicate(record)) { this.records.delete(id); deleted += 1; }
    }
    return deleted;
  }

  deleteByDocument(documentId) { return this.deleteWhere((r) => r.metadata?.document_id === documentId); }
  deleteByScope(scope) { return this.deleteWhere((r) => r.metadata?.scope === scope); }
  count(filter = null) { return [...this.records.values()].filter((r) => matchesFilter(r.metadata, filter)).length; }
  clear() { this.records.clear(); this.dimension = null; }
}