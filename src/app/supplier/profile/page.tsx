/**
 * Dwellers — Supplier profile management (PART 25).
 * The owner's personal account plus the business profile.
 */
import { getAuthContext } from '@/lib/auth/session'
import { getOwnProfileBundle } from '@/modules/identity/profile-service'
import { PersonalProfileForm, BusinessProfileForm, AvatarUpload } from '@/components/dashboard/forms'
import { WelcomeHeader } from '@/components/dashboard/widgets'
import { NotFoundError } from '@/lib/errors'

export const metadata = { title: 'My profile' }

export default async function SupplierProfilePage() {
  const auth = await getAuthContext()
  const bundle = await getOwnProfileBundle(auth)

  if (!bundle.business) {
    // Registered without a business name (equipment path) — personal only.
    return (
      <div className="space-y-6">
        <WelcomeHeader
          name={bundle.account.name}
          title="My profile"
          description="You registered without a business account."
        />
        <PersonalProfileForm
          initial={{
            name: bundle.account.name ?? '',
            phone: bundle.account.phone ?? '',
            bio: bundle.personalProfile?.bio ?? '',
            addressLine: bundle.personalProfile?.addressLine ?? '',
            website: bundle.personalProfile?.website ?? '',
            locationId: bundle.personalProfile?.location?.id ?? null,
          }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <WelcomeHeader
        name={bundle.account.name}
        title="My profile"
        description="Your business identity and your personal account details."
      />
      <div className="grid gap-6">
        <BusinessProfileForm
          initial={{
            name: bundle.business.name,
            description: bundle.business.description ?? '',
            phone: bundle.business.phone ?? '',
            email: bundle.business.email ?? '',
            locationId: bundle.business.location?.id ?? null,
            offersDelivery: bundle.business.offersDelivery,
          }}
        />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <PersonalProfileForm
              initial={{
                name: bundle.account.name ?? '',
                phone: bundle.account.phone ?? '',
                bio: bundle.personalProfile?.bio ?? '',
                addressLine: bundle.personalProfile?.addressLine ?? '',
                website: bundle.personalProfile?.website ?? '',
                locationId: bundle.personalProfile?.location?.id ?? null,
              }}
            />
          </div>
          <AvatarUpload hasAvatar={Boolean(bundle.account.avatarKey)} />
        </div>
      </div>
    </div>
  )
}
