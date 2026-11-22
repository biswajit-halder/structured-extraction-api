import { z } from 'zod';
import { getSchema, schemaIds, type SchemaSpec } from '../schemas/registry';
import { toBatchJsonSchema } from '../schemas/jsonSchema';
import { getByIdempotencyKey, getByCacheKey, insertExtraction } from '../db/queries';
import { extractionCacheKey, normalizeText } from '../lib/hash';
import { newId, safeParseJson } from '../lib/json';
import { RateLimitedError, UnprocessableExtractionError, ValidationError } from '../lib/errors';
import { callLlm, type ChatMessage } from './llm';
import { buildBatchPrompt, buildRepairPrompt, wrapDocuments } from './prompt';
import type { Env, ExtractionRecord, ExtractionResponse, LlmResult } from '../types';

export interface ExtractInput {
  schemaId: string;
  text: string;
  idempotencyKey?: string;
}

export interface BatchInput {
  schemaId: string;
  items: Array<{ clientId?: string; text: string }>;
}

export interface CacheLookup {
  record: ExtractionRecord;
  source: 'kv' | 'd1';
}

export interface BatchResult {
  results: Array<{ clientId?: string; response: ExtractionResponse }>;
  meta: {
    model: string;
    llmCalls: number;
    tokens: { prompt: number; completion: number };
    latencyMs: number;
    repairAttempts: number;
  };
}

const CACHE_PREFIX = 'ext:v1:';
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;

export function assertKnownSchema(schemaId: string): SchemaSpec {
  if (!schemaIds().includes(schemaId)) throw new ValidationError(`Unknown schema "${schemaId}"`);
  return getSchema(schemaId);
}

// ---------------------------------------------------------------------------
// Single extraction
// ---------------------------------------------------------------------------

export async function extractOne(env: Env, input: ExtractInput): Promise<ExtractionResponse> {
  const spec = getSchema(input.schemaId);
  const normalized = normalizeText(input.text);
  if (!normalized) throw new ValidationError('text must not be empty after normalization');

  if (input.idempotencyKey) {
    const existing = await getByIdempotencyKey(env, input.idempotencyKey);
    if (existing) return toResponse(existing, { cached: true, source: 'd1' });
  }

  const cacheKey = await extractionCacheKey(spec.id, spec.version, normalized);
  const cached = await readCache(env, cacheKey);
  if (cached) return toResponse(cached.record, { cached: true, source: cached.source });

  let llm: LlmResult;
  try {
    llm = await callLlm({
      env,
      systemPrompt: spec.systemPrompt,
      userPrompt: normalized,
      jsonSchema: spec.jsonSchema,
      schemaName: spec.id,
    });
  } catch (error) {
    if (error instanceof RateLimitedError) {
      const stale = await readCache(env, cacheKey);
      if (stale) return toResponse(stale.record, { cached: true, source: stale.source, stale: true });
    }
    throw error;
  }

  const outcome = await parseWithRepair(env, spec, spec.zod, llm, normalized, spec.jsonSchema, spec.id);

  const record: ExtractionRecord = {
    id: newId(),
    cacheKey,
    idempotencyKey: input.idempotencyKey ?? null,
    schemaId: spec.id,
    schemaVersion: spec.version,
    data: applyBusinessRules(spec.id, outcome.data),
    model: outcome.llm.model,
    inputChars: normalized.length,
    promptTokens: outcome.llm.promptTokens,
    completionTokens: outcome.llm.completionTokens,
    cached: false,
    repairAttempts: outcome.repairAttempts,
    latencyMs: outcome.llm.latencyMs,
    createdAt: new Date().toISOString(),
  };

  await persist(env, cacheKey, record);
  return toResponse(record, { cached: false, source: 'llm' });
}

// ---------------------------------------------------------------------------
// Batch extraction (5 documents, one LLM call)
// ---------------------------------------------------------------------------

export async function extractBatch(env: Env, input: BatchInput): Promise<BatchResult> {
  const spec = getSchema(input.schemaId);
  const documents = input.items.map((item) => normalizeText(item.text));
  documents.forEach((doc, index) => {
    if (!doc) throw new ValidationError(`items[${index}].text must not be empty`);
  });

  const keys = await Promise.all(
    documents.map((doc) => extractionCacheKey(spec.id, spec.version, doc)),
  );
  const cached = await Promise.all(keys.map((key) => readCache(env, key)));

  let outcome:
    | { data: unknown[]; llm: LlmResult; repairAttempts: number }
    | { data: null; llm: null; repairAttempts: 0 };

  if (cached.every((entry) => entry !== null)) {
    outcome = { data: null, llm: null, repairAttempts: 0 };
  } else {
    const batchZod = z.strictObject({ results: z.array(spec.zod).min(1).max(documents.length) });
    const parsed = await parseWithRepair(
      env,
      spec,
      batchZod,
      await callLlm({
        env,
        systemPrompt: spec.systemPrompt,
        extraInstructions: buildBatchPrompt(documents.length),
        userPrompt: wrapDocuments(documents),
        jsonSchema: toBatchJsonSchema(spec.jsonSchema, documents.length),
        schemaName: `${spec.id}_batch`,
      }),
      wrapDocuments(documents),
      toBatchJsonSchema(spec.jsonSchema, documents.length),
      `${spec.id}_batch`,
    );
    outcome = {
      data: (parsed.data as { results: unknown[] }).results,
      llm: parsed.llm,
      repairAttempts: parsed.repairAttempts,
    };
  }

  const results: BatchResult['results'] = [];
  const writes: Array<Promise<void>> = [];

  for (let index = 0; index < documents.length; index++) {
    const hit = cached[index];
    if (hit) {
      results.push({
        clientId: input.items[index].clientId,
        response: toResponse(hit.record, { cached: true, source: hit.source }),
      });
      continue;
    }

    const rawData = outcome.data?.[index];
    if (rawData === undefined) {
      throw new UnprocessableExtractionError(`Batch response missing result at index ${index}`);
    }

    const record: ExtractionRecord = {
      id: newId(),
      cacheKey: keys[index],
      idempotencyKey: null,
      schemaId: spec.id,
      schemaVersion: spec.version,
      data: applyBusinessRules(spec.id, rawData),
      model: outcome.llm?.model ?? 'cache',
      inputChars: documents[index].length,
      promptTokens: index === 0 ? (outcome.llm?.promptTokens ?? 0) : 0,
      completionTokens: 0,
      cached: false,
      repairAttempts: outcome.repairAttempts,
      latencyMs: index === 0 ? (outcome.llm?.latencyMs ?? 0) : 0,
      createdAt: new Date().toISOString(),
    };
    results.push({
      clientId: input.items[index].clientId,
      response: toResponse(record, { cached: false, source: outcome.llm ? 'llm' : 'd1' }),
    });
    writes.push(persist(env, keys[index], record));
  }

  await Promise.all(writes);

  return {
    results,
    meta: {
      model: outcome.llm?.model ?? 'cache',
      llmCalls: outcome.llm ? 1 + outcome.repairAttempts : 0,
      tokens: {
        prompt: outcome.llm?.promptTokens ?? 0,
        completion: outcome.llm?.completionTokens ?? 0,
      },
      latencyMs: outcome.llm?.latencyMs ?? 0,
      repairAttempts: outcome.repairAttempts,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function parseWithRepair(
  env: Env,
  spec: SchemaSpec,
  zod: z.ZodType,
  initial: LlmResult,
  userPrompt: string,
  jsonSchema: ReturnType<typeof toBatchJsonSchema>,
  schemaName: string,
): Promise<{ data: unknown; llm: LlmResult; repairAttempts: number }> {
  let llm = initial;
  let validation = zod.safeParse(safeParseJson(llm.raw));

  if (validation.success) {
    return { data: validation.data, llm, repairAttempts: 0 };
  }

  const issues = validation.error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');

  const conversation: ChatMessage[] = [
    { role: 'system', content: spec.systemPrompt },
    { role: 'user', content: userPrompt },
    { role: 'assistant', content: llm.raw },
    { role: 'user', content: buildRepairPrompt(issues) },
  ];

  const repair = await callLlm({
    env,
    systemPrompt: spec.systemPrompt,
    userPrompt,
    jsonSchema,
    schemaName,
    messages: conversation,
    models: [llm.model],
  });

  llm = {
    raw: repair.raw,
    model: repair.model,
    promptTokens: llm.promptTokens + repair.promptTokens,
    completionTokens: llm.completionTokens + repair.completionTokens,
    latencyMs: llm.latencyMs + repair.latencyMs,
  };

  validation = zod.safeParse(safeParseJson(repair.raw));
  if (!validation.success) {
    throw new UnprocessableExtractionError(
      validation.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  return { data: validation.data, llm, repairAttempts: 1 };
}

async function readCache(env: Env, cacheKey: string): Promise<CacheLookup | null> {
  try {
    const fromKv = await env.CACHE.get(`${CACHE_PREFIX}${cacheKey}`, 'json');
    if (fromKv) return { record: fromKv as ExtractionRecord, source: 'kv' };
  } catch {
    // KV unavailable — fall through to D1
  }

  const fromDb = await getByCacheKey(env, cacheKey);
  if (fromDb) {
    await writeKv(env, cacheKey, fromDb);
    return { record: fromDb, source: 'd1' };
  }
  return null;
}

async function persist(env: Env, cacheKey: string, record: ExtractionRecord): Promise<void> {
  await Promise.all([writeKv(env, cacheKey, record), insertExtraction(env, record)]);
}

async function writeKv(env: Env, cacheKey: string, record: ExtractionRecord): Promise<void> {
  try {
    await env.CACHE.put(`${CACHE_PREFIX}${cacheKey}`, JSON.stringify(record), {
      expirationTtl: CACHE_TTL_SECONDS,
    });
  } catch {
    // Cache is an optimisation, never a hard failure.
  }
}

function toResponse(
  record: ExtractionRecord,
  options: { cached: boolean; source: 'kv' | 'd1' | 'llm'; stale?: boolean },
): ExtractionResponse {
  return {
    id: record.id,
    schema: record.schemaId,
    schemaVersion: record.schemaVersion,
    data: record.data,
    meta: {
      cached: options.cached,
      cacheSource: options.source,
      stale: options.stale ?? false,
      model: record.model,
      tokens: {
        prompt: record.promptTokens,
        completion: record.completionTokens,
      },
      latencyMs: record.latencyMs,
      repairAttempts: record.repairAttempts,
    },
  };
}

function applyBusinessRules(schemaId: string, data: unknown): unknown {
  if (schemaId === 'resume') {
    const resume = data as {
      skills: string[];
      experience: Array<{ start: string; end: string | null; months: number | null }>;
      total_experience_months: number | null;
    };
    resume.skills = Array.from(
      new Set(resume.skills.map((skill) => skill.trim().toLowerCase()).filter(Boolean)),
    ).slice(0, 40);
    resume.experience.forEach((entry) => {
      if (entry.end && entry.end < entry.start) {
        entry.end = null;
        entry.months = null;
      }
    });
    if (resume.total_experience_months === null) {
      resume.total_experience_months = resume.experience.reduce(
        (total, entry) => total + (entry.months ?? 0),
        0,
      );
    }
    return resume;
  }

  if (schemaId === 'job_posting') {
    const posting = data as {
      required_skills: string[];
      preferred_skills: string[];
      salary_min: number | null;
      salary_max: number | null;
    };
    posting.required_skills = Array.from(
      new Set(posting.required_skills.map((skill) => skill.trim().toLowerCase()).filter(Boolean)),
    );
    posting.preferred_skills = Array.from(
      new Set(posting.preferred_skills.map((skill) => skill.trim().toLowerCase()).filter(Boolean)),
    );
    if (
      posting.salary_min !== null &&
      posting.salary_max !== null &&
      posting.salary_min > posting.salary_max
    ) {
      [posting.salary_min, posting.salary_max] = [posting.salary_max, posting.salary_min];
    }
    return posting;
  }

  return data;
}
