/**
 * Dwellers — Equipment provider dashboard (PART 23).
 * Profile + coverage only; rental workflows arrive later (PART 51).
 */
import { getAuthContext } from '@/lib/auth/session'
import { getOwnProfileBundle } from '@/modules/identity/profile-service'
import { WelcomeHeader, CompletionWidget, ComingSoon, StatCard } from '@/components/dashboard/widgets'

export const metadata = { title: 'Overview' }

export default async function EquipmentOverviewPage() {
  const auth = await getAuthContext()
  const bundle = await getOwnProfileBundle(auth)

  return (
    <div>
      <WelcomeHeader
        name={bundle.account.name}
        title={bundle.business ? `Fleet workspace — ${bundle.business.name}` : 'Fleet workspace'}
        description="Set up your equipment business profile and coverage. Listings and rental requests arrive in later phases."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Service areas" value={bundle.business?.serviceAreas.length ?? 0} />
        <StatCard label="Delivery" value={bundle.business?.offersDelivery ? 'Offered' : 'Not offered'} />
        <StatCard label="Profile" value={bundle.completion.percent + '%'} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <CompletionWidget completion={bundle.completion} profileHref="/equipment/profile" />
        <div className="grid gap-4">
          <ComingSoon title="Equipment" phase="Phase 5" description="List machinery with rental rates in GH₵." />
          <ComingSoon title="Rental Requests" phase="Phase 6" description="Hire enquiries from customers." />
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <ComingSoon title="Availability" phase="Phase 5" description="Manage booking calendars." />
        <ComingSoon title="Messages" phase="Phase 6" description="Chat with hirers." />
      </div>
    </div>
  )
}
