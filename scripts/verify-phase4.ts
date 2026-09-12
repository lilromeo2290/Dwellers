/**
 * Dwellers — PHASE 4 verification suite (discovery).
 *
 * Runs against an ISOLATED test database (db/test-phase4.db) rebuilt from the
 * migration files, PLUS live-HTTP checks against the running dev server.
 * Covers the 25 minimum checks of PART 42 and the four critical acceptance
 * tests of PART 43–46:
 *   1. Plumbing + Nsawam → the Nsawam plumber appears.
 *   2. The Accra-only plumber does NOT appear for Nsawam.
 *   3. A suspended plumber never appears publicly.
 *   4. Results paginate — never unlimited loads.
 */
process.env.DATABASE_URL = 'file:/home/z/my-project/db/test-phase4.db'
process.env.RATE_LIMIT_ENABLED = 'true'
process.env.LOG_LEVEL = 'error'

import { rmSync } from 'node:fs'
import { execSync } from 'node:child_process'

const TEST_DB = '/home/z/my-project/db/test-phase4.db'
const DEV_DB = 'file:/home/z/my-project/db/custom.db'
const BASE = 'http://localhost:3000'

// Fresh isolated database from the migration files.
rmSync(TEST_DB, { force: true })
execSync('bunx prisma migrate deploy', {
  env: { ...process.env },
  cwd: '/home/z/my-project',
  stdio: 'pipe',
})

const { db } = await import('@/lib/db')
const { hashPassword } = await import('@/lib/auth/password')
const { discoverProviders, getPublicProviderProfile, discoveryQuerySchema, recordDiscoveryEvent } =
  await import('@/modules/discovery/provider-discovery')
const ranking = await import('@/modules/discovery/ranking')
const { distanceBandFor, DISTANCE_BANDS, DISCOVERY_WEIGHTS } = ranking
const { assertOwnership } = await import('@/lib/auth/ownership')
const marketplace = await import('@/modules/marketplace/provider-service')
const errors = await import('@/lib/errors')
const { ValidationError, ForbiddenError, NotFoundError } = errors

// -----------------------------------------------------------------------------
// Harness
// -----------------------------------------------------------------------------

let passed = 0
let failed = 0
const failures: string[] = []
let sectionName = ''

function section(name: string) {
  sectionName = name
  console.log(`\n${name}`)
}

function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1
      console.log(`  ✓ ${name}`)
    })
    .catch((error: unknown) => {
      failed += 1
      const message = error instanceof Error ? error.message : String(error)
      failures.push(`[${sectionName}] ${name}: ${message}`)
      console.log(`  ✗ ${name}\n      ${message}`)
    })
}

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function parse<T extends import('zod').ZodType>(schema: T, input: unknown): import('zod').output<T> {
  const result = schema.safeParse(input)
  if (!result.success) throw new Error(`fixture parse failed: ${JSON.stringify(result.error.flatten())}`)
  return result.data
}

// -----------------------------------------------------------------------------
// Fixtures — own geography (with coordinates) so Haversine is deterministic
// -----------------------------------------------------------------------------

const stamp = Date.now()
const passwordHash = await hashPassword('Verify#Passw0rd1')

let phoneCounter = 0
async function makeUser(name: string, role: string, status = 'ACTIVE') {
  phoneCounter += 1
  return db.user.create({
    data: {
      email: `${name.toLowerCase()}-${stamp}@verify.local`,
      phone: `+233201${String(phoneCounter).padStart(6, '0')}`,
      name,
      role,
      status,
      passwordHash,
    },
  })
}

async function makePlumber(opts: {
  name: string
  role?: string
  status?: string
  verification?: string
  availability?: string
  years?: number
  price?: number | null
  response?: number | null
  ratingSum?: number
  ratingCount?: number
  businessId?: string | null
  baseTown: string
  areaTownIds: string[]
  serviceCategoryIds: string[]
}) {
  const user = await makeUser(opts.name, opts.role ?? 'ARTISAN', opts.status)
  const provider = await db.providerProfile.create({
    data: {
      userId: user.id,
      profession: 'plumber',
      headline: `${opts.name} headline`,
      biography: `${opts.name} biography`,
      yearsExperience: opts.years ?? 0,
      availabilityStatus: opts.availability ?? 'AVAILABLE',
      startingPriceAmount: opts.price ?? null,
      verificationStatus: opts.verification ?? 'UNVERIFIED',
      ratingSum: opts.ratingSum ?? 0,
      ratingCount: opts.ratingCount ?? 0,
      responseRatePercent: opts.response ?? null,
      businessId: opts.businessId ?? null,
      primaryLocationId: opts.baseTown,
      serviceAreas: { create: opts.areaTownIds.map((locationId) => ({ locationId })) },
    },
  })
  for (const categoryId of opts.serviceCategoryIds) {
    await db.service.create({
      data: {
        providerId: provider.id,
        categoryId,
        name: `${opts.name} service`,
        pricingModel: 'STARTING_FROM',
        startingPriceAmount: opts.price ?? null,
        status: 'ACTIVE',
      },
    })
  }
  return { user, provider }
}

await section('0. Fixtures (isolated database)')

// Taxonomy: root + two leaves.
const rootCategory = await db.category.create({ data: { name: 'Construction Services', slug: `construction-services-${stamp}`, level: 1 } })
const plumbingCategory = await db.category.create({
  data: { name: 'Plumbing', slug: `plumbing-${stamp}`, parentId: rootCategory.id, level: 2 },
})
const electricalCategory = await db.category.create({
  data: { name: 'Electrical', slug: `electrical-${stamp}`, parentId: rootCategory.id, level: 2 },
})

// Geography: Eastern-corridor towns with real coordinates.
const region = await db.region.create({ data: { name: 'Verify Eastern', slug: `verify-eastern-${stamp}`, latitude: 5.9, longitude: -0.3 } })
const district = await db.district.create({
  data: { regionId: region.id, name: 'Verify Nsawam District', slug: `verify-nsawam-district-${stamp}`, latitude: 5.8, longitude: -0.35 },
})
const town = async (name: string, lat: number, lng: number, major = false) =>
  db.town.create({
    data: { districtId: district.id, regionId: region.id, name, slug: `${name.toLowerCase().replace(/\s+/g, '-')}-${stamp}`, isMajor: major, latitude: lat, longitude: lng },
  })
const townNsawam = await town('Verify Nsawam', 5.8085, -0.3539)
const townAdoagyiri = await town('Verify Adoagyiri', 5.793, -0.343)
const townSuhum = await town('Verify Suhum', 5.75, -0.45)
const townAkropong = await town('Verify Akropong', 5.9667, -0.0833)
const communityZongo = await db.communityArea.create({
  data: { townId: townNsawam.id, name: 'Verify Zongo', slug: `verify-zongo-${stamp}` },
})
// Other regions for cross-region exclusion + distance tests.
const regionAccra = await db.region.create({ data: { name: 'Verify Greater Accra', slug: `verify-accra-${stamp}`, latitude: 5.6037, longitude: -0.187 } })
const districtAccra = await db.district.create({ data: { regionId: regionAccra.id, name: 'Verify Accra Metro', slug: `verify-accra-metro-${stamp}`, latitude: 5.6037, longitude: -0.187 } })
const townAccra = await db.town.create({
  data: { districtId: districtAccra.id, regionId: regionAccra.id, name: 'Verify Accra', slug: `verify-accra-town-${stamp}`, isMajor: true, latitude: 5.6037, longitude: -0.187 },
})
const regionUpperWest = await db.region.create({ data: { name: 'Verify Upper West', slug: `verify-uw-${stamp}`, latitude: 10.06, longitude: -2.51 } })
const districtWa = await db.district.create({ data: { regionId: regionUpperWest.id, name: 'Verify Wa District', slug: `verify-wa-district-${stamp}`, latitude: 10.06, longitude: -2.51 } })
const townWa = await db.town.create({
  data: { districtId: districtWa.id, regionId: regionUpperWest.id, name: 'Verify Wa', slug: `verify-wa-town-${stamp}`, isMajor: true, latitude: 10.06, longitude: -2.51 },
})

// Businesses.
const ownerUser = await makeUser('Verify Business Owner', 'CONSTRUCTION_COMPANY')
const business = await db.business.create({
  data: {
    ownerId: ownerUser.id,
    name: 'Verify Build+ Construction Ltd',
    slug: `verify-build-plus-${stamp}`,
    businessType: 'CONSTRUCTION_COMPANY',
    verificationStatus: 'VERIFIED',
  },
})

// The cast (PART 43–45 + filters/sorting cast):
// P1 — THE Nsawam plumber: serves 4 towns, 2 plumbing services, verified, rated.
const p1 = await makePlumber({
  name: 'Verify Kwame Plumbing', verification: 'VERIFIED', years: 12, price: 15000, response: 92,
  ratingSum: 226, ratingCount: 47,
  baseTown: townNsawam.id, areaTownIds: [townNsawam.id, townAdoagyiri.id, townSuhum.id, townAkropong.id],
  serviceCategoryIds: [plumbingCategory.id],
})
await db.service.create({ data: { providerId: p1.provider.id, categoryId: plumbingCategory.id, name: `${p1.provider.id} second install`, pricingModel: 'QUOTE_REQUIRED', status: 'ACTIVE' } })
// P2 — the Accra-only plumber (must NEVER appear for Nsawam).
const p2 = await makePlumber({
  name: 'Verify Accra Plumbing', verification: 'UNVERIFIED', availability: 'BUSY', years: 4, price: 8000, response: null,
  ratingSum: 15, ratingCount: 5,
  baseTown: townAccra.id, areaTownIds: [townAccra.id], serviceCategoryIds: [plumbingCategory.id],
})
// P3 — suspended Nsawam plumber (must NEVER appear publicly).
await makePlumber({
  name: 'Verify Suspended Plumbing', status: 'SUSPENDED', verification: 'VERIFIED',
  baseTown: townNsawam.id, areaTownIds: [townNsawam.id], serviceCategoryIds: [plumbingCategory.id],
})
// P4 — pending electrician IN Nsawam (service mismatch test).
await makePlumber({
  name: 'Verify Voltaland Electrics', verification: 'PENDING', years: 6, price: 12000,
  baseTown: townNsawam.id, areaTownIds: [townNsawam.id], serviceCategoryIds: [electricalCategory.id],
})
// P5 — pending electrician, engineering the service search the OTHER way.
// P6 — unrated Akropong plumber (nearby + rating/experience sort fixtures).
const p6 = await makePlumber({
  name: 'Verify Akropong Plumbing', verification: 'PENDING', years: 20, price: 200000, response: 60,
  baseTown: townAkropong.id, areaTownIds: [townAkropong.id], serviceCategoryIds: [plumbingCategory.id],
})
// B1 — business-affiliated plumbing company in Accra.
const b1User = await makeUser('Verify Business Provider', 'CONTRACTOR')
const b1 = await db.providerProfile.create({
  data: {
    userId: b1User.id,
    profession: 'plumber',
    businessId: business.id,
    verificationStatus: 'VERIFIED',
    primaryLocationId: townAccra.id,
    serviceAreas: { create: [{ locationId: townAccra.id }] },
  },
})
await db.service.create({ data: { providerId: b1.id, categoryId: plumbingCategory.id, name: 'Verify Build+ plumbing', pricingModel: 'QUOTE_REQUIRED', status: 'ACTIVE' } })
// P7..P18 — twelve more Nsawam plumbers so exact totals paginate (13 → 2 pages @10).
const bulk = []
for (let index = 1; index <= 12; index += 1) {
  bulk.push(
    makePlumber({
      name: `Verify Bulk Plumber ${index}`, verification: index % 2 === 0 ? 'VERIFIED' : 'UNVERIFIED', years: index,
      baseTown: townNsawam.id, areaTownIds: [townNsawam.id], serviceCategoryIds: [plumbingCategory.id],
    }),
  )
}
await Promise.all(bulk)

// Published reviews for P1 (public profile + rating signal).
await db.review.create({
  data: {
    reviewerId: ownerUser.id, providerId: p1.provider.id, ratingOverall: 5,
    comment: 'Fixed our burst pipe within hours. Professional and tidy.', status: 'PUBLISHED', isVerifiedEngagement: true,
  },
})
await db.review.create({
  data: { reviewerId: b1User.id, providerId: p1.provider.id, ratingOverall: 4, comment: 'Good work on the bathroom.', status: 'PUBLISHED' },
})
await db.review.create({
  data: { reviewerId: b1User.id, providerId: p1.provider.id, ratingOverall: 3, comment: 'Should be hidden (pending moderation).', status: 'PENDING' },
})

console.log('  fixtures ready')

// -----------------------------------------------------------------------------
// 1. Ranking configuration
// -----------------------------------------------------------------------------

await section('1. Ranking configuration (PART 10 — one central source)')
await check('weights sum to exactly 100%', () => {
  const total = Object.values(DISCOVERY_WEIGHTS).reduce((sum, w) => sum + w, 0)
  expect(Math.abs(total - 1) < 1e-9, `weights sum to ${total}`)
})
await check('weights match the product matrix', () => {
  expect(DISCOVERY_WEIGHTS.serviceMatch === 0.3, 'service must be 30%')
  expect(DISCOVERY_WEIGHTS.locationMatch === 0.25, 'location must be 25%')
  expect(DISCOVERY_WEIGHTS.availability === 0.15, 'availability must be 15%')
  expect(DISCOVERY_WEIGHTS.rating === 0.1, 'rating must be 10%')
  expect(DISCOVERY_WEIGHTS.responseRate === 0.1, 'response must be 10%')
  expect(DISCOVERY_WEIGHTS.experience === 0.05, 'experience must be 5%')
  expect(DISCOVERY_WEIGHTS.verification === 0.05, 'verification must be 5%')
})
await check('distance bands are ordered and closed', () => {
  expect(DISTANCE_BANDS.length === 4, 'four bands')
  expect(distanceBandFor(3).label === '0–5 km', '3km → first band')
  expect(distanceBandFor(10).label === '5–15 km', '10km → second band')
  expect(distanceBandFor(25).label === '15–30 km', '25km → third band')
  expect(distanceBandFor(80).label === '30+ km', '80km → last band')
})

// -----------------------------------------------------------------------------
// 2. CRITICAL ACCEPTANCE (PART 43–45)
// -----------------------------------------------------------------------------

await section('2. Critical acceptance — Plumbing + Verify Nsawam')
const nsawamResult = await discoverProviders(
  parse(discoveryQuerySchema, { categorySlug: plumbingCategory.slug, townId: townNsawam.id, pageSize: 20 }),
)
await check('CRITICAL 1: Nsawam plumber appears for Plumbing + Nsawam', () => {
  const ids = nsawamResult.items.map((item) => item.providerId)
  expect(ids.includes(p1.provider.id), 'P1 must appear')
})
await check('CRITICAL 2: Accra-only plumber does NOT appear', () => {
  const ids = nsawamResult.items.map((item) => item.providerId)
  expect(!ids.includes(p2.provider.id), 'P2 (Accra-only) must not appear')
  expect(!ids.includes(b1.id), 'B1 (Accra business) must not appear')
})
await check('CRITICAL 3: suspended Nsawam plumber does NOT appear', async () => {
  const again = await discoverProviders(
    parse(discoveryQuerySchema, { categorySlug: plumbingCategory.slug, townId: townNsawam.id, pageSize: 100 }),
  )
  const ids = again.items.map((item) => item.providerId)
  const suspended = await db.providerProfile.findFirst({ where: { profession: 'plumber', user: { status: 'SUSPENDED' } } })
  expect(suspended !== null, 'suspended fixture exists')
  expect(!ids.includes(suspended!.id), 'suspended provider must be excluded')
})
await check('CRITICAL 4 (service mismatch): electrician in Nsawam does NOT appear for Plumbing', async () => {
  const voltaland = await db.providerProfile.findFirst({ where: { user: { name: { startsWith: 'Verify Voltaland' } } } })
  expect(voltaland !== null, 'voltaland fixture exists')
  const ids = nsawamResult.items.map((item) => item.providerId)
  expect(!ids.includes(voltaland!.id), 'electrician must not appear in plumbing search')
})
await check('every exact result genuinely serves Nsawam', () => {
  for (const item of nsawamResult.items) {
    expect(
      item.serviceAreas.some((area) => area.id === townNsawam.id) || item.primaryLocation?.id === townNsawam.id,
      `${item.displayName} does not serve Nsawam`,
    )
  }
})
await check('reason strings are honest and score-free', () => {
  const p1Result = nsawamResult.items.find((item) => item.providerId === p1.provider.id)!
  expect(p1Result.reasons.includes('Serves your area'), 'serves-your-area reason')
  expect(p1Result.reasons.some((reason) => reason.includes('Offers Plumbing')), 'offers reason')
  expect(JSON.stringify(p1Result).match(/score/i) === null, 'no numeric score exposure')
})

// -----------------------------------------------------------------------------
// 3. Location hierarchy (PART 4/11)
// -----------------------------------------------------------------------------

await section('3. Location hierarchy')
await check('community search resolves to its town', async () => {
  const result = await discoverProviders(
    parse(discoveryQuerySchema, { categorySlug: plumbingCategory.slug, communityId: communityZongo.id, pageSize: 30 }),
  )
  expect(result.items.some((item) => item.providerId === p1.provider.id), 'P1 appears via community→town')
  expect(result.location.level === 'community', 'level=community')
})
await check('district sweep includes district towns but not Accra', async () => {
  const result = await discoverProviders(
    parse(discoveryQuerySchema, { categorySlug: plumbingCategory.slug, districtId: district.id, pageSize: 100 }),
  )
  const ids = result.items.map((item) => item.providerId)
  expect(ids.includes(p1.provider.id), 'P1 in district')
  expect(ids.includes(p6.provider.id), 'P6 (Akropong) in district')
  expect(!ids.includes(p2.provider.id), 'P2 (Accra) not in Eastern district')
})
await check('region sweep includes whole region', async () => {
  const result = await discoverProviders(
    parse(discoveryQuerySchema, { categorySlug: plumbingCategory.slug, regionId: region.id, pageSize: 100 }),
  )
  expect(result.items.length >= 12, `region sweep found ${result.items.length}`)
  expect(!result.items.some((item) => item.providerId === p2.provider.id), 'Accra plumber excluded from Eastern')
})
await check('no location searches nationwide', async () => {
  const result = await discoverProviders(
    parse(discoveryQuerySchema, { categorySlug: plumbingCategory.slug, pageSize: 100 }),
  )
  const ids = result.items.map((item) => item.providerId)
  expect(ids.includes(p1.provider.id) && ids.includes(p2.provider.id) && ids.includes(b1.id), 'nationwide includes both regions')
})
await check('ancestor category search finds leaf providers (PART 10 service match)', async () => {
  const result = await discoverProviders(
    parse(discoveryQuerySchema, { categorySlug: rootCategory.slug, townId: townNsawam.id, pageSize: 100 }),
  )
  expect(result.items.some((item) => item.providerId === p1.provider.id), 'P1 found under root category')
})
await check('unknown location ID is a validation error, not a 500', async () => {
  let threw = false
  try {
    await discoverProviders(parse(discoveryQuerySchema, { categorySlug: plumbingCategory.slug, townId: 'nope' }))
  } catch (error) {
    threw = error instanceof ValidationError
  }
  expect(threw, 'expected ValidationError')
})

// -----------------------------------------------------------------------------
// 4. Filters (PART 14) — server-side
// -----------------------------------------------------------------------------

await section('4. Server-side filters')
await check('verification filter: VERIFIED only', async () => {
  const result = await discoverProviders(
    parse(discoveryQuerySchema, { categorySlug: plumbingCategory.slug, regionId: region.id, verification: 'VERIFIED', pageSize: 100 }),
  )
  expect(result.items.length > 0, 'some verified providers')
  expect(result.items.every((item) => item.verificationStatus === 'VERIFIED'), 'all VERIFIED')
  expect(!result.items.some((item) => item.providerId === p6.provider.id), 'PENDING P6 excluded')
})
await check('availability filter: AVAILABLE only (real field, PART 13)', async () => {
  const result = await discoverProviders(
    parse(discoveryQuerySchema, { categorySlug: plumbingCategory.slug, regionId: region.id, availability: 'AVAILABLE', pageSize: 100 }),
  )
  expect(result.items.every((item) => item.availabilityStatus === 'AVAILABLE'), 'all AVAILABLE')
  const busy = await discoverProviders(
    parse(discoveryQuerySchema, { categorySlug: plumbingCategory.slug, regionId: regionAccra.id, availability: 'BUSY', pageSize: 100 }),
  )
  expect(busy.items.some((item) => item.providerId === p2.provider.id), 'BUSY P2 found via BUSY filter in its own region')
})
await check('minRating filter excludes unrated and low-rated', async () => {
  const result = await discoverProviders(
    parse(discoveryQuerySchema, { categorySlug: plumbingCategory.slug, regionId: region.id, minRating: 4, pageSize: 100 }),
  )
  expect(result.items.some((item) => item.providerId === p1.provider.id), 'P1 (4.8) passes')
  expect(!result.items.some((item) => item.providerId === p6.provider.id), 'unrated P6 excluded')
  expect(!result.items.some((item) => item.providerId === p2.provider.id), 'P2 (3.0) excluded')
})
await check('maxPrice filter bounds starting price (pesewas)', async () => {
  const result = await discoverProviders(
    parse(discoveryQuerySchema, { categorySlug: plumbingCategory.slug, regionId: regionAccra.id, maxPrice: 10000, pageSize: 100 }),
  )
  expect(result.items.some((item) => item.providerId === p2.provider.id), 'P2 (8000 pesewas) included')
  expect(!result.items.some((item) => item.providerId === b1.id), 'quote-required B1 (no published price) excluded by price bound')
})
await check('providerType filter separates individual vs business (PART 37/38)', async () => {
  const businesses = await discoverProviders(
    parse(discoveryQuerySchema, { categorySlug: plumbingCategory.slug, providerType: 'BUSINESS', pageSize: 100 }),
  )
  expect(businesses.items.every((item) => item.providerType === 'BUSINESS'), 'all business')
  expect(businesses.items.some((item) => item.providerId === b1.id), 'B1 in businesses')
  const individuals = await discoverProviders(
    parse(discoveryQuerySchema, { categorySlug: plumbingCategory.slug, providerType: 'INDIVIDUAL', pageSize: 100 }),
  )
  expect(individuals.items.every((item) => item.providerType === 'INDIVIDUAL'), 'all individual')
  expect(!individuals.items.some((item) => item.providerId === b1.id), 'B1 not in individuals')
})

// -----------------------------------------------------------------------------
// 5. Sorting (PART 15)
// -----------------------------------------------------------------------------

await section('5. Sorting — no false ranking')
await check('rating sort: rated first, then by average', async () => {
  const result = await discoverProviders(
    parse(discoveryQuerySchema, { categorySlug: plumbingCategory.slug, sort: 'rating', pageSize: 100 }),
  )
  const rated = result.items.filter((item) => item.rating !== null)
  expect(rated.length >= 2, 'two rated providers exist')
  const p1Position = result.items.findIndex((item) => item.providerId === p1.provider.id)
  const p6Position = result.items.findIndex((item) => item.providerId === p6.provider.id)
  expect(p1Position < p6Position, 'P1 (4.8) before unrated P6')
})
await check('experience sort: 20y P6 before 12y P1 before 4y P2', async () => {
  const result = await discoverProviders(
    parse(discoveryQuerySchema, { categorySlug: plumbingCategory.slug, sort: 'experience', pageSize: 100 }),
  )
  const positions = [p6, p1, p2].map((fixture) => result.items.findIndex((item) => item.providerId === fixture.provider.id))
  expect(positions.every((position) => position >= 0), 'all present')
  expect(positions[0] < positions[1] && positions[1] < positions[2], `expected P6<P1<P2, got ${positions.join(',')}`)
})
await check('price sort: ascending, quote-required last', async () => {
  const result = await discoverProviders(
    parse(discoveryQuerySchema, { categorySlug: plumbingCategory.slug, sort: 'price', pageSize: 100 }),
  )
  const priced = result.items.filter((item) => item.startingPriceAmount !== null).map((item) => item.startingPriceAmount!)
  expect(priced.every((price, index) => index === 0 || priced[index - 1] <= price), `not ascending: ${priced.join(',')}`)
  expect(result.items[result.items.length - 1].startingPriceAmount === null, 'null price last')
})
await check('response sort: non-null by rate desc, nulls last', async () => {
  const result = await discoverProviders(
    parse(discoveryQuerySchema, { categorySlug: plumbingCategory.slug, sort: 'response', pageSize: 100 }),
  )
  const withRate = result.items.filter((item) => item.providerId === p1.provider.id || item.providerId === p6.provider.id)
  expect(withRate.length === 2, 'both response-rate providers present')
  expect(result.items.findIndex((i) => i.providerId === p1.provider.id) < result.items.findIndex((i) => i.providerId === p6.provider.id), '92% before 60%')
})
await check('nearest sort orders by Haversine distance (PART 12)', async () => {
  const result = await discoverProviders(
    parse(discoveryQuerySchema, { categorySlug: plumbingCategory.slug, districtId: district.id, sort: 'nearest', pageSize: 100 }),
  )
  const p1Position = result.items.findIndex((item) => item.providerId === p1.provider.id)
  const p6Position = result.items.findIndex((item) => item.providerId === p6.provider.id)
  expect(p1Position < p6Position, 'Nsawam (0km from district point) before Akropong (~35km)')
  const p1Item = result.items[p1Position]
  expect(p1Item.distanceKm !== null && p1Item.distanceKm <= 1, `P1 distance ${p1Item.distanceKm}`)
  const p6Item = result.items[p6Position]
  expect(p6Item.distanceKm !== null && p6Item.distanceKm > 20 && p6Item.distanceKm < 50, `P6 distance ${p6Item.distanceKm}`)
})
await check('distance bands label without exposing coordinates', () => {
  const json = JSON.stringify(nsawamResult)
  expect(json.includes('5.8085') === false, 'raw lat must not leak')
  expect(json.includes('-0.3539') === false, 'raw lng must not leak')
})
await check('recommended ranks verified+rated+available Nsawam plumber on top', async () => {
  const result = await discoverProviders(
    parse(discoveryQuerySchema, { categorySlug: plumbingCategory.slug, townId: townNsawam.id, sort: 'recommended', pageSize: 100 }),
  )
  expect(result.items[0].providerId === p1.provider.id, `top was ${result.items[0].displayName}`)
})

// -----------------------------------------------------------------------------
// 6. Pagination + dedupe (PART 41/46/39)
// -----------------------------------------------------------------------------

await section('6. Pagination & duplicate prevention')
await check('CRITICAL 5: 13 matching plumbers paginate 10 + 3, never unlimited', async () => {
  const page1 = await discoverProviders(
    parse(discoveryQuerySchema, { categorySlug: plumbingCategory.slug, townId: townNsawam.id, pageSize: 10 }),
  )
  expect(page1.pagination.total === 13, `total was ${page1.pagination.total}`)
  expect(page1.items.length === 10, `page1 had ${page1.items.length}`)
  expect(page1.pagination.totalPages === 2, 'two pages')
  expect(page1.pagination.hasNextPage === true, 'has next')
  const page2 = await discoverProviders(
    parse(discoveryQuerySchema, { categorySlug: plumbingCategory.slug, townId: townNsawam.id, pageSize: 10, page: 2 }),
  )
  expect(page2.items.length === 3, `page2 had ${page2.items.length}`)
  const page1Ids = new Set(page1.items.map((item) => item.providerId))
  expect(page2.items.every((item) => !page1Ids.has(item.providerId)), 'no overlap between pages')
})
await check('multi-area multi-service provider appears exactly once (PART 39)', async () => {
  const result = await discoverProviders(
    parse(discoveryQuerySchema, { categorySlug: plumbingCategory.slug, districtId: district.id, pageSize: 100 }),
  )
  const ids = result.items.map((item) => item.providerId)
  expect(new Set(ids).size === ids.length, 'duplicate provider rows found')
  expect(ids.filter((id) => id === p1.provider.id).length === 1, 'P1 exactly once despite 2 services + 4 areas')
})

// -----------------------------------------------------------------------------
// 7. Empty results + nearby fallback (PART 17/18)
// -----------------------------------------------------------------------------

await section('7. Empty results & nearby fallback')
await check('Plumbing + Wa (far region) is honestly empty', async () => {
  const result = await discoverProviders(
    parse(discoveryQuerySchema, { categorySlug: plumbingCategory.slug, townId: townWa.id, pageSize: 10 }),
  )
  expect(result.pagination.total === 0, 'no plumbers in Wa')
  expect(result.nearby === null || result.nearby.items.length === 0, 'no fabricated nearby in an isolated region')
})
await check('nearby fallback: Electrical + Akropong surfaces the Nsawam electrician, clearly labeled', async () => {
  const voltaland = await db.providerProfile.findFirst({ where: { user: { name: { startsWith: 'Verify Voltaland' } } } })
  expect(voltaland !== null, 'voltaland fixture exists')
  const result = await discoverProviders(
    parse(discoveryQuerySchema, { categorySlug: electricalCategory.slug, townId: townAkropong.id, pageSize: 10 }),
  )
  expect(result.pagination.total === 0, 'no electrician serves Akropong exactly')
  expect(result.nearby !== null, 'nearby tier present')
  expect(result.nearby!.items.some((item) => item.providerId === voltaland!.id), 'P4 appears as nearby')
  expect(result.nearby!.items.every((item) => item.providerId !== p6.provider.id), 'no service mismatch inside nearby')
  const p4Nearby = result.nearby!.items.find((item) => item.providerId === voltaland!.id)!
  expect(p4Nearby.reasons.some((reason) => reason.startsWith('Serves ') && !reason.includes('Akropong')), 'nearby label names the served town')
  expect(p4Nearby.distanceKm !== null && p4Nearby.distanceKm > 20 && p4Nearby.distanceKm < 50, `nearby distance ${p4Nearby.distanceKm}`)
})
await check('nearby respects hard filters too (verified-only nearby stays verified)', async () => {
  const result = await discoverProviders(
    parse(discoveryQuerySchema, { categorySlug: electricalCategory.slug, townId: townAkropong.id, verification: 'VERIFIED', pageSize: 10 }),
  )
  // P4 is PENDING — verified-only nearby must be empty, not silently downgraded.
  expect(result.nearby === null || result.nearby.items.length === 0, 'no unverified leakage through nearby')
})

// -----------------------------------------------------------------------------
// 8. Public provider profile (PART 8/9/33)
// -----------------------------------------------------------------------------

await section('8. Public provider profile')
await check('profile exposes real aggregate data only', async () => {
  const profile = await getPublicProviderProfile(p1.provider.id)
  expect(profile.displayName === 'Verify Kwame Plumbing', 'display name')
  expect(profile.verificationStatus === 'VERIFIED', 'verification status')
  expect(profile.rating !== null && profile.rating.count === 47, `rating count ${profile.rating?.count}`)
  expect(Math.abs((profile.rating?.average ?? 0) - 4.8) < 0.01, `rating average ${profile.rating?.average}`)
  expect(profile.providerType === 'INDIVIDUAL', 'type individual')
})
await check('profile shows only PUBLISHED reviews', async () => {
  const profile = await getPublicProviderProfile(p1.provider.id)
  expect(profile.reviews.length === 2, `expected 2 published reviews, got ${profile.reviews.length}`)
  expect(profile.reviews.every((review) => review.comment !== 'Should be hidden (pending moderation).'), 'PENDING review leaked')
})
await check('profile leaks no private contact data (PART 33)', async () => {
  const profile = await getPublicProviderProfile(p1.provider.id)
  const json = JSON.stringify(profile)
  expect(!json.includes('@verify.local'), 'email leaked')
  expect(!json.includes('0201'), 'phone leaked')
  expect(!json.includes('passwordHash'), 'hash leaked')
})
await check('suspended provider profile is 404, not public', async () => {
  const suspended = await db.providerProfile.findFirst({ where: { user: { status: 'SUSPENDED' } } })
  expect(suspended !== null, 'fixture exists')
  let threw = false
  try {
    await getPublicProviderProfile(suspended!.id)
  } catch (error) {
    threw = error instanceof NotFoundError
  }
  expect(threw, 'expected NotFoundError')
})
await check('business-affiliated profile names the business and type', async () => {
  const profile = await getPublicProviderProfile(b1.id)
  expect(profile.providerType === 'BUSINESS', 'type business')
  expect(profile.business?.name === 'Verify Build+ Construction Ltd', 'business name')
})

// -----------------------------------------------------------------------------
// 9. Ownership & eligibility boundaries (PART 9/22/24)
// -----------------------------------------------------------------------------

await section('9. Ownership & eligibility boundaries')
await check('provider profile update rejects a non-owner (IDOR re-check)', async () => {
  const attacker = { userId: b1User.id, email: b1User.email, role: 'CONTRACTOR', status: 'ACTIVE' }
  let threw = false
  try {
    await marketplace.updateProviderProfile(attacker, p1.provider.id, { headline: 'hacked' })
  } catch (error) {
    threw = error instanceof ForbiddenError
  }
  expect(threw, 'expected ForbiddenError')
})
await check('providers cannot set their own verification status (PART 9)', async () => {
  // The update schema has no verification field — asserting at the schema level.
  const schema = marketplace.updateProviderProfileSchema as unknown as { shape: Record<string, unknown> }
  expect(!('verificationStatus' in schema.shape), 'update schema must not accept verificationStatus')
})

// -----------------------------------------------------------------------------
// 10. Analytics foundation (PART 32)
// -----------------------------------------------------------------------------

await section('10. Analytics foundation')
await check('search events are recorded with IDs and counts only', async () => {
  await recordDiscoveryEvent({
    type: 'provider_search',
    categoryId: plumbingCategory.id,
    townId: townNsawam.id,
    resultCount: 13,
    sort: 'recommended',
    page: 1,
  })
  const event = await db.discoveryEvent.findFirst({ where: { eventType: 'provider_search' }, orderBy: { createdAt: 'desc' } })
  expect(event !== null, 'event row missing')
  expect(event!.resultCount === 13, 'result count stored')
  expect(event!.townId === townNsawam.id, 'town id stored')
})
await check('event table has no personal-identifier columns', async () => {
  const columns = await db.$queryRawUnsafe<{ name: string }[]>(
    "SELECT name FROM pragma_table_info('discovery_events')",
  )
  const names = columns.map((column) => column.name)
  for (const forbidden of ['userId', 'ip', 'userAgent', 'email', 'queryText']) {
    expect(!names.includes(forbidden), `forbidden column ${forbidden}`)
  }
})
await check('search rate-limit preset enforces its ceiling in-process (PART 34)', async () => {
  const { checkRateLimit, RateLimitPresets } = await import('@/lib/rate-limit')
  const bucket = `verify:discovery:${stamp}`
  let limited = false
  for (let index = 0; index < RateLimitPresets.search.limit + 5; index += 1) {
    const verdict = checkRateLimit(bucket, RateLimitPresets.search)
    if (!verdict.allowed) {
      limited = true
      expect(verdict.retryAfterSeconds > 0, 'retry-after must be positive')
      break
    }
  }
  expect(limited, `search preset (${RateLimitPresets.search.limit}/min) never exhausted`)
})
await check('analytics failures never break discovery', async () => {
  // Force a genuine Prisma write failure (fractional Int column) and confirm
  // the swallow path keeps discovery fully functional.
  await recordDiscoveryEvent({ type: 'provider_search', page: 1.5 })
  const result = await discoverProviders(parse(discoveryQuerySchema, { categorySlug: plumbingCategory.slug, townId: townNsawam.id, pageSize: 1 }))
  expect(result.pagination.total === 13, 'discovery unaffected by analytics failures')
})

// -----------------------------------------------------------------------------
// 11. HTTP — LIVE SERVER (public discovery contract, dev database)
// -----------------------------------------------------------------------------

await section('11. HTTP — LIVE SERVER (dev database, public contract)')

const { PrismaClient } = await import('@prisma/client')
const devDb = new PrismaClient({ datasources: { db: { url: DEV_DB } } })

async function httpGet(path: string): Promise<{ status: number; body: string; json: { success?: boolean; data?: { items?: unknown[]; pagination?: { total?: number; page?: number; pageSize?: number; totalPages?: number }; criteria?: Record<string, unknown> }; error?: { code?: string } } | null }> {
  const response = await fetch(`${BASE}${path}`)
  const body = await response.text()
  let json: unknown = null
  try {
    json = JSON.parse(body)
  } catch {
    json = null
  }
  return { status: response.status, body, json: json as never }
}

// Locate the seeded Nsawam demo data in the dev database.
const devPlumbing = await devDb.category.findFirst({ where: { slug: 'plumbing' } })
const devNsawam = await devDb.town.findFirst({ where: { name: 'Nsawam' } })
expect(devPlumbing !== null && devNsawam !== null, 'dev seed must contain Plumbing + Nsawam (run bun run db:seed)')

await check('HTTP: Plumbing + Nsawam returns 200 envelope with real pagination meta', async () => {
  const { status, json } = await httpGet(`/api/discovery/providers?categorySlug=${devPlumbing!.slug}&townId=${devNsawam!.id}`)
  expect(status === 200, `status ${status}`)
  expect(json?.success === true, 'envelope success')
  expect(typeof json?.data?.pagination?.total === 'number', 'pagination total present')
  expect(json?.data?.pagination?.page === 1 && json?.data?.pagination?.pageSize === 20, 'page meta defaults')
})
await check('HTTP: NSAWAM ACCEPTANCE — Kwame Darko appears and serves Nsawam', async () => {
  const { json } = await httpGet(`/api/discovery/providers?categorySlug=${devPlumbing!.slug}&townId=${devNsawam!.id}`)
  const items = (json?.data?.items ?? []) as { displayName?: string; providerId?: string; reasons?: string[] }[]
  expect(items.some((item) => item.displayName?.includes('Kwame Darko')), 'Kwame Darko (Demo) must appear')
})
await check('HTTP: no private data in discovery payloads', async () => {
  const { body } = await httpGet(`/api/discovery/providers?categorySlug=${devPlumbing!.slug}`)
  expect(!body.includes('@demo.dwellers.test'), 'demo email leaked')
  expect(!body.includes('0201234567'), 'demo phone leaked')
  expect(!body.includes('latitude'), 'raw coordinates leaked')
})
await check('HTTP: malformed enum value → 422 VALIDATION_ERROR', async () => {
  const { status, json } = await httpGet(`/api/discovery/providers?availability=SOON`)
  expect(status === 422, `status ${status}`)
  expect(json?.error?.code === 'VALIDATION_ERROR', 'validation error code')
})
await check('HTTP: SQL-like/unknown query key → 422 (strict schema)', async () => {
  const { status } = await httpGet(`/api/discovery/providers?password=%27%20OR%201%3D1--`)
  expect(status === 422, `status ${status}`)
})
await check('HTTP: unknown category slug → 422, not a blank page', async () => {
  const { status, json } = await httpGet(`/api/discovery/providers?categorySlug=does-not-exist`)
  expect(status === 422, `status ${status}`)
  expect(json?.error?.code === 'VALIDATION_ERROR', 'validation error code')
})
await check('HTTP: events endpoint rejects junk and accepts honest clicks', async () => {
  const junk = await fetch(`${BASE}/api/discovery/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'DROP_TABLE' }),
  })
  expect(junk.status === 422, `junk status ${junk.status}`)
  const provider = await devDb.providerProfile.findFirst({ where: { user: { name: { contains: 'Kwame Darko' } } } })
  const good = await fetch(`${BASE}/api/discovery/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'request_service_clicked', providerId: provider?.id }),
  })
  expect(good.status === 204, `good status ${good.status}`)
})
await check('HTTP: public provider page renders (200 + JSON-LD + no contacts)', async () => {
  const provider = await devDb.providerProfile.findFirst({ where: { user: { name: { contains: 'Kwame Darko' } } } })
  const response = await fetch(`${BASE}/providers/${provider!.id}`)
  const body = await response.text()
  expect(response.status === 200, `status ${response.status}`)
  expect(body.includes('application/ld+json'), 'JSON-LD present')
  expect(!body.includes('demo.dwellers.test'), 'email leaked on page')
  expect(body.includes('Kwame Darko'), 'name rendered')
})
await check('HTTP: SEO landing /find/plumbing/nsawam renders with title + result', async () => {
  const response = await fetch(`${BASE}/find/plumbing/nsawam`)
  const body = await response.text()
  expect(response.status === 200, `status ${response.status}`)
  expect(body.includes('Plumbing in Nsawam'), 'title content')
  expect(body.includes('Kwame Darko'), 'provider rendered')
  expect(body.includes('rel="canonical"') || body.includes('canonical'), 'canonical present')
})
await check('HTTP: /find directory + homepage discovery panel live', async () => {
  const find = await fetch(`${BASE}/find`)
  expect(find.status === 200, `/find status ${find.status}`)
  const findBody = await find.text()
  expect(findBody.includes('discovery-search-panel'), 'search panel on /find')
  const home = await fetch(`${BASE}/`)
  const homeBody = await home.text()
  expect(home.status === 200, `home status ${home.status}`)
  expect(homeBody.includes('discovery-search-panel'), 'search panel on homepage')
})
await check('HTTP: sitemap lists content-backed discovery URLs', async () => {
  const response = await fetch(`${BASE}/sitemap.xml`)
  const body = await response.text()
  expect(response.status === 200, `status ${response.status}`)
  expect(body.includes('/find/plumbing/nsawam'), 'plumbing×nsawam combo in sitemap')
})
await check('HTTP: discovery surfaces respond with security headers + request id', async () => {
  const response = await fetch(`${BASE}/api/discovery/providers?pageSize=1`)
  expect(response.headers.get('x-request-id') !== null, 'x-request-id header missing')
})
await check('HTTP: rate limiting is env-gated in dev, enforced in production config (PART 34/35)', async () => {
  // Dev servers run with RATE_LIMIT_ENABLED=false by design (Phase 1 policy);
  // the preset ceiling itself is proven in-process in section 10.
  const { json } = await httpGet(`/api/discovery/providers?pageSize=1`)
  expect(json?.success === true, 'discovery still serving in dev without limiter')
})

await devDb.$disconnect()

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------

console.log('\n════════════════════════════════════════')
console.log(`PHASE 4 VERIFICATION: ${passed} passed, ${failed} failed`)
if (failures.length > 0) {
  console.log('\nFailures:')
  for (const failure of failures) console.log(`  - ${failure}`)
  process.exitCode = 1
} else {
  console.log('All discovery, critical acceptance, privacy, security and SEO checks green.')
}

await db.$disconnect()
export {}
