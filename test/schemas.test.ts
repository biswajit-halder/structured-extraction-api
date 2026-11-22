import { describe, expect, it } from 'vitest';
import { ResumeSchema } from '../src/schemas/resume';
import { JobPostingSchema } from '../src/schemas/jobPosting';
import { getSchema, listSchemas, schemaIds } from '../src/schemas/registry';
import { toBatchJsonSchema, toStrictJsonSchema } from '../src/schemas/jsonSchema';
import { validJob, validResume } from './helpers';

function collectObjects(node: unknown): Array<Record<string, unknown>> {
  const found: Array<Record<string, unknown>> = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const object = value as Record<string, unknown>;
    if (object.type === 'object') found.push(object);
    Object.values(object).forEach(visit);
  };
  visit(node);
  return found;
}

describe('schema registry', () => {
  it('exposes both domains', () => {
    expect(schemaIds()).toEqual(['resume', 'job_posting']);
    expect(listSchemas()).toHaveLength(2);
    expect(getSchema('resume').version).toBe('1.0.0');
  });

  it('throws for an unknown schema', () => {
    expect(() => getSchema('invoice')).toThrow('Unknown schema "invoice"');
  });
});

describe('runtime validation', () => {
  it('accepts a valid resume and rejects a bad email', () => {
    expect(ResumeSchema.safeParse(validResume).success).toBe(true);
    expect(ResumeSchema.safeParse({ ...validResume, email: 'not-an-email' }).success).toBe(false);
  });

  it('rejects unknown fields (strict objects)', () => {
    expect(ResumeSchema.safeParse({ ...validResume, surprise: 1 }).success).toBe(false);
  });

  it('accepts a valid job posting and rejects a bad enum', () => {
    expect(JobPostingSchema.safeParse(validJob).success).toBe(true);
    expect(JobPostingSchema.safeParse({ ...validJob, seniority: 'principal' }).success).toBe(false);
  });
});

describe('strict JSON Schema generation', () => {
  it('marks every object as closed with all properties required', () => {
    const generated = toStrictJsonSchema(ResumeSchema);
    const objects = collectObjects(generated);
    expect(objects.length).toBeGreaterThan(1);
    for (const object of objects) {
      expect(object.additionalProperties).toBe(false);
      const properties = object.properties as Record<string, unknown>;
      expect(object.required).toEqual(Object.keys(properties));
    }
  });

  it('builds a bounded batch wrapper', () => {
    const wrapper = toBatchJsonSchema(toStrictJsonSchema(ResumeSchema), 5);
    const results = wrapper.properties as Record<string, Record<string, unknown>>;
    expect(results.results.minItems).toBe(1);
    expect(results.results.maxItems).toBe(5);
    expect(wrapper.additionalProperties).toBe(false);
  });
});
