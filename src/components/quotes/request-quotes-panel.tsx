/**
 * Dwellers — Quotations on one request (Phase 6, PART 49/50).
 *
 * The comparison foundation: a simple, honest list/table of every quotation
 * on this job request — provider, reference, total, validity, status — so a
 * customer with several quotations can tell them apart and never accept the
 * wrong one. No AI, no price-only ranking.
 */
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { QuoteStatusBadge, quoteStatusLabel } from '@/components/quotes/quote-badge'
import { formatCedi } from '@/lib/finance'

export interface RequestQuoteRow {
  id: string
  quoteNumber: string
  status: string
  totalAmount: number
  validUntil: Date | null
  itemCount: number
  provider: { id: string; displayName: string }
}

export function RequestQuotesPanel({
  quotes,
  showWhenEmpty = false,
}: {
  quotes: RequestQuoteRow[]
  showWhenEmpty?: boolean
}) {
  if (quotes.length === 0 && !showWhenEmpty) return null

  return (
    <Card data-testid="request-quotes-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Quotations {quotes.length > 0 && <span className="text-muted-foreground">({quotes.length})</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {quotes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            The provider is interested. When they send an itemised quotation it will appear here
            and you will be notified.
          </p>
        ) : (
          <ul className="space-y-3">
            {quotes.map((quote) => (
              <li key={quote.id} className="rounded-xl border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{quote.provider.displayName}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {quote.quoteNumber} · {quote.itemCount} {quote.itemCount === 1 ? 'item' : 'items'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {quote.validUntil
                        ? `Valid until ${new Date(quote.validUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
                        : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm font-semibold tabular-nums" data-testid={`quote-total-${quote.quoteNumber}`}>
                      {formatCedi(quote.totalAmount)}
                    </p>
                    <div className="mt-1">
                      <QuoteStatusBadge status={quote.status} />
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <Link
                    href={`/customer/quotes/${quote.id}`}
                    className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                    data-testid={`view-quote-${quote.quoteNumber}`}
                  >
                    {quote.status === 'SUBMITTED' || quote.status === 'VIEWED'
                      ? `View quote (${quoteStatusLabel(quote.status).toLowerCase()})`
                      : 'View quote'}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
