/** Remove invisible noise and normalise whitespace so equivalent text hashes identically. */
export function normalizeText(input: string): string {
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** SHA-256 via Web Crypto (available in Cloudflare Workers, no node:crypto needed). */
export async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function extractionCacheKey(
  schemaId: string,
  schemaVersion: string,
  text: string,
): Promise<string> {
  return sha256(`${schemaId}:${schemaVersion}:${normalizeText(text)}`);
}
