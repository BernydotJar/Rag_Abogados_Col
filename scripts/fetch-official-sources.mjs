import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args=process.argv.slice(2);
const arg=(name,fallback=null)=>{const i=args.indexOf(name);return i>=0?args[i+1]:fallback};
const sourceId=arg('--source');
const all=args.includes('--all');
const out=path.resolve(arg('--out','/tmp/evidencia-juridica-official'));
const maxBytes=Number(arg('--max-bytes',20*1024*1024));
if(!all&&!sourceId) throw new Error('Use --all or --source <source_id>.');
if(process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0') throw new Error('TLS verification must not be disabled.');
if(!Number.isSafeInteger(maxBytes)||maxBytes<1024) throw new Error('Invalid --max-bytes.');

const registry=JSON.parse(fs.readFileSync(new URL('../data/legal/CO/upstream-sources.json',import.meta.url),'utf8'));
const allowedHosts=new Set(registry.policy.allowed_hosts);
const selected=all?registry.sources:registry.sources.filter(item=>item.source_id===sourceId);
if(!selected.length) throw new Error(`Unknown source ${sourceId}`);
fs.mkdirSync(out,{recursive:true});

const sha256=(buffer)=>crypto.createHash('sha256').update(buffer).digest('hex');
const safeName=(value)=>value.replace(/[^a-z0-9._-]/gi,'_');
async function readLimited(response){
  const chunks=[]; let total=0;
  for await (const chunk of response.body){
    total+=chunk.byteLength;
    if(total>maxBytes) throw new Error(`Source exceeds ${maxBytes} bytes.`);
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

const results=[];
for(const source of selected){
  const requested=new URL(source.official_url);
  if(requested.protocol!=='https:'||!allowedHosts.has(requested.hostname)) throw new Error(`Disallowed official URL for ${source.source_id}`);
  const response=await fetch(requested,{redirect:'follow',headers:{'user-agent':'EvidenciaJuridica/1.0 official-source-snapshot'}});
  const finalUrl=new URL(response.url);
  if(finalUrl.protocol!=='https:'||!allowedHosts.has(finalUrl.hostname)) throw new Error(`Redirect left official allowlist for ${source.source_id}`);
  if(!response.ok) throw new Error(`${source.source_id}: HTTP ${response.status}`);
  const contentType=response.headers.get('content-type')??'application/octet-stream';
  const mediaType=contentType.split(';',1)[0].trim().toLowerCase();
  const allowedMediaTypes=new Set(['text/html','application/xhtml+xml','application/pdf']);
  if(!allowedMediaTypes.has(mediaType)) throw new Error(`${source.source_id}: unsupported Content-Type ${contentType}`);
  const bytes=await readLimited(response);
  const ext=mediaType==='application/pdf'?'.pdf':'.html';
  const base=safeName(source.source_id);
  const rawPath=path.join(out,base+ext);
  const metadataPath=path.join(out,base+'.metadata.json');
  const digest=sha256(bytes);
  fs.writeFileSync(rawPath,bytes);
  const metadata={schema_version:'official-source-snapshot.v1',source_id:source.source_id,requested_url:source.official_url,final_url:response.url,status:response.status,content_type:contentType,bytes:bytes.length,sha256:digest,retrieved_at:new Date().toISOString(),transport:'https_tls_verified',certified_vigencia:false,registry_version_id:source.registry_version_id};
  fs.writeFileSync(metadataPath,JSON.stringify(metadata,null,2)+'\n');
  results.push({...metadata,raw_path:rawPath,metadata_path:metadataPath});
}
console.log(JSON.stringify({out,count:results.length,results},null,2));