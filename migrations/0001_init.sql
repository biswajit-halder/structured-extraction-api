CREATE TABLE IF NOT EXISTS extractions (
  id                 TEXT PRIMARY KEY,
  cache_key          TEXT NOT NULL UNIQUE,
  idempotency_key    TEXT UNIQUE,
  schema_id          TEXT NOT NULL,
  schema_version     TEXT NOT NULL,
  data               TEXT NOT NULL,
  model              TEXT NOT NULL,
  input_chars        INTEGER NOT NULL,
  prompt_tokens      INTEGER,
  completion_tokens  INTEGER,
  cached             INTEGER NOT NULL DEFAULT 0,
  repair_attempts    INTEGER NOT NULL DEFAULT 0,
  latency_ms         INTEGER NOT NULL,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_extractions_created
  ON extractions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_extractions_schema
  ON extractions(schema_id, created_at DESC);
