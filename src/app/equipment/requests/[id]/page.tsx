/**
 * Dwellers — EQUIPMENT_PROVIDER request detail (Phase 5, PART 30).
 * Authorization lives in the service layer; foreign requests 404.
 */
import { notFound } from 'next/navigation'
import { getAuthContext } from '@/lib/auth/session'
import { getJobRequest } from '@/modules/projects/job-request-service'
import { findOwnQuoteForRequest } from '@/modules/quotes/quote-service'
import { hasPermission } from '@/lib/auth/permissions'
import { NotFoundError } from '@/lib/errors'
import { ProviderRequestDetail, type ProviderRequestView } from '@/components/requests/provider-request-detail'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Request details' }

export default async function ProviderRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await getAuthContext()

  let request
  try {
    request = await getJobRequest(auth, id)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }
  if (request.access.side !== 'PROVIDER') notFound()

  const locationLine = [request.community?.name, request.location?.name].filter(Boolean).join(', ')
  // Phase 6 (PART 3): resolve CREATE QUOTE eligibility server-side.
  const existingQuote = await findOwnQuoteForRequest(auth, id)
  const canQuote =
    request.access.canRespond &&
    !existingQuote &&
    request.status === 'RESPONDED' &&
    request.responseKind === 'INTERESTED' &&
    hasPermission(auth?.role ?? 'CUSTOMER', 'commerce:quotes:submit')

  const view: ProviderRequestView = {
    id: request.id,
    reference: request.reference,
    title: request.title,
    description: request.description,
    status: request.status,
    responseKind: request.responseKind,
    urgency: request.urgency,
    preferredDate: request.preferredDate ? request.preferredDate.toISOString() : null,
    preferredTimeSlot: request.preferredTimeSlot,
    areaText: request.areaText,
    locationLine: locationLine || '—',
    serviceLine: request.service?.name ?? request.category?.name ?? '—',
    customerDisplayName: request.customer?.displayName ?? null,
    servesLocation: request.servesLocation,
    canRespond: request.access.canRespond,
    quote: existingQuote ? { id: existingQuote.id, status: existingQuote.status } : null,
    canCreateQuote: canQuote,
    createQuoteHref: canQuote ? `/equipment/requests/${id}/quote/new` : null,
    quoteHref: existingQuote ? `/equipment/quotes/${existingQuote.id}` : null,
    attachments: request.attachments.map((attachment) => ({
      id: attachment.id,
      originalName: attachment.originalName,
    })),
    events: request.events.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      message: event.message,
      createdAt: event.createdAt.toISOString(),
      actorRole: event.actorRole,
    })),
  }

  return <ProviderRequestDetail request={view} />
}
