/**
 * Dwellers — Customer dashboard (PART 18, Phase 5 update).
 * Real data: request activity and live discovery entry points.
 */
import Link from 'next/link'
import { getAuthContext } from '@/lib/auth/session'
import { getOwnProfileBundle } from '@/modules/identity/profile-service'
import { listJobRequests } from '@/modules/projects/job-request-service'
import { WelcomeHeader, CompletionWidget, ComingSoon } from '@/components/dashboard/widgets'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RequestStatusBadge } from '@/components/requests/status-badge'
import { ArrowRight, Search } from 'lucide-react'

export const metadata = { title: 'Overview' }

export default async function CustomerOverviewPage() {
  const auth = await getAuthContext()
  const bundle = await getOwnProfileBundle(auth)
  const { items: requests, total } = await listJobRequests(auth, { page: 1, pageSize: 4 })

  return (
    <div>
      <WelcomeHeader
        name={bundle.account.name}
        title="Your customer workspace"
        description="Find trusted artisans, request service without a phone call and follow every response — right here."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <CompletionWidget completion={bundle.completion} profileHref="/customer/profile" />

        <Card data-testid="find-artisan-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Find an Artisan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Plumbers in Nsawam, masons in Kumasi, suppliers in Tamale — search WHAT you need and WHERE
              you need it, nationwide.
            </p>
            <Button asChild size="sm">
              <Link href="/find">
                <Search className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Start a search
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6" data-testid="requests-overview-card">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">My Job Requests</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/customer/requests">
              View all <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {total === 0 ? (
            <p className="text-sm text-muted-foreground">
              No requests yet — find a provider and press Request service to describe your job.
            </p>
          ) : (
            <ul className="divide-y" data-testid="overview-recent-requests">
              {requests.map((request) => (
                <li key={request.id}>
                  <Link
                    href={`/customer/requests/${request.id}`}
                    className="flex items-center justify-between gap-3 py-2.5 text-sm transition-colors hover:text-primary"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{request.title ?? 'Untitled request'}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {request.provider?.business?.name ?? request.provider?.user?.name ?? 'Provider'} ·{' '}
                        {request.location?.name ?? '—'}
                      </span>
                    </span>
                    <RequestStatusBadge status={request.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <ComingSoon title="My Quotes" phase="Phase 6" description="Compare and respond to quotations." />
        <ComingSoon title="My Projects" phase="Phase 6" description="Track milestones and budgets." />
        <ComingSoon title="My Orders" phase="Phase 6" description="Buy materials and equipment." />
        <ComingSoon title="Messages" phase="Phase 6" description="Chat with your providers." />
      </div>
    </div>
  )
}
