import fs from 'node:fs';
import { LocalHashEmbeddingProvider } from '../src/core/embeddings.mjs';
import { InMemoryVectorStore } from '../src/core/vector-store.mjs';
import { HybridRetriever,indexLegalCorpus } from '../src/retrieval/hybrid.mjs';
import { GroundedAnswerBuilder } from '../src/answer/grounded-answer.mjs';

const registry=JSON.parse(fs.readFileSync(new URL('../data/legal/CO/sources.json',import.meta.url),'utf8'));
const corpus=JSON.parse(fs.readFileSync(new URL('../data/legal/CO/corpus.json',import.meta.url),'utf8'));
const spec=JSON.parse(fs.readFileSync(new URL('../evals/lawyer-realism.json',import.meta.url),'utf8'));
const embeddingProvider=new LocalHashEmbeddingProvider();
const vectorStore=new InMemoryVectorStore();
await indexLegalCorpus({registry,corpus,embeddingProvider,vectorStore});
const retriever=new HybridRetriever({embeddingProvider,vectorStore,jurisdiction:'CO'});
const builder=new GroundedAnswerBuilder();
const rows=[];
for(const item of spec.cases){
  const results=await retriever.retrieve(item.question,{domain:item.domain,limit:10});
  const answer=builder.build({question:item.question,results,locale:'es'});
  const actualIds=answer.fuentes.filter(x=>x.conclusion_eligible!==false).map(x=>x.evidence_id);
  const expectedIds=item.expected_evidence_ids??[];
  const evidenceOk=expectedIds.every(id=>actualIds.includes(id));
  const statusOk=answer.status===item.expected_status;
  rows.push({id:item.id,category:item.category,question:item.question,expected_status:item.expected_status,actual_status:answer.status,status_ok:statusOk,evidence_ok:evidenceOk,expected_evidence_ids:expectedIds,actual_evidence_ids:actualIds,support_requirements:answer.grounding.support_requirements,rejected_support:answer.grounding.rejected_support.map(x=>({evidence_id:x.evidence_id,reasons:x.reasons,anchor_coverage:x.anchor.coverage}))});
}
const expectedInsufficient=rows.filter(x=>x.expected_status==='insufficient_evidence');
const expectedSupported=rows.filter(x=>x.expected_status==='supported');
const falseSupported=expectedInsufficient.filter(x=>x.actual_status==='supported');
const supportedHits=expectedSupported.filter(x=>x.actual_status==='supported'&&x.evidence_ok);
const correct=rows.filter(x=>x.status_ok&&(x.expected_status!=='supported'||x.evidence_ok));
const metrics={
  total:rows.length,
  expected_supported:expectedSupported.length,
  expected_insufficient:expectedInsufficient.length,
  correct:correct.length,
  behavior_accuracy:correct.length/rows.length,
  false_supported:falseSupported.length,
  false_supported_rate:expectedInsufficient.length?falseSupported.length/expectedInsufficient.length:0,
  expected_supported_recall:expectedSupported.length?supportedHits.length/expectedSupported.length:1
};
const pass=rows.length>=spec.minimum_cases&&metrics.false_supported_rate<=spec.thresholds.false_supported_rate&&metrics.expected_supported_recall>=spec.thresholds.expected_supported_recall&&metrics.behavior_accuracy>=spec.thresholds.behavior_accuracy;
const report={schema_version:'lawyer-realism-report.v1',generated_at:new Date().toISOString(),metrics,pass,failures:rows.filter(x=>!(x.status_ok&&(x.expected_status!=='supported'||x.evidence_ok))),cases:rows};
const json=JSON.stringify(report,null,2);
if(process.argv.includes('--write')) fs.writeFileSync(new URL('../program/agents/lawyer-readiness/run-011/lawyer-realism-report.json',import.meta.url),json+'\n');
console.log(json);
if(!pass)process.exitCode=1;
