/**
 * Dwellers — Customer dashboard (PART 18).
 * Simple and professional: profile completion + honest later-phase placeholders.
 */
import Link from 'next/link'
import { getAuthContext } from '@/lib/auth/session'
import { getOwnProfileBundle } from '@/modules/identity/profile-service'
import { WelcomeHeader, CompletionWidget, ComingSoon } from '@/components/dashboard/widgets'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Search } from 'lucide-react'

export const metadata = { title: 'Overview' }

export default async function CustomerOverviewPage() {
  const auth = await getAuthContext()
  const bundle = await getOwnProfileBundle(auth)

  return (
    <div>
      <WelcomeHeader
        name={bundle.account.name}
        title="Your customer workspace"
        description="Find trusted artisans and suppliers, request quotations and manage your building projects — those arrive in the next phases. For now, make your profile great."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <CompletionWidget completion={bundle.completion} profileHref="/customer/profile" />

        <Card data-testid="find-artisan-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Find an Artisan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Nationwide artisan discovery arrives in Phase 4 — plumbers in Nsawam, masons in Kumasi,
              suppliers in Tamale and everywhere between.
            </p>
            <Button asChild size="sm" variant="outline" disabled>
              <Search className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Search coming soon
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <ComingSoon title="My Job Requests" phase="Phase 5" description="Describe the work you need done." />
        <ComingSoon title="My Quotes" phase="Phase 5" description="Compare and respond to quotations." />
        <ComingSoon title="My Projects" phase="Phase 6" description="Track milestones and budgets." />
        <ComingSoon title="My Orders" phase="Phase 6" description="Buy materials and equipment." />
        <ComingSoon title="Messages" phase="Phase 6" description="Chat with your providers." />
        <ComingSoon title="Saved Providers" phase="Phase 4" description="Keep a shortlist of favourites." />
      </div>
    </div>
  )
}
