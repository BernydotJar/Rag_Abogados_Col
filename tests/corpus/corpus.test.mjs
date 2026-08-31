import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { validateColombiaPack, COLOMBIA_DOMAINS } from '../../src/jurisdictions/colombia.mjs';

const registry=JSON.parse(fs.readFileSync('data/legal/CO/sources.json','utf8'));
const corpus=JSON.parse(fs.readFileSync('data/legal/CO/corpus.json','utf8'));

test('jurisdiction pack is explicit, partial and demo-only',()=>{
  assert.deepEqual(registry.jurisdiction,{country:'Colombia',code:'CO',language:'es',demo_only:true});
  assert.equal(corpus.coverage,'partial_demo');
  assert.deepEqual(COLOMBIA_DOMAINS,['general','civil','familia','laboral','penal','notarial','constitucional','unsure']);
});

test('minimum official-source inventory is present',()=>{
  assert.equal(registry.sources.length,9);
  const ids=new Set(registry.sources.map(s=>s.id));
  for (const id of ['co-constitution-1991','co-civil-1873','co-labor-code','co-cgp-2012','co-penal-2000','co-cpp-2004','co-notariado-960-1970','co-civil-registry-1260-1970','co-childhood-1098-2006']) assert.ok(ids.has(id),id);
});

test('source provenance fields and registry hashes are complete',()=>{
  const required=['jurisdiction','authority','source_type','norm_type','identifier','official_title','source_url','publication_date','effective_from','effective_to','last_verified_at','version_id','sha256','supersedes','superseded_by','retrieval_domains'];
  for (const source of registry.sources) {
    for (const key of required) assert.ok(Object.hasOwn(source,key),`${source.id}:${key}`);
    assert.match(source.source_url,/^https:\/\/www\.suin-juriscol\.gov\.co\/viewDocument\.asp\?id=/);
    assert.equal(source.certified_vigencia,false);
    assert.equal(source.hash_scope,'governed_demo_snapshot_v1');
    const copy={...source}; delete copy.sha256;
    const snapshot={source:copy,evidence:corpus.evidence.filter(e=>e.source_id===source.id)};
    const hash=crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
    assert.equal(source.sha256,hash,source.id);
  }
});

test('evidence is traceable, article-scoped and hash verified',()=>{
  assert.ok(corpus.evidence.length>=9);
  const sourceIds=new Set(registry.sources.map(s=>s.id));
  for (const item of corpus.evidence) {
    assert.ok(sourceIds.has(item.source_id),item.id);
    assert.equal(item.source_type,'legislation');
    assert.ok(item.article_or_section);
    assert.ok(item.version_id);
    assert.ok(item.version_basis);
    assert.ok(Object.hasOwn(item,'effective_from'));
    assert.ok(Object.hasOwn(item,'effective_to'));
    assert.ok(item.text.length>20);
    assert.equal(item.sha256,crypto.createHash('sha256').update(item.text).digest('hex'));
  }
});

test('notarial base is not eligible for current legal conclusion',()=>{
  const source=registry.sources.find(s=>s.id==='co-notariado-960-1970');
  const evidence=corpus.evidence.find(e=>e.source_id===source.id);
  assert.equal(source.effective_to,'1999-03-10');
  assert.equal(source.article_level_review_required,true);
  assert.equal(source.current_conclusion_eligible,false);
  assert.equal(evidence.conclusion_eligible,false);
  assert.equal(evidence.vigencia_status,'unresolved_current_status');
});

test('recent labor modification and family minimum are visible',()=>{
  assert.match(registry.sources.find(s=>s.id==='co-labor-code').version_note,/Ley 2466 de 2025/);
  assert.match(corpus.evidence.find(e=>e.id==='co-cst-art23').version_id,/ley2466-2025/);
  assert.match(corpus.evidence.find(e=>e.id==='co-civil-art1502').text,/objeto lícito/);
  assert.ok(registry.sources.find(s=>s.id==='co-childhood-1098-2006').retrieval_domains.includes('familia'));
});

test('pack validator rejects source-type mixing and accepts governed snapshot',()=>{
  const result=validateColombiaPack({registry,corpus});
  assert.deepEqual(result,{valid:true,errors:[],source_count:9,evidence_count:11});
  const bad=structuredClone(registry); bad.sources[0].source_type='editorial';
  const invalid=validateColombiaPack({registry:bad,corpus});
  assert.equal(invalid.valid,false);
  assert.ok(invalid.errors.some(e=>e.includes('must remain legislation')));
});
