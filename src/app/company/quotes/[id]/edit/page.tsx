/**
 * Dwellers — CONSTRUCTION_COMPANY edit quotation draft (Phase 6, PART 23/28).
 * Only DRAFT quotations can be edited; the machine rejects anything else.
 */
import { notFound } from 'next/navigation'
import { getAuthContext } from '@/lib/auth/session'
import { getQuote } from '@/modules/quotes/quote-service'
import { NotFoundError } from '@/lib/errors'
import { QuoteForm } from '@/components/quotes/quote-form'
import type { QuoteItemKind } from '@/modules/quotes/quote-state'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Edit quotation' }

export default async function CONSTRUCTION_COMPANYQuoteEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await getAuthContext()

  let detail
  try {
    detail = await getQuote(auth, id)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }
  if (detail.access.side !== 'PROVIDER' || !detail.access.canEditDraft) notFound()

  return (
    <div className="mx-auto max-w-3xl">
      <QuoteForm
        mode="edit"
        quoteId={detail.id}
        rolePrefix="/company"
        backHref={`/company/quotes/${detail.id}`}
        request={{
          jobRequestId: detail.jobRequest.id,
          reference: detail.jobRequest.reference,
          title: detail.jobRequest.title,
          customerDisplayName: detail.customer.displayName,
          serviceLine: detail.jobRequest.serviceLine ?? '—',
          locationLine: detail.jobRequest.locationLine,
        }}
        initial={{
          items: detail.items.map((item) => ({
            key: item.id,
            kind: item.kind as QuoteItemKind,
            name: item.name,
            quantity: String(item.quantityMilli / 1000),
            unit: item.unitLabel ?? '',
            unitPrice: String(item.unitPriceAmount / 100),
          })),
          discount: detail.discountAmount > 0 ? String(detail.discountAmount / 100) : '',
          validUntil: detail.validUntil ? detail.validUntil.toISOString().slice(0, 10) : '',
          notes: detail.notes ?? '',
          terms: detail.terms ?? '',
          estimatedDurationDays: detail.estimatedDurationDays ? String(detail.estimatedDurationDays) : '',
        }}
      />
    </div>
  )
}
