import { LocalHashEmbeddingProvider } from '../core/embeddings.mjs';
import { InMemoryVectorStore } from '../core/vector-store.mjs';
import { DocumentIngestor } from '../ingestion/ingestor.mjs';
import { HybridRetriever,indexLegalCorpus } from '../retrieval/hybrid.mjs';
import { GroundedAnswerBuilder } from '../answer/grounded-answer.mjs';

export class LegalResearchController {
  constructor({fetchImpl=null,scope=null,registryUrl=null,corpusUrl=null}={}) {
    this.fetchImpl=fetchImpl??globalThis.fetch?.bind(globalThis);
    this.registryUrl=registryUrl??new URL('../../data/legal/CO/sources.json',import.meta.url).href;
    this.corpusUrl=corpusUrl??new URL('../../data/legal/CO/corpus.json',import.meta.url).href;
    this.scope=scope??`session:${globalThis.crypto?.randomUUID?.()??Math.random().toString(36).slice(2)}`;
    this.embeddingProvider=new LocalHashEmbeddingProvider();
    this.vectorStore=new InMemoryVectorStore();
    this.ingestor=new DocumentIngestor({embeddingProvider:this.embeddingProvider,vectorStore:this.vectorStore});
    this.retriever=new HybridRetriever({embeddingProvider:this.embeddingProvider,vectorStore:this.vectorStore,jurisdiction:'CO'});
    this.answerBuilder=new GroundedAnswerBuilder();
    this.registry=null; this.corpus=null; this.ready=false;
  }

  async initialize() {
    if (!this.fetchImpl) throw new Error('FETCH_UNAVAILABLE');
    const [registryResponse,corpusResponse]=await Promise.all([
      this.fetchImpl(this.registryUrl),
      this.fetchImpl(this.corpusUrl)
    ]);
    if (!registryResponse.ok||!corpusResponse.ok) throw new Error('CORPUS_LOAD_FAILED');
    this.registry=await registryResponse.json(); this.corpus=await corpusResponse.json();
    await indexLegalCorpus({registry:this.registry,corpus:this.corpus,embeddingProvider:this.embeddingProvider,vectorStore:this.vectorStore});
    this.ready=true;
    return this.snapshot();
  }

  snapshot() {
    return {
      ready:this.ready,scope:this.scope,
      sourceCount:this.registry?.sources?.length??0,evidenceCount:this.corpus?.evidence?.length??0,
      documents:this.ingestor.listDocuments({scope:this.scope}),embedding:this.embeddingProvider.metadata()
    };
  }

  async ingestFile(file) {
    const bytes=new Uint8Array(await file.arrayBuffer());
    const result=await this.ingestor.ingest({filename:file.name,mime:file.type,bytes,scope:this.scope});
    return {...result,snapshot:this.snapshot()};
  }

  removeDocument(id) { const removed=this.ingestor.removeDocument(id); return {removed,snapshot:this.snapshot()}; }
  async reindexDocument(id) { const document=await this.ingestor.reindex(id); return {document,snapshot:this.snapshot()}; }
  inspectDocument(id) { return this.ingestor.inspectSourcePassages(id); }

  async research(question,{domain='general',locale='es'}={}) {
    if (!this.ready) throw new Error('CORPUS_NOT_READY');
    const started=performance.now();
    const results=await this.retriever.retrieve(question,{domain,privateScope:this.scope,includeUserDocuments:true,limit:10});
    const answer=this.answerBuilder.build({question,results,locale});
    return {question,domain,results,answer,latency_ms:Math.round((performance.now()-started)*100)/100};
  }
}