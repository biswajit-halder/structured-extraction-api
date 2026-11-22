import type { ErrorHandler } from 'hono';
import { AppError } from '../lib/errors';
import type { Env } from '../types';

export const onError: ErrorHandler<{ Bindings: Env }> = (error, c) => {
  if (error instanceof AppError) {
    if (error.retryAfter !== undefined) c.header('Retry-After', String(error.retryAfter));
    return c.json(error.toBody(), error.status as never);
  }

  console.error('[unhandled]', error);
  return c.json(
    { error: { code: 'INTERNAL', message: 'Internal server error' } },
    500,
  );
};
