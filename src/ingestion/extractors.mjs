import { normalizeDocumentText } from '../core/text.mjs';
import { IngestionError } from './validate.mjs';

const decoder=new TextDecoder('utf-8',{fatal:false});
const latin1=new TextDecoder('latin1');
const u16=(v,o)=>v.getUint16(o,true);
const u32=(v,o)=>v.getUint32(o,true);

async function decompress(bytes,format) {
  if (typeof DecompressionStream!=='function') throw new IngestionError('DECOMPRESSION_UNAVAILABLE','This runtime cannot decompress document streams.');
  try {
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (error) {
    throw new IngestionError('DECOMPRESSION_FAILED','Compressed document content could not be decompressed.',{format,cause:String(error?.message||error)});
  }
}

function findEocd(bytes) {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const min=Math.max(0,bytes.length-65557);
  for (let i=bytes.length-22;i>=min;i-=1) if (u32(view,i)===0x06054b50) return i;
  return -1;
}

async function extractZipEntry(bytes,target,{maxUncompressedBytes=5*1024*1024}={}) {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const eocd=findEocd(bytes);
  if (eocd<0) throw new IngestionError('INVALID_DOCX','DOCX ZIP directory was not found.');
  const entries=u16(view,eocd+10); const cdOffset=u32(view,eocd+16);
  if (entries>10000) throw new IngestionError('DOCX_TOO_COMPLEX','DOCX has too many ZIP entries.');
  let p=cdOffset;
  for (let i=0;i<entries;i+=1) {
    if (p+46>bytes.length || u32(view,p)!==0x02014b50) throw new IngestionError('INVALID_DOCX','DOCX central directory is malformed.');
    const method=u16(view,p+10), compressed=u32(view,p+20), uncompressed=u32(view,p+24);
    const nameLen=u16(view,p+28), extraLen=u16(view,p+30), commentLen=u16(view,p+32), localOffset=u32(view,p+42);
    const name=decoder.decode(bytes.subarray(p+46,p+46+nameLen));
    if (name===target) {
      if (uncompressed>maxUncompressedBytes) throw new IngestionError('DOCX_XML_TOO_LARGE','DOCX document XML exceeds the safe extraction limit.');
      if (compressed>0 && uncompressed/compressed>250) throw new IngestionError('SUSPICIOUS_COMPRESSION_RATIO','DOCX compression ratio exceeds safety limit.');
      if (localOffset+30>bytes.length || u32(view,localOffset)!==0x04034b50) throw new IngestionError('INVALID_DOCX','DOCX local entry is malformed.');
      const localNameLen=u16(view,localOffset+26), localExtraLen=u16(view,localOffset+28);
      const start=localOffset+30+localNameLen+localExtraLen, end=start+compressed;
      if (end>bytes.length) throw new IngestionError('INVALID_DOCX','DOCX entry extends beyond file bounds.');
      const payload=bytes.subarray(start,end);
      if (method===0) return payload;
      if (method===8) return decompress(payload,'deflate-raw');
      throw new IngestionError('UNSUPPORTED_DOCX_COMPRESSION',`Unsupported DOCX compression method ${method}.`);
    }
    p+=46+nameLen+extraLen+commentLen;
  }
  throw new IngestionError('DOCX_TEXT_NOT_FOUND','DOCX does not contain word/document.xml.');
}

function decodeXmlEntities(text) {
  const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,entity)=>{
    if (entity[0]==='#') { const n=entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):parseInt(entity.slice(1),10); return Number.isFinite(n)?String.fromCodePoint(n):''; }
    return named[entity.toLowerCase()] ?? '';
  });
}

function wordXmlToText(xml) {
  const text=xml
    .replace(/<w:tab\b[^>]*\/>/g,'\t')
    .replace(/<w:br\b[^>]*\/>/g,'\n')
    .replace(/<\/w:p>/g,'\n')
    .replace(/<[^>]+>/g,'');
  return normalizeDocumentText(decodeXmlEntities(text));
}

function decodePdfLiteral(value) {
  let out='';
  for (let i=0;i<value.length;i+=1) {
    const ch=value[i];
    if (ch!=='\\') { out+=ch; continue; }
    const n=value[++i]; if (n===undefined) break;
    const map={n:'\n',r:'\r',t:'\t',b:'\b',f:'\f','(':'(',')':')','\\':'\\'};
    if (Object.hasOwn(map,n)) { out+=map[n]; continue; }
    if (n==='\n') continue;
    if (/[0-7]/.test(n)) { let oct=n; for (let j=0;j<2 && /[0-7]/.test(value[i+1]??'');j+=1) oct+=value[++i]; out+=String.fromCharCode(parseInt(oct,8)); continue; }
    out+=n;
  }
  return out;
}

function pdfContentText(content) {
  const parts=[];
  const literalPattern=/\(((?:\\.|[^\\)])*)\)\s*(?:Tj|'|")/g;
  for (const m of content.matchAll(literalPattern)) parts.push(decodePdfLiteral(m[1]));
  const arrays=/\[((?:[^\]]|\][^T])*)\]\s*TJ/g;
  for (const arr of content.matchAll(arrays)) {
    const sub=[]; for (const m of arr[1].matchAll(/\(((?:\\.|[^\\)])*)\)/g)) sub.push(decodePdfLiteral(m[1]));
    if (sub.length) parts.push(sub.join(''));
  }
  for (const m of content.matchAll(/<([0-9a-fA-F\s]+)>\s*Tj/g)) {
    const clean=m[1].replace(/\s/g,''); if (clean.length%2) continue;
    const b=new Uint8Array(clean.length/2); for (let i=0;i<b.length;i+=1) b[i]=parseInt(clean.slice(i*2,i*2+2),16);
    parts.push(latin1.decode(b));
  }
  return normalizeDocumentText(parts.join('\n'));
}

async function extractPdf(bytes) {
  const raw=latin1.decode(bytes);
  if (!raw.startsWith('%PDF-')) throw new IngestionError('INVALID_PDF','PDF signature is missing.');
  if (/\/Encrypt\b/.test(raw)) throw new IngestionError('ENCRYPTED_PDF_UNSUPPORTED','Encrypted PDFs are not supported in this demo.');
  if (/\/(JavaScript|JS\b|Launch\b|RichMedia\b)/.test(raw)) throw new IngestionError('PDF_ACTIVE_CONTENT','PDF contains active-content markers and is rejected for this demo.');
  const page_count=[...raw.matchAll(/\/Type\s*\/Page\b/g)].length || null;
  const pieces=[]; let cursor=0; let streamCount=0;
  while (streamCount<500) {
    const pos=raw.indexOf('stream',cursor); if (pos<0) break;
    const dictStart=raw.lastIndexOf('<<',pos), dictEnd=raw.lastIndexOf('>>',pos);
    let start=pos+6; if (raw[start]==='\r' && raw[start+1]==='\n') start+=2; else if (raw[start]==='\n' || raw[start]==='\r') start+=1;
    const end=raw.indexOf('endstream',start); if (end<0) break;
    const dict=dictStart>=0 && dictEnd>=dictStart ? raw.slice(dictStart,dictEnd+2) : '';
    const payload=bytes.subarray(start,end);
    try {
      const decoded=/\/FlateDecode/.test(dict) ? await decompress(payload,'deflate') : payload;
      if (decoded.length<=5*1024*1024) { const text=pdfContentText(latin1.decode(decoded)); if (text) pieces.push(text); }
    } catch (error) {
      if (!(error instanceof IngestionError)) throw error;
    }
    cursor=end+9; streamCount+=1;
  }
  const text=normalizeDocumentText(pieces.join('\n'));
  if (text.length<20) throw new IngestionError('OCR_REQUIRED_OR_UNSUPPORTED','No reliable text layer was extracted. OCR is not implemented in this demo.',{ocr_supported:false,page_count});
  return {text,page_count,extractor_id:'conservative-pdf-text',extractor_version:'1.0.0',warnings:['PDF extraction is conservative; verify source passages against the original document.']};
}

export async function extractText({bytes,extension}) {
  if (extension==='txt') return {text:normalizeDocumentText(decoder.decode(bytes)),page_count:null,extractor_id:'utf8-text',extractor_version:'1.0.0',warnings:[]};
  if (extension==='docx') {
    if (!(bytes[0]===0x50 && bytes[1]===0x4b)) throw new IngestionError('INVALID_DOCX','DOCX ZIP signature is missing.');
    const xmlBytes=await extractZipEntry(bytes,'word/document.xml');
    const text=wordXmlToText(decoder.decode(xmlBytes));
    if (!text) throw new IngestionError('DOCX_TEXT_NOT_FOUND','DOCX contains no readable paragraph text.');
    return {text,page_count:null,extractor_id:'docx-word-xml',extractor_version:'1.0.0',warnings:[]};
  }
  if (extension==='pdf') return extractPdf(bytes);
  throw new IngestionError('UNSUPPORTED_FORMAT','No extractor for this document type.');
}