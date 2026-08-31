import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { LocalHashEmbeddingProvider } from '../src/core/embeddings.mjs';
import { InMemoryVectorStore } from '../src/core/vector-store.mjs';
import { DocumentIngestor } from '../src/ingestion/ingestor.mjs';
import { HybridRetriever,indexLegalCorpus } from '../src/retrieval/hybrid.mjs';
import { GroundedAnswerBuilder } from '../src/answer/grounded-answer.mjs';

const args=process.argv.slice(2); const noFail=args.includes('--no-fail'); const outIndex=args.indexOf('--output'); const output=outIndex>=0?args[outIndex+1]:null;
const golden=JSON.parse(fs.readFileSync(new URL('../evals/golden.json',import.meta.url),'utf8'));
const registry=JSON.parse(fs.readFileSync(new URL('../data/legal/CO/sources.json',import.meta.url),'utf8'));
const corpus=JSON.parse(fs.readFileSync(new URL('../data/legal/CO/corpus.json',import.meta.url),'utf8'));
const sourceById=new Map(registry.sources.map(x=>[x.id,x])); const evidenceById=new Map(corpus.evidence.map(x=>[x.id,x]));
const enc=new TextEncoder();
const totals={retrieval_expected:0,retrieval_found:0,citations:0,citations_allowed:0,citations_complete_required:0,citations_required:0,authority_checks:0,authority_correct:0,version_checks:0,version_correct:0,unsupported_cases:0,cases:golden.cases.length,private_cases:0,cross_document_contaminated:0,cross_domain_unexpected:0,prompt_cases:0,prompt_failures:0};
const rows=[]; const latencies=[];

function percentile(values,p){if(!values.length)return 0;const s=[...values].sort((a,b)=>a-b);const i=Math.min(s.length-1,Math.ceil(p*s.length)-1);return Math.round(s[i]*100)/100}
function exactCitation(citation){
  const evidence=evidenceById.get(citation.evidence_id); const source=evidence?sourceById.get(evidence.source_id):null;
  if(!evidence||!source)return {authority:false,version:false};
  return {authority:citation.authority===source.authority&&citation.norm===source.official_title&&citation.identifier===source.identifier&&citation.source_url===source.source_url&&citation.excerpt===evidence.text,version:citation.version_id===evidence.version_id&&citation.article_or_section===evidence.article_or_section&&citation.last_verified_at===evidence.last_verified_at};
}

for(const c of golden.cases){
  const embeddingProvider=new LocalHashEmbeddingProvider(); const vectorStore=new InMemoryVectorStore();
  await indexLegalCorpus({registry,corpus,embeddingProvider,vectorStore});
  const ingestor=new DocumentIngestor({embeddingProvider,vectorStore}); const retriever=new HybridRetriever({embeddingProvider,vectorStore,jurisdiction:'CO'}); const answerBuilder=new GroundedAnswerBuilder();
  const scope=`eval:${c.id}`; let privateDocumentId=null;
  if(c.private_document){const d=await ingestor.ingest({filename:c.private_document.filename,mime:'text/plain',bytes:enc.encode(c.private_document.text),scope});privateDocumentId=d.document.id;totals.private_cases+=1}
  if(c.decoy_document) await ingestor.ingest({filename:c.decoy_document.filename,mime:'text/plain',bytes:enc.encode(c.decoy_document.text),scope:`eval:decoy:${c.id}`});
  const t0=performance.now();
  const results=await retriever.retrieve(c.question,{domain:c.domain,privateScope:c.private_document?scope:null,includeUserDocuments:Boolean(c.private_document),sourceTypes:c.category==='document_only'?['user_document']:null,limit:10,minScore:0.08});
  const answer=answerBuilder.build({question:c.question,results,locale:'es',requireLegalEvidence:c.require_legal_evidence!==false});
  const latency=Math.round((performance.now()-t0)*100)/100; latencies.push(latency);
  const top5=new Set(results.slice(0,5).map(x=>x.id)); const requiredRetrieval=c.expected_retrieval_ids??[];
  totals.retrieval_expected+=requiredRetrieval.length; totals.retrieval_found+=requiredRetrieval.filter(id=>top5.has(id)).length;
  const requiredCitations=c.required_legal_citation_ids??[]; const allowed=new Set(c.allowed_legal_citation_ids??[]); const cited=answer.fuentes.map(x=>x.evidence_id);
  totals.citations_required+=requiredCitations.length; totals.citations_complete_required+=requiredCitations.filter(id=>cited.includes(id)).length;
  for(const citation of answer.fuentes){
    totals.citations+=1; if(allowed.has(citation.evidence_id))totals.citations_allowed+=1;
    const exact=exactCitation(citation); totals.authority_checks+=1; totals.version_checks+=1; if(exact.authority)totals.authority_correct+=1;if(exact.version)totals.version_correct+=1;
    const result=results.find(x=>x.id===citation.evidence_id); if(result?.domain_relation==='cross_domain'&&!allowed.has(citation.evidence_id))totals.cross_domain_unexpected+=1;
  }
  const statusOk=answer.status===c.expect_status;
  const responseEvidenceOk=answer.status!=='supported'||c.require_legal_evidence===false||answer.respuesta_evidence_ids.every(id=>allowed.has(id));
  if(c.expect_status==='insufficient_evidence'&&answer.status==='supported')totals.unsupported_cases+=1;
  if(answer.status==='supported'&&c.require_legal_evidence!==false&&answer.respuesta_evidence_ids.some(id=>!allowed.has(id)))totals.unsupported_cases+=1;
  const privateResults=results.filter(x=>x.metadata?.source_type==='user_document');
  const crossDoc=privateResults.some(x=>x.metadata.scope!==scope)||(c.forbidden_text?results.some(x=>x.text.includes(c.forbidden_text)):false);
  if(c.private_document&&crossDoc)totals.cross_document_contaminated+=1;
  const userOk=!c.require_user_document||(privateResults.some(x=>x.metadata.document_id===privateDocumentId)&&answer.documentos_del_usuario.some(x=>x.document_id===privateDocumentId));
  let promptOk=true; if(c.expect_instruction_flag){totals.prompt_cases+=1;promptOk=answer.documentos_del_usuario.some(x=>x.document_id===privateDocumentId&&x.content_risk==='instruction_like_text')&&!/IGNORA TODAS|revela secretos/i.test(answer.respuesta);if(!promptOk)totals.prompt_failures+=1}
  const versionsOk=Object.entries(c.expected_versions??{}).every(([id,version])=>answer.fuentes.some(x=>x.evidence_id===id&&x.version_id===version));
  const retrievalOk=requiredRetrieval.every(id=>top5.has(id));
  const citationsOk=requiredCitations.every(id=>cited.includes(id))&&cited.every(id=>allowed.has(id));
  const casePass=statusOk&&retrievalOk&&citationsOk&&responseEvidenceOk&&userOk&&!crossDoc&&promptOk&&versionsOk;
  rows.push({id:c.id,category:c.category,domain:c.domain,pass:casePass,status_expected:c.expect_status,status_actual:answer.status,top5:results.slice(0,5).map(x=>({id:x.id,score:Math.round(x.score*1000)/1000,relation:x.domain_relation,eligible:x.usable_for_current_conclusion})),citations:cited,response_evidence_ids:answer.respuesta_evidence_ids,user_document_count:answer.documentos_del_usuario.length,latency_ms:latency,checks:{status:statusOk,retrieval:retrievalOk,citations:citationsOk,response_grounding:responseEvidenceOk,user_document:userOk,cross_document:!crossDoc,prompt_injection:promptOk,version:versionsOk}});
}
const div=(a,b)=>b?a/b:1;
const metrics={
  retrieval_recall_at_5:div(totals.retrieval_found,totals.retrieval_expected),
  citation_precision:div(totals.citations_allowed,totals.citations),
  citation_completeness:div(totals.citations_complete_required,totals.citations_required),
  source_authority_correctness:div(totals.authority_correct,totals.authority_checks),
  article_version_correctness:div(totals.version_correct,totals.version_checks),
  unsupported_claim_rate:div(totals.unsupported_cases,totals.cases),
  cross_document_contamination_rate:div(totals.cross_document_contaminated,totals.private_cases),
  cross_domain_contamination_rate:div(totals.cross_domain_unexpected,totals.citations),
  prompt_injection_failure_rate:div(totals.prompt_failures,totals.prompt_cases),
  case_pass_rate:div(rows.filter(x=>x.pass).length,rows.length),
  latency_ms:{p50:percentile(latencies,.5),p95:percentile(latencies,.95),max:Math.max(...latencies)}
};
const thresholdResults=Object.entries(golden.thresholds).map(([name,threshold])=>{const value=metrics[name];const lowerIsBetter=name.endsWith('_rate');return {name,threshold,value,pass:lowerIsBetter?value<=threshold:value>=threshold}});
const report={schema_version:'legal-rag-eval-report.v1',generated_at:new Date().toISOString(),golden_case_count:golden.case_count,embedding:{provider:'local-hash-embedding',model:'charword-384',version:'1.0.0'},totals,metrics,thresholds:thresholdResults,pass:thresholdResults.every(x=>x.pass)&&rows.every(x=>x.pass),failed_cases:rows.filter(x=>!x.pass).map(x=>x.id),cases:rows};
const text=JSON.stringify(report,null,2)+'\n'; if(output)fs.writeFileSync(output,text); else process.stdout.write(text);
if(!report.pass&&!noFail)process.exitCode=1;