import type { Env, ExtractionRecord } from '../types';

interface ExtractionRow {
  id: string;
  cache_key: string;
  idempotency_key: string | null;
  schema_id: string;
  schema_version: string;
  data: string;
  model: string;
  input_chars: number;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cached: number;
  repair_attempts: number;
  latency_ms: number;
  created_at: string;
}

const COLUMNS = `id, cache_key, idempotency_key, schema_id, schema_version, data,
  model, input_chars, prompt_tokens, completion_tokens, cached, repair_attempts,
  latency_ms, created_at`;

export async function getByCacheKey(env: Env, key: string): Promise<ExtractionRecord | null> {
  const row = await env.DB.prepare(`SELECT ${COLUMNS} FROM extractions WHERE cache_key = ?`)
    .bind(key)
    .first<ExtractionRow>();
  return row ? toRecord(row) : null;
}

export async function getByIdempotencyKey(env: Env, key: string): Promise<ExtractionRecord | null> {
  const row = await env.DB.prepare(`SELECT ${COLUMNS} FROM extractions WHERE idempotency_key = ?`)
    .bind(key)
    .first<ExtractionRow>();
  return row ? toRecord(row) : null;
}

export async function getById(env: Env, id: string): Promise<ExtractionRecord | null> {
  const row = await env.DB.prepare(`SELECT ${COLUMNS} FROM extractions WHERE id = ?`)
    .bind(id)
    .first<ExtractionRow>();
  return row ? toRecord(row) : null;
}

export async function insertExtraction(env: Env, record: ExtractionRecord): Promise<void> {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO extractions (
      id, cache_key, idempotency_key, schema_id, schema_version, data,
      model, input_chars, prompt_tokens, completion_tokens, cached,
      repair_attempts, latency_ms, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      record.id,
      record.cacheKey,
      record.idempotencyKey,
      record.schemaId,
      record.schemaVersion,
      JSON.stringify(record.data),
      record.model,
      record.inputChars,
      record.promptTokens,
      record.completionTokens,
      record.cached ? 1 : 0,
      record.repairAttempts,
      record.latencyMs,
      record.createdAt ?? new Date().toISOString(),
    )
    .run();
}

export function toRecord(row: ExtractionRow): ExtractionRecord {
  return {
    id: row.id,
    cacheKey: row.cache_key,
    idempotencyKey: row.idempotency_key,
    schemaId: row.schema_id,
    schemaVersion: row.schema_version,
    data: safeParseStored(row.data),
    model: row.model,
    inputChars: row.input_chars,
    promptTokens: row.prompt_tokens ?? 0,
    completionTokens: row.completion_tokens ?? 0,
    cached: Boolean(row.cached),
    repairAttempts: row.repair_attempts,
    latencyMs: row.latency_ms,
    createdAt: row.created_at,
  };
}

function safeParseStored(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
