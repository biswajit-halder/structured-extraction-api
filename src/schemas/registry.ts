import type { z } from 'zod';
import { JobPostingSchema } from './jobPosting';
import { ResumeSchema } from './resume';
import { toStrictJsonSchema, type JsonObject } from './jsonSchema';
import { UnknownSchemaError } from '../lib/errors';

export interface SchemaSpec {
  id: string;
  version: string;
  description: string;
  zod: z.ZodType;
  jsonSchema: JsonObject;
  systemPrompt: string;
}

function makeSpec(
  id: string,
  version: string,
  description: string,
  zod: z.ZodType,
  extraRules: string,
): SchemaSpec {
  return {
    id,
    version,
    description,
    zod,
    jsonSchema: toStrictJsonSchema(zod),
    systemPrompt: [
      'You are a precise information-extraction engine.',
      'Return ONLY a single JSON object that conforms exactly to the supplied JSON schema.',
      'Never output markdown fences, commentary, or explanations.',
      'Never invent, guess, or infer values that are not supported by the input text. Use null for unknown or missing fields.',
      'Trim surrounding whitespace from all strings. Keep original spelling and casing for names.',
      extraRules,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

const specs: SchemaSpec[] = [
  makeSpec(
    'resume',
    '1.0.0',
    'Extract structured facts from a resume or CV.',
    ResumeSchema,
    'Dates use YYYY or YYYY-MM. `months` and `total_experience_months` are integers counting calendar months. Set `confidence` between 0 and 1 to reflect how complete the source text was.',
  ),
  makeSpec(
    'job_posting',
    '1.0.0',
    'Extract structured facts from a job description.',
    JobPostingSchema,
    'Classify seniority and employment_type into the provided enums; use "unknown" when the text does not say. Use null for salary fields that are not stated. Set `confidence` between 0 and 1.',
  ),
];

const registry = new Map(specs.map((spec) => [spec.id, spec]));

export function getSchema(id: string): SchemaSpec {
  const spec = registry.get(id);
  if (!spec) throw new UnknownSchemaError(id);
  return spec;
}

export function listSchemas(): Array<Omit<SchemaSpec, 'zod' | 'systemPrompt'>> {
  return specs.map(({ zod: _zod, systemPrompt: _prompt, ...rest }) => rest);
}

export function schemaIds(): string[] {
  return specs.map((spec) => spec.id);
}
