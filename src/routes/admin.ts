import { Hono } from 'hono';
import { fixtures } from '../fixtures';
import { UnauthorizedError } from '../lib/errors';
import { extractOne } from '../services/extraction';
import type { Env } from '../types';

export const adminRoutes = new Hono<{ Bindings: Env }>();

adminRoutes.post('/seed', async (c) => {
  if (!c.env.ADMIN_TOKEN || c.req.header('x-admin-token') !== c.env.ADMIN_TOKEN) {
    throw new UnauthorizedError();
  }

  const results: Array<Record<string, unknown>> = [];
  for (const fixture of fixtures) {
    try {
      const response = await extractOne(c.env, {
        schemaId: fixture.schema,
        text: fixture.text,
      });
      results.push({
        name: fixture.name,
        status: 'ok',
        cached: response.meta.cached,
        id: response.id,
      });
    } catch (error) {
      results.push({
        name: fixture.name,
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return c.json({ total: fixtures.length, results });
});
