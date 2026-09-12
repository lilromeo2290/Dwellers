/**
 * Dwellers — Application error system.
 *
 * Every error surfaced through the API must be an `AppError` (or mapped to one
 * by `toPublicError`). Guarantees:
 *  - Stable machine-readable `code` consumed by clients.
 *  - Correct HTTP `status`.
 *  - `message` is ALWAYS safe to display to end users — internal details
 *    (stack traces, driver errors, credentials) never travel inside AppError.
 *  - Unknown/third-party errors collapse into a generic 500 that leaks nothing.
 */

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR'

interface AppErrorOptions {
  /** Machine-readable details safe for clients (e.g. zod field issues). */
  details?: unknown
  /** Root cause kept for server logs only — never serialised to responses. */
  cause?: unknown
  /** false marks non-operational errors (bugs) for alerting; defaults true. */
  isOperational?: boolean
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly details?: unknown
  /** Operational errors are expected (bad input, missing record…); others alert. */
  readonly isOperational: boolean

  constructor(code: ErrorCode, status: number, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined)
    this.name = new.target.name
    this.code = code
    this.status = status
    this.details = options.details
    this.isOperational = options.isOperational ?? true
    Error.captureStackTrace?.(this, new.target)
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'The request could not be understood.', options: AppErrorOptions = {}) {
    super('BAD_REQUEST', 400, message, options)
  }
}

export class ValidationError extends AppError {
  constructor(details?: unknown, message = 'Some fields need your attention.') {
    super('VALIDATION_ERROR', 422, message, { details })
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Please sign in to continue.') {
    super('UNAUTHORIZED', 401, message)
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action.') {
    super('FORBIDDEN', 403, message)
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super('NOT_FOUND', 404, `${resource} not found.`)
  }
}

export class ConflictError extends AppError {
  constructor(message = 'This resource already exists.', options: AppErrorOptions = {}) {
    super('CONFLICT', 409, message, options)
  }
}

export class RateLimitError extends AppError {
  readonly retryAfterSeconds: number

  constructor(retryAfterSeconds: number, message = 'Too many requests. Please slow down.') {
    super('RATE_LIMITED', 429, message)
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(maxBytes: number) {
    super('PAYLOAD_TOO_LARGE', 413, `Upload exceeds the ${(maxBytes / 1024 / 1024).toFixed(1)} MB limit.`)
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor(message = 'This file type is not supported.') {
    super('UNSUPPORTED_MEDIA_TYPE', 415, message)
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(what = 'Service', options: AppErrorOptions = {}) {
    super('SERVICE_UNAVAILABLE', 503, `${what} is temporarily unavailable. Please try again.`, options)
  }
}

export class InternalError extends AppError {
  constructor(options: AppErrorOptions = {}) {
    super('INTERNAL_ERROR', 500, 'Something went wrong on our side. Please try again.', {
      ...options,
      isOperational: false,
    })
  }
}

/**
 * Normalises any thrown value into an AppError. Unknown errors become a
 * generic InternalError: the original is preserved as `cause` for server logs
 * but nothing sensitive is exposed to the client.
 */
export function toPublicError(error: unknown): AppError {
  if (error instanceof AppError) return error

  // Prisma known errors — mapped to safe, semantic responses.
  const name = (error as { name?: string } | null)?.name
  if (name === 'PrismaClientKnownRequestError') {
    const code = (error as { code?: string }).code
    if (code === 'P2002') return new ConflictError('This record already exists.')
    if (code === 'P2025') return new NotFoundError()
    return new InternalError({ cause: error })
  }
  if (typeof name === 'string' && name.startsWith('PrismaClient')) {
    return new ServiceUnavailableError('Database', { cause: error })
  }

  return new InternalError({ cause: error })
}
