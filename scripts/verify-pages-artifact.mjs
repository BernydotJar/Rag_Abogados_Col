import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args=process.argv.slice(2);
const arg=(name,fallback)=>{const i=args.indexOf(name);return i>=0?args[i+1]:fallback};
const root=path.resolve(arg('--root','dist-pages'));
const info=JSON.parse(fs.readFileSync(path.join(root,'build-info.json'),'utf8'));
const expected=(process.env.PAGES_BUILD_SHA??'').trim();
if(expected&&info.build_sha!==expected) throw new Error(`Build SHA mismatch: ${info.build_sha} != ${expected}`);
if(info.schema_version!=='legal-evidence-github-pages-build.v1') throw new Error('Unexpected build schema.');
if(info.corpus.source_count!==9||info.corpus.evidence_count!==11||info.corpus.official_upstream_count!==9) throw new Error('Unexpected corpus/source counts.');

const sha256=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for(const item of info.files){
  const file=path.resolve(root,item.path);
  if(file!==root&&!file.startsWith(root+path.sep)) throw new Error(`Unsafe manifest path ${item.path}`);
  const stat=fs.statSync(file);
  if(stat.size!==item.bytes||sha256(file)!==item.sha256) throw new Error(`Manifest mismatch ${item.path}`);
}
for(const required of ['index.html','public/index.html','public/app.mjs','public/styles.css','src/ui/controller.mjs','data/legal/CO/sources.json','data/legal/CO/corpus.json','data/legal/CO/upstream-sources.json','.nojekyll']){
  if(!fs.existsSync(path.join(root,required))) throw new Error(`Missing ${required}`);
}
const rootHtml=fs.readFileSync(path.join(root,'index.html'),'utf8');
const publicHtml=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'public/app.mjs'),'utf8');
const controller=fs.readFileSync(path.join(root,'src/ui/controller.mjs'),'utf8');
if(!rootHtml.includes('href="./public/styles.css"')||!rootHtml.includes('src="./public/app.mjs"')) throw new Error('Root Pages index does not point into public/.');
if(!publicHtml.includes('href="./styles.css"')||!publicHtml.includes('src="./app.mjs"')) throw new Error('Public index is not directory-relative.');
if(/from ['"]\/src\//.test(app)||/fetchImpl\(['"]\/data\//.test(controller)) throw new Error('Origin-root runtime path remains.');
if(!rootHtml.includes('Content-Security-Policy')||!rootHtml.includes("object-src 'none'")) throw new Error('Document CSP missing.');
const upstream=JSON.parse(fs.readFileSync(path.join(root,'data/legal/CO/upstream-sources.json'),'utf8'));
for(const source of upstream.sources){
  const url=new URL(source.official_url);
  if(url.protocol!=='https:'||!upstream.policy.allowed_hosts.includes(url.hostname)) throw new Error(`Invalid official URL ${source.source_id}`);
}
console.log(JSON.stringify({valid:true,root,build_sha:info.build_sha,file_count:info.files.length,official_sources:upstream.sources.length},null,2));
