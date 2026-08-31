import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LegalResearchController } from '../../src/ui/controller.mjs';
const registry=JSON.parse(fs.readFileSync('data/legal/CO/sources.json','utf8'));
const corpus=JSON.parse(fs.readFileSync('data/legal/CO/corpus.json','utf8'));
const fakeFetch=async (url)=>({ok:true,json:async()=>url.includes('sources.json')?registry:corpus});
test('controller initializes corpus through an injected fetch function',async()=>{
  const c=new LegalResearchController({fetchImpl:fakeFetch,scope:'session:test'});
  const snap=await c.initialize();
  assert.equal(snap.ready,true);assert.equal(snap.sourceCount,9);assert.equal(snap.evidenceCount,11);assert.equal(snap.scope,'session:test');
});