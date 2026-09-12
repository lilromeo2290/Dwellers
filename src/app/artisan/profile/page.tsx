/**
 * Dwellers — Artisan profile management (PART 25).
 * Personal details + professional profile in one place.
 */
import { getAuthContext } from '@/lib/auth/session'
import { getOwnProfileBundle } from '@/modules/identity/profile-service'
import { PersonalProfileForm, ProviderProfileForm, AvatarUpload } from '@/components/dashboard/forms'
import { WelcomeHeader } from '@/components/dashboard/widgets'
import { db } from '@/lib/db'

export const metadata = { title: 'My profile' }

export default async function ArtisanProfilePage() {
  const auth = await getAuthContext()
  const bundle = await getOwnProfileBundle(auth)

  // Trades come from the live category tree — never hard-coded (PART 5).
  const professions = await db.category.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      parent: { slug: { in: ['construction-services', 'professional-services'] } },
    },
    select: { slug: true, name: true },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="space-y-6">
      <WelcomeHeader
        name={bundle.account.name}
        title="My profile"
        description="Your contact details and professional information."
      />
      <div className="grid gap-6">
        <ProviderProfileForm
          initial={{
            profession: bundle.providerProfile?.profession ?? '',
            headline: bundle.providerProfile?.headline ?? '',
            biography: bundle.providerProfile?.biography ?? '',
            yearsExperience: bundle.providerProfile?.yearsExperience ?? 0,
            availabilityStatus: bundle.providerProfile?.availabilityStatus ?? 'AVAILABLE',
            primaryLocationId: bundle.providerProfile?.primaryLocation?.id ?? null,
            professions,
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
