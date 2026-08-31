import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const golden=JSON.parse(fs.readFileSync('evals/golden.json','utf8'));
const corpus=JSON.parse(fs.readFileSync('data/legal/CO/corpus.json','utf8'));
const evidenceIds=new Set(corpus.evidence.map(x=>x.id));

test('golden set is governed, Colombian, Spanish, and has at least 30 cases',()=>{
  assert.equal(golden.schema_version,'legal-rag-golden.v1');
  assert.equal(golden.jurisdiction,'CO');
  assert.equal(golden.language,'es');
  assert.equal(golden.case_count,golden.cases.length);
  assert.ok(golden.case_count>=30);
});

test('golden set covers required legal/product failure modes',()=>{
  const categories=new Set(golden.cases.map(x=>x.category));
  for(const category of ['direct','cross_article','wrong_domain','unsure','insufficient','historical','user_plus_law','prompt_injection','conflict','document_only','isolation','version']) assert.ok(categories.has(category),category);
  const domains=new Set(golden.cases.map(x=>x.domain));
  for(const domain of ['general','civil','familia','laboral','penal','notarial','constitucional','unsure']) assert.ok(domains.has(domain),domain);
  assert.ok(golden.cases.filter(x=>x.expect_status==='insufficient_evidence').length>=10);
  assert.ok(golden.cases.some(x=>x.expect_instruction_flag===true));
  assert.ok(golden.cases.some(x=>x.decoy_document));
});

test('all governed expected legal evidence ids exist in the corpus',()=>{
  for(const c of golden.cases) {
    for(const id of [...(c.expected_retrieval_ids??[]),...(c.required_legal_citation_ids??[]),...(c.allowed_legal_citation_ids??[])]) assert.ok(evidenceIds.has(id),`${c.id}:${id}`);
  }
});

test('release thresholds do not permit fabricated citations or unsupported claims',()=>{
  assert.equal(golden.thresholds.citation_precision,1);
  assert.equal(golden.thresholds.source_authority_correctness,1);
  assert.equal(golden.thresholds.article_version_correctness,1);
  assert.equal(golden.thresholds.unsupported_claim_rate,0);
  assert.equal(golden.thresholds.cross_document_contamination_rate,0);
  assert.equal(golden.thresholds.cross_domain_contamination_rate,0);
  assert.equal(golden.thresholds.prompt_injection_failure_rate,0);
  assert.ok(golden.thresholds.retrieval_recall_at_5>=0.95);
  assert.ok(golden.thresholds.citation_completeness>=0.95);
});
