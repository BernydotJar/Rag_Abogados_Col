import fs from 'node:fs';
import path from 'node:path';

const CDP=process.env.CDP_URL??'http://127.0.0.1:9222';
const URL=process.env.TEST_URL??'http://127.0.0.1:4173/public/index.html';
const screenshotDir=process.env.SCREENSHOT_DIR??'/tmp/rag-ux-trust-screenshots';
fs.mkdirSync(screenshotDir,{recursive:true});

class Session {
  constructor(url){this.url=url;this.id=0;this.pending=new Map();this.events=new Map();this.errors=[];}
  async open(){
    this.ws=new WebSocket(this.url);
    await new Promise((resolve,reject)=>{this.ws.addEventListener('open',resolve,{once:true});this.ws.addEventListener('error',reject,{once:true});});
    this.ws.addEventListener('message',(event)=>{
      const msg=JSON.parse(event.data);
      if(msg.id){const p=this.pending.get(msg.id);if(!p)return;this.pending.delete(msg.id);msg.error?p.reject(new Error(JSON.stringify(msg.error))):p.resolve(msg.result);return;}
      const waits=this.events.get(msg.method);if(waits?.length){const next=waits.shift();next(msg.params);}
      if(msg.method==='Runtime.exceptionThrown') this.errors.push(msg.params?.exceptionDetails?.text??'runtime exception');
    });
  }
  send(method,params={}){const id=++this.id;this.ws.send(JSON.stringify({id,method,params}));return new Promise((resolve,reject)=>this.pending.set(id,{resolve,reject}));}
  event(method,timeout=5000){return new Promise((resolve,reject)=>{const list=this.events.get(method)??[];let timer;const done=(value)=>{clearTimeout(timer);resolve(value)};list.push(done);this.events.set(method,list);timer=setTimeout(()=>reject(new Error(`timeout waiting for ${method}`)),timeout);});}
  async eval(expression,{awaitPromise=true,returnByValue=true}={}){const r=await this.send('Runtime.evaluate',{expression,awaitPromise,returnByValue,userGesture:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result?.value;}
  async poll(expression,timeout=10000){const start=Date.now();while(Date.now()-start<timeout){try{if(await this.eval(expression))return true;}catch{}await new Promise(r=>setTimeout(r,50));}throw new Error(`poll timeout: ${expression}`);}
  close(){this.ws.close();}
}

async function createPage(){
  const response=await fetch(`${CDP}/json/new?${encodeURIComponent(URL)}`,{method:'PUT'}); if(!response.ok) throw new Error(`new page ${response.status}`); return response.json();
}
function assert(condition,message){if(!condition)throw new Error(message)}

const target=await createPage();
const s=new Session(target.webSocketDebuggerUrl);await s.open();
await Promise.all([s.send('Page.enable'),s.send('Runtime.enable'),s.send('Accessibility.enable')]);
await s.poll(`window.__RAG_APP__?.snapshot?.().ready===true`,15000);

const report={browser:(await (await fetch(`${CDP}/json/version`)).json()).Browser,checks:[],viewports:[],runtime_errors:[]};
const check=(name,pass,detail={})=>{report.checks.push({name,pass,...detail});assert(pass,`${name} failed: ${JSON.stringify(detail)}`)};

const landing=await s.eval(`({lang:document.documentElement.lang,title:document.title,domains:document.querySelectorAll('[data-domain]').length,status:window.__RAG_APP__.getState().status})`);
check('landing-ready',landing.lang==='es'&&landing.domains===8&&landing.status==='ready'&&!/RAG/i.test(landing.title),landing);

await s.eval(`document.querySelector('[data-domain="laboral"]').click()`);
await s.poll(`document.querySelector('#question-input')!==null`);
check('workspace-entered',await s.eval(`window.__RAG_APP__.getState().workspace===true && document.querySelectorAll('.workspace-panel').length===3`));
check('coverage-boundary-visible',await s.eval(`document.querySelector('[data-testid=\"coverage-boundary\"]')?.textContent.includes('9 fuentes oficiales') && document.querySelector('[data-testid=\"coverage-boundary\"]')?.textContent.includes('Jurisprudencia no incluida')`));
check('lawyer-task-presets',await s.eval(`document.querySelectorAll('[data-task]').length===7 && [...document.querySelectorAll('[data-task]')].every(x=>x.getAttribute('aria-label')||x.textContent.trim())`));
await s.eval(`document.querySelector('[data-task=\"deadline\"]').click()`);
check('task-preset-fills-query',await s.eval(`document.querySelector('#question-input').value.toLowerCase().includes('plazo')`));
await s.eval(`(()=>{const q=document.querySelector('#question-input');q.value='¿Cuál es el término para contestar una demanda civil?';document.querySelector('#query-form').requestSubmit();return true})()`);
await s.poll(`window.__RAG_APP__.getState().lastStatus==='insufficient_evidence'`);
check('insufficiency-recovery',await s.eval(`document.querySelector('[data-recovery=\"true\"]')?.textContent.includes('Falta una regla expresa de plazo')`));

await s.eval(`(()=>{document.querySelector('[data-action="upload-workspace"]').click();return document.querySelector('#upload-dialog').open})()`);
await s.poll(`document.querySelector('#document-file')!==null`);
check('privacy-deletion-visible',await s.eval(`document.querySelector('#upload-dialog').textContent.includes('texto, fragmentos y vectores')`));
await s.eval(`(()=>{const input=document.querySelector('#document-file');const dt=new DataTransfer();dt.items.add(new File(['Cláusula de contrato laboral. La persona prestará actividad personal bajo subordinación y recibirá salario mensual. '.repeat(18)],'contrato-demo.txt',{type:'text/plain'}));input.files=dt.files;document.querySelector('#upload-form').requestSubmit();return true})()`);
await s.poll(`window.__RAG_APP__.snapshot().documents.length===1`,10000);
check('browser-upload',await s.eval(`window.__RAG_APP__.snapshot().documents[0].filename==='contrato-demo.txt' && window.__RAG_APP__.snapshot().documents[0].chunk_count>0`));

await s.eval(`(()=>{const q=document.querySelector('#question-input');q.value='actividad personal subordinación salario contrato de trabajo';document.querySelector('#query-form').requestSubmit();return true})()`);
await s.poll(`window.__RAG_APP__.getState().lastStatus!==null`,10000);
const research=await s.eval(`({status:window.__RAG_APP__.getState().lastStatus,cards:document.querySelectorAll('.evidence-card').length,answer:document.querySelector('.answer-section p')?.textContent||'',hasLabor:[...document.querySelectorAll('[data-evidence-id]')].some(x=>x.dataset.evidenceId==='co-cst-art23')})`);
check('research-grounded',research.status==='supported'&&research.cards>0&&research.cards<=5&&research.hasLabor,research);
check('evidence-progressive-disclosure',await s.eval(`document.querySelector('[data-action=\"toggle-evidence\"]')!==null`));
check('no-primary-retrieval-percent',await s.eval(`![...document.querySelectorAll('.evidence-type')].some(x=>/%/.test(x.textContent))`));
check('official-source-primary-action',await s.eval(`document.querySelector('[data-evidence-id=\"co-cst-art23\"] .evidence-source-action')!==null`));
check('provenance-primary',await s.eval(`document.querySelector('[data-evidence-id=\"co-cst-art23\"] .evidence-provenance')?.textContent.includes('Versión')`));

const originalExcerpt=await s.eval(`document.querySelector('.evidence-card[data-evidence-id="co-cst-art23"] .evidence-excerpt')?.textContent`);
for(const locale of ['en','pt','es']){
  await s.eval(`(()=>{const e=document.querySelector('#locale-select');e.value='${locale}';e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  const loc=await s.eval(`({lang:document.documentElement.lang,answer:document.querySelector('.answer-section h2')?.textContent,excerpt:document.querySelector('.evidence-card[data-evidence-id="co-cst-art23"] .evidence-excerpt')?.textContent})`);
  check(`locale-${locale}`,loc.lang===locale&&loc.excerpt===originalExcerpt,loc);
}

const viewports=[['desktop',1440,900],['laptop',1280,800],['tablet',768,900],['mobile-390',390,844],['stress-320',320,720]];
for(const [name,width,height] of viewports){
  await s.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<=768});
  await new Promise(r=>setTimeout(r,80));
  const metrics=await s.eval(`(()=>{const vw=innerWidth;const offenders=[...document.querySelectorAll('body *')].map(el=>({el,r:el.getBoundingClientRect()})).filter(x=>x.r.width>1&&(x.r.right>vw+1||x.r.left<-1)).slice(0,10).map(x=>({tag:x.el.tagName,id:x.el.id,cls:x.el.className,left:Math.round(x.r.left),right:Math.round(x.r.right),width:Math.round(x.r.width)}));return {innerWidth:vw,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,offenders}})()`);
  const pass=metrics.scrollWidth<=metrics.innerWidth+1&&metrics.offenders.length===0; check(`no-horizontal-overflow-${name}`,pass,metrics);
  const image=await s.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});
  const file=path.join(screenshotDir,`${name}.png`);fs.writeFileSync(file,Buffer.from(image.data,'base64'));
  report.viewports.push({name,width,height,...metrics,screenshot:file});
}

const ax=(await s.send('Accessibility.getFullAXTree')).nodes;
const interactive=ax.filter(n=>['button','link','textbox','combobox'].includes(n.role?.value));
const unnamed=interactive.filter(n=>!String(n.name?.value??'').trim()).map(n=>n.role?.value);
check('accessible-names',unnamed.length===0,{interactive:interactive.length,unnamed});
check('focus-style-declared',await s.eval(`[...document.styleSheets].some(ss=>{try{return [...ss.cssRules].some(r=>r.cssText?.includes(':focus-visible'))}catch{return false}})`));
report.runtime_errors=s.errors;
check('runtime-errors',s.errors.length===0,{errors:s.errors});

fs.writeFileSync('program/agents/ux-trust/run-012/browser-smoke.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
s.close();
