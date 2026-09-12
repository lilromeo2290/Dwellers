/**
 * Dwellers — Nationwide Ghana location browsing (public).
 *
 *   GET /api/locations?level=regions
 *   GET /api/locations?level=districts&regionId=…
 *   GET /api/locations?level=towns&districtId=… (&regionId=… for a region sweep)
 *   GET /api/locations?level=communities&townId=…
 *   `q` narrows by name at any level. Reference data lives in the database —
 *   the frontend never hard-codes locations.
 */
import { createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { buildMeta } from '@/lib/api/pagination'
import { listLocations, locationListQuerySchema } from '@/modules/discovery/discovery-service'

export const GET = createHandler(
  { auth: 'public', querySchema: locationListQuerySchema, rateLimit: 'search' },
  async ({ query }) => {
    const { items, total } = await listLocations(query)
    return jsonOk(items, { meta: buildMeta(total, query.page, query.pageSize) })
  },
)
