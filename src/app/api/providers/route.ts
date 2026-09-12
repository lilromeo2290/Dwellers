/**
 * Dwellers — Provider profiles (the discovery backbone).
 *   GET  /api/providers — public search: "plumbers in Nsawam" =
 *        ?profession=plumber&locationId=<townId>
 *   POST /api/providers — create own provider profile (provider roles only)
 */
import { createHandler } from '@/lib/api/handler'
import { jsonCreated, jsonOk } from '@/lib/api/response'
import { buildMeta } from '@/lib/api/pagination'
import {
  createProviderProfile,
  createProviderProfileSchema,
  listProviders,
  providerListQuerySchema,
} from '@/modules/marketplace/provider-service'

export const GET = createHandler(
  { auth: 'public', querySchema: providerListQuerySchema, rateLimit: 'search' },
  async ({ query }) => {
    const { items, total } = await listProviders(query)
    return jsonOk(items, { meta: buildMeta(total, query.page, query.pageSize) })
  },
)

export const POST = createHandler(
  {
    auth: 'required',
    permission: 'identity:profile:update',
    bodySchema: createProviderProfileSchema,
  },
  async ({ auth, body, requestId }) =>
    jsonCreated(await createProviderProfile(auth, body), { requestId }),
)
