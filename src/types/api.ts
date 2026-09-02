/**
 * Dwellers — Shared API contract types (client-safe).
 *
 * Every JSON response from the Dwellers API uses one of these two envelopes:
 *
 *   success: { success: true,  data: T, meta?: ResponseMeta }
 *   failure: { success: false, error: { code, message, details?, requestId } }
 *
 * Clients (and future mobile apps) should rely exclusively on this contract.
 */

export type ErrorCodeValue =
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

export interface ErrorPayload {
  code: ErrorCodeValue
  /** Human-readable, user-safe message. */
  message: string
  /** Structured, non-sensitive details (e.g. field-level validation issues). */
  details?: unknown
  /** Correlates the response with server logs. */
  requestId?: string
}

export interface ApiErrorBody {
  success: false
  error: ErrorPayload
}

export interface PaginationMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

export interface ResponseMeta {
  pagination?: PaginationMeta
  [key: string]: unknown
}

export interface ApiSuccessBody<T> {
  success: true
  data: T
  meta?: ResponseMeta
}

export type ApiResponseBody<T> = ApiSuccessBody<T> | ApiErrorBody
