/**
 * Dwellers — Business profiles.
 *   GET  /api/businesses — public directory (filters: type, location, q)
 *   POST /api/businesses — create own business ('marketplace:business:manage')
 */
import { createHandler } from '@/lib/api/handler'
import { jsonCreated, jsonOk } from '@/lib/api/response'
import { buildMeta } from '@/lib/api/pagination'
import {
  businessListQuerySchema,
  createBusinessSchema,
  createBusiness,
  listBusinesses,
} from '@/modules/marketplace/provider-service'

export const GET = createHandler(
  { auth: 'public', querySchema: businessListQuerySchema, rateLimit: 'search' },
  async ({ query }) => {
    const { items, total } = await listBusinesses(query)
    return jsonOk(items, { meta: buildMeta(total, query.page, query.pageSize) })
  },
)

export const POST = createHandler(
  { auth: 'required', permission: 'marketplace:business:manage', bodySchema: createBusinessSchema },
  async ({ auth, body, requestId }) => jsonCreated(await createBusiness(auth, body), { requestId }),
)
