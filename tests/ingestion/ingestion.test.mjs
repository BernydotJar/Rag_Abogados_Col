import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDocument, IngestionError } from '../../src/ingestion/validate.mjs';
import { extractText } from '../../src/ingestion/extractors.mjs';
import { DocumentIngestor } from '../../src/ingestion/ingestor.mjs';
import { LocalHashEmbeddingProvider } from '../../src/core/embeddings.mjs';
import { InMemoryVectorStore } from '../../src/core/vector-store.mjs';

const enc=new TextEncoder();
const concat=(...parts)=>{const n=parts.reduce((s,p)=>s+p.length,0),o=new Uint8Array(n);let x=0;for(const p of parts){o.set(p,x);x+=p.length;}return o;};
const le16=(n)=>new Uint8Array([n&255,(n>>>8)&255]);
const le32=(n)=>new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]);
function storedZip(name,text,{declaredUncompressed=null}={}) {
  const fn=enc.encode(name),data=enc.encode(text),usize=declaredUncompressed??data.length;
  const local=concat(le32(0x04034b50),le16(20),le16(0),le16(0),le16(0),le16(0),le32(0),le32(data.length),le32(usize),le16(fn.length),le16(0),fn,data);
  const central=concat(le32(0x02014b50),le16(20),le16(20),le16(0),le16(0),le16(0),le16(0),le32(0),le32(data.length),le32(usize),le16(fn.length),le16(0),le16(0),le16(0),le16(0),le32(0),le32(0),fn);
  const eocd=concat(le32(0x06054b50),le16(0),le16(0),le16(1),le16(1),le32(central.length),le32(local.length),le16(0));
  return concat(local,central,eocd);
}
async function deflatedZip(name,text) {
  const fn=enc.encode(name),plain=enc.encode(text);
  const stream=new Blob([plain]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const data=new Uint8Array(await new Response(stream).arrayBuffer());
  const local=concat(le32(0x04034b50),le16(20),le16(0),le16(8),le16(0),le16(0),le32(0),le32(data.length),le32(plain.length),le16(fn.length),le16(0),fn,data);
  const central=concat(le32(0x02014b50),le16(20),le16(20),le16(0),le16(8),le16(0),le16(0),le32(0),le32(data.length),le32(plain.length),le16(fn.length),le16(0),le16(0),le16(0),le16(0),le32(0),le32(0),fn);
  const eocd=concat(le32(0x06054b50),le16(0),le16(0),le16(1),le16(1),le32(central.length),le32(local.length),le16(0));
  return concat(local,central,eocd);
}
function simplePdf(text,{active=false}={}) {
  const body=`%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R ${active?'/JavaScript 9 0 R':''} >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj\n4 0 obj << /Length ${text.length+40} >>\nstream\nBT /F1 12 Tf 72 720 Td (${text}) Tj ET\nendstream\nendobj\n%%EOF`;
  return enc.encode(body);
}

test('validation accepts supported types and rejects mismatch/oversize',()=>{
  const bytes=enc.encode('hola');
  assert.equal(classifyDocument({filename:'a.txt',mime:'text/plain',bytes}).extension,'txt');
  assert.throws(()=>classifyDocument({filename:'a.pdf',mime:'text/plain',bytes}),e=>e instanceof IngestionError && e.code==='MIME_EXTENSION_MISMATCH');
  assert.throws(()=>classifyDocument({filename:'a.exe',bytes}),e=>e.code==='UNSUPPORTED_FORMAT');
  assert.throws(()=>classifyDocument({filename:'a.txt',bytes:new Uint8Array(20),maxBytes:10}),e=>e.code==='FILE_TOO_LARGE');
});

test('TXT extraction normalizes readable text',async()=>{
  const r=await extractText({bytes:enc.encode('  Cláusula uno.\r\n\r\n  Cláusula dos. '),extension:'txt'});
  assert.equal(r.text,'Cláusula uno.\n\nCláusula dos.');
  assert.equal(r.extractor_id,'utf8-text');
});

test('DOCX extraction reads word/document.xml and rejects oversized expansion',async()=>{
  const xml='<?xml version="1.0"?><w:document xmlns:w="x"><w:body><w:p><w:r><w:t>Contrato privado</w:t></w:r></w:p><w:p><w:r><w:t>Cláusula laboral</w:t></w:r></w:p></w:body></w:document>';
  const ok=await extractText({bytes:storedZip('word/document.xml',xml),extension:'docx'});
  assert.equal(ok.text,'Contrato privado\nCláusula laboral');
  const compressed=await extractText({bytes:await deflatedZip('word/document.xml',xml),extension:'docx'});
  assert.equal(compressed.text,'Contrato privado\nCláusula laboral');
  await assert.rejects(()=>extractText({bytes:storedZip('word/document.xml','x',{declaredUncompressed:6*1024*1024}),extension:'docx'}),e=>e.code==='DOCX_XML_TOO_LARGE');
});

test('PDF extraction reads a text layer and refuses OCR claims/active content',async()=>{
  const ok=await extractText({bytes:simplePdf('Contrato privado con obligaciones verificables.'),extension:'pdf'});
  assert.match(ok.text,/Contrato privado/); assert.equal(ok.page_count,1);
  await assert.rejects(()=>extractText({bytes:enc.encode('%PDF-1.4\n1 0 obj << /Type /Page >> endobj\n%%EOF'),extension:'pdf'}),e=>e.code==='OCR_REQUIRED_OR_UNSUPPORTED' && e.details.ocr_supported===false);
  await assert.rejects(()=>extractText({bytes:simplePdf('texto suficiente para prueba de contenido activo',{active:true}),extension:'pdf'}),e=>e.code==='PDF_ACTIVE_CONTENT');
  await assert.rejects(()=>extractText({bytes:enc.encode('%PDF-1.4\n1 0 obj << /Encrypt 8 0 R >> endobj\n%%EOF'),extension:'pdf'}),e=>e.code==='ENCRYPTED_PDF_UNSUPPORTED');
});

test('ingestor hashes, deduplicates, indexes and exposes metadata without source text',async()=>{
  let tick=0; const clock=()=>`2026-08-31T00:00:0${tick++}Z`;
  const store=new InMemoryVectorStore();
  const ingestor=new DocumentIngestor({embeddingProvider:new LocalHashEmbeddingProvider({dimension:128}),vectorStore:store,clock});
  const bytes=enc.encode('Contrato de trabajo. La persona prestará servicios bajo instrucciones y recibirá un salario mensual. '.repeat(8));
  const first=await ingestor.ingest({filename:'cliente.txt',mime:'text/plain',bytes,scope:'session-a'});
  assert.equal(first.deduplicated,false); assert.equal(first.document.visibility,'session_private'); assert.ok(first.document.chunk_count>0);
  assert.equal(Object.hasOwn(first.document,'text'),false);
  assert.equal(store.count({scope:'session-a'}),first.document.chunk_count);
  const dup=await ingestor.ingest({filename:'otra-ruta/cliente.txt',mime:'text/plain',bytes,scope:'session-a'});
  assert.equal(dup.deduplicated,true); assert.equal(dup.document.id,first.document.id);
  const other=await ingestor.ingest({filename:'cliente.txt',mime:'text/plain',bytes,scope:'session-b'});
  assert.notEqual(other.document.id,first.document.id);
});

test('re-index preserves id and deletion removes vectors and retained text',async()=>{
  let tick=0; const clock=()=>`2026-08-31T00:01:${String(tick++).padStart(2,'0')}Z`;
  const store=new InMemoryVectorStore(); const ingestor=new DocumentIngestor({vectorStore:store,clock});
  const {document}=await ingestor.ingest({filename:'contrato.txt',bytes:enc.encode('Obligación contractual con evidencia. '.repeat(40)),scope:'s'});
  const created=document.created_at, before=document.last_indexed_at;
  const re=await ingestor.reindex(document.id); assert.equal(re.id,document.id); assert.equal(re.created_at,created); assert.notEqual(re.last_indexed_at,before);
  assert.ok(ingestor.inspectSourcePassages(document.id).length>0); assert.equal(ingestor.hasRetainedSourceText(document.id),true);
  assert.equal(ingestor.removeDocument(document.id),true); assert.equal(store.count({document_id:document.id}),0); assert.equal(ingestor.hasRetainedSourceText(document.id),false); assert.deepEqual(ingestor.inspectSourcePassages(document.id),[]);
  const tombstone=ingestor.getDocument(document.id); assert.equal(tombstone.deletion_status,'deleted'); assert.equal(tombstone.chunk_count,0);
  await assert.rejects(()=>ingestor.reindex(document.id),e=>e.code==='DOCUMENT_DELETED');
});


test('whole-index migration safely changes embedding dimension and version metadata',async()=>{
  const store=new InMemoryVectorStore();
  const ingestor=new DocumentIngestor({embeddingProvider:new LocalHashEmbeddingProvider({dimension:128}),vectorStore:store});
  const a=await ingestor.ingest({filename:'a.txt',bytes:enc.encode('Contrato laboral y salario. '.repeat(30)),scope:'s'});
  const b=await ingestor.ingest({filename:'b.txt',bytes:enc.encode('Documento notarial y escritura. '.repeat(30)),scope:'s'});
  const countBefore=store.count({scope:'s'});
  const migrated=await ingestor.reindexAll({embeddingProvider:new LocalHashEmbeddingProvider({dimension:256})});
  assert.equal(store.dimension,256);
  assert.equal(store.count({scope:'s'}),countBefore);
  assert.equal(migrated.length,2);
  assert.ok(migrated.every(d=>d.embedding_model==='charword-256' && d.index_namespace.includes('charword-256')));
  assert.equal(ingestor.getDocument(a.document.id).id,a.document.id);
  assert.equal(ingestor.getDocument(b.document.id).id,b.document.id);
});


test('ingestor rejects reserved public scopes at the boundary',async()=>{
  const ingestor=new DocumentIngestor();
  await assert.rejects(()=>ingestor.ingest({filename:'spoof.txt',bytes:enc.encode('contenido privado'),scope:'public:CO'}),e=>e.code==='RESERVED_PRIVATE_SCOPE');
});
