/**
 * Dwellers — Request validation helpers.
 *
 * All external input (JSON bodies, query strings, route params) passes through
 * zod schemas before it reaches business logic. Validation failures are turned
 * into structured `VALIDATION_ERROR` responses with field-level details.
 */
import { z } from 'zod'
import { BadRequestError, PayloadTooLargeError, ValidationError } from '@/lib/errors'

/** Default cap for JSON request bodies (1 MB). Uploads go through storage. */
export const MAX_JSON_BODY_BYTES = 1024 * 1024

export function validate<TSchema extends z.ZodType>(
  schema: TSchema,
  data: unknown,
): z.infer<TSchema> {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new ValidationError(result.error.flatten())
  }
  return result.data
}

/**
 * Parses a JSON request body with a hard size limit.
 * Returns `undefined` for empty bodies (common for GET-like POSTs).
 */
export async function parseJsonBody(
  request: Request,
  maxBytes: number = MAX_JSON_BODY_BYTES,
): Promise<unknown> {
  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (contentLength > maxBytes) {
    throw new PayloadTooLargeError(maxBytes)
  }

  const raw = await request.text()
  if (!raw) return undefined
  if (raw.length > maxBytes) throw new PayloadTooLargeError(maxBytes)

  try {
    return JSON.parse(raw)
  } catch {
    throw new BadRequestError('Request body must be valid JSON.')
  }
}

/** Validates an already-parsed JSON body against a schema. */
export function validateBody<TSchema extends z.ZodType>(
  schema: TSchema,
  body: unknown,
): z.infer<TSchema> {
  if (body === undefined) {
    throw new BadRequestError('A JSON request body is required.')
  }
  return validate(schema, body)
}

export type QuerySchema = z.ZodType<Record<string, unknown>>

/** Validates URL query parameters against a schema. */
export function validateQuery<TSchema extends QuerySchema>(
  schema: TSchema,
  searchParams: URLSearchParams,
): z.infer<TSchema> {
  const raw: Record<string, string> = {}
  searchParams.forEach((value, key) => {
    raw[key] = value
  })
  return validate(schema, raw)
}
