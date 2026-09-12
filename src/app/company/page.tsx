/**
 * Dwellers — Construction company dashboard (PART 21).
 * Owner sees company overview; BusinessMember permission granularity arrives
 * with the team phase — normal members will never inherit owner powers.
 */
import Link from 'next/link'
import { getAuthContext } from '@/lib/auth/session'
import { getOwnProfileBundle } from '@/modules/identity/profile-service'
import { WelcomeHeader, CompletionWidget, VerificationBanner, ComingSoon, StatCard } from '@/components/dashboard/widgets'
import { Button } from '@/components/ui/button'

export const metadata = { title: 'Overview' }

export default async function CompanyOverviewPage() {
  const auth = await getAuthContext()
  const bundle = await getOwnProfileBundle(auth)

  return (
    <div>
      <WelcomeHeader
        name={bundle.account.name}
        title={bundle.business ? `Company workspace — ${bundle.business.name}` : 'Company workspace'}
        description="Manage your company profile and coverage. Team, services, quotations and projects arrive in later phases."
      />
      {bundle.business ? <VerificationBanner status={bundle.business.verificationStatus} kind="business" /> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Service areas" value={bundle.business?.serviceAreas.length ?? 0} />
        <StatCard label="Team members" value="1" />
        <StatCard label="Profile" value={bundle.completion.percent + '%'} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <CompletionWidget completion={bundle.completion} profileHref="/company/profile" />
        <div className="grid gap-4 sm:grid-cols-1">
          <ComingSoon title="Team" phase="Phase 5" description="Invite managers and members with scoped roles." />
          <ComingSoon title="Services" phase="Phase 4" description="Publish company services to the marketplace." />
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <ComingSoon title="Job Requests" phase="Phase 5 — LIVE" description="Live now — open Job Requests in the sidebar." href="/company/requests" />
        <ComingSoon title="Quotes" phase="Phase 5" description="Prepare company quotations." />
        <ComingSoon title="Projects" phase="Phase 6" description="Manage site projects and milestones." />
        <ComingSoon title="Portfolio" phase="Phase 4" description="Completed project galleries." />
      </div>
    </div>
  )
}
