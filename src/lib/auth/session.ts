/**
 * Dwellers — Session abstraction.
 *
 * NextAuth.js v4 with a stateless JWT strategy is the chosen session
 * mechanism: it survives serverless/edge deployments without a session table
 * while roles ride inside the signed token. The role is captured at sign-in
 * and re-asserted on every session read — a role revoked by staff takes
 * effect on the user's next token refresh, and sensitive actions re-check
 * the live database record (pattern documented in ARCHITECTURE.md).
 *
 * Phase 1 wired the configuration and the typed accessors. Phase 3 activates
 * the credentials provider, the route handler and full session issuance.
 */
import { getServerSession, type NextAuthOptions } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import { DEFAULT_ROLE, isRole, type Role } from '@/lib/auth/roles'
import { dwellersCredentialsProvider } from '@/lib/auth/credentials'
import { env } from '@/lib/env'
import { AUDIT_ACTIONS, recordAudit } from '@/lib/audit'

/** Extended claims carried inside the JWT. */
export interface DwellersToken extends JWT {
  userId?: string
  role?: Role
  status?: string
}

export interface AuthContext {
  userId: string
  email: string
  name?: string | null
  role: Role
  /** Account status claim captured at sign-in (fast path; live re-checks happen in guards/services). */
  status: string
}

/**
 * NextAuth configuration. Phase 3 activates the credentials provider backed
 * by the real User table (src/lib/auth/credentials.ts — imported here so the
 * heavy modules stay out of files that only need types).
 */
export const authOptions: NextAuthOptions = {
  secret: env.AUTH_SECRET,
  session: { strategy: 'jwt', maxAge: 7 * 24 * 60 * 60 },
  pages: {
    signIn: '/auth/sign-in',
  },
  providers: [dwellersCredentialsProvider],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const dwellersToken = token as DwellersToken
        dwellersToken.userId = user.id
        const maybeRole = (user as { role?: string }).role
        dwellersToken.role = isRole(maybeRole) ? maybeRole : DEFAULT_ROLE
        const maybeStatus = (user as { status?: string }).status
        dwellersToken.status = maybeStatus ?? 'ACTIVE'
      }
      return token
    },
    async session({ session, token }) {
      const dwellersToken = token as DwellersToken
      if (session.user && dwellersToken.userId) {
        session.user.id = dwellersToken.userId
        session.user.role = isRole(dwellersToken.role) ? dwellersToken.role : DEFAULT_ROLE
        session.user.status = dwellersToken.status ?? 'ACTIVE'
      }
      return session
    },
  },
  events: {
    /** Audit logout from the JWT claim (stateless sessions keep no server row). */
    async signOut({ token }) {
      const dwellersToken = token as DwellersToken
      if (dwellersToken?.userId) {
        await recordAudit({
          actorId: dwellersToken.userId,
          actorRole: isRole(dwellersToken.role) ? dwellersToken.role : DEFAULT_ROLE,
          action: AUDIT_ACTIONS.USER_LOGOUT,
          entityType: 'User',
          entityId: dwellersToken.userId,
        }).catch(() => undefined)
      }
    },
  },
}

declare module 'next-auth' {
  interface Session {
    user?: {
      id?: string
      role?: Role
      status?: string
      name?: string | null
      email?: string | null
    }
  }
}

/**
 * Resolves the current API caller into an AuthContext, or `null` when
 * unauthenticated. This is the ONLY way route handlers learn who is calling —
 * client-supplied user IDs are never trusted (IDOR defence, see guards.ts).
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const session = await getServerSession(authOptions)
  const user = session?.user
  if (!user?.id || !user.email) return null
  return {
    userId: user.id,
    email: user.email,
    name: user.name ?? null,
    role: user.role ?? DEFAULT_ROLE,
    status: user.status ?? 'ACTIVE',
  }
}

/**
 * Page-guard helper: resolves the session for server components the same way
 * route handlers do. Returns `null` when unauthenticated.
 */
export async function getPageAuthContext(): Promise<AuthContext | null> {
  return getAuthContext()
}
