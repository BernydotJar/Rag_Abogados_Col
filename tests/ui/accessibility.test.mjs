import test from 'node:test';
import assert from 'node:assert/strict';
import { UI_MESSAGES } from '../../src/ui/i18n.mjs';
function luminance(hex){const v=hex.match(/\w\w/g).map(x=>parseInt(x,16)/255).map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4);return 0.2126*v[0]+0.7152*v[1]+0.0722*v[2]}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)}
test('core palette meets AA text contrast and non-text focus contrast',()=>{
  assert.ok(contrast('#1f2528','#f7f5f0')>=4.5);
  assert.ok(contrast('#626b70','#f7f5f0')>=4.5);
  assert.ok(contrast('#626b70','#fffdf9')>=4.5);
  assert.ok(contrast('#ffffff','#253b55')>=4.5);
  assert.ok(contrast('#6d3d48','#faf4f5')>=4.5);
  assert.ok(contrast('#43688e','#f7f5f0')>=3);
});
test('professional brand does not expose RAG implementation jargon',()=>{
  for(const locale of ['es','en','pt']) assert.ok(!/\bRAG\b/i.test(UI_MESSAGES[locale].appName));
});
