import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const args=process.argv.slice(2); const read=(name,fallback)=>{const i=args.indexOf(name);return i>=0?args[i+1]:fallback};
const root=path.resolve(read('--root','/tmp/rag-juridico-release')); const port=Number(read('--port','4180'));
const headers=JSON.parse(fs.readFileSync(path.join(root,'security-headers.json'),'utf8'));
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.txt':'text/plain; charset=utf-8'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost'); let pathname=decodeURIComponent(url.pathname); if(pathname==='/') pathname='/index.html';
  const resolved=path.resolve(root,'.'+pathname); if(resolved!==root&&!resolved.startsWith(root+path.sep)){res.writeHead(400,headers);return res.end('Bad request');}
  let stat; try{stat=fs.statSync(resolved)}catch{res.writeHead(404,headers);return res.end('Not found')}
  if(!stat.isFile()){res.writeHead(404,headers);return res.end('Not found')}
  res.writeHead(200,{...headers,'Content-Type':mime[path.extname(resolved)]??'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-store'});
  if(req.method==='HEAD')return res.end(); fs.createReadStream(resolved).pipe(res);
});
server.listen(port,'127.0.0.1',()=>console.log(`release-server http://127.0.0.1:${port} root=${root}`));
