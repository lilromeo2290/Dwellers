/**
 * Dwellers — Server-rendered pagination (PART 41).
 *
 * Plain links (crawlable, works without JS) preserving every active filter
 * in the shareable URL. The count comes from the pagination meta — never
 * fabricated.
 */
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { PaginationMeta } from '@/types/api'
import { cn } from '@/lib/utils'

export function DiscoveryPagination({
  meta,
  searchParams,
  basePath = '/find',
}: {
  meta: PaginationMeta
  searchParams: Record<string, string>
  basePath?: string
}) {
  if (meta.totalPages <= 1) return null

  const hrefFor = (page: number) => {
    const params = new URLSearchParams(searchParams)
    if (page === 1) params.delete('page')
    else params.set('page', String(page))
    const query = params.toString()
    return query ? `${basePath}?${query}` : basePath
  }

  const windowStart = Math.max(1, Math.min(meta.page - 2, meta.totalPages - 4))
  const windowEnd = Math.min(meta.totalPages, windowStart + 4)
  const pages: number[] = []
  for (let page = windowStart; page <= windowEnd; page += 1) pages.push(page)

  const linkClass =
    'inline-flex h-9 items-center rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring'

  return (
    <nav aria-label="Search result pages" className="mt-8 flex items-center justify-center gap-1.5">
      {meta.hasPreviousPage ? (
        <Link href={hrefFor(meta.page - 1)} rel="prev" className={linkClass} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : (
        <span className="inline-flex h-9 items-center rounded-lg border border-border/50 bg-muted/40 px-3 text-muted-foreground/60" aria-disabled="true">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </span>
      )}

      {windowStart > 1 && <span className="px-1 text-muted-foreground">…</span>}
      {pages.map((page) => (
        <Link
          key={page}
          href={hrefFor(page)}
          aria-current={page === meta.page ? 'page' : undefined}
          className={cn(
            linkClass,
            page === meta.page && 'border-primary bg-primary text-primary-foreground hover:bg-primary/90',
            page === meta.page && 'pointer-events-none',
          )}
        >
          {page}
        </Link>
      ))}
      {windowEnd < meta.totalPages && <span className="px-1 text-muted-foreground">…</span>}

      {meta.hasNextPage ? (
        <Link href={hrefFor(meta.page + 1)} rel="next" className={linkClass} aria-label="Next page">
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : (
        <span className="inline-flex h-9 items-center rounded-lg border border-border/50 bg-muted/40 px-3 text-muted-foreground/60" aria-disabled="true">
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </span>
      )}
    </nav>
  )
}
