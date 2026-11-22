import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  OPENROUTER_API_KEY: string;
  ADMIN_TOKEN: string;
  DEFAULT_MODEL: string;
  FALLBACK_MODELS: string;
  REQUEST_TIMEOUT_MS: string;
  ALLOWED_ORIGIN: string;
}

export interface ExtractionMeta {
  cached: boolean;
  cacheSource: 'kv' | 'd1' | 'llm' | null;
  stale: boolean;
  model: string;
  tokens: { prompt: number; completion: number };
  latencyMs: number;
  repairAttempts: number;
}

export interface ExtractionRecord {
  id: string;
  cacheKey: string;
  idempotencyKey: string | null;
  schemaId: string;
  schemaVersion: string;
  data: unknown;
  model: string;
  inputChars: number;
  promptTokens: number;
  completionTokens: number;
  cached: boolean;
  repairAttempts: number;
  latencyMs: number;
  createdAt: string;
}

export interface ExtractionResponse {
  id: string;
  schema: string;
  schemaVersion: string;
  data: unknown;
  meta: ExtractionMeta;
}

export interface LlmResult {
  raw: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
}
