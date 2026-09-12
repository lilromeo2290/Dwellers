/**
 * Dwellers — Shared discovery results view.
 *
 * The one renderer for discovery outcomes (PART 2): used by /find, the
 * category landings and the location landings. Receives an already-computed
 * DiscoveryResponse — it never queries the database itself.
 */
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { SearchPanel } from '@/components/discovery/search-panel'
import { ProviderCard } from '@/components/discovery/provider-card'
import { FiltersPanel, SortSelect } from '@/components/discovery/filters-panel'
import { DiscoveryPagination } from '@/components/discovery/pagination'
import { EmptyResults } from '@/components/discovery/empty-state'
import { Badge } from '@/components/ui/badge'
import type { DiscoveryResponse } from '@/modules/discovery/provider-discovery'
import { toUrlSearchParams, type FindPageParams } from '@/modules/discovery/find-params'
import type { LocationValue } from '@/components/auth/location-cascade'

export interface ResultsViewProps {
  result: DiscoveryResponse
  params: FindPageParams
  /** Complete region→district→town chain for the search panel cascade. */
  location: LocationValue
  /** Pagination links preserve criteria against this path. */
  basePath?: string
}

export function DiscoveryResultsView({ result, params, location, basePath = '/find' }: ResultsViewProps) {
  const total = result.pagination.total
  const whatLabel = result.criteria.categoryName ?? result.criteria.q ?? 'Providers'
  const whereLabel = result.location.label
  const hasResults = total > 0

  return (
    <main className="flex-1">
      <div className="dw-hero-surface border-b border-border/70">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
          {/* Location breadcrumb (PART 16) */}
          <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {result.location.breadcrumb.map((crumb, index) => (
              <span key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                {index > 0 && <ChevronRight className="h-3 w-3" aria-hidden="true" />}
                {crumb.href ? (
                  <Link href={crumb.href} className="hover:text-foreground hover:underline">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="font-medium text-foreground">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>

          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl" data-testid="find-heading">
            {whatLabel} {whereLabel ? `in ${whereLabel}` : 'across Ghana'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground" data-testid="result-count" aria-live="polite">
            {hasResults
              ? `${total} provider${total === 1 ? '' : 's'} found${whereLabel ? ` serving ${whereLabel}` : ''}`
              : 'No exact matches for this search yet'}
          </p>

          <div className="mt-5">
            <SearchPanel
              idPrefix="find-results"
              initial={{
                categorySlug: params.category ?? null,
                location,
                communityId: params.community ?? null,
              }}
            />
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
          <div className="lg:order-1">
            <FiltersPanel />
          </div>

          <div className="lg:order-2 min-w-0">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <SortSelect value={result.criteria.sort} />
              {hasResults && (
                <Badge variant="outline" className="border-border/70 text-muted-foreground">
                  Page {result.pagination.page} of {Math.max(result.pagination.totalPages, 1)}
                </Badge>
              )}
            </div>

            {hasResults ? (
              <div className="space-y-4" data-testid="results-list">
                {result.items.map((item) => (
                  <ProviderCard key={item.providerId} result={item} />
                ))}
              </div>
            ) : (
              <EmptyResults
                whatLabel={whatLabel}
                whereLabel={whereLabel}
                categorySlug={result.criteria.categorySlug}
                nearbyAreas={result.location.nearbyAreas}
              />
            )}

            {/* Nearby fallback — clearly labeled, never mixed into exact results (PART 18) */}
            {result.nearby && result.nearby.items.length > 0 && (
              <section className="mt-10" data-testid="nearby-section" aria-labelledby="nearby-heading">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 id="nearby-heading" className="text-lg font-bold tracking-tight text-foreground">
                    Nearby providers
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {result.nearby.total} provider{result.nearby.total === 1 ? '' : 's'} in nearby towns — not in{' '}
                    {whereLabel ?? 'your selected area'}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Nobody offers {whatLabel.toLowerCase()} in {whereLabel ?? 'the selected area'} yet — these serve towns
                  close by. Their exact service areas are shown on each card.
                </p>
                <div className="mt-4 space-y-4">
                  {result.nearby.items.map((item) => (
                    <ProviderCard key={item.providerId} result={item} />
                  ))}
                </div>
              </section>
            )}

            <DiscoveryPagination meta={result.pagination} searchParams={toUrlSearchParams(params)} basePath={basePath} />
          </div>
        </div>
      </div>
    </main>
  )
}
