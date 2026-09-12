/**
 * Dwellers — Company verification status (PART 28).
 * Business verification is an administrative trust workflow.
 */
import { getAuthContext } from '@/lib/auth/session'
import { getOwnProfileBundle } from '@/modules/identity/profile-service'
import { WelcomeHeader, VerificationBanner } from '@/components/dashboard/widgets'
import { Card, CardContent } from '@/components/ui/card'

export const metadata = { title: 'Verification' }

export default async function CompanyVerificationPage() {
  const auth = await getAuthContext()
  const bundle = await getOwnProfileBundle(auth)
  const status = bundle.business?.verificationStatus ?? 'UNVERIFIED'

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <WelcomeHeader
        name={bundle.account.name}
        title="Verification"
        description="How business verification works and where your company stands."
      />
      <VerificationBanner status={status} kind="business" />
      <Card>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">What happens next?</p>
          <p>1. Complete your company profile — description, location, service areas and registration details.</p>
          <p>2. The Dwellers trust team reviews your business registration (Registrar-General) information.</p>
          <p>3. You receive a notification here when your verification status changes.</p>
          <p className="text-xs">
            Current status: <span className="font-semibold text-foreground">{status}</span>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
