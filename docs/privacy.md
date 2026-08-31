# Private document behavior

The initial demo processes uploaded documents locally in the browser/session runtime. It has no server upload path, analytics payload containing document text, training path, or long-term document store.

## Retention
- Extracted text, chunks, and vectors exist in session memory only.
- Refreshing/closing the application loses the private document index.
- `removeDocument` deletes all indexed vectors/chunks for that document and clears retained extracted text, leaving only a non-content tombstone metadata record for in-session UI confirmation.
- Re-indexing is available only while an active document's extracted text remains in session memory.

## Formats
- TXT: UTF-8 text extraction.
- DOCX: local ZIP/XML extraction with entry-count, expanded-size, compression-ratio, and bounds limits.
- PDF: conservative text-layer extraction for supported text PDFs. Active-content markers are rejected. OCR is not implemented; image-only or unsupported PDFs return an explicit `OCR_REQUIRED_OR_UNSUPPORTED` error.

## Professional demo warning
Even with local/session-only processing, this is a demonstration build. The UI must state: “Para esta demostración, no cargues información confidencial de clientes.”