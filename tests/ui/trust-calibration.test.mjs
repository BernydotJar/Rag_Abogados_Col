import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { UI_MESSAGES } from '../../src/ui/i18n.mjs';

const app=fs.readFileSync('public/app.mjs','utf8');

test('primary evidence UI does not expose retrieval score as legal confidence',()=>{
  assert.doesNotMatch(app,/Math\.round\(result\.score\s*\*\s*100\)/);
  assert.match(app,/msg\.evidence\.score/);
  for(const locale of ['es','en','pt']) assert.match(UI_MESSAGES[locale].evidence.score,/no es confianza|not legal confidence|não é confiança/i);
});

test('lawyer query surface exposes capability boundary and research task presets',()=>{
  assert.match(app,/data-testid':'coverage-boundary/);
  for(const task of ['identify','proof','deadline','competence','change','jurisprudence','document']) assert.match(app,new RegExp(`'${task}'`));
  for(const locale of ['es','en','pt']) {
    assert.ok(UI_MESSAGES[locale].coverage.note.length>70);
    assert.ok(UI_MESSAGES[locale].coverage.jurisprudence.length>10);
    assert.ok(UI_MESSAGES[locale].tasks.examples.jurisprudence.length>15);
  }
});

test('insufficient evidence has proposition-specific recovery messages',()=>{
  for(const locale of ['es','en','pt']) for(const key of ['deadline','competence','remedy','procedure','change_comparison','jurisprudence','current_validity','tariff']) assert.ok(UI_MESSAGES[locale].answer.requirements[key].length>20,`${locale}.${key}`);
});

test('evidence verification and provenance are promoted above technical diagnostics',()=>{
  const sourceAction=app.indexOf('evidence-source-action');
  const diagnostics=app.indexOf("const diag=node('details'");
  assert.ok(sourceAction>0&&diagnostics>sourceAction);
  assert.match(app,/evidence-provenance/);
  assert.match(app,/msg\.evidence\.verified/);
  assert.match(app,/msg\.evidence\.version/);
});
