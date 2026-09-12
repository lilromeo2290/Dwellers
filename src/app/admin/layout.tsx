/**
 * Dwellers — Admin dashboard layout.
 * Staff-only guard: ordinary roles can NEVER reach administrative pages
 * (PART 24). Only ADMIN and SUPER_ADMIN pass.
 */
import { requireDashboardPage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/dashboard/shell'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const context = await requireDashboardPage({ allow: ['ADMIN', 'SUPER_ADMIN'], path: '/admin' })
  return <DashboardShell context={context}>{children}</DashboardShell>
}
