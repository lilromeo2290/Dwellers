/**
 * Dwellers — Admin overview (PART 24).
 * Real platform statistics from the database. Staff-only via the layout guard.
 */
import Link from 'next/link'
import { getAuthContext } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { WelcomeHeader, StatCard } from '@/components/dashboard/widgets'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export const metadata = { title: 'Admin overview' }

export default async function AdminOverviewPage() {
  const auth = await getAuthContext()

  const [totalUsers, customers, providers, businesses, pendingBusinesses, recentUsers, recentAudit] =
    await Promise.all([
      db.user.count({ where: { deletedAt: null } }),
      db.user.count({ where: { role: 'CUSTOMER', deletedAt: null } }),
      db.user.count({ where: { role: { in: ['ARTISAN', 'CONTRACTOR', 'CONSTRUCTION_COMPANY', 'SUPPLIER', 'EQUIPMENT_PROVIDER'] }, deletedAt: null } }),
      db.business.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      db.business.count({ where: { status: 'ACTIVE', verificationStatus: { in: ['UNVERIFIED', 'PENDING'] }, deletedAt: null } }),
      db.user.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
      }),
      db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 6 }),
    ])

  return (
    <div>
      <WelcomeHeader
        name={auth?.name ?? null}
        title="Platform administration"
        description="Live platform statistics. Verification, moderation and settings arrive in later phases."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Users" value={totalUsers} />
        <StatCard label="Customers" value={customers} />
        <StatCard label="Providers" value={providers} />
        <StatCard label="Businesses" value={businesses} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">Newest accounts</CardTitle>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/users">All users</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentUsers.map((user) => (
              <div key={user.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{user.name ?? user.email}</p>
                  <p className="text-xs text-muted-foreground">{user.role} · {user.createdAt.toLocaleDateString('en-GB')}</p>
                </div>
                <Badge variant={user.status === 'ACTIVE' ? 'default' : 'secondary'}>{user.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">Latest audit events</CardTitle>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/audit">Full audit log</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentAudit.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{entry.action}</p>
                  <p className="text-xs text-muted-foreground">{entry.entityType ?? '—'} · {entry.createdAt.toLocaleString('en-GB')}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 rounded-xl border border-accent/50 bg-accent/10 p-4 text-sm text-muted-foreground">
        {pendingBusinesses} business profile(s) await verification review. The full verification workflow
        arrives with the trust phase.
      </div>
    </div>
  )
}
