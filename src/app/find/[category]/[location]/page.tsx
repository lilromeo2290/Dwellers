/**
 * Dwellers — Category × location landing (PART 25/26): /find/[category]/[location]
 *
 * e.g. /find/plumbing/nsawam, /find/plumbers/ho, /find/building-contractors/kumasi.
 * The location segment resolves town → district → region against the live
 * database. The results come from the SAME discovery service as /find —
 * this page adds SEO context, never duplicate search logic.
 */
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { DiscoveryResultsView } from '@/components/discovery/results-view'
import { BRAND } from '@/config/brand'
import { discoverProviders } from '@/modules/discovery/provider-discovery'
import { getCategoryLanding, resolveLandingLocation } from '@/modules/discovery/landing'
import { parseFindParams, toDiscoveryQuery, type FindPageParams } from '@/modules/discovery/find-params'
import { NotFoundError } from '@/lib/errors'

interface CategoryLocationPageProps {
  params: Promise<{ category: string; location: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: CategoryLocationPageProps): Promise<Metadata> {
  const { category: slug, location: locationSlug } = await params
  try {
    const [landing, resolved] = await Promise.all([
      getCategoryLanding(slug),
      resolveLandingLocation(locationSlug),
    ])
    if (!resolved) return { title: 'Location not found' }

    const what = landing.category.name
    const where = resolved.name
    return {
      title: `${what} in ${where}`,
      description: `Find ${what.toLowerCase()} providers serving ${where}${resolved.kind === 'town' ? ` and surrounding areas` : ``} on ${BRAND.name}. Compare verification, ratings, experience and service areas.`,
      alternates: { canonical: `/find/${slug}/${locationSlug}` },
      openGraph: { title: `${what} in ${where} · ${BRAND.name}`, type: 'website' },
    }
  } catch {
    return { title: 'Not found' }
  }
}

export default async function CategoryLocationPage({ params, searchParams }: CategoryLocationPageProps) {
  const { category: slug, location: locationSlug } = await params
  const pageParams: FindPageParams = parseFindParams(await searchParams)

  const [landing, resolved] = await Promise.all([
    getCategoryLanding(slug).catch((error) => {
      if (error instanceof NotFoundError) return null
      throw error
    }),
    resolveLandingLocation(locationSlug),
  ])
  if (!landing || !resolved) notFound()

  const criteria = toDiscoveryQuery(pageParams)
  const result = await discoverProviders({
    ...criteria,
    categorySlug: slug,
    ...(resolved.kind === 'town' ? { townId: resolved.townId } : {}),
    ...(resolved.kind === 'district' ? { districtId: resolved.districtId } : {}),
    ...(resolved.kind === 'region' ? { regionId: resolved.regionId } : {}),
  })

  const location = {
    regionId: 'regionId' in resolved ? resolved.regionId : null,
    districtId: resolved.kind === 'town' ? resolved.districtId : resolved.kind === 'district' ? resolved.districtId : null,
    townId: resolved.kind === 'town' ? resolved.townId : null,
  }

  return (
    <>
      {/* Location context strip (PART 26) */}
      <div className="border-b border-border/70 bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <Link href="/find" className="hover:text-foreground hover:underline">Find</Link>
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
            <Link href={`/find/${slug}`} className="hover:text-foreground hover:underline">
              {landing.category.name}
            </Link>
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
            <span className="font-medium text-foreground">{resolved.name}</span>
          </nav>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground" data-testid="location-intro">
            {resolved.kind === 'town'
              ? `Find ${landing.category.name.toLowerCase()} providers serving ${resolved.name}, ${resolved.districtName} (${resolved.regionName}) and surrounding areas.`
              : resolved.kind === 'district'
                ? `${landing.category.name} providers serving towns across ${resolved.name}, ${resolved.regionName}.`
                : `${landing.category.name} providers across ${resolved.name} — all towns and districts.`}
          </p>
          {landing.topLocations.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-foreground">Other areas:</span>
              {landing.topLocations
                .filter((area) => area.slug !== locationSlug)
                .slice(0, 6)
                .map((area) => (
                  <Link
                    key={area.id}
                    href={`/find/${slug}/${area.slug}`}
                    className="inline-flex h-7 items-center rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {area.name}
                  </Link>
                ))}
            </div>
          )}
        </div>
      </div>

      <DiscoveryResultsView result={result} params={pageParams} location={location} basePath={`/find/${slug}/${locationSlug}`} />
    </>
  )
}
