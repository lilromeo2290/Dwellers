/**
 * Dwellers — Customer quotation detail (Phase 6, PART 25/29/57).
 * The professional quotation document; the customer's first open records
 * the real VIEWED event (service layer). Foreign quotes 404.
 */
import { notFound } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { getAuthContext } from '@/lib/auth/session'
import { getQuote } from '@/modules/quotes/quote-service'
import { NotFoundError } from '@/lib/errors'
import { QuoteDocument } from '@/components/quotes/quote-document'
import { toQuoteDocument } from '@/modules/quotes/quote-view'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Quotation' }

export default async function CustomerQuoteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ sent?: string; saved?: string }>
}) {
  const { id } = await params
  const { sent } = await searchParams
  const auth = await getAuthContext()

  let detail
  try {
    detail = await getQuote(auth, id)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }
  if (detail.access.side !== 'CUSTOMER') notFound()

  return (
    <div className="mx-auto max-w-3xl">
      {sent === '1' && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 print:hidden" role="status">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-sm">
            The quotation is with {detail.provider.displayName}. You will be notified when they respond.
          </p>
        </div>
      )}
      <QuoteDocument quote={toQuoteDocument(detail, '', `/customer/requests/${detail.jobRequest.id}`)} />
    </div>
  )
}
