'use client'

/**
 * Dwellers — Provider request detail + response (Phase 5, PART 31/32/55).
 *
 * The provider sees everything needed to decide: service, title, description,
 * location, preferred timing, photos and the customer's display name (first
 * name + initial only). The response panel submits an ACTION — the server
 * owns the resulting state (PART 24). Business MEMBERs get an honest
 * read-only notice instead of buttons they cannot use (PART 27).
 */
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RequestStatusBadge, nextStepCopy } from '@/components/requests/status-badge'
import { RequestTimeline } from '@/components/requests/timeline'
import { apiFetch, ApiError } from '@/lib/client/api'

export interface ProviderRequestView {
  id: string
  reference: string
  title: string | null
  description: string
  status: string
  responseKind: string | null
  urgency: string | null
  preferredDate: string | null
  preferredTimeSlot: string | null
  areaText: string | null
  locationLine: string
  serviceLine: string
  customerDisplayName: string | null
  servesLocation: boolean | undefined
  canRespond: boolean
  /** Phase 6 (PART 3): CREATE QUOTE wiring — the page resolves eligibility. */
  quote: { id: string; status: string } | null
  canCreateQuote: boolean
  createQuoteHref: string | null
  quoteHref: string | null
  attachments: { id: string; originalName: string | null }[]
  events: { id: string; eventType: string; message: string | null; createdAt: string; actorRole: string | null }[]
}

type ResponseAction = 'respond_interested' | 'respond_info' | 'respond_declined'

const RESPONSE_BUTTONS: { action: ResponseAction; label: string; testId: string; variant: 'default' | 'outline' | 'destructive' }[] = [
  { action: 'respond_interested', label: 'I am interested', testId: 'respond-interested', variant: 'default' },
  { action: 'respond_info', label: 'Ask for more info', testId: 'respond-info', variant: 'outline' },
  { action: 'respond_declined', label: 'Decline', testId: 'respond-decline', variant: 'destructive' },
]

export function ProviderRequestDetail({ request }: { request: ProviderRequestView }) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState<ResponseAction | null>(null)
  const [error, setError] = useState<string | null>(null)

  const waiting = request.status === 'SUBMITTED' || request.status === 'MATCHING'

  async function respond(action: ResponseAction) {
    if (pending) return
    setPending(action)
    setError(null)
    try {
      await apiFetch(`/api/job-requests/${request.id}/respond`, {
        method: 'POST',
        json: { action, message: message.trim() || null },
      })
      router.refresh()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The response could not be sent. Please try again.')
      setPending(null)
    }
  }

  return (
    <div data-testid="provider-request-detail">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-xs text-muted-foreground">{request.reference}</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
            {request.title ?? 'Untitled request'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            From {request.customerDisplayName ?? 'a Dwellers customer'}
          </p>
        </div>
        <RequestStatusBadge status={request.status} />
      </header>

      <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm">
        <span className="font-medium">Next:</span> {nextStepCopy(request.status, 'PROVIDER')}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">The job</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <Detail label="Service">{request.serviceLine}</Detail>
              <Detail label="Description" pre>
                {request.description || '—'}
              </Detail>
              <Detail label="Location">
                {request.locationLine}
                {request.areaText && <span className="mt-0.5 block text-muted-foreground">{request.areaText}</span>}
                {request.servesLocation === false && (
                  <span className="mt-1.5 flex items-start gap-1.5 rounded-lg border border-amber-300/60 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200">
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                    This job is outside your listed service areas.
                  </span>
                )}
              </Detail>
              <Detail label="Preferred">
                {request.preferredDate
                  ? new Date(request.preferredDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                  : 'As soon as possible'}
                {request.preferredTimeSlot && ` · ${request.preferredTimeSlot.toLowerCase()}`}
              </Detail>
              {request.urgency && <Detail label="Urgency">{request.urgency.toLowerCase()}</Detail>}
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

          {waiting && request.canRespond && (
            <Card data-testid="respond-panel">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Respond</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="respond-message">Message (optional)</Label>
                  <Textarea
                    id="respond-message"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    rows={3}
                    maxLength={1000}
                    placeholder="e.g. I can inspect the leaking pipe tomorrow morning."
                  />
                  <p className="text-xs text-muted-foreground">{message.trim().length}/1000</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {RESPONSE_BUTTONS.map((button) => (
                    <Button
                      key={button.action}
                      variant={button.variant}
                      onClick={() => void respond(button.action)}
                      disabled={pending !== null}
                      data-testid={button.testId}
                    >
                      {pending === button.action && (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                      )}
                      {button.label}
                    </Button>
                  ))}
                </div>
                {error && (
                  <p role="alert" className="text-sm text-destructive" data-testid="respond-error">
                    {error}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {waiting && !request.canRespond && (
            <p className="rounded-lg border px-3 py-2.5 text-sm text-muted-foreground">
              Your business role can view this request, but responding is reserved for owners and
              managers.
            </p>
          )}

          {request.responseKind && !waiting && (
            <p className="rounded-lg border px-3 py-2.5 text-sm text-muted-foreground">
              You already responded to this request
              {request.status === 'DECLINED' ? ' (declined).' : '.'}{' '}
              {request.status === 'RESPONDED' && 'The customer has been notified.'}
            </p>
          )}

          {/* Phase 6 (PART 3): price this job — the quote flow starts here. */}
          {request.canCreateQuote && request.createQuoteHref && (
            <Card data-testid="create-quote-panel">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Quotation</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  You marked this job as interesting. Prepare an itemised quotation — labour,
                  materials, transport — and send it to the customer.
                </p>
                <Button asChild className="mt-3" data-testid="create-quote">
                  <Link href={request.createQuoteHref}>Create quote</Link>
                </Button>
              </CardContent>
            </Card>
          )}
          {request.quote && request.quoteHref && (
            <Card data-testid="existing-quote-panel">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Your quotation</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  You already created a quotation for this request.
                </p>
                <Button asChild variant="outline" className="mt-3" data-testid="view-existing-quote">
                  <Link href={request.quoteHref}>Open quotation</Link>
                </Button>
              </CardContent>
            </Card>
          )}
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
          <p className="text-xs text-muted-foreground">
            Requests are private between you and the customer. Quotations you create appear on your
            Quotations board and the customer decides — no phone calls required.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <Link href=".." className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to requests
        </Link>
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
