/**
 * Dwellers — Admin audit log (PART 24/33).
 * Append-only WHO/WHAT/WHEN trail rendered read-only for staff.
 */
import { db } from '@/lib/db'
import { WelcomeHeader } from '@/components/dashboard/widgets'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export const metadata = { title: 'Audit logs' }

export default async function AdminAuditPage() {
  const entries = await db.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      actorId: true,
      actorRole: true,
      action: true,
      entityType: true,
      entityId: true,
      createdAt: true,
    },
  })

  return (
    <div className="space-y-6">
      <WelcomeHeader
        name={null}
        title="Audit logs"
        description="Append-only security and business events — the 100 most recent."
      />

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">When</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                  <th className="px-4 py-3 font-semibold">Actor role</th>
                  <th className="px-4 py-3 font-semibold">Entity</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-border/60 last:border-0" data-testid="audit-row">
                    <td className="px-4 py-3 text-xs text-muted-foreground">{entry.createdAt.toLocaleString('en-GB')}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{entry.action}</td>
                    <td className="px-4 py-3"><Badge variant="secondary">{entry.actorRole ?? 'system'}</Badge></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{entry.entityType ?? '—'}</td>
                  </tr>
                ))}
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No audit events recorded yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
