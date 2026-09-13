/**
 * Dwellers — Customer MY QUOTATIONS list (Phase 6, PART 36).
 * All quotations received for the customer's own requests, with real
 * server-side status filters.
 */
import Link from 'next/link'
import { getAuthContext } from '@/lib/auth/session'
import { listQuotes, quoteListQuerySchema } from '@/modules/quotes/quote-service'
import { QuotesBoard } from '@/components/quotes/quotes-board'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'My quotations' }

export default async function CustomerQuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>
}) {
  const params = await searchParams
  const auth = await getAuthContext()
  const query = quoteListQuerySchema.parse({ status: params.status ?? 'ALL', q: params.q ?? null, page: 1, pageSize: 100 })
  const { items, counts } = await listQuotes(auth, query)

  return (
    <div className="mx-auto max-w-4xl">
      <header>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">My quotations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every quotation a provider has prepared for your job requests. Review the details
          carefully before accepting — accepting tells the provider to proceed.
        </p>
      </header>
      <div className="mt-6">
        <QuotesBoard
          rows={items}
          counts={counts}
          activeFilter={query.status}
          baseUrl="/customer/quotes"
          counterpartLabel="Provider"
          emptyCopy={
            query.status === 'ALL'
              ? 'No quotations yet. When a provider prices one of your requests, it appears here.'
              : 'No quotations with this status.'
          }
          testIdPrefix="customer-quotes"
        />
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        Looking for your requests? <Link href="/customer/requests" className="font-medium text-primary underline-offset-2 hover:underline">Open My Job Requests</Link>.
      </p>
    </div>
  )
}
