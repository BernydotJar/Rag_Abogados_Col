export const SOURCE_TYPES = Object.freeze(['legislation', 'jurisprudence', 'user_document', 'editorial']);

export function createEvidenceRecord(input) {
  if (!input?.id || !input?.text) throw new Error('evidence requires id and text');
  if (!SOURCE_TYPES.includes(input.source_type)) throw new Error(`unsupported source_type: ${input.source_type}`);
  if (!input.scope) throw new Error('evidence requires scope');
  return Object.freeze({
    id: input.id,
    text: input.text,
    source_type: input.source_type,
    scope: input.scope,
    citation: input.citation ? { ...input.citation } : null,
    metadata: Object.freeze({ ...(input.metadata ?? {}) })
  });
}