# Grounded legal answer contract

Every answer is structured as RESPUESTA, FUNDAMENTO, FUENTES, DOCUMENTOS DEL USUARIO, INFORMACIÓN QUE FALTA and LÍMITES (localized labels are available in ES/EN/PT).

The deterministic builder does not generate new substantive legal propositions. A supported response reuses eligible retrieved legal evidence; each FUNDAMENTO item and citation carries the same evidence id. If eligible legal evidence is absent, citation metadata is incomplete, or only historical/unresolved material is available, the response is `insufficient_evidence`.

User-document passages are separate from legislation, are marked `untrusted_content=true`, and instruction-like document text is flagged as data rather than executed. Original Colombian legal excerpts remain Spanish even when surrounding answer labels/messages are English or Portuguese.

## Evidence-sufficiency policy
Retrieval and legal sufficiency are deliberately separate decisions. A retrieved legal candidate is eligible for citation/support only when it passes all applicable evidence policy checks: a minimum hybrid score, specific lexical or legal-metadata corroboration (or corroboration from a relevant private document), and a relative-score floor against the strongest specific legal candidate. Unscoped/general queries require stronger direct lexical evidence unless another explicit corroboration path applies.

Default deterministic policy (`grounded-legal-answer.v1`):
- minimum hybrid score: `0.30`;
- minimum legal evidence lexical score: `0.13`;
- minimum unscoped legal lexical score: `0.20`;
- minimum legal metadata lexical score: `0.35`;
- minimum relative score versus strongest specific legal candidate: `0.70`;
- minimum private-document score: `0.20`;
- minimum document-to-rule token corroboration: `0.20`.

These values are versioned policy diagnostics, not hidden model confidence. They were selected against the governed 41-case golden set without weakening any release threshold. Historical/unresolved evidence remains citation-visible when specifically retrieved but cannot by itself make a current legal conclusion supported.
