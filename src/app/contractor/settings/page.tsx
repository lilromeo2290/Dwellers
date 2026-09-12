/**
 * Dwellers — contractor account settings.
 * Password change + profile photo (PARTS 25/41).
 */
import { getAuthContext } from '@/lib/auth/session'
import { pageUserAvatar } from '@/lib/auth/page-guards'
import { PasswordForm, AvatarUpload } from '@/components/dashboard/forms'
import { WelcomeHeader } from '@/components/dashboard/widgets'

export const metadata = { title: 'Account settings' }

export default async function ContractorSettingsPage() {
  const auth = await getAuthContext()
  const user = auth ? await pageUserAvatar(auth.userId) : null

  return (
    <div className="space-y-6">
      <WelcomeHeader
        name={null}
        title="Account settings"
        description="Security controls for your Dwellers account."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <PasswordForm />
        <AvatarUpload hasAvatar={Boolean(user?.avatarKey)} />
      </div>
    </div>
  )
}
