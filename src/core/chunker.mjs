import { normalizeDocumentText } from './text.mjs';

const PREFERRED_BREAKS = ['\n\n', '\n', '. ', '; ', ': ', ', ', ' '];

export class DeterministicChunker {
  constructor({ maxChars = 900, overlapChars = 120, minBreakRatio = 0.58 } = {}) {
    if (!Number.isInteger(maxChars) || maxChars < 120) throw new Error('maxChars must be an integer >= 120');
    if (!Number.isInteger(overlapChars) || overlapChars < 0 || overlapChars >= maxChars / 2) {
      throw new Error('overlapChars must be >= 0 and < maxChars / 2');
    }
    this.maxChars = maxChars;
    this.overlapChars = overlapChars;
    this.minBreakRatio = minBreakRatio;
    this.id = 'deterministic-text';
    this.version = '1.0.0';
  }

  chunk(text, baseMetadata = {}) {
    const normalized = normalizeDocumentText(text);
    if (!normalized) return [];
    const chunks = [];
    let start = 0;
    let index = 0;
    while (start < normalized.length) {
      const hardEnd = Math.min(normalized.length, start + this.maxChars);
      const end = hardEnd === normalized.length ? hardEnd : this.#preferredEnd(normalized, start, hardEnd);
      const chunkText = normalized.slice(start, end).trim();
      if (chunkText) {
        chunks.push({
          id: `${baseMetadata.document_id ?? baseMetadata.source_id ?? 'text'}:${index}`,
          index,
          start,
          end,
          text: chunkText,
          metadata: { ...baseMetadata, chunk_index: index, chunker_id: this.id, chunker_version: this.version, coordinate_space: 'normalized_text_v1' }
        });
        index += 1;
      }
      if (end >= normalized.length) break;
      let next = Math.max(start + 1, end - this.overlapChars);
      while (next < end && /\S/.test(normalized[next - 1] ?? '') && /\S/.test(normalized[next] ?? '')) next += 1;
      while (next < normalized.length && /\s/.test(normalized[next])) next += 1;
      start = Math.min(next, end);
    }
    return chunks;
  }

  #preferredEnd(text, start, hardEnd) {
    const min = start + Math.floor(this.maxChars * this.minBreakRatio);
    const window = text.slice(min, hardEnd);
    for (const marker of PREFERRED_BREAKS) {
      const at = window.lastIndexOf(marker);
      if (at >= 0) return min + at + marker.length;
    }
    return hardEnd;
  }
}