import { describe, expect, it } from 'vitest';
import { extractionCacheKey, normalizeText, sha256 } from '../src/lib/hash';
import { newId, safeParseJson } from '../src/lib/json';
import { AppError, UnprocessableExtractionError, ValidationError } from '../src/lib/errors';

describe('text normalisation and hashing', () => {
  it('collapses whitespace and strips control characters', () => {
    expect(normalizeText('  Hello   world\u0000\n\n\nnext  ')).toBe('Hello world\n\nnext');
  });

  it('produces stable SHA-256 hashes', async () => {
    const first = await sha256('hello');
    expect(first).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    expect(await sha256('hello')).toBe(first);
    expect(await sha256('world')).not.toBe(first);
  });

  it('changes the cache key when the schema version changes', async () => {
    const a = await extractionCacheKey('resume', '1.0.0', 'same text');
    const b = await extractionCacheKey('resume', '1.1.0', 'same text');
    expect(a).not.toBe(b);
  });
});

describe('JSON parsing', () => {
  it('parses plain, fenced, and prefixed JSON', () => {
    expect(safeParseJson('{"a":1}')).toEqual({ a: 1 });
    expect(safeParseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(safeParseJson('Here you go:\n{"a":1}\nHope this helps.')).toEqual({ a: 1 });
    expect(safeParseJson('[{"a":1}]')).toEqual([{ a: 1 }]);
  });

  it('throws on junk', () => {
    expect(() => safeParseJson('not json at all')).toThrow('not valid JSON');
  });

  it('generates prefixed ids', () => {
    expect(newId()).toMatch(/^ext_[0-9a-f]{32}$/);
    expect(newId('job')).toMatch(/^job_[0-9a-f]{32}$/);
  });
});

describe('error types', () => {
  it('serialises an API error envelope', () => {
    const error = new ValidationError('bad input', [{ path: 'text' }]);
    expect(error).toBeInstanceOf(AppError);
    expect(error.status).toBe(400);
    expect(error.toBody()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'bad input', details: [{ path: 'text' }] },
    });
  });

  it('carries validation details for 422s', () => {
    const error = new UnprocessableExtractionError([{ path: 'email', message: 'invalid' }]);
    expect(error.status).toBe(422);
    expect(error.code).toBe('UNPROCESSABLE_EXTRACTION');
  });
});
