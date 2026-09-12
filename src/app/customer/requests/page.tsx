/**
 * Dwellers — Customer dashboard: MY JOB REQUESTS (Phase 5, PART 29).
 *
 * Every request the customer filed, newest first, with its real status.
 * Drafts are included honestly — they are real rows the customer can open,
 * continue or cancel.
 */
import Link from 'next/link'
import { getAuthContext } from '@/lib/auth/session'
import { listJobRequests } from '@/modules/projects/job-request-service'
import { WelcomeHeader } from '@/components/dashboard/widgets'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RequestStatusBadge } from '@/components/requests/status-badge'
import { FileText } from 'lucide-react'

export const metadata = { title: 'My Job Requests' }

export const dynamic = 'force-dynamic'

function formatDate(value: Date | string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function CustomerRequestsPage() {
  const auth = await getAuthContext()
  const { items } = await listJobRequests(auth, { page: 1, pageSize: 50 })

  return (
    <div>
      <WelcomeHeader
        name={null}
        title="My Job Requests"
        description="Everything you have asked providers to quote for — and exactly where each one stands."
      />

      {items.length === 0 ? (
        <Card data-testid="requests-empty">
          <CardContent className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <FileText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="font-medium">No service requests yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Find a provider you like and press Request service — describe the job, add photos and
              submit, all without a phone call.
            </p>
            <Button asChild size="sm">
              <Link href="/find">Find a provider</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3" data-testid="customer-requests-list">
          {items.map((request) => (
            <li key={request.id}>
              <Link
                href={`/customer/requests/${request.id}`}
                className="block rounded-xl border bg-card transition-colors hover:border-primary/40"
              >
                <Card className="border-0 shadow-none">
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{request.reference}</span>
                        <RequestStatusBadge status={request.status} />
                        {request.urgency === 'URGENT' && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
                            Urgent
                          </span>
                        )}
                        {request.urgency === 'EMERGENCY' && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-900 dark:bg-red-500/20 dark:text-red-200">
                            Emergency
                          </span>
                        )}
                      </div>
                      <p className="truncate font-medium">{request.title ?? 'Untitled request'}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {request.provider?.business?.name ?? request.provider?.user?.name ?? 'Provider'} ·{' '}
                        {request.service?.name ?? request.category?.name ?? 'Service'} ·{' '}
                        {request.location?.name ?? 'Location not set'}
                      </p>
                    </div>
                    <div className="shrink-0 text-left text-xs text-muted-foreground sm:text-right">
                      <p>Submitted {formatDate(request.submittedAt ?? request.createdAt)}</p>
                      <p>Updated {formatDate(request.updatedAt)}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
