/**
 * Phase 4 smoke test — discovery engine against the dev database.
 * (Throwaway harness; the durable suite is scripts/verify-phase4.ts.)
 */
process.env.DATABASE_URL = 'file:/home/z/my-project/db/custom.db'
process.env.LOG_LEVEL = 'error'

const { discoverProviders } = await import('@/modules/discovery/provider-discovery')
const { db } = await import('@/lib/db')

const plumbing = await db.category.findFirst({ where: { slug: 'plumbing' } })
const nsawam = await db.town.findFirst({ where: { name: 'Nsawam' } })
if (!plumbing || !nsawam) throw new Error('seed missing plumbing/Nsawam')

const result = await discoverProviders({
  page: 1,
  pageSize: 10,
  sort: 'recommended',
  categorySlug: 'plumbing',
  townId: nsawam.id,
})
console.log('Plumbing + Nsawam:', result.pagination.total, '→',
  result.items.map((i) => `${i.displayName} [${i.providerType}] reasons=${i.reasons.join(' | ')}`))
console.log('nearby:', result.nearby?.total ?? 'none')

const accra = await db.town.findFirst({ where: { name: 'Accra' } })
const accraResult = await discoverProviders({ page: 1, pageSize: 5, sort: 'recommended', categorySlug: 'plumbing', townId: accra!.id })
console.log('Plumbing + Accra:', accraResult.pagination.total, '→', accraResult.items.map((i) => i.displayName))

const directory = await discoverProviders({ page: 1, pageSize: 5, sort: 'rating' })
console.log('Directory (all):', directory.pagination.total, '→', directory.items.slice(0, 3).map((i) => i.displayName))

const nearest = await discoverProviders({ page: 1, pageSize: 5, sort: 'nearest', categorySlug: 'plumbing', districtId: nsawam.districtId })
console.log('Plumbing district sweep:', nearest.pagination.total, nearest.items.map((i) => `${i.displayName} ${i.distanceKm ?? '–'}km`))

const empty = await discoverProviders({ page: 1, pageSize: 5, sort: 'recommended', categorySlug: 'plumbing', townId: (await db.town.findFirst({ where: { name: 'Wa' } }))!.id })
console.log('Plumbing + Wa:', empty.pagination.total, 'nearby:', empty.nearby?.total ?? 'none', empty.location.nearbyAreas.map((a) => a.name).join(', '))

const akropong = await db.town.findFirst({ where: { name: 'Akropong' } })
const nearbyTest = await discoverProviders({ page: 1, pageSize: 5, sort: 'recommended', categorySlug: 'plumbing', townId: akropong!.id })
console.log('Plumbing + Akropong:', nearbyTest.pagination.total, 'nearby:', nearbyTest.nearby?.total ?? 'none', '→', nearbyTest.nearby?.items.map((i) => `${i.displayName} (${i.reasons.join('/')})`).join(', '))

await db.$disconnect()

export {}
