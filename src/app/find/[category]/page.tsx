/**
 * Dwellers — Category landing (PART 25/27): /find/[category]
 *
 * e.g. /find/plumbing. Database-driven: description, common services,
 * nationwide providers, locations with providers, related categories.
 */
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight, MapPin } from 'lucide-react'
import { DiscoveryResultsView } from '@/components/discovery/results-view'
import { BRAND } from '@/config/brand'
import { discoverProviders } from '@/modules/discovery/provider-discovery'
import { getCategoryLanding } from '@/modules/discovery/landing'
import { parseFindParams, toDiscoveryQuery } from '@/modules/discovery/find-params'
import { NotFoundError } from '@/lib/errors'

interface CategoryPageProps {
  params: Promise<{ category: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { category: slug } = await params
  try {
    const landing = await getCategoryLanding(slug)
    return {
      title: `${landing.category.name} services in Ghana`,
      description:
        landing.category.description ??
        `Find ${landing.category.name.toLowerCase()} providers across all 16 regions of Ghana on ${BRAND.name} — compare experience, verification, service areas and ratings.`,
      alternates: { canonical: `/find/${slug}` },
      openGraph: { title: `${landing.category.name} services in Ghana · ${BRAND.name}`, type: 'website' },
    }
  } catch {
    return { title: 'Category not found' }
  }
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { category: slug } = await params
  const pageParams = parseFindParams(await searchParams)

  let landing
  try {
    landing = await getCategoryLanding(slug)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }

  const result = await discoverProviders({
    ...toDiscoveryQuery(pageParams),
    categorySlug: slug,
  })

  return (
    <>
      {/* Category context strip (PART 27) — above the shared results view */}
      <div className="border-b border-border/70 bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <Link href="/find" className="hover:text-foreground hover:underline">Find</Link>
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
            <span className="font-medium text-foreground">{landing.category.name}</span>
          </nav>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground" data-testid="category-intro">
            {landing.category.description ??
              `Hire trusted ${landing.category.name.toLowerCase()} professionals on ${BRAND.name}. Compare verification, ratings, experience and service areas — and request service in a few steps.`}
          </p>
          {landing.commonServiceNames.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Common {landing.category.name.toLowerCase()} jobs: </span>
              {landing.commonServiceNames.join(' · ')}
            </p>
          )}
          {landing.topLocations.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                Browse by location
              </span>
              {landing.topLocations.map((location) => (
                <Link
                  key={location.id}
                  href={`/find/${slug}/${location.slug}`}
                  className="inline-flex h-7 items-center rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {location.name}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <DiscoveryResultsView result={result} params={pageParams} location={{ regionId: null, districtId: null, townId: null }} basePath={`/find/${slug}`} />

      {landing.relatedCategories.length > 0 && (
        <div className="border-t border-border/70">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
            <h2 className="text-sm font-semibold text-foreground">Related categories</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {landing.relatedCategories.map((related) => (
                <Link
                  key={related.slug}
                  href={`/find/${related.slug}`}
                  className="inline-flex h-8 items-center rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {related.name}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
