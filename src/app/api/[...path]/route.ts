/**
 * Dwellers — API catch-all.
 *
 * Unknown /api/* paths fall through here (Next.js matches concrete routes
 * first) and receive the standard JSON error envelope instead of the HTML
 * 404 page — machine clients must never have to parse HTML.
 */
import { errorResponse } from '@/lib/api/handler'
import { NotFoundError } from '@/lib/errors'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'api', route: '/api/[...path]' })

function notFound(request: Request): ReturnType<typeof errorResponse> {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID()
  return errorResponse(new NotFoundError('API route'), requestId, log)
}

export const GET = notFound
export const POST = notFound
export const PUT = notFound
export const PATCH = notFound
export const DELETE = notFound
export const HEAD = notFound
