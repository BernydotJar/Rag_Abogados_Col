const baseRaw=process.env.PAGES_ONLINE_URL;
const expected=process.env.EXPECTED_BUILD_SHA;
if(!baseRaw||!expected) throw new Error('PAGES_ONLINE_URL and EXPECTED_BUILD_SHA are required.');
const base=new URL(baseRaw.endsWith('/')?baseRaw:`${baseRaw}/`);
const waitSeconds=Number(process.env.PAGES_ONLINE_WAIT_SECONDS??180);
const deadline=Date.now()+waitSeconds*1000;
let lastError='not attempted';
while(Date.now()<deadline){
  try{
    const response=await fetch(new URL('build-info.json',base),{cache:'no-store'});
    if(!response.ok) throw new Error(`build-info HTTP ${response.status}`);
    const info=await response.json();
    if(info.build_sha!==expected) throw new Error(`live SHA ${info.build_sha} != ${expected}`);
    const html=await fetch(base,{cache:'no-store'});
    if(!html.ok) throw new Error(`root HTTP ${html.status}`);
    const body=await html.text();
    if(!body.includes('Evidencia Jurídica')||!body.includes('./public/app.mjs')) throw new Error('Unexpected live root artifact.');
    console.log(JSON.stringify({valid:true,url:base.href,build_sha:info.build_sha,corpus:info.corpus},null,2));
    process.exit(0);
  }catch(error){lastError=error.message;await new Promise(resolve=>setTimeout(resolve,5000));}
}
throw new Error(`Online Pages verification timed out: ${lastError}`);