/**
 * Dwellers — Money & currency (Ghana Cedi).
 *
 * ALL monetary amounts in the platform are integers in minor units
 * (pesewas): 1 cedi = 100 pesewas. Floats never touch storage or arithmetic.
 * These helpers are the only sanctioned way to format or convert amounts.
 */

export const CURRENCY_CODE = 'GHS'
export const CURRENCY_SYMBOL = 'GH₵'
export const MINOR_UNITS_PER_MAJOR = 100

/** Ghana Cedi formatter (en-GH locale). */
export function formatCedi(pesewas: number, options: { symbol?: boolean } = {}): string {
  const value = pesewas / MINOR_UNITS_PER_MAJOR
  if (options.symbol === false) {
    return new Intl.NumberFormat('en-GH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }
  return new Intl.NumberFormat('en-GH', {
    style: 'currency',
    currency: CURRENCY_CODE,
    currencyDisplay: 'narrowSymbol',
  }).format(value)
}

/** Converts a decimal cedi amount (e.g. from user input) to integer pesewas. */
export function toPesewas(cedis: number | string): number {
  const value = typeof cedis === 'string' ? Number.parseFloat(cedis) : cedis
  if (!Number.isFinite(value)) {
    throw new Error('Invalid monetary amount')
  }
  const pesewas = Math.round(value * MINOR_UNITS_PER_MAJOR)
  if (pesewas < 0) throw new Error('Monetary amounts cannot be negative')
  return pesewas
}

/** Converts integer pesewas back to a decimal cedi number (display only). */
export function toCedis(pesewas: number): number {
  return pesewas / MINOR_UNITS_PER_MAJOR
}

// -----------------------------------------------------------------------------
// Money policy (Phase 2) — the ONLY sanctioned rounding/division rules.
// Every percentage, line total and split in the platform MUST go through
// these helpers so results are deterministic and audit-compatible:
//
//  Rounding : ROUND_HALF_UP to the nearest pesewa, always.
//  Division : allocations use the largest-remainder method; any leftover
//             pesewa from integer division goes to the FIRST party in the
//             list (documented remainder rule — never ad-hoc division).
//  Storage  : integers only. Floats never touch money storage or output.
// -----------------------------------------------------------------------------

/** Rounds half up to the nearest integer (money-safe rounding). */
export function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5)
}

/**
 * Computes `percent` of an integer pesewa amount.
 * Example: percentOf(16_000, 12) → 1_920 (12% of GH₵160.00).
 */
export function percentOf(amount: number, percent: number): number {
  if (!Number.isInteger(amount) || amount < 0) throw new Error('Invalid monetary amount')
  if (!Number.isFinite(percent) || percent < 0) throw new Error('Invalid percentage')
  return roundHalfUp((amount * percent) / 100)
}

/** Quantity scale: quantities are stored as integer thousandths. */
const QUANTITY_SCALE = 1000

/**
 * Computes a line total from a quantity stored in thousandths and an integer
 * unit price in pesewas. `quantityMilli = qty × 1000` (2.5 bags → 2500).
 * Example: lineTotalAmount(2500, 2000) → 5000 (2.5 × GH₵20.00 = GH₵50.00).
 */
export function lineTotalAmount(quantityMilli: number, unitPriceAmount: number): number {
  if (!Number.isInteger(quantityMilli) || quantityMilli < 0) throw new Error('Invalid quantity')
  if (!Number.isInteger(unitPriceAmount) || unitPriceAmount < 0) {
    throw new Error('Invalid unit price')
  }
  return roundHalfUp((quantityMilli * unitPriceAmount) / QUANTITY_SCALE)
}

/**
 * Splits an integer amount across N parties proportionally to integer weights
 * using the largest-remainder method. The sum of results ALWAYS equals the
 * input amount (no pesewa is created or lost); rounding remainders go to the
 * largest fractional parts, ties resolved by list order (first party wins).
 */
export function allocateAmount(total: number, weights: number[]): number[] {
  if (!Number.isInteger(total) || total < 0) throw new Error('Invalid monetary amount')
  if (weights.length === 0) return []
  const weightSum = weights.reduce((sum, w) => sum + w, 0)
  if (weightSum <= 0 || weights.some((w) => !Number.isInteger(w) || w < 0)) {
    throw new Error('Invalid allocation weights')
  }

  const exact = weights.map((w) => (total * w) / weightSum)
  const floored = exact.map((v) => Math.floor(v))
  let remainder = total - floored.reduce((sum, v) => sum + v, 0)

  // Distribute leftover pesewas to the largest fractional parts (ties →
  // earlier index).
  const order = exact
    .map((v, index) => ({ index, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index)

  const result = [...floored]
  for (const { index } of order) {
    if (remainder <= 0) break
    result[index] += 1
    remainder -= 1
  }
  return result
}
