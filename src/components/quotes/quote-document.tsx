'use client'

/**
 * Dwellers — Quotation document view (Phase 6, PART 25/29/30/56/57/58).
 *
 * Feels like a professional business quotation — DWELLERS header, reference,
 * validity, itemised lines grouped by type, subtotal → discount → total,
 * notes and terms — never a developer dashboard. Decisions go through
 * accessible confirmation dialogs that restate total, provider, job and
 * validity (PART 29). Print-friendly via @media print (PART 56).
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { apiFetch, ApiError } from '@/lib/client/api'
import { formatCedi } from '@/lib/finance'
import { QuoteStatusBadge } from '@/components/quotes/quote-badge'

export interface QuoteDocumentData {
  id: string
  quoteNumber: string
  status: string
  validUntil: string | null
  expired: boolean
  notes: string | null
  terms: string | null
  estimatedDurationDays: number | null
  subtotalAmount: number
  discountAmount: number
  totalAmount: number
  currency: string
  createdAt: string
  items: {
    id: string
    kind: string
    name: string
    description: string | null
    quantityMilli: number
    unitLabel: string | null
    unitPriceAmount: number
    lineTotalAmount: number
  }[]
  jobRequest: {
    reference: string
    title: string | null
    serviceLine: string | null
    locationLine: string
  }
  provider: { id: string; displayName: string }
  customer: { displayName: string }
  access: {
    side: 'CUSTOMER' | 'PROVIDER' | 'STAFF'
    canDecide: boolean
    canManage: boolean
    canEditDraft: boolean
  }
  rolePrefix: string
  backHref: string
}

const KIND_GROUP_ORDER = ['LABOUR', 'MATERIAL', 'EQUIPMENT', 'TRANSPORT', 'OTHER'] as const
const KIND_GROUP_LABELS: Record<string, string> = {
  LABOUR: 'Labour',
  MATERIAL: 'Materials',
  EQUIPMENT: 'Equipment',
  TRANSPORT: 'Transport',
  OTHER: 'Other costs',
}

export function QuoteDocument({ quote }: { quote: QuoteDocumentData }) {
  const router = useRouter()
  const [dialog, setDialog] = useState<'accept' | 'decline' | null>(null)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState<'accept' | 'decline' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isCustomer = quote.access.side === 'CUSTOMER'
  const grouped = KIND_GROUP_ORDER.map((kind) => ({
    kind,
    label: KIND_GROUP_LABELS[kind],
    items: quote.items.filter((item) => item.kind === kind),
  })).filter((group) => group.items.length > 0)

  async function decide(action: 'accept' | 'decline') {
    if (pending) return
    setPending(action)
    setError(null)
    try {
      if (action === 'accept') {
        await apiFetch(`/api/quotes/${quote.id}/accept`, { method: 'POST' })
      } else {
        await apiFetch(`/api/quotes/${quote.id}/decline`, {
          method: 'POST',
          json: { reason: reason.trim() || null },
        })
      }
      setDialog(null)
      router.refresh()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The decision could not be sent. Please try again.')
      setPending(null)
    }
  }

  return (
    <div data-testid="quote-document" className="print:mt-0">
      <div className="flex items-center justify-between print:hidden">
        <a href={quote.backHref} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
          ← Back
        </a>
        <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="print-quote">
          <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Print
        </Button>
      </div>

      <article className="mt-4 rounded-2xl border bg-card p-5 shadow-sm print:rounded-none print:border-0 print:shadow-none sm:p-8">
        <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Dwellers</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Quotation</h1>
            <p className="mt-1 font-mono text-sm text-muted-foreground" data-testid="quote-reference">
              {quote.quoteNumber}
            </p>
          </div>
          <div className="text-left sm:text-right">
            <QuoteStatusBadge status={quote.status} />
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex gap-2 sm:justify-end">
                <dt className="text-muted-foreground">Date:</dt>
                <dd>{new Date(quote.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</dd>
              </div>
              <div className="flex gap-2 sm:justify-end">
                <dt className="text-muted-foreground">Valid until:</dt>
                <dd className={quote.expired ? 'font-medium text-destructive' : 'font-medium'} data-testid="quote-valid-until">
                  {quote.validUntil
                    ? new Date(quote.validUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                    : '—'}
                </dd>
              </div>
            </dl>
          </div>
        </header>

        <section className="grid gap-4 border-b py-5 text-sm sm:grid-cols-2">
          <Party label="Provider">
            <p className="font-medium">{quote.provider.displayName}</p>
          </Party>
          <Party label="Customer">
            <p className="font-medium">{quote.customer.displayName}</p>
          </Party>
          <Party label="Job">
            <p className="font-medium">
              {quote.jobRequest.title ?? 'Untitled job'}
              <span className="block font-mono text-xs text-muted-foreground">{quote.jobRequest.reference}</span>
            </p>
          </Party>
          <Party label="Service & location">
            <p className="font-medium">{quote.jobRequest.serviceLine ?? '—'}</p>
            <p className="text-muted-foreground">{quote.jobRequest.locationLine}</p>
          </Party>
        </section>

        <section className="py-5" data-testid="quote-items">
          {grouped.map((group) => (
            <div key={group.kind} className="mb-5 last:mb-0">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h2>
              <ul className="mt-2 divide-y">
                {group.items.map((item) => (
                  <li key={item.id} className="flex items-baseline justify-between gap-4 py-2 text-sm">
                    <span>
                      <span className="font-medium">{item.name}</span>
                      {item.description && (
                        <span className="block text-xs text-muted-foreground">{item.description}</span>
                      )}
                      <span className="block text-xs text-muted-foreground">
                        {formatQuantity(item.quantityMilli)}
                        {item.unitLabel ? ` ${item.unitLabel}` : ''} × {formatCedi(item.unitPriceAmount)}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono tabular-nums">{formatCedi(item.lineTotalAmount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="border-t pt-5" data-testid="quote-totals">
          <dl className="ml-auto max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="font-mono tabular-nums">{formatCedi(quote.subtotalAmount)}</dd>
            </div>
            {quote.discountAmount > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Discount</dt>
                <dd className="font-mono tabular-nums">−{formatCedi(quote.discountAmount)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd className="font-mono tabular-nums" data-testid="quote-total">
                {formatCedi(quote.totalAmount)}
              </dd>
            </div>
          </dl>
        </section>

        {(quote.notes || quote.terms) && (
          <section className="border-t py-5 text-sm">
            {quote.notes && (
              <div className="mb-4">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</h2>
                <p className="mt-1.5 whitespace-pre-wrap">{quote.notes}</p>
              </div>
            )}
            {quote.terms && (
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Terms</h2>
                <p className="mt-1.5 whitespace-pre-wrap">{quote.terms}</p>
              </div>
            )}
          </section>
        )}

        {quote.estimatedDurationDays && (
          <p className="border-t py-4 text-sm text-muted-foreground">
            Estimated duration: {quote.estimatedDurationDays} {quote.estimatedDurationDays === 1 ? 'day' : 'days'}
          </p>
        )}

        {error && (
          <p role="alert" className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive" data-testid="quote-decision-error">
            {error}
          </p>
        )}

        {isCustomer && quote.access.canDecide && !quote.expired && (
          <footer className="flex flex-col gap-2 border-t pt-5 print:hidden sm:flex-row sm:justify-end" data-testid="quote-decision-actions">
            <Button variant="outline" onClick={() => setDialog('decline')} data-testid="decline-quote">
              Decline quote
            </Button>
            <Button onClick={() => setDialog('accept')} data-testid="accept-quote">
              Accept quote
            </Button>
          </footer>
        )}
        {isCustomer && quote.expired && quote.status === 'EXPIRED' && (
          <p className="rounded-lg border px-3 py-2.5 text-sm text-muted-foreground print:hidden" data-testid="quote-expired-notice">
            This quotation has expired.
          </p>
        )}
        {!isCustomer && quote.access.canManage && quote.status === 'SUBMITTED' && (
          <p className="rounded-lg border px-3 py-2.5 text-sm text-muted-foreground print:hidden">
            Sent — waiting for the customer&apos;s decision. You will be notified.
          </p>
        )}
      </article>

      {/* Accessible confirmations (PART 29/30/58). */}
      <Dialog open={dialog === 'accept'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you sure you want to accept this quotation?</DialogTitle>
            <DialogDescription className="text-left">
              Total {formatCedi(quote.totalAmount)} from {quote.provider.displayName} for{' '}
              {quote.jobRequest.title ?? 'your job'}
              {quote.validUntil
                ? ` — valid until ${new Date(quote.validUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
                : ''}
              . No payment happens on Dwellers at this stage — you settle directly with the provider.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={pending !== null}>
              Cancel
            </Button>
            <Button onClick={() => void decide('accept')} disabled={pending !== null} data-testid="confirm-accept">
              {pending === 'accept' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
              Confirm acceptance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'decline'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline this quotation?</DialogTitle>
            <DialogDescription className="text-left">
              The provider will be notified and this quotation is closed. You can still accept a
              different quotation for this job.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="decline-reason">Reason (optional)</Label>
            <Textarea
              id="decline-reason"
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Price is above my budget."
              data-testid="decline-reason"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={pending !== null}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void decide('decline')} disabled={pending !== null} data-testid="confirm-decline">
              {pending === 'decline' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
              Confirm decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Party({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  )
}

/** quantityMilli → human quantity ("1", "2.5"). */
function formatQuantity(quantityMilli: number): string {
  const value = quantityMilli / 1000
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '')
}
