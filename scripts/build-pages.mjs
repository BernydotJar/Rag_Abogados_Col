import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const args=process.argv.slice(2);
const arg=(name,fallback)=>{const i=args.indexOf(name);return i>=0?args[i+1]:fallback};
const root=process.cwd();
const out=path.resolve(arg('--out','dist-pages'));
const git=(...items)=>execFileSync('git',items,{cwd:root,encoding:'utf8'}).trim();
const buildSha=(process.env.PAGES_BUILD_SHA??git('rev-parse','HEAD')).trim();
if(!/^[a-f0-9]{40}$/.test(buildSha)) throw new Error('PAGES_BUILD_SHA must be a full Git SHA.');
if(process.env.PAGES_REQUIRE_CLEAN==='1'&&git('status','--porcelain')) throw new Error('Pages build requires a clean worktree.');
const commitDate=git('show','-s','--format=%cI',buildSha);

fs.rmSync(out,{recursive:true,force:true});
fs.mkdirSync(out,{recursive:true});
for(const dir of ['public','src','data']) fs.cpSync(path.join(root,dir),path.join(out,dir),{recursive:true});
fs.writeFileSync(path.join(out,'.nojekyll'),'');
const publicIndex=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const rootIndex=publicIndex.replace('href="./styles.css"','href="./public/styles.css"').replace('src="./app.mjs"','src="./public/app.mjs"');
fs.writeFileSync(path.join(out,'index.html'),rootIndex);

const sha256=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(entry.name!=='build-info.json')files.push(full)}}
walk(out);
const rel=file=>path.relative(out,file).split(path.sep).join('/');
const sources=JSON.parse(fs.readFileSync(path.join(root,'data/legal/CO/sources.json'),'utf8'));
const corpus=JSON.parse(fs.readFileSync(path.join(root,'data/legal/CO/corpus.json'),'utf8'));
const upstream=JSON.parse(fs.readFileSync(path.join(root,'data/legal/CO/upstream-sources.json'),'utf8'));
const metadata={schema_version:'legal-evidence-github-pages-build.v1',product:'Evidencia Jurídica',repository:'BernydotJar/Rag_Abogados_Col',build_sha:buildSha,generated_at:commitDate,timestamp_source:'git_commit_committer_date',deployment_model:'github_project_pages_static',resource_resolution:'module_relative_project_subpath_safe',corpus:{jurisdiction:'CO',coverage:corpus.coverage,source_count:sources.sources.length,evidence_count:corpus.evidence.length,official_upstream_count:upstream.sources.length,local_fulltext_snapshot_count:upstream.sources.filter(x=>x.local_fulltext_snapshot).length},private_documents:{processing:'browser/session memory',server_upload:false,training_use:false,content_telemetry:false},files:files.map(file=>({path:rel(file),bytes:fs.statSync(file).size,sha256:sha256(file)})).sort((a,b)=>a.path.localeCompare(b.path))};
fs.writeFileSync(path.join(out,'build-info.json'),JSON.stringify(metadata,null,2)+'\n');
console.log(JSON.stringify({out,build_sha:buildSha,file_count:metadata.files.length,corpus:metadata.corpus},null,2));