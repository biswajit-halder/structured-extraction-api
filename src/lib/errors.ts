export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNKNOWN_SCHEMA'
  | 'PAYLOAD_TOO_LARGE'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'UPSTREAM_ERROR'
  | 'UNPROCESSABLE_EXTRACTION'
  | 'UNAUTHORIZED'
  | 'INTERNAL';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = new.target.name;
  }

  toBody() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details === undefined ? {} : { details: this.details }),
      },
    };
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Request validation failed', details?: unknown) {
    super('VALIDATION_ERROR', 400, message, details);
  }
}

export class UnknownSchemaError extends AppError {
  constructor(schemaId: string) {
    super('UNKNOWN_SCHEMA', 400, `Unknown schema "${schemaId}"`);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message: string) {
    super('PAYLOAD_TOO_LARGE', 413, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super('NOT_FOUND', 404, message);
  }
}

export class RateLimitedError extends AppError {
  constructor(message = 'Rate limited', retryAfter = 60) {
    super('RATE_LIMITED', 429, message, undefined, retryAfter);
  }
}

export class QuotaExceededError extends AppError {
  constructor(message = 'OpenRouter free quota exhausted') {
    super('QUOTA_EXCEEDED', 402, message);
  }
}

export class UpstreamError extends AppError {
  constructor(message = 'Upstream model provider failed') {
    super('UPSTREAM_ERROR', 502, message);
  }
}

export class UnprocessableExtractionError extends AppError {
  constructor(details: unknown) {
    super('UNPROCESSABLE_EXTRACTION', 422, 'Model output failed validation after one repair attempt', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super('UNAUTHORIZED', 401, message);
  }
}
