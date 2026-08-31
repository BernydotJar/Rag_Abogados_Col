import test from 'node:test';
import assert from 'node:assert/strict';
import { assessLegalSupport,classifySupportRequirements,subjectAnchors } from '../../src/answer/support-policy.mjs';

const result=(text,metadata={})=>({id:'x',text,metadata:{source_type:'legislation',search_metadata:'Código General del Proceso Artículo 167',...metadata}});

test('classifies proposition-specific legal support requirements',()=>{
  assert.deepEqual(classifySupportRequirements('¿Cuál es el término para contestar una demanda?'),['deadline']);
  assert.ok(classifySupportRequirements('¿Qué cambió con la reforma laboral de 2025?').includes('change_comparison'));
  assert.ok(classifySupportRequirements('¿Qué sentencia reciente fijó este precedente?').includes('jurisprudence'));
  assert.ok(classifySupportRequirements('¿Qué juez es territorialmente competente?').includes('competence'));
});

test('subject anchors discount generic legal and domain words',()=>{
  const anchors=subjectAnchors('¿Qué norma civil aplica al arrendamiento del inmueble?');
  assert.ok(anchors.includes('arrendamiento'));
  assert.ok(anchors.includes('inmueble'));
  assert.ok(!anchors.includes('norma'));
  assert.ok(!anchors.includes('civil'));
});

test('related but non-responsive evidence fails subject support',()=>{
  const labor=result('Para que haya contrato de trabajo se requiere actividad personal, subordinación y salario.',{search_metadata:'Código Sustantivo del Trabajo Artículo 23'});
  const assessment=assessLegalSupport({question:'¿Cómo termino un contrato de arrendamiento y recupero el inmueble?',result:labor,allResults:[labor]});
  assert.equal(assessment.pass,false);
  assert.ok(assessment.reasons.includes('subject_anchor_mismatch'));
});

test('deadline needs actual deadline evidence, not merely civil metadata',()=>{
  const registry=result('Los hechos y actos relativos al estado civil deben ser inscritos en el registro civil.',{search_metadata:'Decreto 1260 de 1970 Artículo 5'});
  const assessment=assessLegalSupport({question:'¿Cuál es el término para contestar una demanda civil?',result:registry,allResults:[registry]});
  assert.equal(assessment.pass,false);
  assert.ok(assessment.reasons.includes('missing_deadline_evidence'));
});

test('current validity requires governed certification, not a current-looking version label',()=>{
  const law=result('Esta disposición establece una regla.',{certified_vigencia:false,version_id:'2026'});
  const assessment=assessLegalSupport({question:'¿Esta norma sigue vigente hoy?',result:law,allResults:[law]});
  assert.equal(assessment.pass,false);
  assert.ok(assessment.reasons.includes('missing_current_validity_evidence'));
});

test('change questions require comparative version evidence',()=>{
  const law=result('Para que haya contrato de trabajo se requieren tres elementos.',{source_id:'cst',article_or_section:'23',version_id:'2025'});
  const assessment=assessLegalSupport({question:'¿Qué cambió con la reforma laboral de 2025 respecto del contrato de trabajo?',result:law,allResults:[law]});
  assert.equal(assessment.pass,false);
  assert.ok(assessment.reasons.includes('missing_change_comparison_evidence'));
});
