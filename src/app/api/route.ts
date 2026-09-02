/**
 * API index — describes the platform's API surface and conventions.
 *
 * Route groups follow a predictable pattern and are implemented phase by
 * phase (see ARCHITECTURE.md → Delivery roadmap). Unknown paths return the
 * standard error envelope via the not-found handler below.
 */
import { createHandler } from '@/lib/api/handler'
import { env } from '@/lib/env'

interface ApiIndex {
  name: string
  version: string
  appEnv: string
  documentation: string
  conventions: Record<string, unknown>
  routeGroups: { prefix: string; purpose: string; status: string }[]
}

export const GET = createHandler({ auth: 'public' }, async (): Promise<ApiIndex> => {
  const implemented = 'operational' as const
  const planned = 'planned' as const

  return {
    name: env.APP_NAME,
    version: '1.0.0',
    appEnv: env.appEnv,
    documentation: '/ARCHITECTURE.md (repo) — API conventions section',
    conventions: {
      envelope: {
        success: '{ success: true, data, meta? }',
        failure: '{ success: false, error: { code, message, details?, requestId? } }',
      },
      pagination: '?page=1&pageSize=20 (max 100)',
      auth: 'Bearer session (NextAuth JWT); Authorization enforced per-route at the API layer',
      rateLimit: 'Per-IP buckets; 429 responses carry Retry-After',
      requestId: 'Every response carries x-request-id for log correlation',
    },
    routeGroups: [
      { prefix: '/api/health', purpose: 'Liveness and database connectivity', status: implemented },
      { prefix: '/api/auth', purpose: 'Registration, login, password management', status: planned },
      { prefix: '/api/users', purpose: 'Account profiles and self-service', status: planned },
      { prefix: '/api/providers', purpose: 'Provider and business profiles', status: planned },
      { prefix: '/api/categories', purpose: 'Marketplace category taxonomy', status: planned },
      { prefix: '/api/services', purpose: 'Service listings', status: planned },
      { prefix: '/api/products', purpose: 'Product listings (suppliers)', status: planned },
      { prefix: '/api/equipment', purpose: 'Equipment listings and rentals', status: planned },
      { prefix: '/api/projects', purpose: 'Customer projects, tasks, milestones', status: planned },
      { prefix: '/api/quotes', purpose: 'Quotation requests and responses', status: planned },
      { prefix: '/api/orders', purpose: 'Orders and fulfilment', status: planned },
      { prefix: '/api/payments', purpose: 'Payments and transactions', status: planned },
      { prefix: '/api/messages', purpose: 'Conversations and notifications', status: planned },
      { prefix: '/api/notifications', purpose: 'User notifications', status: planned },
      { prefix: '/api/reviews', purpose: 'Reviews, ratings, reports', status: planned },
      { prefix: '/api/admin', purpose: 'Platform administration (staff only)', status: planned },
    ],
  }
})
