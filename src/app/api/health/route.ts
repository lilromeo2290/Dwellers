/**
 * Health check — liveness + database connectivity.
 *
 * Used by monitoring and deployment probes. Returns the standard envelope;
 * a database failure surfaces as 503 with no internal details.
 */
import { createHandler } from '@/lib/api/handler'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { ServiceUnavailableError } from '@/lib/errors'

interface HealthPayload {
  status: 'ok'
  app: string
  appEnv: string
  version: string
  timestamp: string
  uptimeSeconds: number
  checks: { database: 'connected' | 'unavailable' }
}

export const GET = createHandler(
  { auth: 'public', rateLimit: { limit: 300, windowMs: 60_000 } },
  async (): Promise<HealthPayload> => {
    let database: 'connected' | 'unavailable' = 'unavailable'
    try {
      await db.$queryRaw`SELECT 1`
      database = 'connected'
    } catch {
      throw new ServiceUnavailableError('Database')
    }

    return {
      status: 'ok',
      app: env.APP_NAME,
      appEnv: env.appEnv,
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      checks: { database },
    }
  },
)
