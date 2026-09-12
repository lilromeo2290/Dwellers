/**
 * Dwellers — Service listings.
 *   GET  /api/services — public browse (category, provider, location, model, q)
 *   POST /api/services — publish ('marketplace:services:create')
 */
import { createHandler } from '@/lib/api/handler'
import { jsonCreated, jsonOk } from '@/lib/api/response'
import { buildMeta } from '@/lib/api/pagination'
import {
  createServiceListing,
  createServiceSchema,
  listServices,
  serviceListQuerySchema,
} from '@/modules/marketplace/listing-service'

export const GET = createHandler(
  { auth: 'public', querySchema: serviceListQuerySchema, rateLimit: 'search' },
  async ({ query }) => {
    const { items, total } = await listServices(query)
    return jsonOk(items, { meta: buildMeta(total, query.page, query.pageSize) })
  },
)

export const POST = createHandler(
  { auth: 'required', permission: 'marketplace:services:create', bodySchema: createServiceSchema },
  async ({ auth, body, requestId }) =>
    jsonCreated(await createServiceListing(auth, body), { requestId }),
)
