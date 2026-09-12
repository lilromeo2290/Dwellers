/**
 * Dwellers — Product listings (suppliers).
 *   GET  /api/products — public catalogue (category, seller, location, delivery, q)
 *   POST /api/products — publish ('marketplace:products:create')
 */
import { createHandler } from '@/lib/api/handler'
import { jsonCreated, jsonOk } from '@/lib/api/response'
import { buildMeta } from '@/lib/api/pagination'
import {
  createProductListing,
  createProductSchema,
  listProducts,
  productListQuerySchema,
} from '@/modules/marketplace/listing-service'

export const GET = createHandler(
  { auth: 'public', querySchema: productListQuerySchema, rateLimit: 'search' },
  async ({ query }) => {
    const { items, total } = await listProducts(query)
    return jsonOk(items, { meta: buildMeta(total, query.page, query.pageSize) })
  },
)

export const POST = createHandler(
  { auth: 'required', permission: 'marketplace:products:create', bodySchema: createProductSchema },
  async ({ auth, body, requestId }) =>
    jsonCreated(await createProductListing(auth, body), { requestId }),
)
