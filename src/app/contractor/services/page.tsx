/**
 * Dwellers — Contractor services (read-only).
 * The caller's existing service listings from Phase 2. Full listing CRUD
 * arrives with the marketplace phases — nothing is faked here.
 */
import Link from 'next/link'
import { getAuthContext } from '@/lib/auth/session'
import { getOwnProfileBundle } from '@/modules/identity/profile-service'
import { db } from '@/lib/db'
import { WelcomeHeader, ComingSoon } from '@/components/dashboard/widgets'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export const metadata = { title: 'My services' }

export default async function ContractorServicesPage() {
  const auth = await getAuthContext()
  const bundle = await getOwnProfileBundle(auth)
  const providerId = bundle.providerProfile?.id

  const services = providerId
    ? await db.service.findMany({
        where: { providerId, deletedAt: null },
        select: { id: true, name: true, status: true, pricingModel: true, startingPriceAmount: true, currency: true },
        orderBy: { updatedAt: 'desc' },
      })
    : []

  const formatPrice = (amount: number | null, currency: string) =>
    amount === null ? '' : ` (GH₵ ${(amount / 100).toLocaleString('en-GH')})`

  return (
    <div className="space-y-6">
      <WelcomeHeader
        name={bundle.account.name}
        title="My services"
        description="Service listings you already offer. Publishing and editing arrive with the marketplace phase."
      />

      {services.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            You have no service listings yet. Listing management arrives in a later phase.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {services.map((service) => (
            <div key={service.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3" data-testid="service-row">
              <div>
                <p className="text-sm font-semibold text-foreground">{service.name}</p>
                <p className="text-xs text-muted-foreground">
                  {service.pricingModel}
                  {service.startingPriceAmount !== null ? ` — from GH₵ ${(service.startingPriceAmount / 100).toLocaleString('en-GH')}` : ''}
                </p>
              </div>
              <Badge variant={service.status === 'ACTIVE' ? 'default' : 'secondary'}>{service.status}</Badge>
            </div>
          ))}
        </div>
      )}

      <ComingSoon title="Service publishing" phase="Phase 4-5" description="Create, edit, pause and price your services from here." />
    </div>
  )
}
