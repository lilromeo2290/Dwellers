/**
 * Dwellers — Provider discovery engine (Phase 4).
 *
 * THE one discovery backend for every entry point (homepage search, /find,
 * category landings, location landings, provider directory, search URLs and
 * the REST API). Nothing in the UI re-implements search logic (PART 2).
 *
 * Pipeline (PART 20):
 *   1. validate criteria (zod, strict — no arbitrary query values)
 *   2. resolve location (community→town, district/region sweeps, coordinates)
 *   3. resolve service/category (id or slug, subtree expansion)
 *   4. hard filters — active account, offered service, covering service area,
 *      public eligibility (suspension is a LIVE user-status check)
 *   5. fetch eligible candidates (capped, minimal selects, no N+1)
 *   6. score relevance via the central ranking configuration
 *   7. rank, 8. sort, 9. paginate (server-side), 10. return a standardized,
 *      privacy-safe result envelope (no emails, phones or raw coordinates).
 *
 * Matching is grounded in real rows: "provider offers the service" means an
 * ACTIVE Service row inside the requested category subtree; "serves the
 * area" means a ProviderServiceArea row (or the profile base location).
 * Nothing is inferred from free-text addresses (PART 11).
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { safeText } from '@/lib/api/schemas'
import { paginationQuerySchema, buildPaginationMeta } from '@/lib/api/pagination'
import type { PaginationMeta } from '@/types/api'
import { haversineKm } from '@/lib/geo'
import {
  DISCOVERY_WEIGHTS,
  AVAILABILITY_SCORES,
  VERIFICATION_SCORES,
  RATING_MIN_COUNT,
  NEUTRAL_COMPONENT_SCORE,
  EXPERIENCE_FULL_SCORE_YEARS,
  DISTANCE_BANDS,
  NEARBY_RADIUS_KM,
  LOCATION_HIERARCHY_SCORES,
  SERVICE_MATCH_SCORES,
  DISCOVERY_CANDIDATE_CAP,
  distanceBandFor,
  type DistanceBand,
} from '@/modules/discovery/ranking'

// -----------------------------------------------------------------------------
// Criteria schema (PART 19 — every parameter validated, nothing arbitrary)
// -----------------------------------------------------------------------------

export const DISCOVERY_SORTS = [
  'recommended',
  'nearest',
  'rating',
  'experience',
  'price',
  'response',
] as const

export const discoveryQuerySchema = paginationQuerySchema
  .extend({
    categoryId: z.string().min(1).max(64).optional(),
    categorySlug: safeText(80).optional(),
    serviceId: z.string().min(1).max(64).optional(),
    regionId: z.string().min(1).max(64).optional(),
    districtId: z.string().min(1).max(64).optional(),
    townId: z.string().min(1).max(64).optional(),
    communityId: z.string().min(1).max(64).optional(),
    /** Explicit search point (used when the UI has coordinates, e.g. maps). */
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    verification: z.enum(['UNVERIFIED', 'PENDING', 'VERIFIED']).optional(),
    availability: z.enum(['AVAILABLE', 'BUSY', 'UNAVAILABLE']).optional(),
    minRating: z.coerce.number().min(0).max(5).optional(),
    /** Integer pesewas — upper bound on the provider's starting price. */
    maxPrice: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
    providerType: z.enum(['INDIVIDUAL', 'BUSINESS']).optional(),
    maxDistanceKm: z.coerce.number().min(0).max(500).optional(),
    q: safeText(80).optional(),
    sort: z.enum(DISCOVERY_SORTS).default('recommended'),
  })
  .strict()

export type DiscoveryQuery = z.infer<typeof discoveryQuerySchema>

// -----------------------------------------------------------------------------
// Result types (privacy-safe by construction)
// -----------------------------------------------------------------------------

export interface DiscoveryRating {
  average: number // 0–5, one decimal
  count: number
}

export interface DiscoveryResult {
  providerId: string
  /** Business name for business-affiliated providers, otherwise the person. */
  displayName: string
  providerType: 'INDIVIDUAL' | 'BUSINESS'
  businessId: string | null
  businessName: string | null
  profession: string
  headline: string | null
  avatarKey: string | null
  verificationStatus: string
  rating: DiscoveryRating | null // null = no published reviews yet
  yearsExperience: number
  availabilityStatus: string
  /** Integer pesewas; null = quote required / not published. */
  startingPriceAmount: number | null
  currency: string
  completedJobsCount: number
  primaryLocation: { id: string; name: string; regionName: string | null } | null
  /** Distinct towns the provider explicitly serves (up to 4 for display). */
  serviceAreas: { id: string; name: string; regionName: string | null }[]
  serviceAreaCount: number
  /** Active services inside the searched category (display, max 3). */
  matchedServiceNames: string[]
  portfolioCount: number
  /** Distance from the requested location — derived, never raw coordinates. */
  distanceKm: number | null
  distanceBand: DistanceBand['label'] | null
  /** Plain-language reasons (PART 40) — the numeric score stays internal. */
  reasons: string[]
}

export interface DiscoveryLocationContext {
  level: 'community' | 'town' | 'district' | 'region' | null
  /** What the customer searched, e.g. "Nsawam" / "Greater Accra Region". */
  label: string | null
  breadcrumb: { label: string; href: string | null }[]
  /** Suggested nearby towns for empty states (PART 17/18). */
  nearbyAreas: { id: string; name: string; slug: string; distanceKm: number | null }[]
}

export interface DiscoveryResponse {
  criteria: {
    categoryId: string | null
    categoryName: string | null
    categorySlug: string | null
    serviceId: string | null
    regionId: string | null
    districtId: string | null
    townId: string | null
    communityId: string | null
    providerType: 'INDIVIDUAL' | 'BUSINESS' | null
    verification: string | null
    availability: string | null
    minRating: number | null
    maxPrice: number | null
    q: string | null
    sort: (typeof DISCOVERY_SORTS)[number]
    /** Human summary of WHAT was searched, e.g. "Plumbing". */
    whatLabel: string
  }
  location: DiscoveryLocationContext
  items: DiscoveryResult[]
  pagination: PaginationMeta
  /** Present ONLY when nothing matched exactly — always clearly labeled. */
  nearby: { label: 'Nearby providers'; items: DiscoveryResult[]; total: number } | null
}

// -----------------------------------------------------------------------------
// Analytics (PART 32) — privacy-safe, never breaks a search
// -----------------------------------------------------------------------------

export const DISCOVERY_EVENT_TYPES = [
  'provider_search',
  'service_search',
  'location_search',
  'provider_profile_view',
  'filter_used',
  'provider_contact_clicked',
  'request_service_clicked',
] as const

export type DiscoveryEventType = (typeof DISCOVERY_EVENT_TYPES)[number]

export interface DiscoveryEventInput {
  type: DiscoveryEventType
  categoryId?: string | null
  serviceId?: string | null
  regionId?: string | null
  districtId?: string | null
  townId?: string | null
  communityId?: string | null
  providerId?: string | null
  resultCount?: number | null
  sort?: string | null
  page?: number | null
}

/** Fire-and-forget analytics writer — analytics must never fail a search. */
export async function recordDiscoveryEvent(event: DiscoveryEventInput): Promise<void> {
  try {
    await db.discoveryEvent.create({
      data: {
        eventType: event.type,
        categoryId: event.categoryId ?? null,
        serviceId: event.serviceId ?? null,
        regionId: event.regionId ?? null,
        districtId: event.districtId ?? null,
        townId: event.townId ?? null,
        communityId: event.communityId ?? null,
        providerId: event.providerId ?? null,
        resultCount: event.resultCount ?? null,
        sort: event.sort ?? null,
        page: event.page ?? null,
      },
    })
  } catch {
    // Deliberately swallowed: analytics is best-effort by design.
  }
}

// -----------------------------------------------------------------------------
// Resolution helpers
// -----------------------------------------------------------------------------

interface ResolvedLocation {
  level: 'community' | 'town' | 'district' | 'region' | null
  /** Search point for distance calculations, when known. */
  point: { latitude: number; longitude: number } | null
  /** Hard-filter shape (mutually exclusive tiers). */
  scope:
    | { kind: 'town'; townId: string }
    | { kind: 'district'; districtId: string; townIds: string[] }
    | { kind: 'region'; regionId: string }
    | { kind: 'none' }
  label: string | null
  breadcrumb: { label: string; href: string | null }[]
  /** Requested town (when any), even under district/region sweeps. */
  contextTownId: string | null
}

interface ResolvedCategory {
  id: string
  name: string
  slug: string
  description: string | null
  /** The category plus all descendant IDs (tree depth ≤ 3). */
  subtreeIds: string[]
}

/** Resolves the location tier from validated criteria. Unknown IDs throw a
 *  ValidationError (not 404) — they are query parameters, not resources. */
async function resolveLocation(query: DiscoveryQuery): Promise<ResolvedLocation> {
  // Community → its town (service areas are Town-level).
  if (query.communityId) {
    const community = await db.communityArea.findFirst({
      where: { id: query.communityId, isActive: true },
      include: {
        town: { include: { district: true, region: true } },
      },
    })
    if (!community) throw new ValidationError({ communityId: ['Unknown community'] })
    const { town } = community
    return {
      level: 'community',
      point: pointOf(community.latitude, community.longitude) ?? pointOf(town.latitude, town.longitude),
      scope: { kind: 'town', townId: town.id },
      label: `${community.name} (${town.name})`,
      breadcrumb: [
        { label: 'Ghana', href: '/find' },
        { label: town.region.name, href: `/find?regionId=${town.regionId}` },
        { label: town.district.name, href: null },
        { label: town.name, href: `/find?townId=${town.id}` },
        { label: community.name, href: null },
      ],
      contextTownId: town.id,
    }
  }

  if (query.townId) {
    const town = await db.town.findFirst({
      where: { id: query.townId, isActive: true },
      include: { district: true, region: true },
    })
    if (!town) throw new ValidationError({ townId: ['Unknown town'] })
    return {
      level: 'town',
      point: pointOf(town.latitude, town.longitude),
      scope: { kind: 'town', townId: town.id },
      label: town.name,
      breadcrumb: [
        { label: 'Ghana', href: '/find' },
        { label: town.region.name, href: `/find?regionId=${town.regionId}` },
        { label: town.district.name, href: null },
        { label: town.name, href: `/find?townId=${town.id}` },
      ],
      contextTownId: town.id,
    }
  }

  if (query.districtId) {
    const district = await db.district.findFirst({
      where: { id: query.districtId, isActive: true },
      include: { region: true },
    })
    if (!district) throw new ValidationError({ districtId: ['Unknown district'] })
    const towns = await db.town.findMany({
      where: { districtId: district.id, isActive: true },
      select: { id: true },
    })
    return {
      level: 'district',
      point: pointOf(district.latitude, district.longitude),
      scope: { kind: 'district', districtId: district.id, townIds: towns.map((t) => t.id) },
      label: district.name,
      breadcrumb: [
        { label: 'Ghana', href: '/find' },
        { label: district.region.name, href: `/find?regionId=${district.regionId}` },
        { label: district.name, href: null },
      ],
      contextTownId: null,
    }
  }

  if (query.regionId) {
    const region = await db.region.findFirst({
      where: { id: query.regionId, isActive: true },
    })
    if (!region) throw new ValidationError({ regionId: ['Unknown region'] })
    return {
      level: 'region',
      point: pointOf(region.latitude, region.longitude),
      scope: { kind: 'region', regionId: region.id },
      label: `${region.name} Region`,
      breadcrumb: [
        { label: 'Ghana', href: '/find' },
        { label: region.name, href: null },
      ],
      contextTownId: null,
    }
  }

  if (query.latitude !== undefined && query.longitude !== undefined) {
    return {
      level: null,
      point: { latitude: query.latitude, longitude: query.longitude },
      scope: { kind: 'none' },
      label: null,
      breadcrumb: [{ label: 'Ghana', href: '/find' }],
      contextTownId: null,
    }
  }

  return {
    level: null,
    point: null,
    scope: { kind: 'none' },
    label: null,
    breadcrumb: [{ label: 'Ghana', href: '/find' }],
    contextTownId: null,
  }
}

function pointOf(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): { latitude: number; longitude: number } | null {
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
    return null
  }
  return { latitude, longitude }
}

/** Resolves the requested category by ID or slug and expands its subtree. */
async function resolveCategory(query: DiscoveryQuery): Promise<ResolvedCategory | null> {
  const base = query.categoryId
    ? await db.category.findFirst({ where: { id: query.categoryId, isActive: true } })
    : query.categorySlug
      ? await db.category.findFirst({ where: { slug: query.categorySlug, isActive: true } })
      : null
  if (!base) {
    if (query.categoryId || query.categorySlug) {
      throw new ValidationError(
        query.categoryId
          ? { categoryId: ['Unknown category'] }
          : { categorySlug: ['Unknown category'] },
      )
    }
    return null
  }

  // Subtree expansion (depth ≤ 3): children, then grandchildren.
  const subtreeIds = [base.id]
  let frontier = [base.id]
  for (let depth = 0; depth < 2 && frontier.length > 0; depth += 1) {
    const children = await db.category.findMany({
      where: { parentId: { in: frontier }, isActive: true },
      select: { id: true },
    })
    frontier = children.map((c) => c.id)
    subtreeIds.push(...frontier)
  }

  return {
    id: base.id,
    name: base.name,
    slug: base.slug,
    description: base.description,
    subtreeIds,
  }
}

/** Distance between two points in km (Haversine, PART 12). */
function haversineKmLocal(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  return haversineKm(a.latitude, a.longitude, b.latitude, b.longitude)
}

// -----------------------------------------------------------------------------
// Candidate fetching
// -----------------------------------------------------------------------------

interface CandidateTown {
  id: string
  name: string
  regionName: string | null
  latitude: number | null
  longitude: number | null
}

interface Candidate {
  id: string
  profession: string
  headline: string | null
  yearsExperience: number
  availabilityStatus: string
  startingPriceAmount: number | null
  currency: string
  verificationStatus: string
  ratingSum: number
  ratingCount: number
  completedJobsCount: number
  responseRatePercent: number | null
  businessId: string | null
  user: { name: string | null; avatarKey: string | null }
  business: { id: string; name: string } | null
  primaryLocation: CandidateTown | null
  serviceAreas: { location: CandidateTown }[]
  matchedServices: { name: string; categoryId: string }[]
  portfolioCount: number
}

/** Builds the hard-filter WHERE clause for a resolved scope. */
function locationWhere(scope: ResolvedLocation['scope']) {
  switch (scope.kind) {
    case 'town':
      return {
        OR: [
          { primaryLocationId: scope.townId },
          { serviceAreas: { some: { locationId: scope.townId } } },
        ],
      }
    case 'district':
      return {
        OR: [
          { primaryLocationId: { in: scope.townIds } },
          { serviceAreas: { some: { locationId: { in: scope.townIds } } } },
        ],
      }
    case 'region':
      return {
        OR: [
          { primaryLocation: { regionId: scope.regionId } },
          { serviceAreas: { some: { location: { regionId: scope.regionId } } } },
        ],
      }
    default:
      return {}
  }
}

const CANDIDATE_SELECT = {
  id: true,
  profession: true,
  headline: true,
  yearsExperience: true,
  availabilityStatus: true,
  startingPriceAmount: true,
  currency: true,
  verificationStatus: true,
  ratingSum: true,
  ratingCount: true,
  completedJobsCount: true,
  responseRatePercent: true,
  businessId: true,
  user: { select: { name: true, avatarKey: true } },
  business: { select: { id: true, name: true } },
  primaryLocation: {
    select: { id: true, name: true, latitude: true, longitude: true, region: { select: { name: true } } },
  },
  serviceAreas: {
    select: {
      location: {
        select: { id: true, name: true, latitude: true, longitude: true, region: { select: { name: true } } },
      },
    },
  },
  _count: { select: { portfolioItems: true } },
} as const

function shapeCandidate(row: {
  id: string
  profession: string
  headline: string | null
  yearsExperience: number
  availabilityStatus: string
  startingPriceAmount: number | null
  currency: string
  verificationStatus: string
  ratingSum: number
  ratingCount: number
  completedJobsCount: number
  responseRatePercent: number | null
  businessId: string | null
  user: { name: string | null; avatarKey: string | null }
  business: { id: string; name: string } | null
  primaryLocation: {
    id: string
    name: string
    latitude: number | null
    longitude: number | null
    region: { name: string } | null
  } | null
  serviceAreas: {
    location: {
      id: string
      name: string
      latitude: number | null
      longitude: number | null
      region: { name: string } | null
    }
  }[]
  _count: { portfolioItems: number }
}): Candidate {
  return {
    id: row.id,
    profession: row.profession,
    headline: row.headline,
    yearsExperience: row.yearsExperience,
    availabilityStatus: row.availabilityStatus,
    startingPriceAmount: row.startingPriceAmount,
    currency: row.currency,
    verificationStatus: row.verificationStatus,
    ratingSum: row.ratingSum,
    ratingCount: row.ratingCount,
    completedJobsCount: row.completedJobsCount,
    responseRatePercent: row.responseRatePercent,
    businessId: row.businessId,
    user: row.user,
    business: row.business,
    primaryLocation: row.primaryLocation
      ? {
          id: row.primaryLocation.id,
          name: row.primaryLocation.name,
          regionName: row.primaryLocation.region?.name ?? null,
          latitude: row.primaryLocation.latitude,
          longitude: row.primaryLocation.longitude,
        }
      : null,
    serviceAreas: row.serviceAreas.map(({ location }) => ({
      location: {
        id: location.id,
        name: location.name,
        regionName: location.region?.name ?? null,
        latitude: location.latitude,
        longitude: location.longitude,
      },
    })),
    matchedServices: [],
    portfolioCount: row._count.portfolioItems,
  }
}

// -----------------------------------------------------------------------------
// Scoring (PART 10 — weights from the central configuration only)
// -----------------------------------------------------------------------------

interface ScoredComponent {
  key: keyof typeof DISCOVERY_WEIGHTS
  score: number
  available: boolean
}

interface ScoredCandidate {
  candidate: Candidate
  components: Record<string, ScoredComponent>
  total: number // 0–100
  distanceKm: number | null
  distanceBand: DistanceBand | null
  exactLocation: boolean
  reasons: string[]
}

function scoreCandidate(
  candidate: Candidate,
  context: {
    category: ResolvedCategory | null
    location: ResolvedLocation
    maxDistanceKm: number | null
  },
): ScoredCandidate {
  const reasons: string[] = []

  // SERVICE MATCH ------------------------------------------------------------
  let serviceScore: ScoredComponent = {
    key: 'serviceMatch',
    score: 0,
    available: context.category !== null,
  }
  if (context.category) {
    const exact = candidate.matchedServices.some((s) => s.categoryId === context.category!.id)
    serviceScore = { ...serviceScore, score: exact ? SERVICE_MATCH_SCORES.exact : SERVICE_MATCH_SCORES.ancestor }
    if (exact) reasons.push(`Offers ${context.category.name}`)
  }

  // LOCATION / SERVICE AREA MATCH -------------------------------------------
  const exactTownId =
    context.location.scope.kind === 'town'
      ? context.location.scope.townId
      : context.location.contextTownId
  const exactLocation =
    exactTownId !== null &&
    (candidate.primaryLocation?.id === exactTownId ||
      candidate.serviceAreas.some((area) => area.location.id === exactTownId))

  let distanceKm: number | null = null
  if (context.location.point) {
    const towns = [
      candidate.primaryLocation,
      ...candidate.serviceAreas.map((a) => a.location),
    ].filter((town): town is CandidateTown => town !== null)
    let best: number | null = null
    for (const town of towns) {
      const townPoint = pointOf(town.latitude, town.longitude)
      if (!townPoint) continue
      const d = haversineKmLocal(context.location.point, townPoint)
      if (best === null || d < best) best = d
    }
    distanceKm = best
  }

  let locationScore: number
  if (exactLocation) {
    locationScore = LOCATION_HIERARCHY_SCORES.communityOrTown
    reasons.push('Serves your area')
  } else if (distanceKm !== null) {
    const band = distanceBandFor(distanceKm)
    locationScore = band.score
    reasons.push(`About ${band.label} away`)
  } else {
    locationScore =
      context.location.scope.kind === 'district'
        ? LOCATION_HIERARCHY_SCORES.districtSweep
        : LOCATION_HIERARCHY_SCORES.regionSweep
    reasons.push('Serves your wider area')
  }
  const locationComponent: ScoredComponent = {
    key: 'locationMatch',
    score: locationScore,
    available: context.location.scope.kind !== 'none' || context.location.point !== null,
  }

  // AVAILABILITY (real field, PART 13 — never inferred from account status) --
  const availabilityScore = AVAILABILITY_SCORES[candidate.availabilityStatus] ?? NEUTRAL_COMPONENT_SCORE
  if (candidate.availabilityStatus === 'AVAILABLE') reasons.push('Available now')
  const availabilityComponent: ScoredComponent = {
    key: 'availability',
    score: availabilityScore,
    available: true,
  }

  // RATING / REVIEW QUALITY --------------------------------------------------
  const hasRating = candidate.ratingCount >= RATING_MIN_COUNT
  const ratingAverage = hasRating ? candidate.ratingSum / candidate.ratingCount : null
  const ratingComponent: ScoredComponent = {
    key: 'rating',
    score: hasRating ? Math.min(Math.max(ratingAverage! / 5, 0), 1) : NEUTRAL_COMPONENT_SCORE,
    available: hasRating, // unrated providers are NOT falsely scored
  }
  if (hasRating && ratingAverage! >= 4) reasons.push('Highly rated')

  // RESPONSE RATE ------------------------------------------------------------
  const responseComponent: ScoredComponent = {
    key: 'responseRate',
    score:
      candidate.responseRatePercent === null
        ? NEUTRAL_COMPONENT_SCORE
        : Math.min(Math.max(candidate.responseRatePercent / 100, 0), 1),
    available: candidate.responseRatePercent !== null,
  }

  // EXPERIENCE ---------------------------------------------------------------
  const experienceComponent: ScoredComponent = {
    key: 'experience',
    score: Math.min(candidate.yearsExperience / EXPERIENCE_FULL_SCORE_YEARS, 1),
    available: candidate.yearsExperience > 0,
  }

  // VERIFICATION -------------------------------------------------------------
  const verificationScore = VERIFICATION_SCORES[candidate.verificationStatus] ?? 0
  if (candidate.verificationStatus === 'VERIFIED') reasons.push('Verified provider')
  const verificationComponent: ScoredComponent = {
    key: 'verification',
    score: verificationScore,
    available: true,
  }

  const components: Record<string, ScoredComponent> = {
    serviceMatch: serviceScore,
    locationMatch: locationComponent,
    availability: availabilityComponent,
    rating: ratingComponent,
    responseRate: responseComponent,
    experience: experienceComponent,
    verification: verificationComponent,
  }

  // Neutral-fill: components without real data score NEUTRAL (0.5) and keep
  // their weight — missing information pulls toward the middle, never boosts
  // an empty profile above a substantive one, and never fabricates data.
  let weighted = 0
  for (const component of Object.values(components)) {
    const score = component.available ? component.score : NEUTRAL_COMPONENT_SCORE
    weighted += DISCOVERY_WEIGHTS[component.key] * score
  }
  const total = weighted * 100

  return {
    candidate,
    components,
    total,
    distanceKm,
    distanceBand: distanceKm !== null ? distanceBandFor(distanceKm) : null,
    exactLocation,
    reasons: [...new Set(reasons)],
  }
}

// -----------------------------------------------------------------------------
// Sorting (PART 15 — unavailable information never falsely ranks)
// -----------------------------------------------------------------------------

function sortScored(scored: ScoredCandidate[], sort: DiscoveryQuery['sort']): ScoredCandidate[] {
  const byScore = (a: ScoredCandidate, b: ScoredCandidate) => b.total - a.total || a.candidate.id.localeCompare(b.candidate.id)
  const list = [...scored]

  switch (sort) {
    case 'nearest':
      return list.sort((a, b) => {
        if (a.distanceKm === null && b.distanceKm === null) return byScore(a, b)
        if (a.distanceKm === null) return 1
        if (b.distanceKm === null) return -1
        return a.distanceKm - b.distanceKm || byScore(a, b)
      })
    case 'rating':
      return list.sort((a, b) => {
        const aRated = a.candidate.ratingCount >= RATING_MIN_COUNT
        const bRated = b.candidate.ratingCount >= RATING_MIN_COUNT
        if (aRated !== bRated) return aRated ? -1 : 1
        if (aRated && bRated) {
          const aAvg = a.candidate.ratingSum / a.candidate.ratingCount
          const bAvg = b.candidate.ratingSum / b.candidate.ratingCount
          if (bAvg !== aAvg) return bAvg - aAvg
        }
        return byScore(a, b)
      })
    case 'experience':
      return list.sort(
        (a, b) => b.candidate.yearsExperience - a.candidate.yearsExperience || byScore(a, b),
      )
    case 'price':
      return list.sort((a, b) => {
        if (a.candidate.startingPriceAmount === null && b.candidate.startingPriceAmount === null) return byScore(a, b)
        if (a.candidate.startingPriceAmount === null) return 1
        if (b.candidate.startingPriceAmount === null) return -1
        return a.candidate.startingPriceAmount - b.candidate.startingPriceAmount || byScore(a, b)
      })
    case 'response':
      return list.sort((a, b) => {
        if (a.candidate.responseRatePercent === null && b.candidate.responseRatePercent === null) return byScore(a, b)
        if (a.candidate.responseRatePercent === null) return 1
        if (b.candidate.responseRatePercent === null) return -1
        return b.candidate.responseRatePercent - a.candidate.responseRatePercent || byScore(a, b)
      })
    default:
      return list.sort(byScore)
  }
}

// -----------------------------------------------------------------------------
// The pipeline (PART 20)
// -----------------------------------------------------------------------------

export async function discoverProviders(query: DiscoveryQuery): Promise<DiscoveryResponse> {
  const [location, category] = await Promise.all([resolveLocation(query), resolveCategory(query)])

  // Service search implies the service's own category for scoring purposes.
  let serviceId: string | null = null
  let effectiveCategory = category
  if (query.serviceId) {
    const service = await db.service.findFirst({
      where: { id: query.serviceId, status: 'ACTIVE', deletedAt: null },
      select: { id: true, categoryId: true, category: { select: { id: true, name: true, slug: true } } },
    })
    if (!service) throw new ValidationError({ serviceId: ['Unknown service'] })
    serviceId = service.id
    if (!effectiveCategory) {
      effectiveCategory = {
        id: service.category.id,
        name: service.category.name,
        slug: service.category.slug,
        description: null,
        subtreeIds: [service.category.id],
      }
    }
  }

  // ---- Hard filters (PART 10) ---------------------------------------------
  // Conditions are composed as an AND list so independent OR-shapes (location
  // scope vs free-text q) can never collide on a top-level `OR` key.
  const baseConditions: Record<string, unknown>[] = [
    // Suspension is a LIVE user-status check (PART 45) — suspended providers
    // never appear publicly, even mid-session.
    { user: { status: 'ACTIVE' } },
  ]
  if (query.verification) baseConditions.push({ verificationStatus: query.verification })
  if (query.availability) baseConditions.push({ availabilityStatus: query.availability })
  if (query.providerType === 'INDIVIDUAL') baseConditions.push({ businessId: null })
  if (query.providerType === 'BUSINESS') baseConditions.push({ businessId: { not: null } })
  if (query.maxPrice !== undefined) {
    baseConditions.push({ startingPriceAmount: { lte: query.maxPrice, not: null } })
  }
  if (effectiveCategory) {
    baseConditions.push({
      services: {
        some: {
          status: 'ACTIVE',
          deletedAt: null,
          isAvailable: true,
          categoryId: { in: effectiveCategory.subtreeIds },
          ...(serviceId ? { id: serviceId } : {}),
        },
      },
    })
  }
  if (query.q) {
    baseConditions.push({
      OR: [
        { profession: { contains: query.q.toLowerCase() } },
        { headline: { contains: query.q } },
        { biography: { contains: query.q } },
        { business: { name: { contains: query.q } } },
      ],
    })
  }
  const locationCondition = locationWhere(location.scope)
  // `where` = base hard filters + the exact location tier. `baseConditions`
  // itself stays location-free: the nearby fallback reuses it with a swapped
  // location condition (requested town → nearby towns).
  const where = {
    deletedAt: null,
    AND:
      Object.keys(locationCondition).length > 0
        ? [...baseConditions, locationCondition]
        : baseConditions,
  }
  const serviceSelect = {
    where: {
      status: 'ACTIVE' as const,
      deletedAt: null as null,
      ...(effectiveCategory ? { categoryId: { in: effectiveCategory.subtreeIds } } : {}),
    },
    select: { name: true, categoryId: true },
    take: 10,
  }

  // ---- Fetch candidates (single query, capped, minimal selects) ------------
  const rows = await db.providerProfile.findMany({
    where,
    take: DISCOVERY_CANDIDATE_CAP,
    select: { ...CANDIDATE_SELECT, services: serviceSelect },
  })

  const candidates: Candidate[] = rows.map((row) => {
    const shaped = shapeCandidate(row)
    shaped.matchedServices = row.services
    return shaped
  })

  // Post-fetch hard filters that SQL cannot express on SQLite (rating).
  const minRating = query.minRating ?? null
  const eligible = candidates.filter((candidate) => {
    if (minRating !== null && minRating > 0) {
      if (candidate.ratingCount < RATING_MIN_COUNT) return false
      if (candidate.ratingSum / candidate.ratingCount < minRating) return false
    }
    return true
  })

  // ---- Score, filter by distance, sort, paginate ---------------------------
  const scoringContext = { category: effectiveCategory, location, maxDistanceKm: query.maxDistanceKm ?? null }
  let scored = eligible
    .map((candidate) => scoreCandidate(candidate, scoringContext))
    .filter((s) => {
      if (query.maxDistanceKm !== undefined && s.distanceKm !== null) {
        return s.distanceKm <= query.maxDistanceKm
      }
      return true
    })

  // Duplicate prevention is structural: one row per ProviderProfile.
  const seen = new Set<string>()
  scored = scored.filter((s) => (seen.has(s.candidate.id) ? false : (seen.add(s.candidate.id), true)))

  const ranked = sortScored(scored, query.sort)
  const total = ranked.length
  const page = query.page
  const pageSize = query.pageSize
  const pageItems = ranked.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)

  // ---- Nearby fallback (PART 18) — only when nothing matched exactly and a
  // real search point exists to measure "nearby" from --------------------------
  let nearby: DiscoveryResponse['nearby'] = null
  if (total === 0 && location.point) {
    const nearbyTowns = await db.town.findMany({
      where: {
        isActive: true,
        latitude: { not: null },
        longitude: { not: null },
      },
      select: { id: true, name: true, latitude: true, longitude: true },
    })
    const within = nearbyTowns
      .filter((town) => {
        const d = haversineKmLocal(
          location.point!,
          { latitude: town.latitude as number, longitude: town.longitude as number },
        )
        return d <= NEARBY_RADIUS_KM && d > 0.5
      })
      .map((town) => ({
        town,
        distanceKm: haversineKmLocal(
          location.point!,
          { latitude: town.latitude as number, longitude: town.longitude as number },
        ),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 12)

    if (within.length > 0) {
      // Nearby keeps EVERY hard filter (service, eligibility, status) but
      // swaps the requested-location condition for the nearby-town set — the
      // customer's original selection is never silently replaced (PART 18).
      const nearbyRows = await db.providerProfile.findMany({
        where: {
          deletedAt: null,
          AND: [
            ...baseConditions,
            { serviceAreas: { some: { locationId: { in: within.map((w) => w.town.id) } } } },
          ],
        },
        take: DISCOVERY_CANDIDATE_CAP,
        select: { ...CANDIDATE_SELECT, services: serviceSelect },
      })
      const distanceByTown = new Map(within.map((w) => [w.town.id, w.distanceKm]))
      const nearbyScored = nearbyRows
        .map((row) => {
          const shaped = shapeCandidate(row)
          shaped.matchedServices = row.services
          const scoredCandidate = scoreCandidate(shaped, scoringContext)
          // Nearest served town drives the nearby label.
          const served = shaped.serviceAreas.find((a) => distanceByTown.has(a.location.id))
          scoredCandidate.distanceKm = served ? (distanceByTown.get(served.location.id) ?? null) : null
          scoredCandidate.distanceBand = scoredCandidate.distanceKm !== null ? distanceBandFor(scoredCandidate.distanceKm) : null
          scoredCandidate.reasons = [
            ...scoredCandidate.reasons.filter((r) => !r.startsWith('About ') && !r.startsWith('Serves')),
            served ? `Serves ${served.location.name}` : 'Nearby provider',
          ]
          return scoredCandidate
        })
        .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || b.total - a.total)
      nearby = {
        label: 'Nearby providers',
        items: nearbyScored.slice(0, pageSize).map(toResult),
        total: nearbyScored.length,
      }
    }
  }

  // ---- Location context for breadcrumbs / empty states ---------------------
  const nearbyAreas = await resolveNearbyAreas(location)
  const locationContext: DiscoveryLocationContext = {
    level: location.level,
    label: location.label,
    breadcrumb: location.breadcrumb,
    nearbyAreas,
  }

  return {
    criteria: {
      categoryId: effectiveCategory?.id ?? null,
      categoryName: effectiveCategory?.name ?? null,
      categorySlug: effectiveCategory?.slug ?? null,
      serviceId,
      regionId: query.regionId ?? null,
      districtId: query.districtId ?? null,
      townId: query.townId ?? null,
      communityId: query.communityId ?? null,
      providerType: query.providerType ?? null,
      verification: query.verification ?? null,
      availability: query.availability ?? null,
      minRating: query.minRating ?? null,
      maxPrice: query.maxPrice ?? null,
      q: query.q ?? null,
      sort: query.sort,
      whatLabel: effectiveCategory?.name ?? (query.q ? `“${query.q}”` : 'Providers'),
    },
    location: locationContext,
    items: pageItems.map(toResult),
    pagination: buildPaginationMeta(total, page, pageSize),
    nearby,
  }
}

/** Suggested nearby areas for empty states: same-district towns, then towns
 *  within the nearby radius, then nothing (the UI hides the block). */
async function resolveNearbyAreas(location: ResolvedLocation): Promise<DiscoveryLocationContext['nearbyAreas']> {
  if (location.scope.kind === 'town') {
    const town = await db.town.findFirst({
      where: { id: location.scope.townId },
      select: { districtId: true, id: true, latitude: true, longitude: true },
    })
    if (!town) return []

    if (town.latitude !== null && town.longitude !== null) {
      const point = { latitude: town.latitude, longitude: town.longitude }
      const towns = await db.town.findMany({
        where: { isActive: true, id: { not: town.id }, latitude: { not: null }, longitude: { not: null } },
        select: { id: true, name: true, slug: true, latitude: true, longitude: true, isMajor: true },
        orderBy: [{ isMajor: 'desc' }, { name: 'asc' }],
      })
      return towns
        .map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          isMajor: t.isMajor,
          distanceKm: haversineKmLocal(point, {
            latitude: t.latitude as number,
            longitude: t.longitude as number,
          }),
        }))
        .filter((t) => t.distanceKm <= NEARBY_RADIUS_KM)
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, 6)
        .map(({ id, name, slug, distanceKm }) => ({ id, name, slug, distanceKm }))
    }

    const siblings = await db.town.findMany({
      where: { districtId: town.districtId, isActive: true, id: { not: town.id } },
      select: { id: true, name: true, slug: true },
      orderBy: { name: 'asc' },
      take: 6,
    })
    return siblings.map((t) => ({ ...t, distanceKm: null }))
  }

  if (location.scope.kind === 'district') {
    const towns = await db.town.findMany({
      where: { districtId: location.scope.districtId, isActive: true },
      select: { id: true, name: true, slug: true },
      orderBy: [{ isMajor: 'desc' }, { name: 'asc' }],
      take: 6,
    })
    return towns.map((t) => ({ ...t, distanceKm: null }))
  }

  return []
}

/** Maps a scored candidate to the public result shape (privacy final gate). */
function toResult(scored: ScoredCandidate): DiscoveryResult {
  const c = scored.candidate
  const rating =
    c.ratingCount >= RATING_MIN_COUNT
      ? { average: Math.round((c.ratingSum / c.ratingCount) * 10) / 10, count: c.ratingCount }
      : null

  const areas = c.serviceAreas.map(({ location }) => ({
    id: location.id,
    name: location.name,
    regionName: location.regionName,
  }))
  const base = c.primaryLocation
    ? [{ id: c.primaryLocation.id, name: c.primaryLocation.name, regionName: c.primaryLocation.regionName }]
    : []
  const merged = [...base]
  for (const area of areas) {
    if (merged.length >= 5) break
    if (!merged.some((m) => m.id === area.id)) merged.push(area)
  }

  return {
    providerId: c.id,
    displayName: c.business?.name ?? c.user.name ?? 'Dwellers provider',
    providerType: c.businessId ? 'BUSINESS' : 'INDIVIDUAL',
    businessId: c.businessId,
    businessName: c.business?.name ?? null,
    profession: c.profession,
    headline: c.headline,
    avatarKey: c.user.avatarKey,
    verificationStatus: c.verificationStatus,
    rating,
    yearsExperience: c.yearsExperience,
    availabilityStatus: c.availabilityStatus,
    startingPriceAmount: c.startingPriceAmount,
    currency: c.currency,
    completedJobsCount: c.completedJobsCount,
    primaryLocation: base[0] ?? null,
    serviceAreas: merged,
    serviceAreaCount: new Set([...areas.map((a) => a.id), ...(base.length ? [base[0].id] : [])]).size,
    matchedServiceNames: [...new Set(c.matchedServices.map((s) => s.name))].slice(0, 3),
    portfolioCount: c.portfolioCount,
    distanceKm: scored.distanceKm !== null ? Math.round(scored.distanceKm) : null,
    distanceBand: scored.distanceBand?.label ?? null,
    reasons: scored.reasons,
  }
}

// -----------------------------------------------------------------------------
// Public provider profile (PART 8) — privacy-safe by construction
// -----------------------------------------------------------------------------

export interface PublicProviderProfile {
  id: string
  displayName: string
  providerType: 'INDIVIDUAL' | 'BUSINESS'
  business: { id: string; name: string } | null
  profession: string
  headline: string | null
  biography: string | null
  yearsExperience: number
  availabilityStatus: string
  startingPriceAmount: number | null
  currency: string
  verificationStatus: string
  rating: DiscoveryRating | null
  completedJobsCount: number
  responseRatePercent: number | null
  primaryLocation: { id: string; name: string; regionName: string | null; districtName: string | null } | null
  serviceAreas: { id: string; name: string; regionName: string | null }[]
  services: {
    id: string
    name: string
    description: string | null
    pricingModel: string
    startingPriceAmount: number | null
    currency: string
  }[]
  reviews: {
    id: string
    rating: number
    comment: string | null
    createdAt: string
    reviewerName: string // first name only — reviewer privacy
    isVerifiedEngagement: boolean
  }[]
  reviewBreakdown: { average: number; count: number; buckets: { star: number; count: number }[] }
  portfolio: {
    id: string
    title: string
    description: string | null
    completedAt: string | null
    imageKeys: string[]
  }[]
  memberSince: string
}

/**
 * Loads everything the public profile page needs in a fixed number of
 * queries (profile + services + reviews + portfolio + areas), excluding ALL
 * private contact data (PART 33): no emails, no phone numbers, no raw
 * coordinates. Suspended/deleted providers 404 (PART 45 — never public).
 */
export async function getPublicProviderProfile(id: string): Promise<PublicProviderProfile> {
  const provider = await db.providerProfile.findFirst({
    where: { id, deletedAt: null, user: { status: 'ACTIVE' } },
    select: {
      id: true,
      userId: true,
      businessId: true,
      profession: true,
      headline: true,
      biography: true,
      yearsExperience: true,
      availabilityStatus: true,
      startingPriceAmount: true,
      currency: true,
      verificationStatus: true,
      ratingSum: true,
      ratingCount: true,
      completedJobsCount: true,
      responseRatePercent: true,
      createdAt: true,
      user: { select: { name: true, avatarKey: true, createdAt: true } },
      business: { select: { id: true, name: true } },
      primaryLocation: {
        select: { id: true, name: true, district: { select: { name: true } }, region: { select: { name: true } } },
      },
      serviceAreas: {
        select: { location: { select: { id: true, name: true, region: { select: { name: true } } } } },
      },
      services: {
        where: { status: 'ACTIVE', deletedAt: null },
        select: { id: true, name: true, description: true, pricingModel: true, startingPriceAmount: true, currency: true },
        orderBy: { createdAt: 'desc' },
        take: 12,
      },
      reviews: {
        where: { status: 'PUBLISHED', deletedAt: null },
        select: {
          id: true,
          ratingOverall: true,
          comment: true,
          createdAt: true,
          isVerifiedEngagement: true,
          reviewer: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
      portfolioItems: {
        where: { deletedAt: null },
        select: {
          id: true,
          title: true,
          description: true,
          completedAt: true,
          images: { select: { storageKey: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
        },
        orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
        take: 12,
      },
    },
  })
  if (!provider) throw new NotFoundError('Provider')

  const buckets = new Map<number, number>([1, 2, 3, 4, 5].map((star) => [star, 0]))
  for (const review of provider.reviews) {
    buckets.set(review.ratingOverall, (buckets.get(review.ratingOverall) ?? 0) + 1)
  }

  const areas = provider.serviceAreas.map(({ location }) => ({
    id: location.id,
    name: location.name,
    regionName: location.region?.name ?? null,
  }))
  const areaIds = new Set(areas.map((a) => a.id))
  const base = provider.primaryLocation
    ? {
        id: provider.primaryLocation.id,
        name: provider.primaryLocation.name,
        regionName: provider.primaryLocation.region?.name ?? null,
        districtName: provider.primaryLocation.district?.name ?? null,
      }
    : null

  return {
    id: provider.id,
    displayName: provider.business?.name ?? provider.user.name ?? 'Dwellers provider',
    providerType: provider.businessId ? 'BUSINESS' : 'INDIVIDUAL',
    business: provider.business,
    profession: provider.profession,
    headline: provider.headline,
    biography: provider.biography,
    yearsExperience: provider.yearsExperience,
    availabilityStatus: provider.availabilityStatus,
    startingPriceAmount: provider.startingPriceAmount,
    currency: provider.currency,
    verificationStatus: provider.verificationStatus,
    rating:
      provider.ratingCount >= RATING_MIN_COUNT
        ? {
            average: Math.round((provider.ratingSum / provider.ratingCount) * 10) / 10,
            count: provider.ratingCount,
          }
        : provider.ratingCount > 0
          ? { average: Math.round((provider.ratingSum / provider.ratingCount) * 10) / 10, count: provider.ratingCount }
          : null,
    completedJobsCount: provider.completedJobsCount,
    responseRatePercent: provider.responseRatePercent,
    primaryLocation: base,
    serviceAreas: areas,
    services: provider.services,
    reviews: provider.reviews.map((review) => ({
      id: review.id,
      rating: review.ratingOverall,
      comment: review.comment,
      createdAt: review.createdAt.toISOString(),
      reviewerName: (review.reviewer?.name ?? 'Dwellers user').split(' ')[0],
      isVerifiedEngagement: review.isVerifiedEngagement,
    })),
    reviewBreakdown: {
      average: provider.ratingCount > 0 ? Math.round((provider.ratingSum / provider.ratingCount) * 10) / 10 : 0,
      count: provider.ratingCount,
      buckets: [5, 4, 3, 2, 1].map((star) => ({ star, count: buckets.get(star) ?? 0 })),
    },
    portfolio: provider.portfolioItems.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      completedAt: item.completedAt?.toISOString() ?? null,
      imageKeys: item.images.map((image) => image.storageKey),
    })),
    memberSince: (provider.user.createdAt ?? provider.createdAt).toISOString(),
  }
}

// Re-export for route modules — DISTANCE_BANDS used by the UI distance legend.
export { DISTANCE_BANDS } from '@/modules/discovery/ranking'
