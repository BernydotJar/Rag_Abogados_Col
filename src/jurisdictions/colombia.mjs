export const COLOMBIA_JURISDICTION = Object.freeze({ country: 'Colombia', code: 'CO', language: 'es', demo_only: true });
export const COLOMBIA_DOMAINS = Object.freeze(['general','civil','familia','laboral','penal','notarial','constitucional','unsure']);

export function validateColombiaPack({ registry, corpus }) {
  const errors = [];
  if (registry?.jurisdiction?.code !== 'CO' || registry?.jurisdiction?.demo_only !== true) errors.push('invalid jurisdiction metadata');
  const sources = new Map();
  for (const source of registry?.sources ?? []) {
    for (const key of ['id','jurisdiction','authority','source_type','norm_type','identifier','official_title','source_url','publication_date','last_verified_at','version_id','sha256','retrieval_domains']) {
      if (!(key in source) || source[key] === '') errors.push(`${source.id ?? 'source'} missing ${key}`);
    }
    if (source.source_type !== 'legislation') errors.push(`${source.id} must remain legislation`);
    if (source.certified_vigencia !== false) errors.push(`${source.id} may not claim certified vigencia`);
    if (sources.has(source.id)) errors.push(`duplicate source ${source.id}`);
    sources.set(source.id, source);
  }
  for (const item of corpus?.evidence ?? []) {
    if (!sources.has(item.source_id)) errors.push(`${item.id} unknown source ${item.source_id}`);
    if (item.source_type !== 'legislation') errors.push(`${item.id} source_type mismatch`);
    if (!item.article_or_section) errors.push(`${item.id} missing article_or_section`);
    if (!item.version_id || !item.version_basis || !Object.hasOwn(item, 'effective_from') || !Object.hasOwn(item, 'effective_to')) errors.push(`${item.id} missing article version metadata`);
    if (!Array.isArray(item.retrieval_domains) || item.retrieval_domains.length === 0) errors.push(`${item.id} missing retrieval domains`);
  }
  const notarial = sources.get('co-notariado-960-1970');
  if (!notarial?.article_level_review_required || notarial?.current_conclusion_eligible !== false) errors.push('notarial base must be blocked for current conclusions');
  return { valid: errors.length === 0, errors, source_count: sources.size, evidence_count: corpus?.evidence?.length ?? 0 };
}