/**
 * Models sometimes wrap JSON in markdown fences or add a leading sentence.
 * Try a strict parse first, then progressively more forgiving extraction.
 */
export function safeParseJson(raw: string): unknown {
  const trimmed = raw.trim();
  const candidates = [trimmed, stripFences(trimmed), sliceJson(trimmed)];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // try next strategy
    }
  }
  throw new Error('Response was not valid JSON');
}

function stripFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

function sliceJson(raw: string): string | null {
  const firstBrace = raw.indexOf('{');
  const firstBracket = raw.indexOf('[');
  let start = -1;
  if (firstBrace !== -1 && firstBracket !== -1) start = Math.min(firstBrace, firstBracket);
  else start = firstBrace !== -1 ? firstBrace : firstBracket;
  if (start === -1) return null;

  const open = raw[start];
  const close = open === '{' ? '}' : ']';
  const end = raw.lastIndexOf(close);
  if (end <= start) return null;
  return raw.slice(start, end + 1);
}

export function newId(prefix = 'ext'): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}
