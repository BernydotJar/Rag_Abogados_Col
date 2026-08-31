import { foldForSearch } from '../core/text.mjs';

const INJECTION_PATTERNS=[
  /ignora(r|e)? (todas |las )?(instrucciones|reglas|politicas)/,
  /ignore (all |the )?(previous |system )?(instructions|rules|policy)/,
  /nao siga (as )?(instrucoes|regras)/,
  /(system prompt|prompt del sistema|prompt de sistema)/,
  /(revela|reveal|exponha).{0,40}(secreto|secret|token|credencial)/,
  /(override|sobrescribe|sustituye).{0,30}(system|sistema|policy|politica)/,
  /(ejecuta|execute|run).{0,30}(codigo|code|comando|command)/
];

export function detectInstructionRisk(text) {
  const normalized=foldForSearch(String(text??'')).replace(/[\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g,'');
  const matches=INJECTION_PATTERNS.flatMap((pattern)=>normalized.match(pattern)?.[0]?[pattern.source]:[]);
  return {untrusted_content:true,instruction_like:matches.length>0,pattern_count:matches.length,matched_patterns:matches};
}

export function assertPrivateScope(scope) {
  if(typeof scope!=='string'||scope.length<4) { const e=new Error('Private scope is required.'); e.code='PRIVATE_SCOPE_REQUIRED'; throw e; }
  if(scope.startsWith('public:')) { const e=new Error('Public namespaces are reserved.'); e.code='RESERVED_PUBLIC_SCOPE'; throw e; }
  return scope;
}

export function auditPrivateDocumentMetadata(metadata) {
  const findings=[];
  if(!metadata||typeof metadata!=='object') return {safe:false,findings:['metadata_missing']};
  for(const forbidden of ['text','raw_text','content','extracted_text','vector','embedding']) if(Object.hasOwn(metadata,forbidden)) findings.push(`forbidden_content_field:${forbidden}`);
  if(metadata.visibility!=='session_private') findings.push('visibility_not_session_private');
  try{assertPrivateScope(metadata.scope)}catch(error){findings.push(error.code??'invalid_scope')}
  if(!metadata.sha256||!/^[a-f0-9]{64}$/.test(metadata.sha256)) findings.push('invalid_sha256');
  return {safe:findings.length===0,findings};
}

export function safeUiError(error) {
  const code=String(error?.code??'OPERATION_FAILED').replace(/[^A-Z0-9_]/gi,'_').slice(0,64).toUpperCase();
  return {message_key:'status.error',diagnostic_code:code};
}

export function isAllowedRuntimeNetworkTarget(url,origin) {
  const parsed=new URL(url,origin);
  if(parsed.origin!==origin) return false;
  const pathname=parsed.pathname.replace(/\/{2,}/g,'/');
  return ['/data/legal/','/src/','/public/'].some(segment=>pathname.includes(segment));
}