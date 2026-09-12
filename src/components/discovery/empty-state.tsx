/**
 * Dwellers — Empty results state (PART 17).
 *
 * Never a bare "No results": the honest reason, nearby towns to try (real
 * database suggestions), and the Phase 5-ready job-request entry. Nothing
 * claims an artisan is available when none was found.
 */
import Link from 'next/link'
import { ArrowRight, MapPin, SearchX } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function EmptyResults({
  whatLabel,
  whereLabel,
  categorySlug,
  nearbyAreas,
}: {
  whatLabel: string
  whereLabel: string | null
  categorySlug: string | null
  nearbyAreas: { id: string; name: string; slug: string; distanceKm: number | null }[]
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/60 p-8 text-center sm:p-12" data-testid="empty-results">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <SearchX className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-foreground">
        No {whatLabel.toLowerCase()} found in {whereLabel ?? 'this area'} yet
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Providers join Dwellers every week. You can widen the area, check
        nearby towns below, or tell us what you need — providers who serve
        your area will be able to respond to your request.
      </p>

      {nearbyAreas.length > 0 && (
        <div className="mt-6">
          <p className="text-sm font-medium text-foreground">Try nearby areas</p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            {nearbyAreas.map((area) => (
              <Link
                key={area.id}
                href={
                  categorySlug
                    ? `/find/${categorySlug}/${area.slug}`
                    : `/find?townId=${area.id}`
                }
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"
              >
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                {area.name}
                {area.distanceKm !== null ? (
                  <span className="text-xs text-muted-foreground">≈ {Math.round(area.distanceKm)} km</span>
                ) : null}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 flex flex-col items-center justify-center gap-2 sm:flex-row">
        <Button asChild className="h-11 px-6" data-testid="empty-post-job">
          <Link href="/auth/register">
            Post a Job Request
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
        <p className="text-xs text-muted-foreground">Free for customers — sign in or create an account first.</p>
      </div>
    </div>
  )
}
