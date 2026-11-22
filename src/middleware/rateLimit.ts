import type { MiddlewareHandler } from 'hono';
import { RateLimitedError } from '../lib/errors';
import type { Env } from '../types';

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const LIMIT = 10;
const WINDOW_MS = 60_000;

// Per-isolate token bucket. Good enough to stop casual abuse on a free demo;
// a production system would use a durable store (KV/D1 or Rate Limiting API).
const buckets = new Map<string, Bucket>();

export const rateLimit: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const key =
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-forwarded-for') ??
    c.req.header('x-real-ip') ??
    'anonymous';

  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: LIMIT, updatedAt: now };
  const elapsed = now - bucket.updatedAt;

  if (elapsed >= WINDOW_MS) {
    bucket.tokens = LIMIT;
    bucket.updatedAt = now;
  } else {
    bucket.tokens = Math.min(LIMIT, bucket.tokens + (elapsed / WINDOW_MS) * LIMIT);
  }

  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    throw new RateLimitedError('Too many requests, slow down', 60);
  }

  bucket.tokens -= 1;
  if (elapsed > 0) bucket.updatedAt = now;
  buckets.set(key, bucket);

  await next();
};
