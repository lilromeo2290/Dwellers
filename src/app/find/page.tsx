/**
 * Dwellers — /find: THE discovery results page (PART 16).
 *
 * One backend discovery service powers this page, the SEO landings and the
 * REST API — no search logic lives in the UI. Everything on screen is real:
 * the count, the filters, the pagination meta, the nearby fallback.
 */
import type { Metadata } from 'next'
import { DiscoveryResultsView } from '@/components/discovery/results-view'
import { BRAND } from '@/config/brand'
import { discoverProviders } from '@/modules/discovery/provider-discovery'
import { parseFindParams, toDiscoveryQuery } from '@/modules/discovery/find-params'
import { db } from '@/lib/db'

interface FindPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({ searchParams }: FindPageProps): Promise<Metadata> {
  const params = parseFindParams(await searchParams)
  const what = params.category ? await categoryName(params.category) : null
  const where = params.town ? await townName(params.town) : null
  const title = what
    ? where
      ? `${what} in ${where} — Find providers`
      : `${what} providers across Ghana`
    : 'Find trusted providers'
  return {
    title,
    description: what
      ? `Compare ${what.toLowerCase()} providers ${where ? `serving ${where}` : 'across all 16 regions of Ghana'} on ${BRAND.name}. Real ratings, real service areas, no guesswork.`
      : `Search Ghana's construction marketplace: plumbers, electricians, masons, contractors and more — with real service areas and verification.`,
    alternates: { canonical: '/find' },
    openGraph: { title: `${title} · ${BRAND.name}`, type: 'website' },
  }
}

async function categoryName(slug: string): Promise<string | null> {
  const category = await db.category.findFirst({ where: { slug, isActive: true }, select: { name: true } })
  return category?.name ?? null
}

async function townName(id: string): Promise<string | null> {
  const town = await db.town.findFirst({ where: { id, isActive: true }, select: { name: true } })
  return town?.name ?? null
}

export default async function FindPage({ searchParams }: FindPageProps) {
  const params = parseFindParams(await searchParams)
  const result = await discoverProviders(toDiscoveryQuery(params))
  const location = await resolveLocationChain(params)

  return <DiscoveryResultsView result={result} params={params} location={location} />
}

/** Completes the region→district→town chain when a deep link carries only a
 *  town or district ID (the cascade needs the full path to render names). */
async function resolveLocationChain(params: {
  region?: string
  district?: string
  town?: string
}): Promise<{ regionId: string | null; districtId: string | null; townId: string | null }> {
  const location = { regionId: params.region ?? null, districtId: params.district ?? null, townId: params.town ?? null }

  if (location.townId) {
    const town = await db.town.findFirst({
      where: { id: location.townId },
      select: { regionId: true, districtId: true },
    })
    if (town) {
      location.regionId = location.regionId ?? town.regionId
      location.districtId = location.districtId ?? town.districtId
    }
    return location
  }

  if (location.districtId && !location.regionId) {
    const district = await db.district.findFirst({
      where: { id: location.districtId },
      select: { regionId: true },
    })
    if (district) location.regionId = district.regionId
  }

  return location
}
