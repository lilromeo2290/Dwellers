/**
 * Dwellers — Admin user list (PART 24).
 * Read-only staff view over the accounts table. Role/status management
 * actions land with the full admin phase; escalation defences remain.
 */
import { db } from '@/lib/db'
import { WelcomeHeader, ComingSoon } from '@/components/dashboard/widgets'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

export const metadata = { title: 'Users' }

const ROLES = ['CUSTOMER', 'ARTISAN', 'CONTRACTOR', 'CONSTRUCTION_COMPANY', 'SUPPLIER', 'EQUIPMENT_PROVIDER', 'ADMIN', 'SUPER_ADMIN'] as const

export default async function AdminUsersPage() {
  const [total, users] = await Promise.all([
    db.user.count({ where: { deletedAt: null } }),
    db.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        emailVerifiedAt: true,
        lastLoginAt: true,
        isSeedData: true,
        createdAt: true,
      },
    }),
  ])

  return (
    <div className="space-y-6">
      <WelcomeHeader
        name={null}
        title="Users"
        description={`${total} account(s) on the platform — showing the 50 most recent.`}
      />

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Account</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Last login</th>
                  <th className="px-4 py-3 font-semibold">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-border/60 last:border-0" data-testid="admin-user-row">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">
                        {user.name ?? '—'}
                        {user.isSeedData ? <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">demo</span> : null}
                      </p>
                      <p className="text-xs text-muted-foreground">{user.email}{user.phone ? ` · ${user.phone}` : ''}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={ROLES.includes(user.role as (typeof ROLES)[number]) && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') ? 'destructive' : 'secondary'}>
                        {user.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={user.status === 'ACTIVE' ? 'default' : 'secondary'}>{user.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{user.lastLoginAt ? user.lastLoginAt.toLocaleString('en-GB') : 'Never'}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{user.createdAt.toLocaleDateString('en-GB')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <ComingSoon
        title="User management actions"
        phase="Phase 5"
        description="Suspend, reactivate, verify and assign roles — with full escalation defences."
      />
    </div>
  )
}
