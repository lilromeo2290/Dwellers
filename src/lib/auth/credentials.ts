/**
 * Dwellers — Credentials authentication provider.
 *
 * Backs the NextAuth credentials flow against the real User table:
 *  - identifier may be the account email OR the canonical Ghana phone
 *  - passwords are verified with the existing scrypt utility (never logged)
 *  - only ACTIVE accounts may authenticate; SUSPENDED/DEACTIVATED receive a
 *    distinct, server-side error code the login page maps to a friendly
 *    message (the account state is enforced here, never merely in the UI)
 *  - login success/failure produce audit events; failures never log secrets
 *
 * This module deliberately does NOT import session.ts (authOptions imports
 * the provider from here — keeping the dependency one-directional).
 */
import CredentialsProvider from 'next-auth/providers/credentials'
import { db } from '@/lib/db'
import { verifyPassword } from '@/lib/auth/password'
import { AUDIT_ACTIONS, recordAudit } from '@/lib/audit'
import { normalizeGhanaPhoneNumber } from '@/lib/constants/ghana'
import { logger } from '@/lib/logger'

/**
 * Sign-in rejection carrying a stable machine-readable code. NextAuth v4
 * propagates error.message into the sign-in response (`?error=…` / client
 * `result.error`), so the message IS the code — the login page maps codes to
 * friendly copy; the server decides which code applies, the client never
 * distinguishes more than it is told.
 */
export class DwellersSignInError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'DwellersSignInError'
  }
}

export const SIGN_IN_ERRORS = {
  INVALID_CREDENTIALS: 'Email/phone or password is incorrect.',
  ACCOUNT_SUSPENDED: 'This account has been suspended. Contact Dwellers support.',
  ACCOUNT_DEACTIVATED: 'This account is deactivated. Sign in is unavailable.',
} as const

export type SignInErrorCode = keyof typeof SIGN_IN_ERRORS

interface DwellersAuthorizeUser {
  id: string
  email: string
  name: string | null
  role: string
  status: string
}

/** Resolves the identifier: exact email, or canonicalised Ghana phone. */
function resolveIdentifier(raw: string): { email?: string; phone?: string } {
  const value = raw.trim()
  if (!value) return {}
  if (value.includes('@')) {
    return { email: value.toLowerCase() }
  }
  const phone = normalizeGhanaPhoneNumber(value)
  return phone ? { phone } : {}
}

export async function authenticateDwellersUser(
  identifier: string,
  password: string,
): Promise<DwellersAuthorizeUser | null> {
  const { email, phone } = resolveIdentifier(identifier)
  if (!email && !phone) return null

  const user = await db.user.findFirst({
    where: {
      OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
      deletedAt: null,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      passwordHash: true,
    },
  })

  if (!user) return null

  const passwordOk = user.passwordHash
    ? await verifyPassword(password, user.passwordHash)
    : false

  if (!passwordOk) {
    await recordAudit({
      actorId: user.id,
      actorRole: user.role,
      action: AUDIT_ACTIONS.USER_LOGIN_FAILED,
      entityType: 'User',
      entityId: user.id,
      metadata: { reason: 'invalid_credentials' },
    })
    return null
  }

  if (user.status !== 'ACTIVE') {
    await recordAudit({
      actorId: user.id,
      actorRole: user.role,
      action: AUDIT_ACTIONS.USER_LOGIN_FAILED,
      entityType: 'User',
      entityId: user.id,
      metadata: { reason: user.status === 'SUSPENDED' ? 'account_suspended' : 'account_deactivated' },
    })
    throw new DwellersSignInError(
      user.status === 'SUSPENDED' ? 'ACCOUNT_SUSPENDED' : 'ACCOUNT_DEACTIVATED',
    )
  }

  await db.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
    select: { id: true },
  })

  await recordAudit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT_ACTIONS.USER_LOGIN,
    entityType: 'User',
    entityId: user.id,
  })

  logger.info('User signed in', { module: 'auth', actorId: user.id, role: user.role })

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
  }
}

export const dwellersCredentialsProvider = CredentialsProvider({
  name: 'Dwellers account',
  credentials: {
    identifier: { label: 'Email or phone', type: 'text' },
    password: { label: 'Password', type: 'password' },
  },
  async authorize(credentials) {
    const identifier = typeof credentials?.identifier === 'string' ? credentials.identifier : ''
    const password = typeof credentials?.password === 'string' ? credentials.password : ''
    if (!identifier || !password) return null
    return authenticateDwellersUser(identifier, password)
  },
})
