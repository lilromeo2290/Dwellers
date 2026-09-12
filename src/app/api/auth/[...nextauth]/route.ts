/**
 * Dwellers — NextAuth catch-all route (Phase 3).
 *
 * Handles session issuance (credentials callback), session reads
 * (GET /api/auth/session) and sign-out (POST /api/auth/signout).
 *
 * POSTs (the credentials sign-in callback) are rate limited with the auth
 * preset (10/min/IP) BEFORE reaching NextAuth, so credential stuffing is
 * throttled at the edge of the handler stack. GETs (session/csrf) are not
 * limited beyond the platform defaults — they carry no secrets.
 */
import { type NextRequest } from 'next/server'
import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth/session'
import { checkRateLimit, getClientIp, RateLimitPresets } from '@/lib/rate-limit'
import { jsonError } from '@/lib/api/response'

const handler = NextAuth(authOptions)

export { handler as GET }

export async function POST(request: NextRequest, context: { params: Promise<{ nextauth: string[] }> }) {
  const ip = getClientIp(request)
  const limit = checkRateLimit(`${ip}:auth-callback`, RateLimitPresets.auth)
  if (!limit.allowed) {
    return jsonError(
      {
        code: 'RATE_LIMITED',
        message: 'Too many sign-in attempts. Please wait a moment and try again.',
      },
      429,
      { 'Retry-After': String(limit.retryAfterSeconds) },
    )
  }
  return handler(request, context)
}
