/**
 * Dwellers — CONTRACTOR QUOTATIONS board (Phase 6, PART 37/38).
 * The provider's quotations across all statuses with server-side filters.
 */
import { getAuthContext } from '@/lib/auth/session'
import { listQuotes, quoteListQuerySchema } from '@/modules/quotes/quote-service'
import { QuotesBoard } from '@/components/quotes/quotes-board'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Quotations' }

export default async function CONTRACTORQuotesPage({
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
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Quotations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your priced responses to job requests — drafts, sent quotations and the customer&apos;s decisions.
        </p>
      </header>
      <div className="mt-6">
        <QuotesBoard
          rows={items}
          counts={counts}
          activeFilter={query.status}
          baseUrl="/contractor/quotes"
          counterpartLabel="Customer"
          emptyCopy={
            query.status === 'ALL'
              ? 'No quotations yet. Open a job request and press Create quote to price your work.'
              : 'No quotations with this status.'
          }
          testIdPrefix="contractor-quotes"
        />
      </div>
    </div>
  )
}
