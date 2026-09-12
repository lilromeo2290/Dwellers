/**
 * Dwellers — Discovery ranking configuration (PART 10).
 *
 * THE single source of truth for provider-matching weights and scoring
 * bands. Nothing downstream may hard-code a weight, a distance band or an
 * availability score — tune discovery here, and only here.
 *
 * Hard filters (active account, offered service/category, covering service
 * area, public eligibility) are applied BEFORE any scoring — see
 * provider-discovery.ts. Scoring only RANKS providers that already passed.
 *
 * Honest-scoring rules (PART 7/13/15):
 *  - a component with no real data is marked "unavailable" and is EXCLUDED
 *    from the weighted sum (weights renormalise over present components) —
 *    never defaulted to a fabricated value;
 *  - ratings below RATING_MIN_COUNT are treated as "no rating yet" (neutral),
 *    so three angry friends cannot outrank a genuinely unrated professional;
 *  - the numeric score itself is internal — surfaces show plain-language
 *    reasons ("Serves your area", "Verified provider"), never the number.
 */

/** Weight matrix — MUST sum to 1 (asserted at module load). */
export const DISCOVERY_WEIGHTS = {
  /** Provider offers the requested service/category (ACTIVE Service row). */
  serviceMatch: 0.3,
  /** Provider service area covers the requested location (exact / distance). */
  locationMatch: 0.25,
  /** Real availability field on the provider profile. */
  availability: 0.15,
  /** Rating average from PUBLISHED reviews (ratingSum / ratingCount). */
  rating: 0.1,
  /** Share of requests answered (responseRatePercent 0–100). */
  responseRate: 0.1,
  /** Years of trade experience. */
  experience: 0.05,
  /** Platform verification status. */
  verification: 0.05,
} as const

export type DiscoveryWeightKey = keyof typeof DISCOVERY_WEIGHTS

/** Runtime guard: the weight matrix must always be a complete 100%. */
const WEIGHT_TOTAL = Object.values(DISCOVERY_WEIGHTS).reduce((sum, w) => sum + w, 0)
if (Math.abs(WEIGHT_TOTAL - 1) > 1e-9) {
  throw new Error(`DISCOVERY_WEIGHTS must sum to 1 — got ${WEIGHT_TOTAL}`)
}

/** Score for each real availability state. UNKNOWN exists defensively for
 *  future schema drift; the current column is NOT NULL. */
export const AVAILABILITY_SCORES: Record<string, number> = {
  AVAILABLE: 1,
  BUSY: 0.4,
  UNAVAILABLE: 0,
  UNKNOWN: 0.5,
}

/** Score for each verification status. REJECTED providers never reach
 *  scoring (hard filter), mapped here for completeness only. */
export const VERIFICATION_SCORES: Record<string, number> = {
  VERIFIED: 1,
  PENDING: 0.5,
  UNVERIFIED: 0,
  REJECTED: 0,
}

/** Reviews needed before the average is trusted for ranking. */
export const RATING_MIN_COUNT = 3

/** Neutral score for components with no data yet (used for rating/response
 *  neutral values only where a component is still considered present). */
export const NEUTRAL_COMPONENT_SCORE = 0.5

/** Years of experience that earn the full experience score. */
export const EXPERIENCE_FULL_SCORE_YEARS = 10

/**
 * Distance bands (PART 12): where real coordinates exist, straight-line
 * Haversine distance refines location relevance. Bands are coarse on
 * purpose — they communicate a band, never a provider's exact coordinates.
 */
export interface DistanceBand {
  maxKm: number // inclusive upper bound; Infinity closes the last band
  label: string
  score: number
}

export const DISTANCE_BANDS: readonly DistanceBand[] = [
  { maxKm: 5, label: '0–5 km', score: 1 },
  { maxKm: 15, label: '5–15 km', score: 0.8 },
  { maxKm: 30, label: '15–30 km', score: 0.55 },
  { maxKm: Number.POSITIVE_INFINITY, label: '30+ km', score: 0.35 },
]

/** Radius for the "Nearby providers" fallback tier (PART 18). */
export const NEARBY_RADIUS_KM = 50

/** Location relevance by hierarchy tier when distance cannot be computed
 *  (missing coordinates — PART 12 fallback to hierarchy matching). */
export const LOCATION_HIERARCHY_SCORES = {
  communityOrTown: 1,
  districtSweep: 0.6,
  regionSweep: 0.3,
} as const

/** Service-match depth: an exact category hit outranks an ancestor hit
 *  (searching "Construction Services" surfaces specialists below it). */
export const SERVICE_MATCH_SCORES = {
  exact: 1,
  ancestor: 0.6,
} as const

/** Upper bound on candidates fetched per discovery run before scoring and
 *  pagination (PART 21 guard). Pagination happens AFTER ranking, so the
 *  cap bounds memory/compute per request; documented in DISCOVERY.md. */
export const DISCOVERY_CANDIDATE_CAP = 600

/** Maximum number of SEO/discovery internal links rendered per surface. */
export const NEARBY_AREAS_LIMIT = 6

/**
 * Maps a Haversine distance to its band. Distances themselves are derived
 * data — the provider's raw coordinates never leave the service layer.
 */
export function distanceBandFor(distanceKm: number): DistanceBand {
  for (const band of DISTANCE_BANDS) {
    if (distanceKm <= band.maxKm) return band
  }
  return DISTANCE_BANDS[DISTANCE_BANDS.length - 1]
}
