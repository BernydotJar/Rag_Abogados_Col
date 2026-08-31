import { buildCitation } from './citations.mjs';
import { messageSet } from './messages.mjs';
import { tokenize } from '../core/text.mjs';

const instructionLike=(text)=>/(ignora|ignore|system prompt|instrucciones del sistema|revela|override|do not follow|no sigas)/i.test(String(text));
const OVERLAP_STOPWORDS=new Set(['a','al','ante','bajo','con','contra','de','del','desde','el','en','entre','es','esta','este','la','las','lo','los','o','para','por','que','se','sin','su','sus','un','una','y']);
function contentOverlap(a,b) {
  const left=[...new Set(tokenize(a).filter(t=>t.length>2&&!OVERLAP_STOPWORDS.has(t)))];
  const right=new Set(tokenize(b).filter(t=>t.length>2&&!OVERLAP_STOPWORDS.has(t)));
  if(!left.length||!right.size)return 0;
  const matched=left.filter(t=>right.has(t)).length;
  return matched/Math.min(left.length,right.size);
}

export class GroundedAnswerBuilder {
  constructor({
    minEvidenceScore=0.30,
    minLegalLexicalScore=0.13,
    minUnscopedLegalLexicalScore=0.20,
    minLegalMetadataScore=0.35,
    minLegalRelativeScore=0.70,
    minUserDocumentScore=0.20,
    minDocumentCorroboration=0.20
  }={}) {
    this.minEvidenceScore=minEvidenceScore;
    this.minLegalLexicalScore=minLegalLexicalScore;
    this.minUnscopedLegalLexicalScore=minUnscopedLegalLexicalScore;
    this.minLegalMetadataScore=minLegalMetadataScore;
    this.minLegalRelativeScore=minLegalRelativeScore;
    this.minUserDocumentScore=minUserDocumentScore;
    this.minDocumentCorroboration=minDocumentCorroboration;
  }

  build({question='',results=[],locale='es',requireLegalEvidence=true,knownMissing=[]}={}) {
    const msg=messageSet(locale);
    const userDocs=results.filter(r=>r.metadata?.source_type==='user_document'&&Number(r.score)>=this.minUserDocumentScore);
    const legalCandidates=results.filter(r=>{
      if(r.metadata?.source_type!=='legislation'||Number(r.score)<this.minEvidenceScore)return false;
      const evidenceLex=Number(r.score_components?.lexical_evidence??r.score_components?.lexical??0);
      const metadataLex=Number(r.score_components?.lexical_metadata??0);
      const corroborated=userDocs.some(doc=>contentOverlap(r.text,doc.text)>=this.minDocumentCorroboration);
      const specific=evidenceLex>=this.minLegalLexicalScore||metadataLex>=this.minLegalMetadataScore||corroborated;
      if(!specific)return false;
      if(r.domain_relation==='unscoped'&&evidenceLex<this.minUnscopedLegalLexicalScore&&metadataLex<this.minLegalMetadataScore&&!corroborated)return false;
      return true;
    });
    const strongestLegalScore=legalCandidates.reduce((max,r)=>Math.max(max,Number(r.score)),0);
    const legalRelevant=legalCandidates.filter(r=>strongestLegalScore===0||Number(r.score)>=strongestLegalScore*this.minLegalRelativeScore);
    const legalEligible=legalRelevant.filter(r=>r.usable_for_current_conclusion!==false);
    const legalBlocked=legalRelevant.filter(r=>r.usable_for_current_conclusion===false);
    const relevant=[...legalRelevant,...userDocs];
    const usable=requireLegalEvidence?legalEligible:[...legalEligible,...userDocs];
    const citationPairs=relevant.map(r=>({result:r,citation:buildCitation(r)}));
    const invalid=citationPairs.filter(x=>!x.citation.valid);
    const legalCitations=citationPairs.filter(x=>x.citation.valid&&x.citation.source_type==='legislation').map(x=>x.citation);
    const docCitations=citationPairs.filter(x=>x.citation.valid&&x.citation.source_type==='user_document').map(x=>({...x.citation,content_risk:instructionLike(x.citation.excerpt)?'instruction_like_text':null}));
    const hasSupport=usable.length>0 && invalid.filter(x=>usable.includes(x.result)).length===0;
    const status=hasSupport?'supported':'insufficient_evidence';
    const top=hasSupport?(legalEligible[0]??userDocs[0]):null;
    const respuesta=hasSupport?`${msg.supported} ${top.text}`:msg.insufficient;
    const respuestaEvidenceIds=top?[top.id]:[];
    const fundamento=hasSupport?legalEligible.map(r=>({evidence_id:r.id,statement:r.text,score:r.score,domain_relation:r.domain_relation,usable_for_current_conclusion:true})):[];
    const missing=[...knownMissing];
    if (requireLegalEvidence&&!legalEligible.length) missing.push(msg.missingLegal);
    for (const x of invalid) missing.push(`Citation metadata incomplete for ${x.citation.evidence_id??'unknown evidence'}: ${x.citation.missing.join(', ')}.`);
    const limits=[msg.partial,msg.professional];
    if (legalBlocked.length) limits.push(msg.historical);
    if (relevant.some(r=>r.domain_relation==='cross_domain')) limits.push(msg.crossDomain);
    return {
      contract_version:'grounded-legal-answer.v1',locale,question,status,labels:msg.labels,
      respuesta,respuesta_evidence_ids:respuestaEvidenceIds,fundamento,fuentes:legalCitations,documentos_del_usuario:docCitations,
      informacion_que_falta:[...new Set(missing)],limites:[...new Set(limits)],
      grounding:{policy:{min_evidence_score:this.minEvidenceScore,min_legal_lexical_score:this.minLegalLexicalScore,min_unscoped_legal_lexical_score:this.minUnscopedLegalLexicalScore,min_legal_metadata_score:this.minLegalMetadataScore,min_legal_relative_score:this.minLegalRelativeScore,min_user_document_score:this.minUserDocumentScore,min_document_corroboration:this.minDocumentCorroboration,mode:'extractive_evidence_only',require_legal_evidence:requireLegalEvidence},response_evidence_ids:respuestaEvidenceIds,evidence_ids:[...new Set([...fundamento.map(x=>x.evidence_id),...docCitations.map(x=>x.evidence_id)])],citation_failures:invalid.map(x=>x.citation),authoritative_quote_language:'es',translated_authority_quotes:false}
    };
  }
}
