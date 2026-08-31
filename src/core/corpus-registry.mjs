import { createEvidenceRecord, SOURCE_TYPES } from './evidence.mjs';

export class CorpusRegistry {
  constructor() { this.sources = new Map(); this.evidence = new Map(); }
  registerSource(source) {
    if (!source?.id || !source?.title || !source?.source_type) throw new Error('source requires id, title and source_type');
    if (!SOURCE_TYPES.includes(source.source_type)) throw new Error(`unsupported source_type: ${source.source_type}`);
    if (this.sources.has(source.id)) throw new Error(`duplicate source id: ${source.id}`);
    this.sources.set(source.id, Object.freeze({ ...source }));
    return this.sources.get(source.id);
  }
  registerEvidence(record) {
    const evidence = createEvidenceRecord(record);
    if (this.evidence.has(evidence.id)) throw new Error(`duplicate evidence id: ${evidence.id}`);
    if (evidence.metadata?.source_id && !this.sources.has(evidence.metadata.source_id)) throw new Error(`unknown source: ${evidence.metadata.source_id}`);
    this.evidence.set(evidence.id, evidence);
    return evidence;
  }
  listSources(filter = {}) {
    return [...this.sources.values()].filter((source) => Object.entries(filter).every(([k, v]) => source[k] === v));
  }
  listEvidence(filter = {}) {
    return [...this.evidence.values()].filter((item) => Object.entries(filter).every(([k, v]) => item[k] === v || item.metadata?.[k] === v));
  }
}
