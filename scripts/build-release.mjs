import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const args=process.argv.slice(2);
const outIndex=args.indexOf('--out');
const out=path.resolve(outIndex>=0?args[outIndex+1]:'/tmp/rag-juridico-release');
const root=process.cwd();
const git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'}).trim();
const dirty=git('status','--porcelain');
if(dirty) throw new Error('Release build requires a clean committed worktree.');
const sha=git('rev-parse','HEAD');
const branch=git('branch','--show-current');
const commitDate=git('show','-s','--format=%cI',sha);
fs.rmSync(out,{recursive:true,force:true}); fs.mkdirSync(out,{recursive:true});
for(const dir of ['public','src','data']) fs.cpSync(path.join(root,dir),path.join(out,dir),{recursive:true});
const publicIndex=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const rootIndex=publicIndex.replace('href="./styles.css"','href="./public/styles.css"').replace('src="./app.mjs"','src="./public/app.mjs"');
fs.writeFileSync(path.join(out,'index.html'),rootIndex);
fs.copyFileSync(path.join(root,'program/release/security-headers.json'),path.join(out,'security-headers.json'));
const sha256=(file)=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(entry.name!=='build-metadata.json')files.push(full)}}
walk(out);
const relative=(file)=>path.relative(out,file).split(path.sep).join('/');
const registry=JSON.parse(fs.readFileSync(path.join(root,'data/legal/CO/sources.json'),'utf8'));
const corpus=JSON.parse(fs.readFileSync(path.join(root,'data/legal/CO/corpus.json'),'utf8'));
const metadata={
  schema_version:'legal-evidence-static-build.v1',
  product:'Evidencia Jurídica',
  release_id:`local-rc-${sha.slice(0,12)}`,
  git_sha:sha,
  branch,
  generated_at:commitDate,
  timestamp_source:'git_commit_committer_date',
  worktree_clean:true,
  graph_harness_revision:'477bdcc3d390c30eb49d823e5c7fd105fee2cc4d',
  embedding:{provider:'local-hash-embedding',model:'charword-384',version:'1.0.0',dimension:384,local:true},
  vector_store:{strategy:'browser-session in-memory vectors + lexical/vector/metadata reranking',persistent:false},
  corpus:{jurisdiction:'CO',coverage:corpus.coverage,source_count:registry.sources.length,evidence_count:corpus.evidence.length,last_verified_at:[...new Set(registry.sources.map(x=>x.last_verified_at))].sort().at(-1)},
  private_documents:{processing:'browser/session local',persistence:'session memory only',training_use:false,content_telemetry:false,ocr_supported:false},
  files:files.map(file=>({path:relative(file),bytes:fs.statSync(file).size,sha256:sha256(file)})).sort((a,b)=>a.path.localeCompare(b.path))
};
fs.writeFileSync(path.join(out,'build-metadata.json'),JSON.stringify(metadata,null,2)+'\n');
console.log(JSON.stringify({out,release_id:metadata.release_id,git_sha:sha,file_count:metadata.files.length,source_count:metadata.corpus.source_count,evidence_count:metadata.corpus.evidence_count},null,2));
