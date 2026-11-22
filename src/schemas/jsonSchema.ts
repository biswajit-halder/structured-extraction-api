import { z } from 'zod';

export type JsonObject = Record<string, unknown>;

/**
 * Strict-mode JSON Schema for structured outputs.
 *
 * Zod's generator is the source of truth, but we post-process it because
 * strict structured-output endpoints require:
 *   - additionalProperties: false on every object
 *   - every property listed in `required` (nullability carries "optionality")
 */
export function toStrictJsonSchema(schema: z.ZodType): JsonObject {
  const generated = z.toJSONSchema(schema) as JsonObject;
  return enforceStrict(generated) as JsonObject;
}

function enforceStrict(node: unknown): unknown {
  if (!node || typeof node !== 'object') return node;

  if (Array.isArray(node)) {
    return node.map(enforceStrict);
  }

  const obj = { ...(node as JsonObject) };

  if (obj.type === 'object' && obj.properties && typeof obj.properties === 'object') {
    const props = obj.properties as JsonObject;
    obj.required = Object.keys(props);
    obj.additionalProperties = false;
    obj.properties = Object.fromEntries(
      Object.entries(props).map(([key, value]) => [key, enforceStrict(value)]),
    );
  }

  for (const key of ['items', 'anyOf', 'oneOf', 'allOf', 'not', 'if', 'then', 'else'] as const) {
    if (obj[key] !== undefined) obj[key] = enforceStrict(obj[key]);
  }

  if (obj.$defs && typeof obj.$defs === 'object') {
    obj.$defs = Object.fromEntries(
      Object.entries(obj.$defs as JsonObject).map(([key, value]) => [key, enforceStrict(value)]),
    );
  }

  return obj;
}

/** Wrapper used by the batch endpoint: one LLM call returns an ordered array. */
export function toBatchJsonSchema(item: JsonObject, maxItems = 5): JsonObject {
  return enforceStrict({
    type: 'object',
    properties: {
      results: { type: 'array', items: item, minItems: 1, maxItems: maxItems },
    },
    required: ['results'],
    additionalProperties: false,
  }) as JsonObject;
}
