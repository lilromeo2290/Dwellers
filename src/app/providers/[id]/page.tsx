/**
 * Dwellers — Public provider profile (PART 8).
 *
 * Mobile-first professional profile: verified status, real ratings, real
 * service areas, availability — and the Phase 5-ready REQUEST SERVICE /
 * MESSAGE PROVIDER transitions. Private data never reaches this page: no
 * emails, no phone numbers, no raw coordinates (PART 33).
 */
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  Clock3,
  FolderOpen,
  MapPin,
  Star,
  Timer,
  User,
  Wrench,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ProfileActions } from '@/components/discovery/profile-actions'
import { BRAND } from '@/config/brand'
import { getPublicProviderProfile, recordDiscoveryEvent } from '@/modules/discovery/provider-discovery'
import { formatCedi } from '@/lib/finance'
import { NotFoundError } from '@/lib/errors'

interface ProviderPageProps {
  params: Promise<{ id: string }>
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: ProviderPageProps): Promise<Metadata> {
  const { id } = await params
  try {
    const profile = await getPublicProviderProfile(id)
    const rating = profile.rating && profile.rating.count > 0 ? ` Rated ${profile.rating.average}/5 by ${profile.rating.count} customers.` : ''
    return {
      title: `${profile.displayName} — ${profile.profession}`,
      description: `${profile.displayName} is a ${profile.profession}${profile.primaryLocation ? ` based in ${profile.primaryLocation.name}` : ''}, serving ${profile.serviceAreas.map((area) => area.name).join(', ')}.${rating}`,
      alternates: { canonical: `/providers/${id}` },
      openGraph: { title: `${profile.displayName} · ${BRAND.name}`, type: 'profile' },
    }
  } catch {
    return { title: 'Provider not found' }
  }
}

const AVAILABILITY_LABEL: Record<string, string> = {
  AVAILABLE: 'Available for new work',
  BUSY: 'Currently busy',
  UNAVAILABLE: 'Not taking new work right now',
  UNKNOWN: 'Availability unknown',
}

const PRICING_LABEL: Record<string, string> = {
  FIXED: 'Fixed price',
  STARTING_FROM: 'Starting from',
  PER_HOUR: 'Per hour',
  PER_DAY: 'Per day',
  PER_UNIT: 'Per unit',
  QUOTE_REQUIRED: 'Quote required',
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export default async function ProviderProfilePage({ params }: ProviderPageProps) {
  const { id } = await params

  let profile
  try {
    profile = await getPublicProviderProfile(id)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }

  // Analytics (PART 32) — anonymous, best-effort, after the page resolves.
  await recordDiscoveryEvent({ type: 'provider_profile_view', providerId: profile.id })

  const showRating = profile.rating !== null && profile.rating.count > 0
  const areaNames = profile.serviceAreas.map((area) => area.name)

  // JSON-LD: honest structured data only (PART 48) — aggregateRating is
  // included ONLY when real published reviews exist.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    name: profile.displayName,
    description: profile.headline ?? profile.biography ?? `${profile.profession} on ${BRAND.name}`,
    ...(profile.primaryLocation
      ? { address: { '@type': 'PostalAddress', addressLocality: profile.primaryLocation.name, addressRegion: profile.primaryLocation.regionName ?? 'Ghana', addressCountry: 'GH' } }
      : {}),
    areaServed: areaNames.map((name) => ({ '@type': 'Place', name })),
    ...(showRating
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: profile.rating!.average,
            reviewCount: profile.rating!.count,
          },
        }
      : {}),
  }

  return (
    <main className="flex-1">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Header */}
      <div className="dw-hero-surface border-b border-border/70">
        <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-xl font-bold text-primary sm:h-20 sm:w-20 sm:text-2xl">
              {initialsOf(profile.displayName)}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl" data-testid="provider-name">
                  {profile.displayName}
                </h1>
                {profile.verificationStatus === 'VERIFIED' && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary" data-testid="verified-badge">
                    <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                    Verified
                  </span>
                )}
                {profile.verificationStatus === 'PENDING' && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-600/30 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-400/10 dark:text-amber-300">
                    Verification pending
                  </span>
                )}
                {profile.verificationStatus === 'UNVERIFIED' && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                    Unverified
                  </span>
                )}
              </div>

              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                  <Wrench className="h-4 w-4" aria-hidden="true" />
                  {profile.profession}
                </span>
                <Badge variant="outline" className="border-border/70 text-[11px]">
                  {profile.providerType === 'BUSINESS' ? (
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
                {profile.headline ? <span className="truncate">{profile.headline}</span> : null}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                {showRating ? (
                  <span className="inline-flex items-center gap-1.5" data-testid="provider-rating">
                    <Star className="h-4 w-4 fill-accent text-accent" aria-hidden="true" />
                    <span className="font-semibold text-foreground">{profile.rating!.average.toFixed(1)}</span>
                    <span className="text-muted-foreground">
                      {profile.rating!.count} review{profile.rating!.count === 1 ? '' : 's'}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">No published reviews yet</span>
                )}
                {profile.yearsExperience > 0 && (
                  <span className="text-muted-foreground">{profile.yearsExperience} years of experience</span>
                )}
                <span
                  className="inline-flex items-center gap-1.5 font-medium text-foreground"
                  data-testid="availability"
                >
                  <Clock3
                    className={
                      profile.availabilityStatus === 'AVAILABLE'
                        ? 'h-4 w-4 text-emerald-600 dark:text-emerald-400'
                        : 'h-4 w-4 text-muted-foreground'
                    }
                    aria-hidden="true"
                  />
                  {AVAILABILITY_LABEL[profile.availabilityStatus] ?? profile.availabilityStatus}
                </span>
                {profile.primaryLocation && (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <MapPin className="h-4 w-4" aria-hidden="true" />
                    Based in {profile.primaryLocation.name}
                  </span>
                )}
              </div>

              {areaNames.length > 0 && (
                <p className="mt-2 text-sm text-muted-foreground" data-testid="provider-areas">
                  <span className="font-medium text-foreground">Serving:</span> {areaNames.join(', ')}
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 max-w-xl">
            <ProfileActions providerId={profile.id} providerName={profile.displayName} />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
          <div className="min-w-0 space-y-8">
            {profile.biography && (
              <section aria-labelledby="about-heading">
                <h2 id="about-heading" className="text-lg font-bold tracking-tight text-foreground">About</h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{profile.biography}</p>
              </section>
            )}

            <section aria-labelledby="services-heading">
              <h2 id="services-heading" className="text-lg font-bold tracking-tight text-foreground">Services</h2>
              {profile.services.length > 0 ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {profile.services.map((service) => (
                    <Card key={service.id}>
                      <CardContent className="p-4">
                        <p className="font-semibold text-foreground">{service.name}</p>
                        {service.description ? (
                          <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{service.description}</p>
                        ) : null}
                        <p className="mt-2 text-sm font-medium text-foreground">
                          {service.startingPriceAmount !== null
                            ? `${PRICING_LABEL[service.pricingModel] ?? service.pricingModel}: ${formatCedi(service.startingPriceAmount)}`
                            : PRICING_LABEL[service.pricingModel] ?? service.pricingModel}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No published service listings yet.</p>
              )}
            </section>

            <section aria-labelledby="portfolio-heading">
              <h2 id="portfolio-heading" className="text-lg font-bold tracking-tight text-foreground">Portfolio</h2>
              {profile.portfolio.length > 0 ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {profile.portfolio.map((item) => (
                    <Card key={item.id}>
                      <CardContent className="flex items-start gap-3 p-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <FolderOpen className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">{item.title}</p>
                          {item.completedAt ? (
                            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <CalendarDays className="h-3 w-3" aria-hidden="true" />
                              {new Date(item.completedAt).toLocaleDateString('en-GB', { year: 'numeric', month: 'short' })}
                            </p>
                          ) : null}
                          {item.description ? (
                            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No portfolio projects published yet.</p>
              )}
            </section>

            <section aria-labelledby="reviews-heading" data-testid="reviews-section">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="reviews-heading" className="text-lg font-bold tracking-tight text-foreground">Reviews</h2>
                {profile.reviewBreakdown.count > 0 && (
                  <span className="text-sm text-muted-foreground">
                    {profile.reviewBreakdown.average.toFixed(1)} average · {profile.reviewBreakdown.count} review
                    {profile.reviewBreakdown.count === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              {profile.reviews.length > 0 ? (
                <div className="mt-3 space-y-3">
                  {profile.reviews.map((review) => (
                    <Card key={review.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-1" aria-label={`Rated ${review.rating} out of 5`}>
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={
                                  star <= review.rating
                                    ? 'h-4 w-4 fill-accent text-accent'
                                    : 'h-4 w-4 text-border'
                                }
                                aria-hidden="true"
                              />
                            ))}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(review.createdAt).toLocaleDateString('en-GB', { year: 'numeric', month: 'short' })}
                          </span>
                        </div>
                        {review.comment ? <p className="mt-2 text-sm leading-relaxed text-foreground">{review.comment}</p> : null}
                        <p className="mt-2 text-xs text-muted-foreground">
                          {review.reviewerName}
                          {review.isVerifiedEngagement ? ' · verified engagement' : ''}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No published reviews yet — reviews come from real customers after completed engagements.</p>
              )}
            </section>
          </div>

          {/* Sidebar facts */}
          <aside className="space-y-4">
            <Card>
              <CardContent className="space-y-4 p-5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Verification</span>
                  <Badge
                    variant="outline"
                    className={
                      profile.verificationStatus === 'VERIFIED'
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground'
                    }
                  >
                    {profile.verificationStatus}
                  </Badge>
                </div>
                {profile.startingPriceAmount !== null && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Starting price</span>
                    <span className="font-semibold text-foreground">{formatCedi(profile.startingPriceAmount)}</span>
                  </div>
                )}
                {profile.yearsExperience > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Experience</span>
                    <span className="font-semibold text-foreground">{profile.yearsExperience} years</span>
                  </div>
                )}
                {profile.completedJobsCount > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Completed jobs</span>
                    <span className="font-semibold text-foreground">{profile.completedJobsCount}</span>
                  </div>
                )}
                {profile.responseRatePercent !== null && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Timer className="h-3.5 w-3.5" aria-hidden="true" />
                      Response rate
                    </span>
                    <span className="font-semibold text-foreground">{profile.responseRatePercent}%</span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">On Dwellers since</span>
                  <span className="font-semibold text-foreground">
                    {new Date(profile.memberSince).toLocaleDateString('en-GB', { year: 'numeric', month: 'short' })}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <h2 className="text-sm font-semibold text-foreground">Service areas</h2>
                <ul className="mt-3 space-y-2 text-sm">
                  {(profile.primaryLocation
                    ? [
                        { id: 'base', name: profile.primaryLocation.name, regionName: profile.primaryLocation.regionName },
                        ...profile.serviceAreas,
                      ]
                    : profile.serviceAreas
                  )
                    .filter((area, index, all) => all.findIndex((a) => a.name === area.name) === index)
                    .map((area) => (
                      <li key={area.id} className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>
                          {area.name}
                          {area.regionName ? <span className="text-xs"> · {area.regionName}</span> : null}
                        </span>
                      </li>
                    ))}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">
                  Providers list the towns they can genuinely work in — results in{' '}
                  <Link href="/find" className="font-medium text-primary underline-offset-2 hover:underline">
                    Find
                  </Link>{' '}
                  respect these areas.
                </p>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </main>
  )
}
