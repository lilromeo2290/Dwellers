/**
 * Dwellers — Provider result card (PART 7).
 *
 * Renders ONLY information the platform actually stores — no fabricated
 * ratings, reviews, experience or availability. Honest labeling follows the
 * verification and availability enums verbatim (PART 9/13).
 */
import Link from 'next/link'
import { BadgeCheck, BriefcaseBusiness, Clock3, MapPin, Star, User } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatCedi } from '@/lib/finance'
import type { DiscoveryResult } from '@/modules/discovery/provider-discovery'
import { cn } from '@/lib/utils'

const AVAILABILITY_LABEL: Record<string, string> = {
  AVAILABLE: 'Available',
  BUSY: 'Busy',
  UNAVAILABLE: 'Unavailable',
  UNKNOWN: 'Availability unknown',
}

const AVAILABILITY_STYLE: Record<string, string> = {
  AVAILABLE: 'border-emerald-700/25 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300',
  BUSY: 'border-amber-600/30 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300',
  UNAVAILABLE: 'border-border bg-muted text-muted-foreground',
  UNKNOWN: 'border-border bg-muted text-muted-foreground',
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function ProviderCard({ result }: { result: DiscoveryResult }) {
  const showRating = result.rating !== null && result.rating.count > 0

  return (
    <article className="group rounded-xl border border-border/80 bg-card p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5" data-testid="provider-card">
      <div className="flex items-start gap-3 sm:gap-4">
        {/* Avatar (initials — no fabricated photos) */}
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary sm:h-14 sm:w-14">
          {initialsOf(result.displayName)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={`/providers/${result.providerId}`}
              className="truncate text-base font-semibold text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring sm:text-lg"
            >
              {result.displayName}
            </Link>
            {result.verificationStatus === 'VERIFIED' && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary" title="Verified provider">
                <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                Verified
              </span>
            )}
            <Badge variant="outline" className="border-border/70 text-[11px] text-muted-foreground">
              {result.providerType === 'BUSINESS' ? (
                <>
                  <BriefcaseBusiness className="mr-1 h-3 w-3" aria-hidden="true" />
                  Business
                </>
              ) : (
                <>
                  <User className="mr-1 h-3 w-3" aria-hidden="true" />
                  Individual
                </>
              )}
            </Badge>
          </div>

          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {result.profession}
            {result.headline ? ` — ${result.headline}` : ''}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
            {showRating ? (
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                <Star className="h-4 w-4 fill-accent text-accent" aria-hidden="true" />
                {result.rating!.average.toFixed(1)}
                <span className="text-muted-foreground">({result.rating!.count} review{result.rating!.count === 1 ? '' : 's'})</span>
              </span>
            ) : (
              <span className="text-muted-foreground">No reviews yet</span>
            )}

            {result.yearsExperience > 0 && (
              <span className="text-muted-foreground">{result.yearsExperience} yr experience</span>
            )}

            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
                AVAILABILITY_STYLE[result.availabilityStatus] ?? AVAILABILITY_STYLE.UNKNOWN,
              )}
            >
              <Clock3 className="h-3 w-3" aria-hidden="true" />
              {AVAILABILITY_LABEL[result.availabilityStatus] ?? result.availabilityStatus}
            </span>

            {result.startingPriceAmount !== null && (
              <span className="font-medium text-foreground">
                From {formatCedi(result.startingPriceAmount)}
              </span>
            )}
          </div>

          <p className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            {result.primaryLocation ? (
              <>Based in {result.primaryLocation.name} · </>
            ) : null}
            Serving {result.serviceAreas.map((area) => area.name).join(', ')}
            {result.serviceAreaCount > result.serviceAreas.length
              ? ` +${result.serviceAreaCount - result.serviceAreas.length} more`
              : ''}
            {result.distanceKm !== null ? ` · ≈ ${result.distanceKm} km away` : ''}
          </p>

          {result.matchedServiceNames.length > 0 && (
            <p className="mt-1.5 truncate text-xs text-muted-foreground">
              {result.matchedServiceNames.join(' · ')}
            </p>
          )}

          {(result.reasons.length > 0 || result.portfolioCount > 0) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {result.reasons.slice(0, 3).map((reason) => (
                <Badge
                  key={reason}
                  variant="outline"
                  className="border-primary/25 bg-primary/5 text-[11px] font-medium text-primary"
                >
                  {reason}
                </Badge>
              ))}
              {result.portfolioCount > 0 && (
                <Badge variant="outline" className="border-border/70 text-[11px] text-muted-foreground">
                  {result.portfolioCount} portfolio project{result.portfolioCount === 1 ? '' : 's'}
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
        <span className="text-xs text-muted-foreground">
          {result.completedJobsCount > 0 ? `${result.completedJobsCount} completed job${result.completedJobsCount === 1 ? '' : 's'} on Dwellers` : 'New on Dwellers'}
        </span>
        <Link
          href={`/providers/${result.providerId}`}
          className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring"
        >
          View profile
        </Link>
      </div>
    </article>
  )
}
