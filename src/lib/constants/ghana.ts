/**
 * Dwellers — Ghana geography reference data.
 *
 * The marketplace is nationwide from day one: every location-aware feature
 * models the hierarchy  Region → City/Town → Area  (documented in
 * ARCHITECTURE.md § Ghana geography model). This module carries stable
 * reference constants only; the authoritative, queryable geo tables are
 * seeded into the database in Phase 2 — never hard-code location data into
 * features, always read from the database.
 */

/** The 16 administrative regions of Ghana (ISO 3166-2:GH). */
export const GHANA_REGIONS = [
  'Ahafo',
  'Ashanti',
  'Bono',
  'Bono East',
  'Central',
  'Eastern',
  'Greater Accra',
  'North East',
  'Northern',
  'Oti',
  'Savannah',
  'Upper East',
  'Upper West',
  'Volta',
  'Western',
  'Western North',
] as const

export type GhanaRegion = (typeof GHANA_REGIONS)[number]

export const GHANA_COUNTRY_CODE = 'GH'
export const GHANA_DIALING_CODE = '+233'

/**
 * Validates a Ghanaian mobile number (local `0XXXXXXXXX` or international
 * `+233XXXXXXXXX`) without third-party libs.
 */
export function isGhanaPhoneNumber(value: string): boolean {
  return /^(?:\+233|0)(?:2|5|)\d{8}$/.test(value.replace(/[\s-]/g, ''))
}

/** Normalises a Ghanaian phone number to international format (+233…). */
export function normalizeGhanaPhoneNumber(value: string): string | null {
  const cleaned = value.replace(/[\s-]/g, '')
  if (!isGhanaPhoneNumber(cleaned)) return null
  if (cleaned.startsWith('+233')) return cleaned
  return `+233${cleaned.slice(1)}`
}
