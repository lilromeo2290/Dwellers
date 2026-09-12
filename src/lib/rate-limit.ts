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
 *
 * Memory safety: the bucket map is capped at MAX_TRACKED_BUCKETS. When the
 * cap is reached, expired buckets are swept first; if the map is still full
 * (a flood of unique attacker keys), the oldest-inserted buckets are evicted.
 * Legitimate traffic is never locked out by the sweep itself — evicted
 * buckets simply start a fresh window on the next request.
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
/** Hard cap on tracked buckets — bounds memory under unique-key floods. */
export const MAX_TRACKED_BUCKETS = 10_000

function evictIfNeeded(now: number): void {
  if (buckets.size < MAX_TRACKED_BUCKETS) return

  // 1. Sweep expired windows first — the common case recovers full capacity.
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }

  // 2. Still full (flood of distinct keys): evict oldest-inserted entries.
  //    Map iterates in insertion order, so this is FIFO — the least recently
  //    created windows go first.
  for (const key of buckets.keys()) {
    if (buckets.size < MAX_TRACKED_BUCKETS) break
    buckets.delete(key)
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

/**
 * Extracts the client IP with an explicit trusted-proxy strategy.
 *
 * Forwarded headers (`X-Forwarded-For`, `X-Real-IP`) are attacker-controlled
 * on direct traffic and are NEVER trusted blindly. The behaviour is decided
 * by configuration:
 *
 *  - TRUST_PROXY_ENABLED=false (default): the app expects direct traffic or
 *    terminates TLS itself; forwarded headers are ignored and the caller is
 *    recorded as `direct`. Per-route limiting still applies (shared bucket),
 *    so disabling proxy trust never disables protection.
 *
 *  - TRUST_PROXY_ENABLED=true: the deployment sits behind infrastructure we
 *    control (e.g. Caddy/NGINX/CDN). With `TRUSTED_PROXY_HOPS` trusted
 *    proxies in front, the entry `length - hops` positions into X-Forwarded-For
 *    is the client IP as recorded by the first trusted proxy. Hops MUST match
 *    the real deployment topology — the operators of trusted proxies are
 *    responsible for sanitising client-supplied XFF values.
 *
 * See ARCHITECTURE.md → "Client IP & trusted proxies" for the deployment
 * matrix. Redis-backed limiting (later phase) will reuse this extraction.
 */
export const DIRECT_TRAFFIC_IP = 'direct'

export function getClientIp(request: Request): string {
  if (!env.TRUST_PROXY_ENABLED) return DIRECT_TRAFFIC_IP

  const hops = Math.max(0, env.TRUSTED_PROXY_HOPS)
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const parts = forwarded
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)

    // With `hops` trusted proxies in the chain, the LAST `hops` entries of
    // X-Forwarded-For were appended by our own infrastructure; the entry at
    // index `length - hops` is the client as observed by the first trusted
    // proxy (P1 appends the client, P2 appends P1, …).
    if (hops >= 1 && parts.length >= hops) {
      const candidate = parts[parts.length - hops]
      if (candidate) return candidate
    }
    // Fewer recorded hops than expected topology — the proxy chain did not
    // append what we assume; fall through to a safe default instead of
    // trusting the leftmost (most spoofable) entry.
  }

  // Single-hop deployments commonly also set X-Real-IP (equivalent trust).
  if (hops <= 1) {
    const realIp = request.headers.get('x-real-ip')?.trim()
    if (realIp) return realIp
  }

  return DIRECT_TRAFFIC_IP
}
