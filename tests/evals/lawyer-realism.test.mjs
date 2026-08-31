import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const spec=JSON.parse(fs.readFileSync('evals/lawyer-realism.json','utf8'));

test('lawyer realism benchmark has at least 100 governed cases and zero false-support tolerance',()=>{
  assert.ok(spec.cases.length>=100);
  assert.equal(spec.thresholds.false_supported_rate,0);
  assert.equal(spec.thresholds.expected_supported_recall,1);
  assert.equal(spec.thresholds.behavior_accuracy,1);
});

test('benchmark mixes positive evidence queries with realistic near misses',()=>{
  const statuses=new Set(spec.cases.map(x=>x.expected_status));
  assert.deepEqual([...statuses].sort(),['insufficient_evidence','supported']);
  for(const category of ['deadline','competence','procedure','jurisprudence','change_comparison','current_validity','tariff']) assert.ok(spec.cases.some(x=>x.category===category),category);
});
