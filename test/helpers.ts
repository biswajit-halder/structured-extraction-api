import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import { vi } from 'vitest';
import type { Env } from '../src/types';

export function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    CACHE: {} as KVNamespace,
    OPENROUTER_API_KEY: 'test-key',
    ADMIN_TOKEN: 'admin-token',
    DEFAULT_MODEL: 'model-a:free',
    FALLBACK_MODELS: 'model-b:free,model-c:free',
    REQUEST_TIMEOUT_MS: '5000',
    ALLOWED_ORIGIN: '*',
    ...overrides,
  };
}

export function createMockKv(initial: Record<string, unknown> = {}): KVNamespace {
  const store = new Map<string, string>(
    Object.entries(initial).map(([key, value]) => [key, JSON.stringify(value)]),
  );
  return {
    get: vi.fn(async (key: string) => {
      const value = store.get(key);
      return value === undefined ? null : JSON.parse(value);
    }),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
  } as unknown as KVNamespace;
}

export function chatResponse(content: string, usage?: { prompt_tokens: number; completion_tokens: number }) {
  return {
    choices: [{ message: { content } }],
    usage: usage ?? { prompt_tokens: 10, completion_tokens: 20 },
  };
}

export const validResume = {
  full_name: 'Test User',
  email: 'test@example.com',
  phone: null,
  location: 'Delhi',
  summary: null,
  skills: ['Node.js', 'PostgreSQL'],
  experience: [
    { company: 'Acme', role: 'Developer', start: '2024-01', end: '2024-06', months: 6 },
  ],
  education: [],
  total_experience_months: 6,
  confidence: 0.9,
};

export const validJob = {
  title: 'Junior Backend Engineer',
  company: 'Acme',
  location: 'Remote',
  remote: true,
  employment_type: 'full_time',
  seniority: 'junior',
  required_skills: ['Node.js'],
  preferred_skills: ['Docker'],
  min_years_experience: 0,
  responsibilities: ['Build APIs'],
  salary_min: 600000,
  salary_max: 900000,
  currency: 'INR',
  confidence: 0.9,
};
