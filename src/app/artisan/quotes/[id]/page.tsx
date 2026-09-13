/**
 * Dwellers — ARTISAN quotation detail (Phase 6, PART 26/37).
 * The document exactly as the customer sees it, plus the provider's own
 * actions (edit draft / withdraw). Foreign quotations 404.
 */
import { notFound } from 'next/navigation'
import { getAuthContext } from '@/lib/auth/session'
import { getQuote } from '@/modules/quotes/quote-service'
import { NotFoundError } from '@/lib/errors'
import { QuoteDocument } from '@/components/quotes/quote-document'
import { ProviderQuoteActions } from '@/components/quotes/provider-quote-actions'
import { toQuoteDocument } from '@/modules/quotes/quote-view'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Quotation' }

export default async function ARTISANQuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await getAuthContext()

  let detail
  try {
    detail = await getQuote(auth, id)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }
  if (detail.access.side !== 'PROVIDER') notFound()

  return (
    <div className="mx-auto max-w-3xl">
      <QuoteDocument quote={toQuoteDocument(detail, '/artisan', '/artisan/quotes')} />
      <Card className="mt-6 print:hidden" data-testid="provider-quote-side">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Your quotation</CardTitle>
        </CardHeader>
        <CardContent>
          <ProviderQuoteActions quoteId={detail.id} status={detail.status} rolePrefix="/artisan" />
        </CardContent>
      </Card>
    </div>
  )
}
