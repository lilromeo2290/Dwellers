import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * URL-safe slug from a human-readable name (categories, towns, businesses…).
 * Lowercase ASCII letters/digits, collapsed separators, trimmed to 80 chars.
 */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no ambiguous 0/O/1/I

/**
 * Human-friendly unique reference (job requests, quotes, orders, payments).
 * Format: `<PREFIX>-<8 unambiguous base32 chars>`; uniqueness is enforced by
 * the caller's unique column with a retry loop.
 */
export function generateReference(prefix: string): string {
  let suffix = ''
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  for (const byte of bytes) {
    suffix += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length]
  }
  return `${prefix}-${suffix}`
}
