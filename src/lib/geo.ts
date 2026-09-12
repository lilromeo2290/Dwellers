/**
 * Dwellers — Geographic calculations (PART 12 of the Phase 4 plan).
 *
 * Standard-formula Haversine distance on the WGS84 sphere. Used by discovery
 * to derive "how far is a provider's service area from the requested
 * location". Raw coordinates stay inside the service layer — surfaces only
 * ever receive derived distances and band labels.
 */

const EARTH_RADIUS_KM = 6371.0088
const RADIANS = Math.PI / 180

/** Great-circle distance between two WGS84 points, in kilometres. */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const phi1 = lat1 * RADIANS
  const phi2 = lat2 * RADIANS
  const deltaPhi = (lat2 - lat1) * RADIANS
  const deltaLambda = (lng2 - lng1) * RADIANS

  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_KM * c
}
