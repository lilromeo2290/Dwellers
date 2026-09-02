/**
 * Dwellers — In-memory rate limiter (fixed window).
 *
 * Single-instance protection against brute-force login attempts, request
 * flooding and API abuse. Sufficient for the current single-node deployment;
 * when the platform scales horizontally this implementation is swapped for a
 * Redis-backed store behind the SAME interface (see ARCHITECTURE.md → Scaling).
 *
 * The limiter is deliberately generic: callers choose a bucket key
 * (e.g. `ip:route` or `userId:action`) and policy (limit + window).
 */
import { env } from '@/lib/env'

export interface RateLimitPolicy {
  /** Maximum requests allowed per window. */
  limit: number
  /** Window length in milliseconds. */
  windowMs: number
}

export interface RateLimitResult {
  allowed: boolean
  /** Requests remaining in the current window. */
  remaining: number
  /** Epoch ms when the window resets. */
  resetAt: number
  retryAfterSeconds: number
}

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()
const MAX_TRACKED_BUCKETS = 10_000

function evictIfNeeded(now: number) {
  if (buckets.size < MAX_TRACKED_BUCKETS) return
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export function checkRateLimit(key: string, policy: RateLimitPolicy): RateLimitResult {
  if (!env.RATE_LIMIT_ENABLED) {
    return { allowed: true, remaining: Infinity, resetAt: 0, retryAfterSeconds: 0 }
  }

  const now = Date.now()
  evictIfNeeded(now)

  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    const bucket: Bucket = { count: 1, resetAt: now + policy.windowMs }
    buckets.set(key, bucket)
    return {
      allowed: true,
      remaining: policy.limit - 1,
      resetAt: bucket.resetAt,
      retryAfterSeconds: 0,
    }
  }

  existing.count += 1
  const allowed = existing.count <= policy.limit
  return {
    allowed,
    remaining: Math.max(0, policy.limit - existing.count),
    resetAt: existing.resetAt,
    retryAfterSeconds: allowed ? 0 : Math.ceil((existing.resetAt - now) / 1000),
  }
}

/** Preset policies used across the platform. Tune per endpoint as needed. */
export const RateLimitPresets = {
  /** Generic API traffic. */
  standard: { limit: 120, windowMs: 60_000 },
  /** Authentication endpoints (login, register, password reset). */
  auth: { limit: 10, windowMs: 60_000 },
  /** Expensive search/list queries. */
  search: { limit: 60, windowMs: 60_000 },
  /** File uploads. */
  upload: { limit: 20, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitPolicy>

/** Extracts the best-effort client IP from proxy-aware headers. */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}
