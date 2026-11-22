import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/index';
import { getById } from '../src/db/queries';
import { makeEnv } from './helpers';

vi.mock('../src/db/queries', () => ({
  getByCacheKey: vi.fn(),
  getByIdempotencyKey: vi.fn(),
  getById: vi.fn(),
  insertExtraction: vi.fn(),
}));

const env = makeEnv();

beforeEach(() => {
  vi.mocked(getById).mockResolvedValue(null);
});

describe('public routes', () => {
  it('reports health', async () => {
    const response = await app.request('/health', {}, env);
    expect(response.status).toBe(200);
    expect(((await response.json()) as { status: string }).status).toBe('ok');
  });

  it('lists schemas and demo fixtures', async () => {
    const schemas = (await (await app.request('/v1/schemas', {}, env)).json()) as {
      schemas: unknown[];
    };
    expect(schemas.schemas).toHaveLength(2);

    const fixtures = (await (await app.request('/v1/schemas/fixtures', {}, env)).json()) as {
      fixtures: unknown[];
    };
    expect(fixtures.fixtures.length).toBeGreaterThanOrEqual(5);
  });

  it('returns a structured 400 for invalid input', async () => {
    const response = await app.request(
      '/v1/extractions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schema: 'resume', text: '' }),
      },
      env,
    );

    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 for an unknown extraction id', async () => {
    const response = await app.request('/v1/extractions/does-not-exist', {}, env);
    expect(response.status).toBe(404);
  });

  it('protects the admin seed route', async () => {
    const response = await app.request('/admin/seed', { method: 'POST' }, env);
    expect(response.status).toBe(401);
  });
});
