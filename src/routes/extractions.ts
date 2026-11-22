import { Hono } from 'hono';
import { z } from 'zod';
import { getById } from '../db/queries';
import { NotFoundError, ValidationError } from '../lib/errors';
import { extractBatch, extractOne } from '../services/extraction';
import type { Env } from '../types';

export const extractionsRoutes = new Hono<{ Bindings: Env }>();

const SingleRequest = z.object({
  text: z.string().min(1).max(8000),
  schema: z.enum(['resume', 'job_posting']),
  idempotencyKey: z.string().min(1).max(128).optional(),
});

const BatchRequest = z.object({
  items: z
    .array(
      z.object({
        clientId: z.string().max(64).optional(),
        text: z.string().min(1).max(8000),
      }),
    )
    .min(1)
    .max(5)
    .refine((items) => items.reduce((total, item) => total + item.text.length, 0) <= 20_000, {
      message: 'Total text across items must be at most 20000 characters',
    }),
  schema: z.enum(['resume', 'job_posting']),
});

const IdParam = z.object({ id: z.string().min(1).max(128) });

extractionsRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = SingleRequest.safeParse(body);
  if (!parsed.success) throw new ValidationError('Invalid extraction request', parsed.error.issues);

  const response = await extractOne(c.env, {
    schemaId: parsed.data.schema,
    text: parsed.data.text,
    idempotencyKey: parsed.data.idempotencyKey,
  });

  c.header('X-Cache', response.meta.stale ? 'STALE' : response.meta.cached ? 'HIT' : 'MISS');
  c.header('Cache-Control', 'no-store');
  return c.json(response, response.meta.cached ? 200 : 201);
});

extractionsRoutes.post('/batch', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = BatchRequest.safeParse(body);
  if (!parsed.success) throw new ValidationError('Invalid batch request', parsed.error.issues);

  const result = await extractBatch(c.env, {
    schemaId: parsed.data.schema,
    items: parsed.data.items,
  });

  c.header('Cache-Control', 'no-store');
  return c.json(result, 201);
});

extractionsRoutes.get('/:id', async (c) => {
  const params = IdParam.safeParse(c.req.param());
  if (!params.success) throw new ValidationError('Invalid extraction id');

  const record = await getById(c.env, params.data.id);
  if (!record) throw new NotFoundError('Extraction not found');

  return c.json({
    id: record.id,
    schema: record.schemaId,
    schemaVersion: record.schemaVersion,
    data: record.data,
    meta: {
      cached: record.cached,
      cacheSource: 'd1',
      stale: false,
      model: record.model,
      tokens: {
        prompt: record.promptTokens,
        completion: record.completionTokens,
      },
      latencyMs: record.latencyMs,
      repairAttempts: record.repairAttempts,
    },
    createdAt: record.createdAt,
  });
});
