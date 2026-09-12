/**
 * Dwellers — Customer profile management (PART 25).
 */
import { getAuthContext } from '@/lib/auth/session'
import { getOwnProfileBundle } from '@/modules/identity/profile-service'
import { PersonalProfileForm, AvatarUpload } from '@/components/dashboard/forms'
import { WelcomeHeader } from '@/components/dashboard/widgets'

export const metadata = { title: 'My profile' }

export default async function CustomerProfilePage() {
  const auth = await getAuthContext()
  const bundle = await getOwnProfileBundle(auth)

  return (
    <div className="space-y-6">
      <WelcomeHeader
        name={bundle.account.name}
        title="My profile"
        description="Keep your contact details current so providers can reach you."
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
  )
}
