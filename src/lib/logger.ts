/**
 * Dwellers — Structured application logging.
 *
 * Centralised logger used by every server-side module. Output is:
 *  - pretty, human-readable in development
 *  - single-line JSON in staging/production (log shippers friendly)
 *
 * Security rules enforced here:
 *  - Known sensitive keys are redacted recursively before serialisation.
 *  - Stack traces are only printed in development; production logs carry the
 *    error name, message and code so internals never leak through log drains
 *    shared with non-engineers.
 */
import { env } from '@/lib/env'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

/** Canonical application event names for search/filter in log drains. */
export const LogEvent = {
  // Identity & access
  LOGIN: 'auth.login',
  LOGOUT: 'auth.logout',
  LOGIN_FAILED: 'auth.login_failed',
  REGISTRATION: 'auth.registration',
  PASSWORD_RESET_REQUESTED: 'auth.password_reset_requested',
  PASSWORD_CHANGED: 'auth.password_changed',
  ROLE_CHANGED: 'auth.role_changed',
  SESSION_REVOKED: 'auth.session_revoked',
  // Trust & verification
  VERIFICATION_CHANGED: 'trust.verification_changed',
  REVIEW_SUBMITTED: 'trust.review_submitted',
  REPORT_FILED: 'trust.report_filed',
  // Commerce
  PAYMENT_EVENT: 'commerce.payment_event',
  ORDER_EVENT: 'commerce.order_event',
  QUOTATION_EVENT: 'commerce.quotation_event',
  // Security & platform
  SECURITY_EVENT: 'security.event',
  RATE_LIMITED: 'security.rate_limited',
  ACCESS_DENIED: 'security.access_denied',
  ADMIN_ACTION: 'admin.action',
  FILE_UPLOAD_REJECTED: 'storage.upload_rejected',
  SYSTEM_EVENT: 'system.event',
} as const

export type LogEventName = (typeof LogEvent)[keyof typeof LogEvent]

const REDACTED = '[redacted]'
const SENSITIVE_KEY_PATTERN =
  /(password|passwd|secret|token|authorization|auth|api[-_]?key|cookie|session|credential|card|pin|momo|otp)/i

function redact(value: object, depth?: number): Record<string, unknown>
function redact(value: unknown, depth?: number): unknown
function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth-limit]'
  if (value === null || value === undefined) return value

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1))
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(value instanceof Error && env.isDevelopment ? { stack: value.stack } : {}),
    }
  }

  if (typeof value === 'object') {
    const output: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redact(item, depth + 1)
    }
    return output
  }

  return value
}

export interface LogContext {
  /** Module or domain emitting the log, e.g. "api", "auth", "storage". */
  module?: string
  /** Correlates all log lines belonging to one request. */
  requestId?: string
  actorId?: string
  [key: string]: unknown
}

export interface Logger {
  debug(message: string, context?: LogContext): void
  info(message: string, context?: LogContext): void
  warn(message: string, context?: LogContext): void
  error(message: string, error?: unknown, context?: LogContext): void
  child(bindings: LogContext): Logger
}

function write(level: LogLevel, logger: Logger, message: string, extra?: unknown[], error?: unknown) {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[env.LOG_LEVEL]) return

  const bindings = (logger as unknown as { __bindings?: LogContext }).__bindings ?? {}
  const payload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    app: 'dwellers',
    appEnv: env.appEnv,
    message,
    ...redact(bindings),
  }

  for (const item of extra ?? []) {
    if (item === undefined) continue
    if (item instanceof Error) {
      payload.error = redact(item)
    } else if (typeof item === 'object') {
      Object.assign(payload, redact(item))
    } else {
      payload.detail = item
    }
  }
  if (error !== undefined) payload.error = redact(error)

  const line =
    env.isProduction || process.env.NEXT_LOG_JSON === 'true'
      ? JSON.stringify(payload)
      : `${payload.ts} ${level.toUpperCase().padEnd(5)} [${String(payload.module ?? 'app')}] ${message}${
          error !== undefined ? ` :: ${error instanceof Error ? error.message : String(error)}` : ''
        }${extra && extra.length ? ` ${JSON.stringify(redact(extra))}` : ''}`

  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export function createLogger(rootBindings: LogContext = {}): Logger {
  const make = (bindings: LogContext): Logger => ({
    debug: (message, context) => write('debug', make(bindings), message, context ? [context] : []),
    info: (message, context) => write('info', make(bindings), message, context ? [context] : []),
    warn: (message, context) => write('warn', make(bindings), message, context ? [context] : []),
    error: (message, error, context) =>
      write('error', make(bindings), message, context ? [context] : [], error),
    child: (childBindings) => make({ ...bindings, ...childBindings }),
  })

  const root = make(rootBindings)
  ;(root as unknown as { __bindings?: LogContext }).__bindings = rootBindings
  return root
}

/** Default application logger. Prefer `createLogger({ module })` per feature. */
export const logger = createLogger({ module: 'app' })
