import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { extractBatch, extractOne } from '../src/services/extraction';
import { getByIdempotencyKey, getByCacheKey, insertExtraction } from '../src/db/queries';
import { extractionCacheKey } from '../src/lib/hash';
import { UnprocessableExtractionError } from '../src/lib/errors';
import type { ExtractionRecord } from '../src/types';
import { chatResponse, createMockKv, makeEnv, validResume } from './helpers';

vi.mock('../src/db/queries', () => ({
  getByCacheKey: vi.fn(),
  getByIdempotencyKey: vi.fn(),
  getById: vi.fn(),
  insertExtraction: vi.fn(),
}));

let fetchMock: Mock;
const resumeText = 'Test User\ntest@example.com\nNode.js developer, 2024-01 to 2024-06 at Acme.';

function response(status: number, body: unknown) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...(status === 429 ? { 'retry-after': '5' } : {}) },
  });
}

function makeRecord(cacheKey: string, id = 'ext_test'): ExtractionRecord {
  return {
    id,
    cacheKey,
    idempotencyKey: null,
    schemaId: 'resume',
    schemaVersion: '1.0.0',
    data: validResume,
    model: 'cached-model:free',
    inputChars: 10,
    promptTokens: 5,
    completionTokens: 5,
    cached: false,
    repairAttempts: 0,
    latencyMs: 100,
    createdAt: new Date().toISOString(),
  };
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(getByCacheKey).mockResolvedValue(null);
  vi.mocked(getByIdempotencyKey).mockResolvedValue(null);
  vi.mocked(insertExtraction).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('extractOne', () => {
  it('serves a KV cache hit without calling the model', async () => {
    const cacheKey = await extractionCacheKey('resume', '1.0.0', resumeText);
    const env = makeEnv({ CACHE: createMockKv({ [`ext:v1:${cacheKey}`]: makeRecord(cacheKey) }) });

    const result = await extractOne(env, { schemaId: 'resume', text: resumeText });

    expect(result.meta.cached).toBe(true);
    expect(result.meta.cacheSource).toBe('kv');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls the model, validates, persists and returns a fresh extraction', async () => {
    fetchMock.mockResolvedValueOnce(response(200, chatResponse(JSON.stringify(validResume))));
    const env = makeEnv({ CACHE: createMockKv() });

    const result = await extractOne(env, { schemaId: 'resume', text: resumeText });

    expect(result.meta.cached).toBe(false);
    expect(result.meta.cacheSource).toBe('llm');
    expect(result.data).toMatchObject({ full_name: 'Test User' });
    expect(insertExtraction).toHaveBeenCalledTimes(1);
    expect(env.CACHE.put).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('normalises skills through business rules', async () => {
    fetchMock.mockResolvedValueOnce(
      response(200, chatResponse(JSON.stringify({ ...validResume, skills: [' Node.js ', 'NODE.JS', 'Redis'] }))),
    );

    const result = await extractOne(makeEnv({ CACHE: createMockKv() }), {
      schemaId: 'resume',
      text: resumeText,
    });

    expect((result.data as { skills: string[] }).skills).toEqual(['node.js', 'redis']);
  });

  it('makes exactly one repair call when the first output fails validation', async () => {
    fetchMock
      .mockResolvedValueOnce(response(200, chatResponse('{"full_name": 123}')))
      .mockResolvedValueOnce(response(200, chatResponse(JSON.stringify(validResume))));

    const result = await extractOne(makeEnv({ CACHE: createMockKv() }), {
      schemaId: 'resume',
      text: resumeText,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.meta.repairAttempts).toBe(1);
    expect(result.meta.tokens.prompt).toBe(20);
  });

  it('fails with 422 after a failed repair', async () => {
    fetchMock
      .mockResolvedValueOnce(response(200, chatResponse('{"full_name": 123}')))
      .mockResolvedValueOnce(response(200, chatResponse('{"full_name": 456}')));

    await expect(
      extractOne(makeEnv({ CACHE: createMockKv() }), { schemaId: 'resume', text: resumeText }),
    ).rejects.toBeInstanceOf(UnprocessableExtractionError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('serves a stale cached record when the provider rate limits us', async () => {
    const cacheKey = await extractionCacheKey('resume', '1.0.0', resumeText);
    vi.mocked(getByCacheKey)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeRecord(cacheKey, 'ext_stale'));
    fetchMock.mockResolvedValueOnce(response(429, { error: { message: 'slow down' } }));

    const result = await extractOne(makeEnv({ CACHE: createMockKv() }), {
      schemaId: 'resume',
      text: resumeText,
    });

    expect(result.id).toBe('ext_stale');
    expect(result.meta.stale).toBe(true);
  });

  it('returns an existing idempotency record without calling the model', async () => {
    vi.mocked(getByIdempotencyKey).mockResolvedValueOnce(makeRecord('any', 'ext_idem'));

    const result = await extractOne(makeEnv({ CACHE: createMockKv() }), {
      schemaId: 'resume',
      text: resumeText,
      idempotencyKey: 'client-key-1',
    });

    expect(result.id).toBe('ext_idem');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('extractBatch', () => {
  it('extracts several documents in a single model call', async () => {
    fetchMock.mockResolvedValueOnce(
      response(200, chatResponse(JSON.stringify({ results: [validResume, validResume] }))),
    );

    const result = await extractBatch(makeEnv({ CACHE: createMockKv() }), {
      schemaId: 'resume',
      items: [
        { clientId: 'a', text: `${resumeText} extra one` },
        { clientId: 'b', text: `${resumeText} extra two` },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].clientId).toBe('a');
    expect(result.meta.llmCalls).toBe(1);
    expect(insertExtraction).toHaveBeenCalledTimes(2);
  });

  it('uses zero model calls when every document is cached', async () => {
    const texts = [`${resumeText} one`, `${resumeText} two`];
    const entries = Object.fromEntries(
      await Promise.all(
        texts.map(async (text) => {
          const key = await extractionCacheKey('resume', '1.0.0', text);
          return [`ext:v1:${key}`, makeRecord(key)] as const;
        }),
      ),
    );

    const result = await extractBatch(makeEnv({ CACHE: createMockKv(entries) }), {
      schemaId: 'resume',
      items: texts.map((text) => ({ text })),
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.meta.llmCalls).toBe(0);
    expect(result.results.every((item) => item.response.meta.cached)).toBe(true);
  });
});
