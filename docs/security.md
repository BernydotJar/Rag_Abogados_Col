# Security and privacy threat model

## Protected assets
- Private legal/client document bytes, extracted text, chunks and vectors.
- Separation between private sessions/documents and the governed public corpus.
- Integrity of legal citations, source type, article/version metadata and insufficiency decisions.
- Browser execution integrity when uploaded text contains hostile instructions or HTML-like content.

## Trust boundaries
1. **Governed public corpus** — curated legislative evidence with provenance. It is data, not executable instructions.
2. **Private uploaded document** — always untrusted content, even when supplied by the user. It may contain prompt injection, markup, malicious parser constructs or misleading legal claims.
3. **Browser session memory** — the only private-document persistence boundary in this demo.
4. **Static application assets** — code and governed corpus are same-origin. No private upload API exists.

## Threats and controls

| Threat | Control |
|---|---|
| Prompt injection in uploaded text | User-document evidence is typed separately, marked untrusted, never executed as policy, and the legal answer remains extractive/citation-bound. Instruction-like text is flagged for diagnostics. |
| HTML/script payload inside text | UI writes document/evidence content with `textContent`; `innerHTML`, `insertAdjacentHTML`, and `document.write` are absent from runtime rendering. |
| Cross-session leakage | Private retrieval requires the exact private scope and `source_type=user_document`; public scope is reserved to legislation. |
| Cross-document leakage | Document id metadata is retained on every chunk; deletion removes that document's vectors and text. Tests cover another private scope and removed documents. |
| Scope spoofing | Retrieval authorizes `(source_type, scope)`, and `public:*` is rejected as a private scope. |
| DOCX zip bomb / malformed ZIP | Entry count, expanded size, compression ratio and bounds checks; no external-entity XML parser. |
| PDF active content | JavaScript/JS, Launch and RichMedia markers rejected; encrypted PDF rejected; OCR not claimed. |
| Oversized file | 10 MiB default whole-file limit. |
| Confidential data retention | Private text/chunks/vectors are session memory only. Remove clears content and vectors; only a non-content in-session tombstone may remain until refresh. |
| Model training / telemetry | No model-training code, analytics SDK, beacon, XHR upload or private-document fetch path exists. Local deterministic embeddings require no provider secret or network call. |
| Error leakage | Main UI shows localized generic errors; technical code is limited to advanced diagnostics. |
| Legal source confusion | Legislation and user documents have distinct source types and citation renderers; historical/unresolved evidence cannot ground a current conclusion by itself. |

## Retention and deletion contract
- Processing location: browser/session runtime.
- Remote processing of uploaded documents: none in this build.
- Private persistence: none beyond the active page session.
- Training use: none; there is no training pipeline.
- Telemetry containing private content: none.
- Delete: removes indexed vectors/chunks and clears extracted text; a non-content deletion tombstone may remain in session UI until refresh.
- Refresh/close: loses the private session index.

## Residual limitations
This is a professional demonstration, not a production multi-tenant service. It has no authentication, server-side tenant boundary, DLP, malware sandbox, production CSP/header deployment profile or long-term audit store. The UI therefore warns users not to upload confidential client information. A production deployment must add authenticated tenant isolation, server/edge security headers, CSP, retention controls and operational logging that excludes document content.
