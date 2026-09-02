/**
 * Dwellers — Password hashing (node:crypto scrypt, zero dependencies).
 *
 * Format: scrypt$N$r$p$salt_b64$hash_b64 — self-describing so parameters can
 * be strengthened later without breaking existing hashes (verify re-derives
 * with the stored parameters).
 *
 * scrypt is memory-hard and ships with Node/Bun; no native build steps needed.
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>

const PARAMS = { N: 16384, r: 8, p: 1 } as const
const KEY_LENGTH = 64

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, PARAMS)
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, n, r, p, saltB64, hashB64] = stored.split('$')
    if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false

    const salt = Buffer.from(saltB64, 'base64')
    const expected = Buffer.from(hashB64, 'base64')
    const derived = await scrypt(password.normalize('NFKC'), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    })

    return derived.length === expected.length && timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

/** Basic strength policy enforced at every registration/change entry point. */
export function assessPasswordStrength(password: string): {
  score: 'weak' | 'fair' | 'strong'
  problems: string[]
} {
  const problems: string[] = []
  if (password.length < 8) problems.push('Use at least 8 characters')
  if (!/[a-z]/.test(password)) problems.push('Add a lowercase letter')
  if (!/[A-Z]/.test(password)) problems.push('Add an uppercase letter')
  if (!/[0-9]/.test(password)) problems.push('Add a number')

  const score = problems.length === 0 ? 'strong' : problems.length <= 2 ? 'fair' : 'weak'
  return { score, problems }
}
