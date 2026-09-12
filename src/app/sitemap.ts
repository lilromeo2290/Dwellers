/**
 * Dwellers — Sitemap (PART 25/48).
 *
 * Only useful, content-backed URLs are listed: the discovery surfaces, every
 * active category landing, and category × location combinations that
 * genuinely have at least one eligible provider (computed from real
 * Service + ProviderServiceArea rows — no empty thousand-page farms).
 */
import type { MetadataRoute } from 'next'
import { db } from '@/lib/db'

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://dwellers.example'

export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE_URL}/find`, changeFrequency: 'daily', priority: 0.9 },
  ]

  const [categories, services, areas] = await Promise.all([
    db.category.findMany({
      where: { isActive: true, deletedAt: null },
      select: { slug: true },
      orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }],
      take: 100,
    }),
    db.service.findMany({
      where: { status: 'ACTIVE', deletedAt: null, isAvailable: true },
      select: { categoryId: true, providerId: true },
      take: 5000,
    }),
    db.providerServiceArea.findMany({
      where: { provider: { deletedAt: null, user: { status: 'ACTIVE' } } },
      select: { providerId: true, location: { select: { slug: true } } },
      take: 5000,
    }),
  ])

  // category × town combinations with at least one eligible provider.
  const categoriesBySlug = new Map<string, string>() // slug → id
  // Level-2 (leaf) categories are the useful landing targets.
  const leafCategories = await db.category.findMany({
    where: { isActive: true, deletedAt: null, level: 2 },
    select: { id: true, slug: true },
    take: 100,
  })
  for (const category of leafCategories) categoriesBySlug.set(category.slug, category.id)

  const providersByCategory = new Map<string, Set<string>>() // categoryId → providerIds
  for (const service of services) {
    let set = providersByCategory.get(service.categoryId)
    if (!set) providersByCategory.set(service.categoryId, (set = new Set()))
    set.add(service.providerId)
  }

  const townsByProvider = new Map<string, Set<string>>() // providerId → town slugs
  for (const area of areas) {
    let set = townsByProvider.get(area.providerId)
    if (!set) townsByProvider.set(area.providerId, (set = new Set()))
    set.add(area.location.slug)
  }

  const combos: MetadataRoute.Sitemap = []
  const seen = new Set<string>()
  for (const [slug, categoryId] of categoriesBySlug) {
    const providers = providersByCategory.get(categoryId)
    if (!providers) continue
    const townSlugs = new Set<string>()
    for (const providerId of providers) {
      for (const townSlug of townsByProvider.get(providerId) ?? []) townSlugs.add(townSlug)
    }
    for (const townSlug of [...townSlugs].slice(0, 20)) {
      const path = `/find/${slug}/${townSlug}`
      if (seen.has(path)) continue
      seen.add(path)
      combos.push({ url: `${BASE_URL}${path}`, changeFrequency: 'weekly', priority: 0.7 })
      if (combos.length >= 500) break
    }
    if (combos.length >= 500) break
  }

  const categoryRoutes: MetadataRoute.Sitemap = categories.map((category) => ({
    url: `${BASE_URL}/find/${category.slug}`,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  return [...staticRoutes, ...categoryRoutes, ...combos]
}
