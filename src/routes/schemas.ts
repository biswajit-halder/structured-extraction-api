import { Hono } from 'hono';
import { fixtures } from '../fixtures';
import { listSchemas } from '../schemas/registry';
import type { Env } from '../types';

export const schemasRoutes = new Hono<{ Bindings: Env }>();

schemasRoutes.get('/', (c) => {
  return c.json({ schemas: listSchemas() });
});

// Public sample inputs so the static demo page can offer "load an example".
schemasRoutes.get('/fixtures', (c) => {
  return c.json({ fixtures });
});
