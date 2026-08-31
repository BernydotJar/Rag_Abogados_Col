import { foldForSearch, tokenize } from '../core/text.mjs';

const QUESTION_NOISE=new Set([
  'a','al','ante','bajo','con','contra','de','del','desde','el','en','entre','es','esta','este','la','las','lo','los','o','para','por','que','se','sin','su','sus','un','una','y',
  'cual','cuales','como','donde','cuando','quien','quienes','cuanto','cuantos','qué','cuál','cuáles','cómo','dónde','cuándo','quién','quiénes','cuánto','cuántos',
  'norma','normas','ley','leyes','articulo','articulos','codigo','codigos','derecho','juridico','juridica','legal','colombia','colombiano','colombiana','disponible','disponibles','corpus','evidencia','regla','reglas','requisito','requisitos','version','versiones','fuente','fuentes','actual','actualmente','vigente','vigencia','hoy','documento','documentos','privado','privada','privados','privadas','clausula','clausulas','mi','solo','relevante','relevantes'
]);
const DOMAIN_NOISE=new Set(['civil','laboral','penal','familia','familiar','constitucional','notarial','procesal','administrativo','administrativa']);
const INTENT_NOISE=new Set(['indica','indicar','muestra','mostrar','localiza','localizar','explica','explicar','dice','decir','establece','establecer','aplica','aplicable','aplicables','necesito','saber','consulta','consultar','busca','buscar','aparece','aparecen','compara','comparar','contrasta','contrastar','relaciona','relacionar','trata','sobre','habla','exige','exigir','afirma','afirmar','existe','existir','contenidas','dentro']);

const REQUIREMENT_RULES=Object.freeze({
  jurisprudence:/\b(jurisprud\w*|sentencia\w*|providencia\w*|precedente\w*|linea jurisprudencial|corte constitucional|corte suprema|consejo de estado)\b/i,
  change_comparison:/\b(que cambio|qué cambió|cambios?|reforma\w*|modific\w*|antes y despues|antes y después|version anterior|versión anterior|evolucion normativa|evolución normativa|afectacion normativa|afectación normativa)\b/i,
  deadline:/\b(plazo\w*|termino\w*|término\w*|prescrip\w*|caduc\w*|dias?|días?|horas?|meses?|anos?|años?)\b/i,
  competence:/\b(competencia(?:\s+territorial)?|territorial\w*|juez|jueces|tribunal|fuero|domicilio)\b/i,
  remedy:/\b(recurso\w*|apelacion|apelación|reposicion|reposición|queja|casacion|casación|impugnacion|impugnación|suplic\w*)\b/i,
  procedure:/\b(que debo hacer|qué debo hacer|como hago|cómo hago|como tramito|cómo tramito|como presento|cómo presento|como denuncio|cómo denuncio|como reclamo|cómo reclamo|como cobro|cómo cobro|como termino|cómo termino|tramite|trámite|procedimiento|pasos? para)\b/i,
  tariff:/\b(tarifa\w*|costo\w*|precio\w*|pesos?|cuanto cuesta|cuánto cuesta|iva|porcentaje|tasa exacta)\b/i,
  current_validity:/\b(vigente|vigencia|hoy|a la fecha|actualmente vigente|sigue vigente)\b/i
});

const REQUIREMENT_EVIDENCE=Object.freeze({
  deadline:/\b(plazo\w*|termino\w*|término\w*|prescrip\w*|caduc\w*|dias?|días?|horas?|meses?|anos?|años?)\b/i,
  competence:/\b(juez|jueces|tribunal|competencia|territorial\w*|fuero|domicilio)\b/i,
  remedy:/\b(recurso\w*|apelacion|apelación|reposicion|reposición|queja|casacion|casación|impugnacion|impugnación|suplic\w*)\b/i,
  procedure:/\b(presentar|radicar|solicitar|tramitar|denunciar|reclamar|demandar|notificar|conciliar|inscribir|acudir|interponer|procedimiento|tramite|trámite|pasos?)\b/i,
  tariff:/\b(tarifa\w*|costo\w*|precio\w*|pesos?|iva|porcentaje|tasa)\b/i
});

const numericOrTemporal=/\b(\d+[\.,]?\d*|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|quince|veinte|treinta|sesenta|noventa|ciento|ciento\s+ochenta)\s*(dias?|días?|horas?|meses?|anos?|años?|%|por ciento|pesos?)?\b/i;

function canonicalToken(value){
  const token=String(value);
  if(/^(prueba|pruebas|probar|prueba|pruebe|probado|probatoria|probatorio)$/.test(token))return 'prob';
  return token;
}

function tokenEquivalent(a,b){
  a=canonicalToken(a); b=canonicalToken(b);
  if(a===b)return true;
  if(a.length>=5&&b.length>=5&&(a.startsWith(b)||b.startsWith(a)))return true;
  if(a.length>=6&&b.length>=6&&a.slice(0,5)===b.slice(0,5))return true;
  return false;
}

export function classifySupportRequirements(question=''){
  const folded=foldForSearch(question);
  return Object.entries(REQUIREMENT_RULES).filter(([,rx])=>rx.test(folded)).map(([key])=>key);
}

export function subjectAnchors(question=''){
  const seen=new Set();
  const out=[];
  for(const token of tokenize(question)){
    if(token.length<3||QUESTION_NOISE.has(token)||DOMAIN_NOISE.has(token)||INTENT_NOISE.has(token))continue;
    if(/^[0-9]{4}$/.test(token))continue; // a year alone is context, not subject matter
    if(!seen.has(token)){seen.add(token);out.push(token);}
  }
  return out;
}

function anchorAssessment(question,result){
  const anchors=subjectAnchors(question);
  if(!anchors.length)return {pass:true,anchors,matched:[],coverage:1};
  const hayTokens=tokenize([result.text,result.metadata?.search_metadata,result.metadata?.identifier,result.metadata?.article_or_section].filter(Boolean).join(' '));
  const matched=anchors.filter(anchor=>hayTokens.some(token=>tokenEquivalent(anchor,token)));
  const coverage=matched.length/anchors.length;
  const minimumMatches=anchors.length===1?1:2;
  const pass=matched.length>=minimumMatches&&coverage>=0.40;
  return {pass,anchors,matched,coverage};
}

function hasComparativeEvidence(result,allResults){
  if(result.metadata?.change_evidence===true)return true;
  const article=result.metadata?.article_or_section;
  const sourceId=result.metadata?.source_id;
  const versions=new Set(allResults.filter(r=>r.metadata?.source_type==='legislation'&&r.metadata?.source_id===sourceId&&r.metadata?.article_or_section===article).map(r=>r.metadata?.version_id).filter(Boolean));
  return versions.size>=2;
}

function requirementAssessment(requirement,result,allResults){
  const searchable=[result.text,result.metadata?.search_text,result.metadata?.version_basis].filter(Boolean).join(' ');
  if(requirement==='jurisprudence') return result.metadata?.source_type==='jurisprudence';
  if(requirement==='change_comparison') return hasComparativeEvidence(result,allResults);
  if(requirement==='current_validity') return result.metadata?.certified_vigencia===true;
  if(requirement==='deadline') return REQUIREMENT_EVIDENCE.deadline.test(searchable)&&numericOrTemporal.test(searchable);
  if(requirement==='competence'){
    const cues=(foldForSearch(searchable).match(/\b(juez|jueces|tribunal|competencia|territorial\w*|fuero|domicilio)\b/g)??[]);
    return new Set(cues).size>=2;
  }
  if(requirement==='remedy') return REQUIREMENT_EVIDENCE.remedy.test(searchable);
  if(requirement==='procedure') return REQUIREMENT_EVIDENCE.procedure.test(searchable);
  if(requirement==='tariff') return REQUIREMENT_EVIDENCE.tariff.test(searchable)&&numericOrTemporal.test(searchable);
  return true;
}


export function assessSynthesisSupport(question='',result){
  const folded=foldForSearch(question);
  const parts=[];
  const tanto=folded.match(/tanto\s+(.+?)\s+como\s+(.+)/);
  const muestra=folded.match(/muestra\s+(.+?)\s+y\s+(.+)/);
  const relaciona=folded.match(/relaciona\s+(.+?)\s+con\s+(.+)/);
  const match=tanto??muestra??relaciona;
  if(match){parts.push(match[1],match[2]);}
  if(!parts.length)return {pass:false,parts:[]};
  const assessments=parts.map(part=>anchorAssessment(part,result));
  const pass=assessments.some(a=>a.matched.length>=1&&a.coverage>=0.50);
  return {pass,parts:assessments};
}

export function assessLegalSupport({question='',result,allResults=[]}={}){
  if(!result||result.metadata?.source_type!=='legislation')return {pass:false,reasons:['unsupported_source_type'],requirements:[],anchor:{pass:false,anchors:[],matched:[],coverage:0}};
  const requirements=classifySupportRequirements(question);
  const anchor=anchorAssessment(question,result);
  const failed=requirements.filter(req=>!requirementAssessment(req,result,allResults));
  const reasons=[];
  if(!anchor.pass)reasons.push('subject_anchor_mismatch');
  reasons.push(...failed.map(req=>`missing_${req}_evidence`));
  return {pass:anchor.pass&&failed.length===0,reasons,requirements,anchor};
}
