/**
 * Dwellers — Route handler factory.
 *
 * THE convention for every API endpoint. One wrapper guarantees:
 *  - unique request id (x-request-id) propagated to logs and responses
 *  - rate limiting per client IP + route bucket
 *  - authentication and permission checks BEFORE business logic
 *  - zod-validated body/query delivered as parsed values
 *  - uniform success/error envelopes with correct status codes
 *  - centralised logging (request lifecycle + access denials)
 *  - safe errors: unknown failures become opaque 500s; nothing internal leaks
 *
 * Type model: the generic parameters are the SCHEMA types themselves (not
 * their outputs), so `body`/`query` resolve through z.output<Schema> —
 * sound by construction. When a schema is absent the corresponding context
 * field is `undefined`, and a handler that tries to use it fails to compile.
 * Handlers that need a body MUST declare bodySchema.
 *
 * Example (Phase 2 route):
 *   export const GET = createHandler(
 *     { auth: 'required', permission: 'projects:manage', querySchema: listQuerySchema },
 *     async ({ query, auth }) => jsonOk(await listProjects(query, auth)),
 *   )
 */
import { NextResponse, type NextRequest } from 'next/server'
import type { z } from 'zod'
import { AppError, ForbiddenError, RateLimitError, toPublicError } from '@/lib/errors'
import { jsonError, jsonOk } from '@/lib/api/response'
import { parseJsonBody, validateBody, validateQuery } from '@/lib/api/validation'
import {
  checkRateLimit,
  getClientIp,
  RateLimitPresets,
  type RateLimitPolicy,
} from '@/lib/rate-limit'
import { getAuthContext, type AuthContext } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/guards'
import { db } from '@/lib/db'
import { LogEvent, logger } from '@/lib/logger'

export type AuthRequirement = 'public' | 'optional' | 'required'
export type RateLimitOption = RateLimitPolicy | keyof typeof RateLimitPresets

export interface HandlerConfig<TBodySchema, TQuerySchema> {
  /** Access requirement — defaults to 'public'. */
  auth?: AuthRequirement
  /** Permission checked against the caller's role when set (implies required auth). */
  permission?: string
  /** Rate-limit policy or preset name; sensible default applied per auth type. */
  rateLimit?: RateLimitOption
  /** Zod schema for the JSON body. */
  bodySchema?: TBodySchema
  /** Zod schema for URL query parameters. */
  querySchema?: TQuerySchema
}

export interface HandlerContext<TBody, TQuery> {
  request: NextRequest
  /** Dynamic route params, e.g. { id: '...' } for /api/x/[id]. */
  params: Record<string, string>
  /** Parsed body when bodySchema is configured; otherwise undefined. */
  body: TBody
  /** Parsed query when querySchema is configured; otherwise Record<string, string>. */
  query: TQuery
  auth: AuthContext | null
  requestId: string
}

function resolvePolicy(option: RateLimitOption | undefined): RateLimitPolicy {
  if (!option) return RateLimitPresets.standard
  if (typeof option === 'string') return RateLimitPresets[option]
  return option
}

type RouteHandler = (
  request: NextRequest,
  routeContext: { params?: Promise<Record<string, string>> },
) => Promise<NextResponse>

export function createHandler<
  TBodySchema extends z.ZodType | undefined = undefined,
  TQuerySchema extends z.ZodType | undefined = undefined,
  TResult = unknown,
>(
  config: HandlerConfig<TBodySchema, TQuerySchema>,
  handler: (context: {
    request: NextRequest
    params: Record<string, string>
    body: TBodySchema extends z.ZodType ? z.output<TBodySchema> : undefined
    query: TQuerySchema extends z.ZodType ? z.output<TQuerySchema> : Record<string, string>
    auth: AuthContext | null
    requestId: string
  }) => Promise<TResult>,
): RouteHandler {
  return async (request, routeContext) => {
    const requestId = crypto.randomUUID()
    const url = new URL(request.url)
    const route = url.pathname
    const log = logger.child({ module: 'api', requestId, route })

    try {
      // 1. Rate limiting -------------------------------------------------------
      const policy = resolvePolicy(config.rateLimit)
      const bucket = `${getClientIp(request)}:${route}`
      const limit = checkRateLimit(bucket, policy)
      if (!limit.allowed) {
        log.warn('Rate limit exceeded', {
          event: LogEvent.RATE_LIMITED,
          bucket,
        })
        return jsonError(
          {
            code: 'RATE_LIMITED',
            message: 'Too many requests. Please slow down and try again shortly.',
            requestId,
          },
          429,
          { 'Retry-After': String(limit.retryAfterSeconds) },
        )
      }

      // 2. Authentication ------------------------------------------------------
      const authRequirement: AuthRequirement = config.permission
        ? 'required'
        : config.auth ?? 'public'
      let auth: AuthContext | null = null
      if (authRequirement !== 'public') {
        auth = await getAuthContext()
        if (!auth && authRequirement === 'required') {
          throw new AppError('UNAUTHORIZED', 401, 'Please sign in to continue.')
        }
        // PART 14/44: suspended/deactivated/deleted accounts never pass
        // protected routes. The JWT status claim fails fast when stale; the
        // LIVE database record is re-checked for every authenticated request
        // (one indexed PK select) so mid-session suspension takes effect
        // immediately — never merely hidden in the UI.
        if (auth) {
          if (auth.status !== 'ACTIVE') {
            logger.warn('Blocked request from non-active account claim', {
              module: 'auth',
              event: LogEvent.ACCESS_DENIED,
              actorId: auth.userId,
              status: auth.status,
            })
            throw new ForbiddenError(
              auth.status === 'SUSPENDED'
                ? 'This account has been suspended. Contact Dwellers support.'
                : 'This account is no longer active.',
            )
          }
          const live = await db.user.findUnique({
            where: { id: auth.userId },
            select: { status: true, deletedAt: true },
          })
          if (!live || live.deletedAt || live.status !== 'ACTIVE') {
            logger.warn('Blocked request from non-active account (live check)', {
              module: 'auth',
              event: LogEvent.ACCESS_DENIED,
              actorId: auth.userId,
              status: live?.status ?? 'MISSING',
            })
            throw new ForbiddenError('This account can no longer be used. Contact Dwellers support.')
          }
        }
      }

      // 3. Authorization (RBAC, backend-enforced) ------------------------------
      if (config.permission) {
        requirePermission(auth, config.permission)
      }

      // 4. Input validation ----------------------------------------------------
      const params = routeContext?.params ? await routeContext.params : {}
      const rawBody = config.bodySchema
        ? validateBody(config.bodySchema, await parseJsonBody(request))
        : undefined
      const rawQuery = config.querySchema
        ? validateQuery(config.querySchema, url.searchParams)
        : Object.fromEntries(url.searchParams)

      // 5. Business logic ------------------------------------------------------
      // Factory invariant: the conditional types above are DERIVED from the
      // configured schemas, so the raw values below match them exactly.
      const result = await handler({
        request,
        params,
        body: rawBody,
        query: rawQuery,
        auth,
        requestId,
      } as Parameters<typeof handler>[0])

      // Handler returned a ready-made NextResponse (streaming/override cases).
      if (result instanceof NextResponse) {
        result.headers.set('x-request-id', requestId)
        return result
      }

      log.debug('Request completed', { status: 200 })
      return jsonOk(result, { requestId })
    } catch (error) {
      return errorResponse(error, requestId, log)
    }
  }
}

/** Shared error mapper — also usable by code outside createHandler. */
export function errorResponse(
  error: unknown,
  requestId: string,
  log: ReturnType<typeof logger.child>,
): NextResponse {
  const publicError = toPublicError(error)

  if (publicError instanceof AppError && !publicError.isOperational) {
    log.error('Unhandled request failure', error, { requestId })
  } else if (
    publicError instanceof AppError &&
    publicError.status >= 400 &&
    publicError.status < 500
  ) {
    log.info('Request rejected', {
      requestId,
      code: publicError.code,
      status: publicError.status,
      message: publicError.message,
    })
  } else {
    log.error('Request failed', error, { requestId })
  }

  if (publicError instanceof RateLimitError) {
    return jsonError(
      { code: publicError.code, message: publicError.message, requestId },
      publicError.status,
      { 'Retry-After': String(publicError.retryAfterSeconds) },
    )
  }

  return jsonError(
    {
      code: publicError.code,
      message: publicError.message,
      details: publicError.details,
      requestId,
    },
    publicError.status,
  )
}
