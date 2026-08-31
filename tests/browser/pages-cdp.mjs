const CDP=process.env.CDP_URL??'http://127.0.0.1:9444';
const BASE=process.env.PAGES_URL??'http://127.0.0.1:4190/Rag_Abogados_Col/';
const EXPECTED_SHA=process.env.EXPECTED_SHA??'';

class Session {
  constructor(url){this.url=url;this.id=0;this.pending=new Map();this.errors=[];}
  async open(){
    this.ws=new WebSocket(this.url);
    await new Promise((resolve,reject)=>{this.ws.addEventListener('open',resolve,{once:true});this.ws.addEventListener('error',reject,{once:true});});
    this.ws.addEventListener('message',(event)=>{
      const message=JSON.parse(event.data);
      if(message.id){const pending=this.pending.get(message.id);if(!pending)return;this.pending.delete(message.id);message.error?pending.reject(new Error(JSON.stringify(message.error))):pending.resolve(message.result);}
      else if(message.method==='Runtime.exceptionThrown'){this.errors.push(message.params?.exceptionDetails?.text??'runtime exception');}
    });
  }
  send(method,params={}){const id=++this.id;this.ws.send(JSON.stringify({id,method,params}));return new Promise((resolve,reject)=>this.pending.set(id,{resolve,reject}));}
  async eval(expression){const result=await this.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.text);return result.result?.value;}
  async poll(expression,timeout=15000){const start=Date.now();while(Date.now()-start<timeout){try{if(await this.eval(expression))return;}catch{}await new Promise(resolve=>setTimeout(resolve,50));}throw new Error(`poll timeout: ${expression}`);}
}

const target=await (await fetch(`${CDP}/json/new?${encodeURIComponent(BASE)}`,{method:'PUT'})).json();
const session=new Session(target.webSocketDebuggerUrl);
await session.open();
await Promise.all([session.send('Page.enable'),session.send('Runtime.enable')]);
await session.poll(`window.__RAG_APP__?.snapshot?.().ready===true`);

const checks=[];
const check=(name,pass,detail={})=>{checks.push({name,pass,...detail});if(!pass)throw new Error(`${name}: ${JSON.stringify(detail)}`);};
const info=await session.eval(`fetch(new URL('build-info.json',location.href)).then(r=>r.json())`);
check('build-sha',Boolean(EXPECTED_SHA)&&info.build_sha===EXPECTED_SHA,{actual:info.build_sha});
const state=await session.eval(`({pathname:location.pathname,ready:window.__RAG_APP__.snapshot().ready,sources:window.__RAG_APP__.snapshot().sourceCount,evidence:window.__RAG_APP__.snapshot().evidenceCount})`);
check('project-subpath',state.pathname.includes('/Rag_Abogados_Col/')&&state.ready&&state.sources===9&&state.evidence===11,state);

await session.eval(`document.querySelector('[data-domain="laboral"]').click()`);
await session.poll(`document.querySelector('#question-input')!==null`);
await session.eval(`(()=>{const q=document.querySelector('#question-input');q.value='actividad personal subordinación salario contrato de trabajo';document.querySelector('#query-form').requestSubmit();return true})()`);
await session.poll(`window.__RAG_APP__.getState().lastStatus!==null`);
const grounded=await session.eval(`({status:window.__RAG_APP__.getState().lastStatus,hasLaw:[...document.querySelectorAll('[data-evidence-id]')].some(x=>x.dataset.evidenceId==='co-cst-art23')})`);
check('grounded-under-subpath',grounded.status==='supported'&&grounded.hasLaw,grounded);

const resources=await session.eval(`performance.getEntriesByType('resource').map(x=>new URL(x.name)).map(x=>({origin:x.origin,pathname:x.pathname}))`);
const pageOrigin=new URL(BASE).origin;
check('same-origin-resources',resources.every(item=>item.origin===pageOrigin),{resources});
const runtimeResources=resources.filter(item=>/\/(src|public|data)\//.test(item.pathname));
check('no-origin-root-runtime-paths',runtimeResources.every(item=>item.pathname.includes('/Rag_Abogados_Col/')),{runtimeResources});

await session.send('Emulation.setDeviceMetricsOverride',{width:320,height:720,deviceScaleFactor:1,mobile:true});
await new Promise(resolve=>setTimeout(resolve,100));
const metrics=await session.eval(`({innerWidth,scrollWidth:document.documentElement.scrollWidth})`);
check('320-no-overflow',metrics.scrollWidth<=metrics.innerWidth+1,metrics);
check('runtime-errors',session.errors.length===0,{errors:session.errors});

console.log(JSON.stringify({base:BASE,checks},null,2));
session.ws.close();
