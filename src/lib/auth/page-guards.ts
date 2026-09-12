/**
 * Dwellers — Server-side page guards (PART 30).
 *
 * Dashboards are protected in server components — the same trust level as
 * API routes, never "hiding buttons". Every dashboard layout calls
 * requireDashboardPage():
 *
 *   1. resolve the session (NextAuth JWT)          → 401-equivalent redirect
 *   2. re-check the LIVE database record            → suspended/deactivated
 *      users are signed out even mid-session (PART 14)
 *   3. compare the live role with the page's roles  → 403 redirect
 *
 * The live role (not the token claim) decides — a role revoked by staff
 * takes effect on the very next page load.
 */
import { redirect } from 'next/navigation'
import { getAuthContext, type AuthContext } from '@/lib/auth/session'
import { isRole, type Role } from '@/lib/auth/roles'
import { db } from '@/lib/db'

export interface DashboardPageContext {
  auth: AuthContext
  /** Live account record fetched fresh from the database. */
  account: {
    id: string
    name: string | null
    email: string
    role: Role
    status: string
    avatarKey: string | null
  }
}

export async function requireDashboardPage(options: {
  allow: Role[]
  /** Route prefix used for sign-in callbackUrl (e.g. '/artisan'). */
  path: string
}): Promise<DashboardPageContext> {
  const auth = await getAuthContext()
  const callbackUrl = encodeURIComponent(options.path)
  if (!auth) {
    redirect(`/auth/sign-in?callbackUrl=${callbackUrl}`)
  }

  const user = await db.user.findUnique({
    where: { id: auth.userId },
    select: { id: true, name: true, email: true, role: true, status: true, avatarKey: true, deletedAt: true },
  })

  if (!user || user.deletedAt || user.status !== 'ACTIVE') {
    redirect(`/auth/sign-in?callbackUrl=${callbackUrl}`)
  }

  if (!isRole(user.role) || !options.allow.includes(user.role)) {
    redirect(`/403?from=${encodeURIComponent(options.path)}`)
  }

  return {
    auth,
    account: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      avatarKey: user.avatarKey,
    },
  }
}

/** Minimal live account fetch for settings pages (avatar state). */
export async function pageUserAvatar(userId: string): Promise<{ avatarKey: string | null } | null> {
  return db.user.findUnique({ where: { id: userId }, select: { avatarKey: true } })
}
