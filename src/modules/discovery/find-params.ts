/**
 * Dwellers — /find URL contract (PART 28).
 *
 * Search results must be shareable and refresh-stable, so the page layer
 * parses the same criteria from the URL on every request. Page parsing is
 * deliberately TOLERANT (bad values fall back to defaults so a mangled link
 * never breaks the page); the JSON API is strict and rejects unknown values.
 * Unknown extra query keys (analytics tags etc.) are stripped, never forwarded.
 */
import { z } from 'zod'
import { safeText } from '@/lib/api/schemas'
import { DISCOVERY_SORTS, type DiscoveryQuery } from '@/modules/discovery/provider-discovery'

const pageParamsSchema = z
  .object({
    category: safeText(80).optional().catch(undefined),
    region: z.string().max(64).optional().catch(undefined),
    district: z.string().max(64).optional().catch(undefined),
    town: z.string().max(64).optional().catch(undefined),
    community: z.string().max(64).optional().catch(undefined),
    q: safeText(80).optional().catch(undefined),
    verification: z.enum(['UNVERIFIED', 'PENDING', 'VERIFIED']).optional().catch(undefined),
    availability: z.enum(['AVAILABLE', 'BUSY', 'UNAVAILABLE']).optional().catch(undefined),
    minRating: z.coerce.number().min(0).max(5).optional().catch(undefined),
    maxPrice: z.coerce.number().int().min(0).optional().catch(undefined),
    type: z.enum(['INDIVIDUAL', 'BUSINESS']).optional().catch(undefined),
    distance: z.coerce.number().min(0).max(500).optional().catch(undefined),
    sort: z.enum(DISCOVERY_SORTS).optional().catch(undefined),
    page: z.coerce.number().int().positive().optional().catch(undefined),
    pageSize: z.coerce.number().int().min(1).max(100).optional().catch(undefined),
  })
  .strip()

export type FindPageParams = z.infer<typeof pageParamsSchema>

export const FIND_DEFAULT_PAGE_SIZE = 12

/** Parses raw page search params into tolerant, typed criteria. */
export function parseFindParams(
  raw: Record<string, string | string[] | undefined>,
): FindPageParams {
  const flat: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    const single = Array.isArray(value) ? value[0] : value
    if (typeof single === 'string' && single !== '') flat[key] = single
  }
  return pageParamsSchema.parse(flat)
}

/** Maps page params onto the discovery service contract. */
export function toDiscoveryQuery(params: FindPageParams): DiscoveryQuery {
  return {
    categorySlug: params.category,
    regionId: params.region,
    districtId: params.district,
    townId: params.town,
    communityId: params.community,
    q: params.q,
    verification: params.verification,
    availability: params.availability,
    minRating: params.minRating,
    maxPrice: params.maxPrice,
    providerType: params.type,
    maxDistanceKm: params.distance,
    sort: params.sort ?? 'recommended',
    page: params.page ?? 1,
    pageSize: params.pageSize ?? FIND_DEFAULT_PAGE_SIZE,
  }
}

/** Rebuilds the shareable URL params actually in force (for pagination). */
export function toUrlSearchParams(params: FindPageParams): Record<string, string> {
  const out: Record<string, string> = {}
  const map: [keyof FindPageParams, string][] = [
    ['category', 'category'],
    ['region', 'region'],
    ['district', 'district'],
    ['town', 'town'],
    ['community', 'community'],
    ['q', 'q'],
    ['verification', 'verification'],
    ['availability', 'availability'],
    ['type', 'type'],
    ['sort', 'sort'],
  ]
  for (const [key, urlKey] of map) {
    const value = params[key]
    if (typeof value === 'string' && value) out[urlKey] = value
  }
  if (params.minRating !== undefined) out.minRating = String(params.minRating)
  if (params.maxPrice !== undefined) out.maxPrice = String(params.maxPrice)
  if (params.distance !== undefined) out.distance = String(params.distance)
  if (params.pageSize !== undefined && params.pageSize !== FIND_DEFAULT_PAGE_SIZE) {
    out.pageSize = String(params.pageSize)
  }
  return out
}
