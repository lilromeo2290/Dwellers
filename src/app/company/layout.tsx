/**
 * Dwellers — company dashboard layout.
 * Server-side guard: unauthenticated → sign-in; wrong role → 403 (PART 30).
 */
import { requireDashboardPage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/dashboard/shell'

export default async function CompanyLayout({ children }: { children: React.ReactNode }) {
  const context = await requireDashboardPage({ allow: ['CONSTRUCTION_COMPANY'], path: '/company' })
  return <DashboardShell context={context}>{children}</DashboardShell>
}
