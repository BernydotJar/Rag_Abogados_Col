function requireFields(obj,fields) { return fields.filter(k=>obj?.[k]===undefined||obj?.[k]===null||obj?.[k]===''); }

export function buildCitation(result) {
  const m=result?.metadata??{};
  if (m.source_type==='legislation') {
    const missing=requireFields(m,['official_title','identifier','article_or_section','authority','source_url','version_id','last_verified_at']);
    if (!result?.id||!result?.text) missing.push('evidence');
    if (missing.length) return {valid:false,evidence_id:result?.id??null,missing:[...new Set(missing)]};
    return {valid:true,evidence_id:result.id,source_type:'legislation',norm:m.official_title,identifier:m.identifier,article_or_section:m.article_or_section,authority:m.authority,source_url:m.source_url,excerpt:result.text,version_id:m.version_id,last_verified_at:m.last_verified_at,original_language:'es',conclusion_eligible:result.usable_for_current_conclusion!==false};
  }
  if (m.source_type==='user_document') {
    const missing=requireFields(m,['document_id','filename','scope']);
    if (!result?.id||!result?.text) missing.push('evidence');
    if (missing.length) return {valid:false,evidence_id:result?.id??null,missing:[...new Set(missing)]};
    return {valid:true,evidence_id:result.id,source_type:'user_document',document_id:m.document_id,filename:m.filename,chunk_index:m.chunk_index??null,excerpt:result.text,scope:m.scope,untrusted_content:true};
  }
  return {valid:false,evidence_id:result?.id??null,missing:['supported_source_type']};
}
