export function normalizeDocumentText(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[\t\f\v ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function foldForSearch(value) {
  return normalizeDocumentText(value)
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLocaleLowerCase('es');
}

export function tokenize(value) {
  return foldForSearch(value).match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function fnv1a32(value, seed = 0x811c9dc5) {
  let hash = seed >>> 0;
  const bytes = new TextEncoder().encode(String(value));
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function charNgrams(token, size = 3) {
  const padded = `^${token}$`;
  if (padded.length <= size) return [padded];
  const out = [];
  for (let i = 0; i <= padded.length - size; i += 1) out.push(padded.slice(i, i + size));
  return out;
}
