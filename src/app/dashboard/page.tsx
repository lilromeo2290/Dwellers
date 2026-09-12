/**
 * Dwellers — Role-based dashboard redirect (PART 31).
 *
 * /dashboard resolves the authenticated identity SERVER-SIDE and forwards to
 * the correct role dashboard. No client-supplied role is ever consulted.
 */
import { redirect } from 'next/navigation'
import { getAuthContext } from '@/lib/auth/session'
import type { Role } from '@/lib/auth/roles'
import { db } from '@/lib/db'

const ROLE_HOME: Record<Role, string> = {
  CUSTOMER: '/customer',
  ARTISAN: '/artisan',
  CONTRACTOR: '/contractor',
  CONSTRUCTION_COMPANY: '/company',
  SUPPLIER: '/supplier',
  EQUIPMENT_PROVIDER: '/equipment',
  ADMIN: '/admin',
  SUPER_ADMIN: '/admin',
}

export default async function DashboardIndexPage() {
  const auth = await getAuthContext()
  if (!auth) {
    redirect('/auth/sign-in?callbackUrl=%2Fdashboard')
  }

  // Live record decides — the JWT claim may lag a staff role change.
  const user = await db.user.findUnique({
    where: { id: auth.userId },
    select: { role: true, status: true, deletedAt: true },
  })

  if (!user || user.deletedAt || user.status !== 'ACTIVE') {
    redirect('/auth/sign-in?callbackUrl=%2Fdashboard')
  }

  const home = ROLE_HOME[user.role as Role] ?? '/403'
  redirect(home)
}
