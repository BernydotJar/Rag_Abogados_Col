import { LegalResearchController } from '../src/ui/controller.mjs';
import { uiMessages } from '../src/ui/i18n.mjs';

const controller=new LegalResearchController();
const state={locale:'es',domain:'general',workspace:false,lastResearch:null,status:'loading',evidenceExpanded:false,lastErrorCode:null};
const $=(id)=>document.getElementById(id);
const domains=['general','civil','familia','laboral','penal','notarial','constitucional','unsure'];

function node(tag,{className='',text='',attrs={}}={},children=[]) {
  const element=document.createElement(tag);
  if (className) element.className=className;
  if (text!==undefined&&text!==null) element.textContent=text;
  for (const [key,value] of Object.entries(attrs)) {
    if (value===false||value===null||value===undefined) continue;
    if (key==='hidden') element.hidden=Boolean(value); else element.setAttribute(key,String(value));
  }
  for (const child of children) if (child) element.append(child);
  return element;
}
function button(text,className,onClick,attrs={}) { const b=node('button',{className,text,attrs:{type:'button',...attrs}}); b.addEventListener('click',onClick); return b; }
function clear(element) { while(element.firstChild) element.firstChild.remove(); }
function m(){return uiMessages(state.locale)}
function setStatus(kind,text) { state.status=kind; if(kind!=='error') state.lastErrorCode=null; const dot=document.querySelector('.status-dot'); dot.className=`status-dot${kind==='loading'?' busy':kind==='error'?' error':''}`; $('system-status').textContent=text; }
function setFailure(error) { state.lastErrorCode=error?.code??error?.message??'UNKNOWN'; setStatus('error',m().status.error); }
function refreshDocumentAnswerLocale() { if (!state.lastResearch) return; state.lastResearch.answer=controller.answerBuilder.build({question:state.lastResearch.question,results:state.lastResearch.results,locale:state.locale}); }

function renderChrome() {
  const msg=m(); document.documentElement.lang=state.locale; document.title=`${msg.appName} — ${msg.tagline}`;
  $('skip-link').textContent=msg.skip; $('brand-name').textContent=msg.appName; $('demo-badge').textContent=msg.demoBadge; $('language-label').textContent=msg.language; $('footer-copy').textContent=msg.footer;
  $('locale-select').value=state.locale; $('locale-select').setAttribute('aria-label',msg.language);
}

function renderLanding() {
  const msg=m(),root=$('landing-view'); clear(root);
  const heroCopy=node('div',{},[
    node('p',{className:'eyebrow',text:msg.landing.eyebrow}),
    node('h1',{text:msg.landing.title}),
    node('p',{className:'hero-copy',text:msg.landing.body})
  ]);
  const heroActions=node('div',{className:'hero-actions'},[
    button(msg.actions.law,'primary-action',()=>enterWorkspace(state.domain),{'data-action':'research-law'}),
    button(msg.actions.document,'secondary-action',()=>openUpload(),{'data-action':'upload-document'})
  ]);
  root.append(node('div',{className:'hero'},[heroCopy,heroActions]));
  const heading=node('div',{className:'section-heading'},[
    node('h2',{text:msg.landing.areaTitle}),node('p',{text:msg.landing.areaHelp})
  ]);
  const grid=node('div',{className:'domain-grid'});
  for (const domain of domains) grid.append(button(msg.domains[domain],'domain-card',()=>enterWorkspace(domain),{'data-domain':domain,'aria-label':msg.domains[domain]}));
  root.append(node('section',{className:'domain-section'},[heading,grid]));
}

function enterWorkspace(domain='general') { state.domain=domain; state.workspace=true; $('landing-view').hidden=true; $('workspace-view').hidden=false; renderWorkspace(); requestAnimationFrame(()=>$('question-input')?.focus()); }
function goHome(event){event?.preventDefault();state.workspace=false;$('landing-view').hidden=false;$('workspace-view').hidden=true;renderLanding();}

function renderDocuments(container) {
  const msg=m(),docs=controller.snapshot().documents; clear(container);
  if (!docs.length) { container.append(node('p',{className:'document-meta',text:msg.workspace.noDocuments})); return; }
  for (const doc of docs) {
    const actions=node('div',{className:'document-actions'},[
      button(msg.actions.inspect,'quiet-button',()=>openPassages(doc.id)),
      button(msg.actions.reindex,'quiet-button',()=>reindexDocument(doc.id)),
      button(msg.actions.remove,'danger-button',()=>removeDocument(doc.id))
    ]);
    const item=node('article',{className:'document-item',attrs:{'data-document-id':doc.id}},[
      node('div',{className:'document-name',text:doc.filename}),
      node('div',{className:'document-meta',text:`${Math.round(doc.byte_size/1024)} KB · ${doc.chunk_count} ${msg.diagnostics.chunks.toLocaleLowerCase()}`}),actions
    ]);
    container.append(item);
  }
}

function renderLeftPanel() {
  const msg=m(),snap=controller.snapshot();
  const docs=node('div',{className:'document-list',attrs:{id:'document-list'}}); renderDocuments(docs);
  return node('aside',{className:'workspace-panel left-panel',attrs:{'aria-label':msg.workspace.corpus}},[
    node('section',{className:'panel-section'},[
      node('p',{className:'panel-kicker',text:msg.workspace.area}),node('h2',{className:'panel-title',text:msg.domains[state.domain]}),
      node('span',{className:'area-pill',text:msg.landing.areaHelp}),button(msg.actions.changeArea,'quiet-button add-document',()=>goHome(),{'data-action':'change-area'})
    ]),
    node('section',{className:'panel-section'},[
      node('div',{className:'meta-row'},[node('strong',{text:msg.workspace.publicCorpus}),node('span',{text:String(snap.sourceCount)})]),
      node('p',{className:'document-meta',text:`${snap.evidenceCount} ${msg.evidence.excerpt.toLocaleLowerCase()}s · CO · es`})
    ]),
    node('section',{className:'panel-section'},[
      node('div',{className:'meta-row'},[node('strong',{text:msg.workspace.privateDocs}),node('span',{text:String(snap.documents.length)})]),docs,
      button(msg.actions.document,'quiet-button add-document',()=>openUpload(),{'data-action':'upload-workspace'})
    ]),
    node('details',{className:'diagnostics'},[
      node('summary',{text:msg.diagnostics.title}),node('div',{className:'diagnostic-grid'},[
        node('span',{text:msg.diagnostics.model}),node('span',{text:`${snap.embedding.provider}/${snap.embedding.model}/${snap.embedding.version}`}),
        node('span',{text:msg.diagnostics.scope}),node('span',{text:snap.scope}),
        ...(state.lastErrorCode?[node('span',{text:'error_code'}),node('span',{text:state.lastErrorCode})]:[])
      ])
    ])
  ]);
}

function renderAnswer(container) {
  const msg=m(); clear(container);
  if (!state.lastResearch) { container.append(node('div',{className:'answer-empty',text:msg.workspace.emptyAnswer})); return; }
  const {answer,latency_ms}=state.lastResearch;
  const supported=answer.status==='supported';
  const status=node('section',{className:`answer-state${supported?'':' insufficient'}`,attrs:{'data-answer-state':answer.status}},[
    node('div',{className:'answer-state-label',text:supported?msg.answer.supported:msg.answer.insufficient}),
    node('p',{className:'answer-state-detail',text:supported?msg.answer.supportedDetail:msg.answer.insufficientDetail})
  ]);
  const direct=node('section',{className:'answer-section'},[node('h2',{text:answer.labels.respuesta}),node('p',{text:answer.respuesta})]);
  const basisList=node('ul',{className:'basis-list'});
  for (const item of answer.fundamento) basisList.append(node('li',{},[node('span',{text:item.statement}),node('span',{className:'basis-id',text:item.evidence_id})]));
  const basis=node('section',{className:'answer-section'},[node('h2',{text:answer.labels.fundamento}),answer.fundamento.length?basisList:node('p',{text:'—'})]);
  const requirements=answer.grounding?.support_requirements??[];
  const recoveryItems=requirements.map(key=>msg.answer.requirements?.[key]).filter(Boolean);
  const recoveryList=node('ul',{className:'recovery-list'});
  for(const item of (recoveryItems.length?recoveryItems:[msg.answer.recoveryGeneral])) recoveryList.append(node('li',{text:item}));
  const recovery=supported?null:node('section',{className:'answer-section recovery-section',attrs:{'data-recovery':'true'}},[
    node('h2',{text:msg.answer.recoveryTitle}),recoveryList
  ]);
  const missingList=node('ul',{className:'missing-list'}); for(const item of answer.informacion_que_falta) missingList.append(node('li',{text:item}));
  const missing=node('section',{className:'answer-section'},[node('h2',{text:answer.labels.faltante}),answer.informacion_que_falta.length?missingList:node('p',{text:'—'})]);
  const limitsList=node('ul',{className:'limits-list'}); for(const item of answer.limites) limitsList.append(node('li',{text:item}));
  const limits=node('section',{className:'answer-section'},[node('h2',{text:answer.labels.limites}),limitsList]);
  container.append(status,direct,basis,recovery,missing,limits,node('div',{className:'latency',text:`${latency_ms} ms · ${answer.grounding.policy.mode}`}));
}

function renderEvidenceCard(result) {
  const msg=m(),meta=result.metadata??{},isLaw=meta.source_type==='legislation';
  const tag=node('span',{className:`evidence-tag${isLaw?'':' user'}`,text:isLaw?msg.evidence.law:msg.evidence.user});
  const relation=result.domain_relation==='cross_domain'?node('span',{className:'flag',text:msg.evidence.crossDomain}):null;
  const historical=result.usable_for_current_conclusion===false?node('span',{className:'flag',text:msg.evidence.historical}):null;
  const usedForGrounding=Boolean(state.lastResearch?.answer?.fundamento?.some(item=>item.evidence_id===result.id));
  const rejected=isLaw&&!usedForGrounding;
  const notSupport=rejected?node('span',{className:'flag caution',text:msg.evidence.notSupport}):null;
  const flags=node('div',{className:'evidence-flags'},[relation,historical,notSupport]);
  const title=isLaw?(meta.official_title??meta.identifier??result.id):(meta.filename??result.id);
  const cite=isLaw?[meta.identifier,meta.article_or_section,meta.authority].filter(Boolean).join(' · '):`${meta.filename??''} · ${msg.diagnostics.chunks.toLocaleLowerCase()} ${Number(meta.chunk_index??0)+1}`;
  const provenance=node('dl',{className:'evidence-provenance'});
  if(isLaw&&meta.version_id) provenance.append(node('dt',{text:msg.evidence.version}),node('dd',{text:meta.version_id}));
  if(isLaw&&meta.last_verified_at) provenance.append(node('dt',{text:msg.evidence.verified}),node('dd',{text:meta.last_verified_at}));
  const card=node('article',{className:'evidence-card',attrs:{'data-evidence-id':result.id,'data-support-role':rejected?'related':'candidate'}},[
    node('div',{className:'evidence-type'},[tag]),
    node('h3',{text:title}),node('p',{className:'evidence-cite',text:cite}),flags,provenance,
    node('p',{className:'evidence-excerpt',text:result.text})
  ]);
  if (isLaw&&meta.source_url) card.append(node('a',{className:'evidence-source-action',text:msg.evidence.source,attrs:{href:meta.source_url,target:'_blank',rel:'noopener noreferrer'}}));
  const diag=node('details',{className:'diagnostics'}); diag.append(node('summary',{text:msg.evidence.score}));
  const grid=node('div',{className:'diagnostic-grid'});
  for (const [key,value] of Object.entries(result.score_components??{})) grid.append(node('span',{text:key}),node('span',{text:String(Math.round(value*1000)/1000)}));
  diag.append(grid); card.append(diag); return card;
}

function renderEvidencePanel() {
  const msg=m(),panel=node('aside',{className:'workspace-panel evidence-panel',attrs:{'aria-label':msg.workspace.sources}});
  panel.append(node('p',{className:'panel-kicker',text:msg.nav.evidence}),node('h2',{className:'panel-title',text:msg.workspace.sources}));
  const list=node('div',{className:'evidence-list'});
  if (!state.lastResearch?.results?.length) list.append(node('p',{className:'document-meta',text:msg.workspace.noAnswer}));
  else {
    const results=state.lastResearch.results; const visible=state.evidenceExpanded?results:results.slice(0,4);
    for (const result of visible) list.append(renderEvidenceCard(result));
    if (results.length>4) list.append(button(state.evidenceExpanded?msg.actions.showLess:msg.actions.showMore,'quiet-button',()=>{state.evidenceExpanded=!state.evidenceExpanded;renderWorkspace()},{'data-action':'toggle-evidence'}));
  }
  panel.append(list); return panel;
}

async function submitResearch(event) {
  event.preventDefault(); const input=$('question-input'); const question=input.value.trim(); if (!question) { input.focus(); return; }
  const submit=$('query-submit'); submit.disabled=true; setStatus('loading',m().status.loading);
  try {
    state.lastResearch=await controller.research(question,{domain:state.domain,locale:state.locale}); state.evidenceExpanded=false;
    setStatus('ready',m().status.ready); renderWorkspace();
  } catch (error) { setFailure(error); }
  finally { const current=$('query-submit'); if(current) current.disabled=false; }
}

function renderCenterPanel() {
  const msg=m(),snap=controller.snapshot(),panel=node('section',{className:'workspace-panel center-panel'});
  panel.append(node('div',{className:'query-header'},[
    node('div',{},[node('p',{className:'panel-kicker',text:msg.nav.research}),node('h1',{text:msg.workspace.question}),node('p',{className:'query-help',text:msg.workspace.questionHelp})]),
    node('span',{className:'area-pill query-area',text:msg.domains[state.domain]})
  ]));
  const coverage=node('section',{className:'coverage-boundary',attrs:{'data-testid':'coverage-boundary','aria-labelledby':'coverage-title'}},[
    node('div',{className:'coverage-heading'},[
      node('h2',{text:msg.coverage.title,attrs:{id:'coverage-title'}}),node('span',{className:'coverage-status',text:msg.coverage.partial})
    ]),
    node('div',{className:'coverage-facts'},[
      node('span',{text:`${snap.sourceCount} ${msg.coverage.sources}`}),
      node('span',{text:`${snap.evidenceCount} ${msg.coverage.passages}`}),
      node('span',{className:'coverage-gap',text:msg.coverage.jurisprudence}),
      node('span',{className:'coverage-gap',text:msg.coverage.fullText})
    ]),
    node('p',{className:'coverage-note',text:msg.coverage.note,attrs:{id:'coverage-note'}})
  ]);
  panel.append(coverage);
  const textarea=node('textarea',{attrs:{id:'question-input',name:'question',placeholder:msg.workspace.placeholder,'aria-label':msg.workspace.question,'aria-describedby':'question-help coverage-note',required:'true'}});
  if (state.lastResearch?.question) textarea.value=state.lastResearch.question;
  textarea.addEventListener('keydown',(event)=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter') textarea.form?.requestSubmit();});
  const taskButtons=node('div',{className:'task-presets',attrs:{role:'group','aria-label':msg.tasks.title}});
  for(const key of ['identify','proof','deadline','competence','change','jurisprudence','document']){
    taskButtons.append(button(msg.tasks[key],'task-chip',()=>{textarea.value=msg.tasks.examples[key];textarea.focus();textarea.setSelectionRange(textarea.value.length,textarea.value.length)},{'data-task':key}));
  }
  const taskSection=node('section',{className:'task-section'},[
    node('div',{className:'task-heading'},[node('h2',{text:msg.tasks.title}),node('p',{text:msg.tasks.help})]),taskButtons
  ]);
  const help=node('span',{className:'sr-only',text:msg.workspace.questionHelp,attrs:{id:'question-help'}});
  const submit=button(msg.actions.ask,'primary-action query-submit',()=>{}, {id:'query-submit'}); submit.type='submit';
  const form=node('form',{className:'query-form',attrs:{id:'query-form'}},[taskSection,textarea,help,node('div',{className:'query-actions'},[
    node('span',{className:'document-meta',text:msg.landing.areaHelp}),submit
  ])]);
  form.addEventListener('submit',submitResearch); panel.append(form);
  const answer=node('div',{attrs:{id:'answer-container','aria-live':'polite'}}); renderAnswer(answer); panel.append(answer); return panel;
}

function renderWorkspace() {
  const root=$('workspace-view'); clear(root); root.append(renderLeftPanel(),renderCenterPanel(),renderEvidencePanel());
}

function renderUploadDialog() {
  const msg=m(),dialog=$('upload-dialog'); clear(dialog);
  const close=button('×','dialog-close',()=>dialog.close(),{'aria-label':msg.actions.close});
  const input=node('input',{attrs:{id:'document-file',type:'file',accept:'.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain',required:'true'}});
  const stages=node('div',{className:'upload-stages',attrs:{id:'upload-stages'}});
  for (const key of ['preparing','reading','organizing','search_ready','ready']) stages.append(node('div',{className:'stage',text:msg.upload.stages[key],attrs:{'data-stage':key}}));
  const error=node('p',{className:'dialog-error',attrs:{id:'upload-error',role:'alert'}});
  const submit=button(msg.upload.choose,'primary-action',()=>{}, {id:'upload-submit'}); submit.type='submit';
  const form=node('form',{attrs:{id:'upload-form'}},[
    node('label',{className:'file-field'},[node('span',{text:msg.upload.choose}),input]),submit,stages,error
  ]);
  form.addEventListener('submit',handleUpload);
  dialog.append(node('div',{className:'dialog-body'},[
    node('div',{className:'dialog-header'},[node('div',{},[node('p',{className:'panel-kicker',text:msg.nav.documents}),node('h2',{text:msg.upload.title}),node('p',{className:'query-help',text:msg.upload.body})]),close]),
    node('p',{className:'privacy-warning',text:msg.upload.warning}),
    node('section',{className:'privacy-facts'},[node('strong',{text:msg.privacy.title}),node('span',{text:msg.privacy.body})]),
    node('div',{className:'privacy-facts'},[node('span',{text:`• ${msg.upload.local}`}),node('span',{text:`• ${msg.upload.retention}`}),node('span',{text:`• ${msg.upload.noTraining}`}),node('span',{text:`• ${msg.upload.ocr}`})]),
    form
  ]));
}
function openUpload(){renderUploadDialog();$('upload-dialog').showModal();requestAnimationFrame(()=>$('document-file')?.focus())}
function setUploadStages(activeKey,done=false){for(const stage of document.querySelectorAll('#upload-stages .stage')){const key=stage.dataset.stage;stage.className=`stage${done||key===activeKey?' active':''}${done?' done':''}`;}}
async function handleUpload(event) {
  event.preventDefault(); const input=$('document-file'),file=input.files?.[0]; if(!file)return;
  const submit=$('upload-submit'); submit.disabled=true; $('upload-error').textContent=''; setUploadStages('preparing'); setStatus('loading',m().upload.stages.preparing);
  try {
    await new Promise(resolve=>requestAnimationFrame(resolve)); setUploadStages('reading'); setStatus('loading',m().upload.stages.reading);
    const result=await controller.ingestFile(file); setUploadStages('ready',true); setStatus('ready',m().status.uploaded);
    state.workspace=true; renderWorkspace(); setTimeout(()=>{if($('upload-dialog')?.open)$('upload-dialog').close()},180);
    return result;
  } catch(error) { state.lastErrorCode=error?.code??error?.message??'UNKNOWN'; $('upload-error').textContent=m().status.error; setStatus('error',m().status.error); }
  finally { const current=$('upload-submit'); if(current)current.disabled=false; }
}

async function removeDocument(id){controller.removeDocument(id);setStatus('ready',m().status.deleted);renderWorkspace()}
async function reindexDocument(id){setStatus('loading',m().upload.stages.search_ready);try{await controller.reindexDocument(id);setStatus('ready',m().status.reindexed);renderWorkspace()}catch(error){setFailure(error)}}
function openPassages(id){
  const msg=m(),dialog=$('passage-dialog'); clear(dialog); const passages=controller.inspectDocument(id),list=node('div',{className:'passage-list'});
  for(const passage of passages) list.append(node('article',{className:'passage'},[node('small',{text:`#${passage.index+1} · ${passage.chunk_id}`}),node('p',{text:passage.text})]));
  dialog.append(node('div',{className:'dialog-body'},[node('div',{className:'dialog-header'},[node('h2',{text:msg.actions.inspect}),button('×','dialog-close',()=>dialog.close(),{'aria-label':msg.actions.close})]),list]));
  dialog.showModal();
}

$('locale-select').addEventListener('change',(event)=>{state.locale=event.target.value;refreshDocumentAnswerLocale();renderChrome();renderLanding();if(state.workspace)renderWorkspace();});
$('brand-link').addEventListener('click',goHome);
renderChrome(); renderLanding(); setStatus('loading',m().status.loading);

try { await controller.initialize(); setStatus('ready',m().status.ready); }
catch(error) { setFailure(error); }

window.__RAG_APP__=Object.freeze({snapshot:()=>controller.snapshot(),getState:()=>({locale:state.locale,domain:state.domain,workspace:state.workspace,status:state.status,lastStatus:state.lastResearch?.answer?.status??null,lastErrorCode:state.lastErrorCode})});
