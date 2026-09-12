/**
 * Dwellers — Supplier dashboard (PART 22).
 * Onboarding + profile management only; the marketplace arrives later (PART 51).
 */
import { getAuthContext } from '@/lib/auth/session'
import { getOwnProfileBundle } from '@/modules/identity/profile-service'
import { WelcomeHeader, CompletionWidget, VerificationBanner, ComingSoon, StatCard } from '@/components/dashboard/widgets'

export const metadata = { title: 'Overview' }

export default async function SupplierOverviewPage() {
  const auth = await getAuthContext()
  const bundle = await getOwnProfileBundle(auth)

  return (
    <div>
      <WelcomeHeader
        name={bundle.account.name}
        title={bundle.business ? `Shop workspace — ${bundle.business.name}` : 'Shop workspace'}
        description="Set up your business profile and coverage. Product listings, orders and delivery arrive with the marketplace phases."
      />
      {bundle.business ? <VerificationBanner status={bundle.business.verificationStatus} kind="business" /> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Service areas" value={bundle.business?.serviceAreas.length ?? 0} />
        <StatCard label="Delivery" value={bundle.business?.offersDelivery ? 'Offered' : 'Not offered'} />
        <StatCard label="Profile" value={bundle.completion.percent + '%'} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <CompletionWidget completion={bundle.completion} profileHref="/supplier/profile" />
        <div className="grid gap-4">
          <ComingSoon title="Products" phase="Phase 5" description="Stock your catalogue with prices in GH₵." />
          <ComingSoon title="Orders" phase="Phase 6" description="Fulfil customer orders." />
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <ComingSoon title="Customers" phase="Phase 6" description="Your buyer relationships." />
        <ComingSoon title="Reviews" phase="Phase 5" description="What customers say about your shop." />
      </div>
    </div>
  )
}
