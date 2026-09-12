import { PrismaClient } from '@prisma/client'
import { env } from '@/lib/env'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Query logging is a development convenience only: in production every SQL
 * statement (with bound values — emails, phones, names) would leak PII into
 * log drains and add measurable overhead. Production keeps `warn`/`error`
 * events, which never carry statement payloads.
 */
function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: env.isDevelopment ? ['query', 'warn', 'error'] : ['warn', 'error'],
  })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
