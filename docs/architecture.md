# Architecture

RAG Juridico ES is a browser-first evidence platform with a domain-neutral core. Colombia is the first jurisdiction pack, not a condition in core retrieval code.

`Jurisdiction pack / private document -> TextExtractor -> deterministic Chunker -> EmbeddingProvider -> VectorStore -> RetrievalPolicy -> CitationBuilder -> GroundedAnswerBuilder -> Evidence UI`

The initial local provider is `local-hash-embedding / charword-384 / v1`: deterministic, local, zero-network and replaceable. Private documents remain in browser session memory only. Official-source snapshots are evidence inputs, not legal certification; unsupported questions must return insufficient evidence.
