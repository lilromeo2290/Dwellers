/**
 * Dwellers — Server-side mapping from the quote service detail shape to the
 * QuoteDocument component props (Phase 6). One mapper, reused by every
 * detail page so all sides see the same document.
 */
import type { QuoteDocumentData } from '@/components/quotes/quote-document'

interface ServiceQuoteDetail {
  id: string
  quoteNumber: string
  status: string
  validUntil: Date | null
  notes: string | null
  terms: string | null
  estimatedDurationDays: number | null
  subtotalAmount: number
  discountAmount: number
  totalAmount: number
  currency: string
  createdAt: Date
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
}

export function toQuoteDocument(
  detail: ServiceQuoteDetail,
  rolePrefix: string,
  backHref: string,
): QuoteDocumentData {
  const expired =
    detail.validUntil != null &&
    new Date(detail.validUntil).getTime() < Date.now() &&
    (detail.status === 'SUBMITTED' || detail.status === 'VIEWED' || detail.status === 'EXPIRED')
  return {
    id: detail.id,
    quoteNumber: detail.quoteNumber,
    status: detail.status,
    validUntil: detail.validUntil ? detail.validUntil.toISOString() : null,
    expired,
    notes: detail.notes,
    terms: detail.terms,
    estimatedDurationDays: detail.estimatedDurationDays,
    subtotalAmount: detail.subtotalAmount,
    discountAmount: detail.discountAmount,
    totalAmount: detail.totalAmount,
    currency: detail.currency,
    createdAt: detail.createdAt.toISOString(),
    items: detail.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      name: item.name,
      description: item.description,
      quantityMilli: item.quantityMilli,
      unitLabel: item.unitLabel,
      unitPriceAmount: item.unitPriceAmount,
      lineTotalAmount: item.lineTotalAmount,
    })),
    jobRequest: detail.jobRequest,
    provider: detail.provider,
    customer: detail.customer,
    access: detail.access,
    rolePrefix,
    backHref,
  }
}
