import { charNgrams, fnv1a32, tokenize } from './text.mjs';

function addFeature(vector, feature, weight) {
  const h1 = fnv1a32(feature);
  const h2 = fnv1a32(feature, 0x9e3779b9);
  const index = h1 % vector.length;
  vector[index] += (h2 & 1 ? 1 : -1) * weight;
}

export function normalizeVector(vector) {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const norm = Math.sqrt(sum);
  if (!norm) return vector;
  for (let i = 0; i < vector.length; i += 1) vector[i] /= norm;
  return vector;
}

export function cosineSimilarity(a, b) {
  if (a.length !== b.length) throw new Error('vector dimensions differ');
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return dot;
}

export class LocalHashEmbeddingProvider {
  constructor({ dimension = 384 } = {}) {
    if (!Number.isInteger(dimension) || dimension < 64) throw new Error('dimension must be an integer >= 64');
    this.dimension = dimension;
    this.provider = 'local-hash-embedding';
    this.model = `charword-${dimension}`;
    this.version = '1.0.0';
  }

  metadata() {
    return { provider: this.provider, model: this.model, version: this.version, dimension: this.dimension, local: true };
  }

  async embed(text) {
    const tokens = tokenize(text);
    const vector = new Float32Array(this.dimension);
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      addFeature(vector, `w:${token}`, 1);
      if (i + 1 < tokens.length) addFeature(vector, `b:${token}_${tokens[i + 1]}`, 0.75);
      for (const gram of charNgrams(token, 3)) addFeature(vector, `c:${gram}`, 0.24);
    }
    return normalizeVector(vector);
  }

  async embedMany(texts) {
    return Promise.all(texts.map((text) => this.embed(text)));
  }
}