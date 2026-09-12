/**
 * Dwellers — Centralized discovery API (PART 19).
 *
 *   GET /api/discovery/providers
 *
 * THE search contract used by every Dwellers surface. Every parameter is
 * Zod-validated and strictly enumerated — arbitrary SQL-like values are
 * rejected with 400. Public access by design (PART 22): visitors can search
 * before registering. Rate-limited with the shared `search` preset.
 */
import { createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { discoverProviders, discoveryQuerySchema, recordDiscoveryEvent } from '@/modules/discovery/provider-discovery'

export const GET = createHandler(
  { auth: 'public', querySchema: discoveryQuerySchema, rateLimit: 'search' },
  async ({ query }) => {
    const result = await discoverProviders(query)

    // Analytics (PART 32): resolved IDs + coarse outcome only — no PII.
    await recordDiscoveryEvent({
      type: 'provider_search',
      categoryId: result.criteria.categoryId,
      serviceId: result.criteria.serviceId,
      regionId: result.criteria.regionId,
      districtId: result.criteria.districtId,
      townId: result.criteria.townId,
      communityId: result.criteria.communityId,
      resultCount: result.pagination.total,
      sort: result.criteria.sort,
      page: query.page,
    })

    return jsonOk(result)
  },
)
