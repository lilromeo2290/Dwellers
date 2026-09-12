/**
 * Dwellers — Contractor dashboard overview (PART 19/20).
 * Real data only: completion, verification, availability and existing
 * services. Later-phase features appear as honest placeholders (PART 51).
 */
import Link from 'next/link'
import { getAuthContext } from '@/lib/auth/session'
import { getOwnProfileBundle } from '@/modules/identity/profile-service'
import { db } from '@/lib/db'
import { WelcomeHeader, CompletionWidget, VerificationBanner, ComingSoon, StatCard } from '@/components/dashboard/widgets'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export const metadata = { title: 'Overview' }

export default async function ContractorOverviewPage() {
  const auth = await getAuthContext()
  const bundle = await getOwnProfileBundle(auth)
  const provider = bundle.providerProfile

  const services = provider
    ? await db.service.findMany({
        where: { providerId: provider.id, deletedAt: null },
        select: { id: true, name: true, status: true, pricingModel: true },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      })
    : []
  const serviceCount = provider
    ? await db.service.count({ where: { providerId: provider.id, deletedAt: null } })
    : 0

  return (
    <div>
      <WelcomeHeader
        name={bundle.account.name}
        title="Your contractor workspace"
        description="Complete your profile and manage where you work. Job requests, quotes and projects arrive in later phases."
      />
      {provider ? <VerificationBanner status={provider.verificationStatus} kind="provider" /> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Services" value={serviceCount} />
        <StatCard label="Service areas" value={provider?.serviceAreas.length ?? 0} />
        <StatCard label="Profile" value={bundle.completion.percent + '%'} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <CompletionWidget completion={bundle.completion} profileHref="/contractor/profile" />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              Your services
              <Button asChild size="sm" variant="outline">
                <Link href="/contractor/services">View all</Link>
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {services.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No services yet — listing management arrives in a later phase.
              </p>
            ) : (
              services.map((service) => (
                <div key={service.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <span className="text-sm font-medium text-foreground">{service.name}</span>
                  <Badge variant={service.status === 'ACTIVE' ? 'default' : 'secondary'}>{service.status}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <ComingSoon title="Job Requests" phase="Phase 5 — LIVE" description="Live now — open Job Requests in the sidebar." href="/artisan/requests" />
        <ComingSoon title="Quotes" phase="Phase 5" description="Submit quotations from here." />
        <ComingSoon title="Portfolio" phase="Phase 4" description="Show photos of your completed work." />
        <ComingSoon title="Messages" phase="Phase 6" description="Chat with customers directly." />
      </div>
    </div>
  )
}
