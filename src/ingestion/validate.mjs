const MIME_BY_EXT=Object.freeze({
  txt:'text/plain',
  docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf:'application/pdf'
});

export class IngestionError extends Error {
  constructor(code,message,details={}) { super(message); this.name='IngestionError'; this.code=code; this.details=details; }
}

export function safeFilename(name='document') {
  const leaf=String(name).replace(/\\/g,'/').split('/').at(-1).replace(/[\u0000-\u001f\u007f]/g,'').trim();
  return (leaf || 'document').slice(0,180);
}

export function classifyDocument({filename,mime='',bytes,maxBytes=10*1024*1024}) {
  const safe=safeFilename(filename);
  const ext=(safe.split('.').at(-1) || '').toLowerCase();
  const normalizedMime=String(mime).split(';')[0].trim().toLowerCase();
  if (!(bytes instanceof Uint8Array)) throw new IngestionError('INVALID_BYTES','Document bytes must be Uint8Array.');
  if (bytes.byteLength===0) throw new IngestionError('EMPTY_FILE','The document is empty.');
  if (bytes.byteLength>maxBytes) throw new IngestionError('FILE_TOO_LARGE',`Document exceeds ${maxBytes} bytes.`,{max_bytes:maxBytes});
  if (!Object.hasOwn(MIME_BY_EXT,ext)) throw new IngestionError('UNSUPPORTED_FORMAT','Supported formats: PDF, DOCX, TXT.');
  const expected=MIME_BY_EXT[ext];
  if (normalizedMime && normalizedMime!=='application/octet-stream' && normalizedMime!==expected) {
    throw new IngestionError('MIME_EXTENSION_MISMATCH',`File extension .${ext} does not match MIME ${normalizedMime}.`);
  }
  return {filename:safe,extension:ext,mime:expected,byte_size:bytes.byteLength};
}
