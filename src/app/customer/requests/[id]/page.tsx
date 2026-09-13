/**
 * Dwellers — Customer request details (Phase 5, PART 29/30/45/46/54).
 *
 * One request, rendered according to the caller's permission. The customer
 * always knows WHAT / WHERE / WHEN / WHO / STATUS / NEXT (PART 54) — the
 * timeline is built from real events only, and cancellation goes through the
 * state machine with a confirmation step (PART 46).
 */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CheckCircle2, ChevronLeft } from 'lucide-react'
import { getAuthContext } from '@/lib/auth/session'
import { getJobRequest } from '@/modules/projects/job-request-service'
import { listRequestQuotes } from '@/modules/quotes/quote-service'
import { NotFoundError } from '@/lib/errors'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RequestStatusBadge, nextStepCopy } from '@/components/requests/status-badge'
import { RequestTimeline } from '@/components/requests/timeline'
import { CustomerRequestActions } from '@/components/requests/customer-request-actions'
import { RequestQuotesPanel } from '@/components/quotes/request-quotes-panel'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Request details' }

const RESPONSE_COPY: Record<string, string> = {
  INTERESTED: 'The provider is interested in this job.',
  NEEDS_INFO: 'The provider asked for more information — see the response below.',
  DECLINED: 'The provider declined this request.',
}

export default async function CustomerRequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ submitted?: string }>
}) {
  const { id } = await params
  const { submitted } = await searchParams
  const auth = await getAuthContext()

  let request
  try {
    request = await getJobRequest(auth, id)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }
  // The customer side only — another customer's request 404s above.
  if (request.access.side !== 'CUSTOMER') notFound()

  const responseEvent = [...request.events]
    .reverse()
    .find((event) => event.eventType.startsWith('RESPONSE_'))

  // Phase 6 (PART 49/50): every quotation on this request, side by side.
  const quotes = await listRequestQuotes(auth, id)

  const locationLine = [
    request.community?.name,
    request.location?.name,
    request.location?.district?.name,
    request.location?.region?.name,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <div className="mx-auto max-w-3xl" data-testid="customer-request-detail">
      <Link
        href="/customer/requests"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        My Job Requests
      </Link>

      {submitted === '1' && (
        <div
          className="mt-4 flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3"
          role="status"
          data-testid="submit-confirmation"
        >
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="font-medium">Request submitted</p>
            <p className="text-sm text-muted-foreground">
              Reference <span className="font-mono">{request.reference}</span> — {request.provider?.business?.name ?? request.provider?.user?.name} has been
              notified and will respond here.
            </p>
          </div>
        </div>
      )}

      <header className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-xs text-muted-foreground">{request.reference}</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
            {request.title ?? 'Untitled request'}
          </h1>
        </div>
        <RequestStatusBadge status={request.status} />
      </header>

      <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-sm">
        <span className="font-medium">Next:</span> {nextStepCopy(request.status, 'CUSTOMER')}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">The job</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <Detail label="Provider">
                <Link
                  href={`/providers/${request.providerId}`}
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  {request.provider?.business?.name ?? request.provider?.user?.name ?? 'Provider'}
                </Link>
              </Detail>
              <Detail label="Service">{request.service?.name ?? request.category?.name ?? '—'}</Detail>
              <Detail label="Description" pre>
                {request.description || '—'}
              </Detail>
              <Detail label="Job location">
                {locationLine || '—'}
                {request.areaText && (
                  <span className="mt-0.5 block text-muted-foreground">{request.areaText}</span>
                )}
              </Detail>
              <Detail label="Preferred">
                {request.preferredDate
                  ? new Date(request.preferredDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                  : 'As soon as possible'}
                {request.preferredTimeSlot && ` · ${request.preferredTimeSlot.toLowerCase()}`}
              </Detail>
              {request.urgency && <Detail label="Urgency">{request.urgency.toLowerCase()}</Detail>}
              {(request.budgetMinAmount != null || request.budgetMaxAmount != null) && (
                <Detail label="Budget">
                  {request.budgetMinAmount != null ? `GH₵ ${(request.budgetMinAmount / 100).toFixed(2)}` : '—'}
                  {' – '}
                  {request.budgetMaxAmount != null ? `GH₵ ${(request.budgetMaxAmount / 100).toFixed(2)}` : '—'}
                </Detail>
              )}
            </CardContent>
          </Card>

          {request.attachments.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Photos ({request.attachments.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {request.attachments.map((attachment) => (
                    <li key={attachment.id} className="overflow-hidden rounded-lg border">
                      {/* Private, authorization-checked photo route (PART 49). */}
                      <img
                        src={`/api/job-requests/${request.id}/attachments/${attachment.id}`}
                        alt={attachment.originalName ?? 'Job photo'}
                        loading="lazy"
                        className="aspect-square w-full object-cover"
                      />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {responseEvent && request.responseKind && (
            <Card data-testid="provider-response-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Provider response</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>{RESPONSE_COPY[request.responseKind] ?? 'The provider has responded.'}</p>
                {responseEvent.message && (
                  <blockquote className="rounded-lg bg-muted px-3 py-2 italic">
                    &ldquo;{responseEvent.message}&rdquo;
                  </blockquote>
                )}
              </CardContent>
            </Card>
          )}

          <RequestQuotesPanel
            quotes={quotes}
            showWhenEmpty={request.status === 'RESPONDED' && request.responseKind === 'INTERESTED'}
          />
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <RequestTimeline events={request.events} />
            </CardContent>
          </Card>

          <CustomerRequestActions
            requestId={request.id}
            providerId={request.providerId ?? ''}
            status={request.status}
          />
        </div>
      </div>
    </div>
  )
}

function Detail({ label, children, pre }: { label: string; children: React.ReactNode; pre?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className={pre ? 'whitespace-pre-wrap' : ''}>{children}</div>
    </div>
  )
}
