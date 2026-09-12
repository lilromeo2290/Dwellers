/**
 * Dwellers — Artisan verification status (PART 28).
 * Registration does NOT mean verification. Verification is an administrative
 * trust workflow — there is nothing to click here, by design.
 */
import { getAuthContext } from '@/lib/auth/session'
import { getOwnProfileBundle } from '@/modules/identity/profile-service'
import { WelcomeHeader, VerificationBanner } from '@/components/dashboard/widgets'
import { Card as UICard, CardContent as UICardContent } from '@/components/ui/card'

export const metadata = { title: 'Verification' }

export default async function ArtisanVerificationPage() {
  const auth = await getAuthContext()
  const bundle = await getOwnProfileBundle(auth)
  const status = bundle.providerProfile?.verificationStatus ?? 'UNVERIFIED'

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <WelcomeHeader
        name={bundle.account.name}
        title="Verification"
        description="How the trust workflow works and where your profile stands."
      />
      <VerificationBanner status={status} kind="provider" />
      <UICard>
        <UICardContent className="space-y-3 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">What happens next?</p>
          <p>
            1. Complete your profile — trades, experience, service areas and portfolio build the evidence
            the trust team reviews.
          </p>
          <p>2. The Dwellers trust team reviews your professional information and documents.</p>
          <p>3. You receive a notification here when your verification status changes.</p>
          <p className="text-xs">
            Current status: <span className="font-semibold text-foreground">{status}</span>
          </p>
        </UICardContent>
      </UICard>
    </div>
  )
}
