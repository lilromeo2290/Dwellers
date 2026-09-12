/**
 * Dwellers — Artisan service areas (PART 27).
 * Managed through the Phase 2 ProviderServiceArea relation — never free text.
 */
import { getAuthContext } from '@/lib/auth/session'
import { getOwnProfileBundle } from '@/modules/identity/profile-service'
import { ServiceAreasForm } from '@/components/dashboard/forms'
import { WelcomeHeader } from '@/components/dashboard/widgets'

export const metadata = { title: 'Service areas' }

export default async function ArtisanServiceAreasPage() {
  const auth = await getAuthContext()
  const bundle = await getOwnProfileBundle(auth)

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <WelcomeHeader
        name={bundle.account.name}
        title="Service areas"
        description="Where do you provide your services? Customers in these areas will find you."
      />
      <ServiceAreasForm
        scope="provider"
        initial={(bundle.providerProfile?.serviceAreas ?? []).map((area) => area.id)}
      />
    </div>
  )
}
