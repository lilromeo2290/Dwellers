/**
 * Dwellers — Equipment listings (equipment providers).
 *   GET  /api/equipment — public catalogue (category, location, availability, q)
 *   POST /api/equipment — publish ('marketplace:equipment:create')
 */
import { createHandler } from '@/lib/api/handler'
import { jsonCreated, jsonOk } from '@/lib/api/response'
import { buildMeta } from '@/lib/api/pagination'
import {
  createEquipmentListing,
  createEquipmentSchema,
  listEquipment,
  equipmentListQuerySchema,
} from '@/modules/marketplace/listing-service'

export const GET = createHandler(
  { auth: 'public', querySchema: equipmentListQuerySchema, rateLimit: 'search' },
  async ({ query }) => {
    const { items, total } = await listEquipment(query)
    return jsonOk(items, { meta: buildMeta(total, query.page, query.pageSize) })
  },
)

export const POST = createHandler(
  {
    auth: 'required',
    permission: 'marketplace:equipment:create',
    bodySchema: createEquipmentSchema,
  },
  async ({ auth, body, requestId }) =>
    jsonCreated(await createEquipmentListing(auth, body), { requestId }),
)
