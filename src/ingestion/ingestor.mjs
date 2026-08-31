import { DeterministicChunker } from '../core/chunker.mjs';
import { LocalHashEmbeddingProvider } from '../core/embeddings.mjs';
import { InMemoryVectorStore } from '../core/vector-store.mjs';
import { sha256Hex, stableId } from '../core/ids.mjs';
import { classifyDocument, IngestionError } from './validate.mjs';
import { extractText } from './extractors.mjs';

const STAGES=Object.freeze(['preparing','reading','organizing','search_ready','ready']);
const indexNamespace=(provider)=>`${provider.provider}:${provider.model}:${provider.version}:${provider.dimension ?? 'na'}`;

function publicMetadata(record) { return record ? structuredClone(record.metadata) : null; }

export class DocumentIngestor {
  constructor({chunker=new DeterministicChunker(),embeddingProvider=new LocalHashEmbeddingProvider(),vectorStore=new InMemoryVectorStore(),clock=()=>new Date().toISOString(),maxBytes=10*1024*1024}={}) {
    this.chunker=chunker; this.embeddingProvider=embeddingProvider; this.vectorStore=vectorStore; this.clock=clock; this.maxBytes=maxBytes;
    this.documents=new Map();
  }

  async ingest({filename,mime='',bytes,scope}) {
    if (!scope || typeof scope!=='string') throw new IngestionError('SCOPE_REQUIRED','A private document scope is required.');
    if (scope.startsWith('public:')) throw new IngestionError('RESERVED_PRIVATE_SCOPE','Private documents cannot use a reserved public scope.');
    const file=classifyDocument({filename,mime,bytes,maxBytes:this.maxBytes});
    const hash=await sha256Hex(bytes);
    const existing=[...this.documents.values()].find(r=>r.metadata.scope===scope && r.metadata.sha256===hash && r.metadata.deletion_status==='active');
    if (existing) return {document:publicMetadata(existing),stages:[...STAGES],deduplicated:true};
    const id=await stableId('doc',scope,hash);
    const extracted=await extractText({bytes,extension:file.extension});
    if (!extracted.text) throw new IngestionError('NO_TEXT','No readable text was extracted.');
    const now=this.clock();
    const record={
      metadata:{
        id,filename:file.filename,mime:file.mime,byte_size:file.byte_size,sha256:hash,page_count:extracted.page_count,
        ingest_status:'ready',chunk_count:0,embedding_provider:this.embeddingProvider.provider,embedding_model:this.embeddingProvider.model,
        embedding_version:this.embeddingProvider.version,chunker_version:this.chunker.version,extractor_id:extracted.extractor_id,
        extractor_version:extracted.extractor_version,index_namespace:indexNamespace(this.embeddingProvider),created_at:now,last_indexed_at:now,scope,visibility:'session_private',deletion_status:'active',warnings:[...extracted.warnings]
      },
      text:extracted.text,chunks:[]
    };
    await this.#indexRecord(record);
    this.documents.set(id,record);
    return {document:publicMetadata(record),stages:[...STAGES],deduplicated:false};
  }

  async #indexRecord(record) {
    const {id,scope,filename}=record.metadata;
    const chunks=this.chunker.chunk(record.text,{document_id:id,scope,filename,source_type:'user_document',visibility:'session_private'});
    const vectors=await this.embeddingProvider.embedMany(chunks.map(c=>c.text));
    this.vectorStore.deleteByDocument(id);
    chunks.forEach((chunk,i)=>this.vectorStore.upsert({id:chunk.id,text:chunk.text,vector:vectors[i],metadata:{...chunk.metadata}}));
    record.chunks=chunks;
    Object.assign(record.metadata,{chunk_count:chunks.length,embedding_provider:this.embeddingProvider.provider,embedding_model:this.embeddingProvider.model,embedding_version:this.embeddingProvider.version,index_namespace:indexNamespace(this.embeddingProvider),chunker_version:this.chunker.version,last_indexed_at:this.clock(),ingest_status:'ready'});
  }

  async reindexAll({embeddingProvider=this.embeddingProvider,chunker=this.chunker}={}) {
    const active=[...this.documents.values()].filter(r=>r.metadata.deletion_status==='active' && r.text);
    const planned=[];
    for (const record of active) {
      const chunks=chunker.chunk(record.text,{document_id:record.metadata.id,scope:record.metadata.scope,filename:record.metadata.filename,source_type:'user_document',visibility:'session_private'});
      const vectors=await embeddingProvider.embedMany(chunks.map(c=>c.text));
      planned.push({record,chunks,vectors});
    }
    this.vectorStore.clear();
    this.embeddingProvider=embeddingProvider; this.chunker=chunker;
    for (const {record,chunks,vectors} of planned) {
      chunks.forEach((chunk,i)=>this.vectorStore.upsert({id:chunk.id,text:chunk.text,vector:vectors[i],metadata:{...chunk.metadata}}));
      record.chunks=chunks;
      Object.assign(record.metadata,{chunk_count:chunks.length,embedding_provider:embeddingProvider.provider,embedding_model:embeddingProvider.model,embedding_version:embeddingProvider.version,index_namespace:indexNamespace(embeddingProvider),chunker_version:chunker.version,last_indexed_at:this.clock(),ingest_status:'ready'});
    }
    return active.map(publicMetadata);
  }

  getDocument(id) { return publicMetadata(this.documents.get(id)); }
  listDocuments({scope,includeDeleted=false}={}) {
    return [...this.documents.values()].filter(r=>(!scope||r.metadata.scope===scope)&&(includeDeleted||r.metadata.deletion_status==='active')).map(publicMetadata);
  }
  inspectSourcePassages(id) {
    const r=this.documents.get(id); if (!r || r.metadata.deletion_status!=='active') return [];
    return r.chunks.map(({id:chunk_id,index,text,metadata})=>({chunk_id,index,text,metadata:structuredClone(metadata)}));
  }
  async reindex(id) {
    const r=this.documents.get(id); if (!r) throw new IngestionError('DOCUMENT_NOT_FOUND','Document not found.');
    if (r.metadata.deletion_status!=='active' || !r.text) throw new IngestionError('DOCUMENT_DELETED','Deleted documents cannot be re-indexed.');
    await this.#indexRecord(r); return publicMetadata(r);
  }
  removeDocument(id) {
    const r=this.documents.get(id); if (!r) return false;
    this.vectorStore.deleteByDocument(id);
    r.text=null; r.chunks=[];
    Object.assign(r.metadata,{ingest_status:'deleted',chunk_count:0,deletion_status:'deleted',deleted_at:this.clock()});
    return true;
  }
  hasRetainedSourceText(id) { return Boolean(this.documents.get(id)?.text); }
}

export { STAGES as INGESTION_STAGES };
