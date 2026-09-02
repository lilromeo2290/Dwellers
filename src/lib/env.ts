/**
 * Dwellers — Environment configuration (server-side only).
 *
 * Single source of truth for environment variables. Values are validated once
 * at module load with zod so the application fails fast with a clear message
 * instead of misbehaving at runtime.
 *
 * Rules:
 *  - NEVER import this module from client components ("use client").
 *  - Only NEXT_PUBLIC_* values are safe to expose to the browser.
 *  - Sensitive values are optional in development (features stay disabled)
 *    but can be enforced via `requiredInProduction` below.
 */
import { z } from 'zod'

const booleanish = z
  .string()
  .optional()
  .transform((value) => value === 'true' || value === '1')

const appEnvironmentSchema = z.enum(['development', 'staging', 'production'])

/**
 * Sensitive variables that MUST be present in staging/production but may be
 * absent locally so that contributors can boot the app without third-party
 * accounts. Extend this list as integrations (email, SMS, payments) land.
 */
const requiredInProduction = z
  .string()
  .optional()
  .refine(
    (value, ctx) => {
      const appEnv = process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development'
      if (appEnv === 'production' && !value) {
        ctx.addIssue({ code: 'custom', message: 'is required in production' })
        return false
      }
      return true
    },
    { message: 'is required in production' },
  )

const envSchema = z.object({
  // Application ----------------------------------------------------------------
  APP_ENV: appEnvironmentSchema.optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  APP_NAME: z.string().default('Dwellers'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Database -------------------------------------------------------------------
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Auth -----------------------------------------------------------------------
  AUTH_SECRET: requiredInProduction,
  NEXTAUTH_URL: z.string().url().optional(),

  // Storage --------------------------------------------------------------------
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('./uploads'),
  STORAGE_PUBLIC_URL: z.string().url().optional(),

  // Integrations (optional in Phase 1 — activate per feature) -------------------
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  SMS_API_KEY: z.string().optional(),
  WHATSAPP_TOKEN: z.string().optional(),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  REDIS_URL: z.string().url().optional(),

  // Flags ---------------------------------------------------------------- them
  RATE_LIMIT_ENABLED: booleanish,
})

export type AppEnvironment = z.infer<typeof appEnvironmentSchema>

export type Env = z.infer<typeof envSchema> & {
  /** Resolved deployment environment (APP_ENV or NODE_ENV). */
  appEnv: AppEnvironment
  isProduction: boolean
  isDevelopment: boolean
}

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env)

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')
    throw new Error(
      `Invalid environment configuration. Fix the following before starting:\n${issues}`,
    )
  }

  const value = parsed.data
  const appEnv: AppEnvironment =
    value.APP_ENV ?? (value.NODE_ENV === 'test' ? 'development' : value.NODE_ENV)

  return {
    ...value,
    RATE_LIMIT_ENABLED: value.RATE_LIMIT_ENABLED ?? appEnv !== 'development',
    appEnv,
    isProduction: appEnv === 'production',
    isDevelopment: appEnv === 'development',
  }
}

/** Validated environment. Throws at import time when misconfigured. */
export const env = loadEnv()

/** Public (client-safe) subset. Never add secrets here. */
export const publicEnv = {
  appUrl: env.NEXT_PUBLIC_APP_URL,
  appName: env.APP_NAME,
} as const
