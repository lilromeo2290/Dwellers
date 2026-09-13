/**
 * Dwellers — CONTRACTOR create quotation (Phase 6, PART 3/4/26).
 * Reached from the CREATE QUOTE button on an eligible request. Customer,
 * service, job and location come from the request — never re-entered.
 */
import { notFound } from 'next/navigation'
import { getAuthContext } from '@/lib/auth/session'
import { getJobRequest } from '@/modules/projects/job-request-service'
import { NotFoundError } from '@/lib/errors'
import { QuoteForm } from '@/components/quotes/quote-form'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Create quotation' }

export default async function CONTRACTORQuoteNewPage({ params }: { params: Promise<{ id: string }> }) {
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
  if (request.status !== 'RESPONDED' || request.responseKind !== 'INTERESTED') notFound()

  const locationLine = [request.community?.name, request.location?.name].filter(Boolean).join(', ')

  return (
    <div className="mx-auto max-w-3xl">
      <QuoteForm
        mode="create"
        rolePrefix="/contractor"
        backHref={`/contractor/requests/${request.id}`}
        request={{
          jobRequestId: request.id,
          reference: request.reference,
          title: request.title,
          customerDisplayName: request.customer?.displayName ?? 'The customer',
          serviceLine: request.service?.name ?? request.category?.name ?? '—',
          locationLine: locationLine || '—',
        }}
        initial={{
          items: [],
          discount: '',
          validUntil: '',
          notes: '',
          terms: '',
          estimatedDurationDays: '',
        }}
      />
    </div>
  )
}
