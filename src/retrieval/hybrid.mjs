import { tokenize } from '../core/text.mjs';

const STOPWORDS=new Set(['a','al','ante','bajo','con','contra','de','del','desde','el','en','entre','es','esta','este','la','las','lo','los','o','para','por','que','se','sin','su','sus','un','una','y']);
const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));
const contentTokens=(text)=>tokenize(text).filter(t=>t.length>1&&!STOPWORDS.has(t));

export function lexicalScore(query,text) {
  const q=[...new Set(contentTokens(query))]; if (!q.length) return 0;
  const d=contentTokens(text); if (!d.length) return 0;
  const counts=new Map(); for (const t of d) counts.set(t,(counts.get(t)||0)+1);
  let matched=0,tf=0; for (const t of q) if (counts.has(t)) { matched+=1; tf+=Math.min(3,counts.get(t)); }
  const coverage=matched/q.length;
  const density=Math.min(1,tf/Math.max(q.length,1)/1.5);
  const foldedQuery=q.join(' '), foldedDoc=d.join(' ');
  const phrase=foldedQuery.length>5&&foldedDoc.includes(foldedQuery)?0.12:0;
  return clamp(coverage*0.78+density*0.22+phrase);
}

export async function indexLegalCorpus({registry,corpus,embeddingProvider,vectorStore}) {
  const sources=new Map(registry.sources.map(s=>[s.id,s]));
  const scope=`public:${registry.jurisdiction.code}`;
  vectorStore.deleteByScope(scope);
  const indexed=corpus.evidence.map((e)=>{
    const source=sources.get(e.source_id); if (!source) throw new Error(`Unknown legal source ${e.source_id}`);
    const search_metadata=[source.official_title,source.identifier,e.article_or_section].filter(Boolean).join(' ');
    const search_text=[search_metadata,e.text].filter(Boolean).join(' ');
    return {e,source,search_text,search_metadata};
  });
  const vectors=await embeddingProvider.embedMany(indexed.map(x=>x.search_text));
  indexed.forEach(({e,source,search_text,search_metadata},i)=>{
    vectorStore.upsert({
      id:e.id,text:e.text,vector:vectors[i],metadata:{
        scope,jurisdiction:e.jurisdiction,source_type:e.source_type,source_id:e.source_id,article_or_section:e.article_or_section,
        retrieval_domains:[...e.retrieval_domains],conclusion_eligible:e.conclusion_eligible!==false&&source.current_conclusion_eligible!==false,
        vigencia_status:e.vigencia_status,version_id:e.version_id,version_basis:e.version_basis,authority:source.authority,
        official_title:source.official_title,identifier:source.identifier,source_url:source.source_url,last_verified_at:e.last_verified_at,
        source_sha256:source.sha256,evidence_sha256:e.sha256,coverage:source.coverage,search_text,search_metadata
      }
    });
  });
  return {scope,indexed:corpus.evidence.length,embedding:embeddingProvider.metadata()};
}

function domainRelation(metadata,domain) {
  if (metadata.source_type==='user_document') return 'user_document';
  if (!domain||domain==='general'||domain==='unsure') return 'unscoped';
  return metadata.retrieval_domains?.includes(domain)?'preferred':'cross_domain';
}

export class HybridRetriever {
  constructor({embeddingProvider,vectorStore,jurisdiction='CO'}={}) { this.embeddingProvider=embeddingProvider; this.vectorStore=vectorStore; this.jurisdiction=jurisdiction; }

  async retrieve(query,{domain='general',privateScope=null,includeUserDocuments=true,sourceTypes=null,limit=8,minScore=0.08}={}) {
    const q=String(query??'').trim(); if (!q) return [];
    const queryVector=await this.embeddingProvider.embed(q);
    const publicScope=`public:${this.jurisdiction}`;
    if (privateScope?.startsWith('public:')) { const error=new Error('Reserved public scopes cannot be used as privateScope.'); error.code='RESERVED_PRIVATE_SCOPE'; throw error; }
    const filter={scope:(actual,metadata)=>
      (metadata?.source_type==='legislation' && actual===publicScope) ||
      (metadata?.source_type==='user_document' && includeUserDocuments && Boolean(privateScope) && actual===privateScope)
    };
    if (sourceTypes?.length) filter.source_type=sourceTypes;
    const candidateLimit=Math.max(limit,Math.min(1000,this.vectorStore.count()));
    const candidates=this.vectorStore.search(queryVector,{limit:candidateLimit,filter,minScore:-1});
    return candidates.map(record=>{
      const evidenceLex=lexicalScore(q,record.text);
      const metadataLex=record.metadata?.source_type==='legislation'?lexicalScore(q,record.metadata?.search_metadata??''):0;
      const lex=Math.max(evidenceLex,metadataLex*0.85);
      const vector=clamp(record.vector_score,0,1);
      const relation=domainRelation(record.metadata,domain);
      const domainBoost=relation==='preferred'?0.08:0;
      const authorityBoost=record.metadata.source_type==='legislation'?0.04:record.metadata.source_type==='user_document'?0.03:0;
      const eligibilityPenalty=record.metadata.conclusion_eligible===false?0.25:0;
      const score=clamp(vector*0.55+lex*0.35+domainBoost+authorityBoost-eligibilityPenalty,0,1);
      return {
        id:record.id,text:record.text,metadata:{...record.metadata},score,
        score_components:{vector,lexical:lex,lexical_evidence:evidenceLex,lexical_metadata:metadataLex,domain_boost:domainBoost,authority_boost:authorityBoost,eligibility_penalty:eligibilityPenalty},
        domain_relation:relation,
        domain_explanation:relation==='cross_domain'?`Evidencia relevante fuera del área preferida: ${domain}.`:null,
        usable_for_current_conclusion:record.metadata.conclusion_eligible!==false
      };
    }).filter(r=>r.score>=minScore)
      .sort((a,b)=>b.score-a.score||b.score_components.lexical-a.score_components.lexical||a.id.localeCompare(b.id))
      .slice(0,limit);
  }
}
