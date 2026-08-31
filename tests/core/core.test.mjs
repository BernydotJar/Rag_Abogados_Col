import test from 'node:test';
import assert from 'node:assert/strict';
import { DeterministicChunker } from '../../src/core/chunker.mjs';
import { normalizeDocumentText } from '../../src/core/text.mjs';
import { LocalHashEmbeddingProvider, cosineSimilarity } from '../../src/core/embeddings.mjs';
import { InMemoryVectorStore } from '../../src/core/vector-store.mjs';
import { createEvidenceRecord } from '../../src/core/evidence.mjs';
import { CorpusRegistry } from '../../src/core/corpus-registry.mjs';
import { sha256Hex, stableId } from '../../src/core/ids.mjs';

const longText = `Primera sección sobre obligaciones y contratos. ${'La voluntad debe estar respaldada por evidencia verificable. '.repeat(18)}\n\nSegunda sección sobre documentos privados. ${'El documento debe conservar su procedencia y su alcance. '.repeat(18)}`;

test('chunker is deterministic and bounded', () => {
  const chunker = new DeterministicChunker({ maxChars: 420, overlapChars: 60 });
  const a = chunker.chunk(longText, { document_id: 'doc-a' });
  const b = chunker.chunk(longText, { document_id: 'doc-a' });
  assert.deepEqual(a, b);
  assert.ok(a.length > 2);
  assert.ok(a.every((c) => c.text.length <= 420));
  assert.equal(a[0].metadata.chunker_version, '1.0.0');
  assert.equal(a.at(-1).end, normalizeDocumentText(longText).length);
  assert.equal(a[0].metadata.coordinate_space, 'normalized_text_v1');
});

test('hash embedding is normalized and stable', async () => {
  const provider = new LocalHashEmbeddingProvider({ dimension: 128 });
  const a = await provider.embed('contrato de trabajo trabajador empleador');
  const b = await provider.embed('contrato de trabajo trabajador empleador');
  const c = await provider.embed('registro notarial escritura pública');
  assert.deepEqual([...a], [...b]);
  assert.ok(Math.abs(cosineSimilarity(a, a) - 1) < 1e-5);
  assert.ok(cosineSimilarity(a, b) > cosineSimilarity(a, c));
  assert.deepEqual(provider.metadata(), { provider: 'local-hash-embedding', model: 'charword-128', version: '1.0.0', dimension: 128, local: true });
});

test('vector store filters and deletes by document', async () => {
  const provider = new LocalHashEmbeddingProvider({ dimension: 128 });
  const store = new InMemoryVectorStore();
  store.upsertMany([
    { id: 'a1', text: 'contrato laboral', vector: await provider.embed('contrato laboral'), metadata: { scope: 's1', document_id: 'a', domain: 'laboral' } },
    { id: 'b1', text: 'escritura notarial', vector: await provider.embed('escritura notarial'), metadata: { scope: 's1', document_id: 'b', domain: 'notarial' } },
    { id: 'c1', text: 'otro contrato', vector: await provider.embed('otro contrato'), metadata: { scope: 's2', document_id: 'c', domain: 'laboral' } }
  ]);
  const results = store.search(await provider.embed('contrato laboral'), { filter: { scope: 's1', domain: 'laboral' }, limit: 3 });
  assert.deepEqual(results.map((r) => r.id), ['a1']);
  assert.equal(store.deleteByDocument('a'), 1);
  assert.equal(store.count({ scope: 's1' }), 1);
  assert.throws(() => store.upsert({ id: 'bad', text: 'bad', vector: new Float32Array(64), metadata: {} }), /vector dimension mismatch/);
  assert.throws(() => store.search(new Float32Array(64)), /query vector dimension mismatch/);
});

test('evidence records enforce source-type separation', () => {
  const item = createEvidenceRecord({ id: 'e1', text: 'Artículo de prueba', source_type: 'legislation', scope: 'public', metadata: { source_id: 'law-1' } });
  assert.equal(item.source_type, 'legislation');
  assert.throws(() => createEvidenceRecord({ id: 'e2', text: 'x', source_type: 'mixed', scope: 'public' }), /unsupported source_type/);
});

test('corpus registry requires known source ids', () => {
  const registry = new CorpusRegistry();
  registry.registerSource({ id: 'law-1', title: 'Ley de prueba', source_type: 'legislation' });
  registry.registerEvidence({ id: 'e1', text: 'Artículo 1', source_type: 'legislation', scope: 'public', metadata: { source_id: 'law-1' } });
  assert.equal(registry.listEvidence({ source_id: 'law-1' }).length, 1);
  assert.throws(() => registry.registerSource({ id: 'bad-source', title: 'Bad', source_type: 'mixed' }), /unsupported source_type/);
  assert.throws(() => registry.registerEvidence({ id: 'e2', text: 'x', source_type: 'legislation', scope: 'public', metadata: { source_id: 'missing' } }), /unknown source/);
});

test('stable ids use SHA-256', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.match(await stableId('doc', 'name', 'bytes'), /^doc_[a-f0-9]{24}$/);
});