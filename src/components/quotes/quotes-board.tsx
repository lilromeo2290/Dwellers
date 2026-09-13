/**
 * Dwellers — Quote list board (Phase 6, PART 36/37/38/50).
 *
 * Server-safe: renders the caller's quotations with server-side status
 * filters (the filter is a real URL param — shareable, no client state) and
 * a simple comparison-ready table: reference / counterpart / job / total /
 * validity / status (PART 49/50 — no AI ranking, price is never the only
 * signal shown).
 */
import Link from 'next/link'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { QuoteStatusBadge, QUOTE_FILTERS, quoteStatusLabel } from '@/components/quotes/quote-badge'
import { formatCedi } from '@/lib/finance'

export interface QuoteListRow {
  id: string
  quoteNumber: string
  status: string
  totalAmount: number
  validUntil: Date | string | null
  createdAt: Date | string
  itemCount: number
  jobRequest: { id: string; reference: string; title: string | null }
  provider: { id: string; displayName: string }
  customer: { displayName: string }
}

export function QuotesBoard({
  rows,
  counts,
  activeFilter,
  baseUrl,
  counterpartLabel,
  emptyCopy,
  testIdPrefix,
}: {
  rows: QuoteListRow[]
  counts: Record<string, number>
  activeFilter: string
  baseUrl: string
  counterpartLabel: 'Provider' | 'Customer'
  emptyCopy: string
  testIdPrefix: string
}) {
  return (
    <div data-testid={`${testIdPrefix}-board`}>
      <nav aria-label="Filter quotations by status" className="flex flex-wrap gap-1.5" data-testid={`${testIdPrefix}-filters`}>
        {QUOTE_FILTERS.map((filter) => {
          const count = filter === 'ALL' ? Object.values(counts).reduce((sum, value) => sum + value, 0) : (counts[filter] ?? 0)
          const isActive = activeFilter === filter
          return (
            <Link
              key={filter}
              href={filter === 'ALL' ? baseUrl : `${baseUrl}?status=${filter}`}
              aria-current={isActive ? 'page' : undefined}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                isActive
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:text-foreground'
              }`}
            >
              {filter === 'ALL' ? 'All' : quoteStatusLabel(filter)}
              {count > 0 && <span className="ml-1.5 text-xs opacity-80">{count}</span>}
            </Link>
          )
        })}
      </nav>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-xl border px-4 py-8 text-center text-sm text-muted-foreground" data-testid={`${testIdPrefix}-empty`}>
          {emptyCopy}
        </p>
      ) : (
        <>
          {/* Desktop table */}
          <Table className="mt-5 hidden md:table" aria-label="Quotations">
            <TableHeader>
              <TableRow>
                <TableHead>Quote</TableHead>
                <TableHead>{counterpartLabel}</TableHead>
                <TableHead>Job</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Valid until</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Open</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.quoteNumber}</TableCell>
                  <TableCell className="font-medium">
                    {counterpartLabel === 'Provider' ? row.provider.displayName : row.customer.displayName}
                  </TableCell>
                  <TableCell className="max-w-[16rem] truncate">{row.jobRequest.title ?? '—'}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatCedi(row.totalAmount)}</TableCell>
                  <TableCell>
                    {row.validUntil
                      ? new Date(row.validUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <QuoteStatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`${baseUrl}/${row.id}`}
                      className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                      data-testid={`${testIdPrefix}-open-${row.quoteNumber}`}
                    >
                      View quote
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Mobile cards */}
          <ul className="mt-5 space-y-3 md:hidden">
            {rows.map((row) => (
              <li key={row.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">{row.quoteNumber}</p>
                    <p className="mt-0.5 font-medium">{row.jobRequest.title ?? 'Untitled job'}</p>
                    <p className="text-sm text-muted-foreground">
                      {counterpartLabel === 'Provider' ? row.provider.displayName : row.customer.displayName}
                    </p>
                  </div>
                  <QuoteStatusBadge status={row.status} />
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <p className="font-mono text-sm tabular-nums font-semibold">{formatCedi(row.totalAmount)}</p>
                  <Link
                    href={`${baseUrl}/${row.id}`}
                    className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                  >
                    View quote
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
