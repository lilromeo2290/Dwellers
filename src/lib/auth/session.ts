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
 * Phase 1 wires the configuration and the typed accessors. Concrete
 * credential/OAuth providers and the route handler land in Phase 2
 * (Database Schema & Backend Foundation) together with the user store.
 */
import { getServerSession, type NextAuthOptions } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import { DEFAULT_ROLE, isRole, type Role } from '@/lib/auth/roles'

/** Extended claims carried inside the JWT. */
export interface DwellersToken extends JWT {
  userId?: string
  role?: Role
}

export interface AuthContext {
  userId: string
  email: string
  name?: string | null
  role: Role
}

/**
 * NextAuth configuration. `providers` is intentionally empty in Phase 1:
 * no sign-in flow exists yet, so no session can ever be forged. Phase 2
 * adds the credentials provider backed by the real User table.
 */
export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt', maxAge: 7 * 24 * 60 * 60 },
  pages: {
    signIn: '/auth/sign-in', // route delivered with the auth phase
  },
  providers: [], // Phase 2: CredentialsProvider (email + password against DB)
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const dwellersToken = token as DwellersToken
        dwellersToken.userId = user.id
        const maybeRole = (user as { role?: string }).role
        dwellersToken.role = isRole(maybeRole) ? maybeRole : DEFAULT_ROLE
      }
      return token
    },
    async session({ session, token }) {
      const dwellersToken = token as DwellersToken
      if (session.user && dwellersToken.userId) {
        session.user.id = dwellersToken.userId
        session.user.role = isRole(dwellersToken.role) ? dwellersToken.role : DEFAULT_ROLE
      }
      return session
    },
  },
}

declare module 'next-auth' {
  interface Session {
    user?: {
      id?: string
      role?: Role
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
  }
}
