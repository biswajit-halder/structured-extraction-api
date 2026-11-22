import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { callLlm } from '../src/services/llm';
import { QuotaExceededError, RateLimitedError, UpstreamError } from '../src/lib/errors';
import { chatResponse, makeEnv } from './helpers';

let fetchMock: Mock;

function response(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

const baseRequest = {
  systemPrompt: 'Extract facts',
  userPrompt: 'Some resume text',
  jsonSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  schemaName: 'resume',
};

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('callLlm', () => {
  it('sends a strict structured-output request with provider pinning', async () => {
    fetchMock.mockResolvedValueOnce(response(200, chatResponse('{"a":1}')));

    const result = await callLlm({ ...baseRequest, env: makeEnv() });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('model-a:free');
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: {
        name: 'resume',
        strict: true,
        schema: baseRequest.jsonSchema,
      },
    });
    expect(body.provider).toEqual({ require_parameters: true });
    expect(result).toMatchObject({
      raw: '{"a":1}',
      model: 'model-a:free',
      promptTokens: 10,
      completionTokens: 20,
    });
  });

  it('does not fall back when the free quota is exhausted', async () => {
    fetchMock.mockResolvedValueOnce(response(402, { error: { message: 'out of credits' } }));

    await expect(callLlm({ ...baseRequest, env: makeEnv() })).rejects.toBeInstanceOf(QuotaExceededError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('tries other free models on a per-model 429, then surfaces Retry-After', async () => {
    const rateLimited = () => response(429, { error: { message: 'slow down' } }, { 'retry-after': '12' });
    fetchMock
      .mockResolvedValueOnce(rateLimited())
      .mockResolvedValueOnce(rateLimited())
      .mockResolvedValueOnce(rateLimited());

    const error = await callLlm({ ...baseRequest, env: makeEnv() }).catch((e) => e);
    expect(error).toBeInstanceOf(RateLimitedError);
    expect(error.retryAfter).toBe(12);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('falls back to the next free model on a 5xx', async () => {
    fetchMock
      .mockResolvedValueOnce(response(500, { error: { message: 'down' } }))
      .mockResolvedValueOnce(response(200, chatResponse('{"ok":true}')));

    const result = await callLlm({ ...baseRequest, env: makeEnv() });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.model).toBe('model-b:free');
  });

  it('throws an upstream error when every model fails', async () => {
    fetchMock
      .mockResolvedValueOnce(response(503, {}))
      .mockResolvedValueOnce(response(503, {}))
      .mockResolvedValueOnce(response(503, {}));

    await expect(callLlm({ ...baseRequest, env: makeEnv() })).rejects.toBeInstanceOf(UpstreamError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('uses the supplied conversation for repair calls', async () => {
    fetchMock.mockResolvedValueOnce(response(200, chatResponse('{"fixed":true}')));

    await callLlm({
      ...baseRequest,
      env: makeEnv(),
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'input' },
        { role: 'assistant', content: '{"broken":' },
        { role: 'user', content: 'fix it' },
      ],
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).messages).toHaveLength(4);
  });
});
