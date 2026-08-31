import test from 'node:test';
import assert from 'node:assert/strict';
import { UI_MESSAGES,t } from '../../src/ui/i18n.mjs';

test('ES EN PT expose the same top-level i18n contract',()=>{
  const es=Object.keys(UI_MESSAGES.es).sort();
  for (const locale of ['en','pt']) assert.deepEqual(Object.keys(UI_MESSAGES[locale]).sort(),es);
});

test('domain and privacy copy exist in every locale',()=>{
  for (const locale of ['es','en','pt']) {
    for (const domain of ['general','civil','familia','laboral','penal','notarial','constitucional','unsure']) assert.notEqual(t(locale,`domains.${domain}`),`domains.${domain}`);
    assert.ok(t(locale,'upload.warning').length>25);
    assert.ok(t(locale,'privacy.body').length>50);
  }
});