/**
 * Dwellers — Network proxy layer (Next.js 16 `proxy` convention, formerly
 * `middleware`).
 *
 * Runs before every request and provides platform-wide guarantees:
 *  1. Security headers on every response (defence-in-depth alongside
 *     next.config headers — this layer covers dynamic and API responses).
 *  2. Request-ID propagation (accepts upstream ids, else mints one).
 *  3. Coarse rate limiting for /api/* buckets (fine-grained limits live in
 *     route configs via createHandler).
 */
import { NextResponse, type NextRequest } from 'next/server'
import { checkRateLimit, getClientIp, RateLimitPresets } from '@/lib/rate-limit'
import { env } from '@/lib/env'

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-DNS-Prefetch-Control': 'on',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self), payment=(self)',
  ...(env.isProduction
    ? { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload' }
    : {}),
}

export default function proxy(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID()

  // Coarse API rate limiting
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const result = checkRateLimit(`${getClientIp(request)}:api`, RateLimitPresets.standard)
    if (!result.allowed) {
      const response = NextResponse.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests. Please slow down and try again shortly.',
            requestId,
          },
        },
        { status: 429, headers: { 'Retry-After': String(result.retryAfterSeconds) } },
      )
      return finalize(response, requestId)
    }
  }

  const response = NextResponse.next()
  return finalize(response, requestId)
}

function finalize(response: NextResponse, requestId: string): NextResponse {
  response.headers.set('x-request-id', requestId)
  for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(header, value)
  }
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
