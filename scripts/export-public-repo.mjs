import fs from 'node:fs';
import path from 'node:path';

const args=process.argv.slice(2);
const index=args.indexOf('--out');
const out=path.resolve(index>=0?args[index+1]:'/tmp/rag-abogados-col-public');
const root=process.cwd();
const includeDirs=['public','src','data','docs','evals','scripts','tests'];
const includeFiles=['README.md','.github/workflows/deploy-pages.yml','program/release/security-headers.json','program/release/hosting-contract.md'];

fs.rmSync(out,{recursive:true,force:true});
fs.mkdirSync(out,{recursive:true});
for(const dir of includeDirs){
  const source=path.join(root,dir);
  if(!fs.existsSync(source)) throw new Error(`Missing public directory ${dir}`);
  fs.cpSync(source,path.join(out,dir),{recursive:true});
}
for(const file of includeFiles){
  const source=path.join(root,file);
  if(!fs.existsSync(source)) throw new Error(`Missing public file ${file}`);
  const target=path.join(out,file);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(source,target);
}
const forbidden=['program/graph-harness.events.jsonl','program/graph-harness.project.json','program/approvals','program/agents','specs','.git'];
for(const item of forbidden) if(fs.existsSync(path.join(out,item))) throw new Error(`Forbidden internal artifact exported: ${item}`);
const files=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else files.push(path.relative(out,full).split(path.sep).join('/'));}}
walk(out);
console.log(JSON.stringify({out,file_count:files.length,files:files.sort()},null,2));
