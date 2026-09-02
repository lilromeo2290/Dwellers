/**
 * Dwellers — HTTP response envelope helpers.
 *
 * All API routes return the same envelope shape (see src/types/api.ts).
 * Never call NextResponse.json bare-handed in a route; use these helpers so
 * status codes, caching and error shapes stay consistent platform-wide.
 */
import { NextResponse } from 'next/server'
import type { ApiErrorBody, ApiSuccessBody, ResponseMeta } from '@/types/api'

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
} as const

export function jsonOk<T>(
  data: T,
  options: { meta?: ResponseMeta; status?: number; requestId?: string } = {},
): NextResponse<ApiSuccessBody<T>> {
  const body: ApiSuccessBody<T> = { success: true, data }
  if (options.meta) body.meta = options.meta
  const response = NextResponse.json(body, {
    status: options.status ?? 200,
    headers: JSON_HEADERS,
  })
  if (options.requestId) response.headers.set('x-request-id', options.requestId)
  return response
}

export function jsonCreated<T>(data: T, options: { requestId?: string } = {}) {
  return jsonOk(data, { status: 201, requestId: options.requestId })
}

export function jsonNoContent() {
  return new NextResponse(null, { status: 204 })
}

export function jsonError(
  error: ApiErrorBody['error'],
  status: number,
  headers: Record<string, string> = {},
): NextResponse<ApiErrorBody> {
  const response = NextResponse.json({ success: false, error } as ApiErrorBody, {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  })
  if (error.requestId) response.headers.set('x-request-id', error.requestId)
  return response
}
