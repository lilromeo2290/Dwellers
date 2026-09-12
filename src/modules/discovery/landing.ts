/**
 * Dwellers — SEO landing resolvers (PART 25/26/27).
 *
 * Category and location landing pages are database-driven: slugs resolve to
 * real rows, and only combinations with real content are worth indexing.
 * No category, town, district or region name is ever hard-coded here.
 */
import { db } from '@/lib/db'
import { NotFoundError } from '@/lib/errors'

export interface CategoryLanding {
  category: { id: string; name: string; slug: string; description: string | null }
  parentName: string | null
  commonServiceNames: string[]
  /** Towns where providers of this category actually serve (internal links). */
  topLocations: { id: string; name: string; slug: string }[]
  relatedCategories: { name: string; slug: string }[]
}

export async function getCategoryLanding(slug: string): Promise<CategoryLanding> {
  const category = await db.category.findFirst({
    where: { slug, isActive: true },
    select: { id: true, name: true, slug: true, description: true, parentId: true, parent: { select: { name: true, slug: true } } },
  })
  if (!category) throw new NotFoundError('Category')

  // Subtree (category + descendants) — same expansion the engine uses.
  const subtreeIds = [category.id]
  let frontier = [category.id]
  for (let depth = 0; depth < 2 && frontier.length > 0; depth += 1) {
    const children = await db.category.findMany({
      where: { parentId: { in: frontier }, isActive: true },
      select: { id: true },
    })
    frontier = children.map((c) => c.id)
    subtreeIds.push(...frontier)
  }

  const [services, areas, siblings] = await Promise.all([
    db.service.findMany({
      where: { categoryId: { in: subtreeIds }, status: 'ACTIVE', deletedAt: null },
      select: { name: true },
      take: 40,
      orderBy: { createdAt: 'desc' },
    }),
    db.providerServiceArea.findMany({
      where: {
        provider: {
          deletedAt: null,
          user: { status: 'ACTIVE' },
          services: { some: { categoryId: { in: subtreeIds }, status: 'ACTIVE', deletedAt: null } },
        },
      },
      select: { location: { select: { id: true, name: true, slug: true, isMajor: true } } },
      take: 200,
    }),
    category.parentId
      ? db.category.findMany({
          where: { parentId: category.parentId, isActive: true, id: { not: category.id } },
          select: { name: true, slug: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          take: 6,
        })
      : db.category.findMany({
          where: { parentId: category.id, isActive: true },
          select: { name: true, slug: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          take: 6,
        }),
  ])

  // Distinct towns, majors first.
  const byId = new Map<string, { id: string; name: string; slug: string; isMajor: boolean }>()
  for (const area of areas) {
    const { location } = area
    if (!byId.has(location.id)) {
      byId.set(location.id, { id: location.id, name: location.name, slug: location.slug, isMajor: location.isMajor })
    }
  }
  const topLocations = [...byId.values()]
    .sort((a, b) => Number(b.isMajor) - Number(a.isMajor) || a.name.localeCompare(b.name))
    .slice(0, 12)
    .map(({ id, name, slug }) => ({ id, name, slug }))

  const seen = new Set<string>()
  const commonServiceNames: string[] = []
  for (const service of services) {
    const label = service.name.replace(/\s*\(Demo\)\s*$/, '')
    if (!seen.has(label)) {
      seen.add(label)
      commonServiceNames.push(label)
    }
    if (commonServiceNames.length >= 6) break
  }

  return {
    category: { id: category.id, name: category.name, slug: category.slug, description: category.description },
    parentName: category.parent?.name ?? null,
    commonServiceNames,
    topLocations,
    relatedCategories: siblings,
  }
}

export type ResolvedLandingLocation =
  | { kind: 'town'; townId: string; name: string; slug: string; districtId: string; regionId: string; districtName: string; regionName: string }
  | { kind: 'district'; districtId: string; regionId: string; name: string; slug: string; regionName: string }
  | { kind: 'region'; regionId: string; name: string; slug: string }

/**
 * Resolves a URL location segment to the most specific matching entity:
 * town first, then district, then region (PART 25 examples use town slugs).
 */
export async function resolveLandingLocation(
  locationSlug: string,
): Promise<ResolvedLandingLocation | null> {
  const town = await db.town.findFirst({
    where: { slug: locationSlug, isActive: true },
    orderBy: [{ isMajor: 'desc' }, { name: 'asc' }],
    select: {
      id: true, name: true, slug: true, districtId: true, regionId: true,
      district: { select: { name: true } }, region: { select: { name: true } },
    },
  })
  if (town) {
    return {
      kind: 'town',
      townId: town.id,
      name: town.name,
      slug: town.slug,
      districtId: town.districtId,
      regionId: town.regionId,
      districtName: town.district.name,
      regionName: town.region.name,
    }
  }

  const district = await db.district.findFirst({
    where: { slug: locationSlug, isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, regionId: true, name: true, slug: true, region: { select: { name: true } } },
  })
  if (district) {
    return {
      kind: 'district',
      districtId: district.id,
      regionId: district.regionId,
      name: district.name,
      slug: district.slug,
      regionName: district.region.name,
    }
  }

  const region = await db.region.findFirst({
    where: { slug: locationSlug, isActive: true },
    select: { id: true, name: true, slug: true },
  })
  if (region) {
    return { kind: 'region', regionId: region.id, name: region.name, slug: region.slug }
  }

  return null
}
