import { QuotaExceededError, RateLimitedError, UpstreamError } from '../lib/errors';
import type { Env, LlmResult } from '../types';
import type { JsonObject } from '../schemas/jsonSchema';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  env: Env;
  systemPrompt: string;
  userPrompt: string;
  jsonSchema: JsonObject;
  schemaName: string;
  /** Override models for repair calls or tests. */
  models?: string[];
  /** Additional system-level instructions appended after the base prompt. */
  extraInstructions?: string;
  /** Full conversation override (used by the repair call, which includes the bad output). */
  messages?: ChatMessage[];
}

/** Try the primary free model, then fallbacks, on transient failures only. */
export async function callLlm(request: LlmRequest): Promise<LlmResult> {
  const models = request.models ?? modelList(request.env);
  let lastError: unknown = new UpstreamError('No models configured');
  let firstRateLimit: RateLimitedError | null = null;

  for (const model of models) {
    try {
      return await callModel(request, model);
    } catch (error) {
      // A 402 means the account has no credits left — never retry.
      if (error instanceof QuotaExceededError) throw error;

      // A 429 is usually per-model on the free tier, so another free model
      // may still work. Remember it and only surface it if everything fails.
      if (error instanceof RateLimitedError) {
        firstRateLimit ??= error;
        continue;
      }
      lastError = error;
    }
  }

  if (firstRateLimit) throw firstRateLimit;
  if (lastError instanceof UpstreamError) throw lastError;
  throw new UpstreamError(lastError instanceof Error ? lastError.message : 'Model provider failed');
}

function modelList(env: Env): string[] {
  const fallbacks = (env.FALLBACK_MODELS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return [env.DEFAULT_MODEL, ...fallbacks].filter(Boolean);
}

async function callModel(request: LlmRequest, model: string): Promise<LlmResult> {
  const { env } = request;
  const system = request.extraInstructions
    ? `${request.systemPrompt}\n${request.extraInstructions}`
    : request.systemPrompt;

  const messages: ChatMessage[] = request.messages ?? [
    { role: 'system', content: system },
    { role: 'user', content: request.userPrompt },
  ];

  const timeoutMs = Number(env.REQUEST_TIMEOUT_MS ?? 20000);
  const started = Date.now();

  let response: Response;
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://structured-extraction-api.workers.dev',
        'X-Title': 'Structured Extraction API',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: request.schemaName,
            strict: true,
            schema: request.jsonSchema,
          },
        },
        provider: { require_parameters: true },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new UpstreamError(`Model request failed for ${model}: ${errorMessage(error)}`);
  }

  if (response.status === 402) {
    throw new QuotaExceededError();
  }
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('retry-after') ?? '60');
    throw new RateLimitedError(`Model provider rate limit on ${model}`, Number.isFinite(retryAfter) ? retryAfter : 60);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new UpstreamError(`Model ${model} returned ${response.status}: ${body.slice(0, 300)}`);
  }

  let data: {
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    error?: { message?: string };
  };
  try {
    data = await response.json();
  } catch {
    throw new UpstreamError(`Model ${model} returned invalid JSON`);
  }

  if (data.error?.message) throw new UpstreamError(data.error.message);

  const content = data.choices?.[0]?.message?.content;
  const raw = Array.isArray(content) ? content.map((part) => part.text ?? '').join('') : content;
  if (!raw) throw new UpstreamError(`Model ${model} returned an empty response`);

  return {
    raw,
    model,
    promptTokens: data.usage?.prompt_tokens ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
    latencyMs: Date.now() - started,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
