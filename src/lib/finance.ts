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
