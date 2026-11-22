import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { adminRoutes } from './routes/admin';
import { extractionsRoutes } from './routes/extractions';
import { schemasRoutes } from './routes/schemas';
import { onError } from './middleware/errorHandler';
import { rateLimit } from './middleware/rateLimit';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

app.onError(onError);

app.use(
  '/v1/*',
  cors({
    origin: (_origin, c) => c.env.ALLOWED_ORIGIN ?? '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Idempotency-Key'],
  }),
);
app.use('/v1/*', rateLimit);

app.route('/v1/schemas', schemasRoutes);
app.route('/v1/extractions', extractionsRoutes);
app.route('/admin', adminRoutes);

app.get('/', (c) =>
  c.json({
    name: 'structured-extraction-api',
    version: '1.0.0',
    docs: '/openapi.yaml (in repo)',
    endpoints: ['GET /v1/schemas', 'POST /v1/extractions', 'POST /v1/extractions:batch'],
  }),
);

app.get('/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }));

export default app;
