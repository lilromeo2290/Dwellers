/**
 * Dwellers — Equipment service areas (PART 27).
 * Business coverage via the Phase 2 BusinessServiceArea relation.
 */
import { getAuthContext } from '@/lib/auth/session'
import { getOwnProfileBundle } from '@/modules/identity/profile-service'
import { ServiceAreasForm } from '@/components/dashboard/forms'
import { WelcomeHeader } from '@/components/dashboard/widgets'

export const metadata = { title: 'Service areas' }

export default async function EquipmentServiceAreasPage() {
  const auth = await getAuthContext()
  const bundle = await getOwnProfileBundle(auth)

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <WelcomeHeader
        name={bundle.account.name}
        title="Service areas"
        description="Where does your business serve customers?"
      />
      {bundle.business ? (
        <ServiceAreasForm
          scope="business"
          initial={bundle.business.serviceAreas.map((area) => area.id)}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          You registered without a business account, so there are no business service areas to manage.
        </p>
      )}
    </div>
  )
}
