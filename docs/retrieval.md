# Hybrid retrieval

The retriever is domain-neutral. It ranks evidence using local vector similarity, lexical query coverage, metadata authority/source type, a soft legal-domain preference, and a penalty for evidence that is not eligible for a current legal conclusion.

## Scope isolation
Public Colombian evidence uses `scope=public:CO`. Private document chunks retain their session scope. A query may see only `public:CO` plus the exact private scope explicitly supplied to the retriever; it cannot see other private scopes.

## Domain selection
`civil`, `familia`, `laboral`, `penal`, `notarial`, `constitucional`, `general`, and `unsure` are retrieval preferences. A result outside the preferred domain is not discarded; it is labeled `cross_domain` so the answer/UI can explain why it surfaced.

## Evidence eligibility
Historical or unresolved-vigencia material may be retrieved for context but is penalized and returned with `usable_for_current_conclusion=false`. The answer layer must not use it as the sole basis for a current legal conclusion.

## Current scaling boundary
The in-memory demo reranks up to 1000 vector candidates. A production-scale adapter must generate lexical and vector candidate sets independently before fusion; the 1000-record bound is not a production recall guarantee.

## Searchable legal metadata without citation mutation
For legislation, indexing embeds a separate `search_text` composed of the official title, legal identifier, article/section label, and exact governed excerpt. Lexical diagnostics keep `lexical_evidence` and `lexical_metadata` separate. The result's `text` remains the exact governed excerpt, so retrieval can answer queries such as a decree number plus article without changing the text shown or cited as authority.