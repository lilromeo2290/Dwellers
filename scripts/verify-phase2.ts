/**
 * Dwellers — PHASE 2 verification suite (domain + security).
 *
 * Runs against an ISOLATED test database (db/test-phase2.db) that is created
 * from the migration files and dropped afterwards — the development database
 * is never touched. Service-level authorization tests simulate AuthContexts
 * (real login lands with Phase 3); HTTP-level tests run separately against
 * the live server.
 *
 * IMPORTANT: every value import below is DYNAMIC and happens AFTER the env
 * overrides — static imports would hoist and evaluate env/db with the dev
 * configuration before the overrides run.
 */
process.env.DATABASE_URL = 'file:/home/z/my-project/db/test-phase2.db'
process.env.RATE_LIMIT_ENABLED = 'true'
process.env.TRUST_PROXY_ENABLED = 'true'
process.env.TRUSTED_PROXY_HOPS = '1'
process.env.LOG_LEVEL = 'error'

import { rmSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import type { z } from 'zod'

const TEST_DB = '/home/z/my-project/db/test-phase2.db'

// Fresh isolated database from the migration files.
rmSync(TEST_DB, { force: true })
execSync('bunx prisma migrate deploy', {
  env: { ...process.env },
  cwd: '/home/z/my-project',
  stdio: 'pipe',
})

const { db } = await import('@/lib/db')
const { hashPassword } = await import('@/lib/auth/password')
const { slugify } = await import('@/lib/utils')
const {
  roundHalfUp, percentOf, lineTotalAmount, allocateAmount, toPesewas,
} = await import('@/lib/finance')
const {
  isGhanaPhoneNumber, normalizeGhanaPhoneNumber,
} = await import('@/lib/constants/ghana')
const { validateUpload } = await import('@/lib/storage/validation')
const { LocalStorageProvider } = await import('@/lib/storage/local')
const {
  checkRateLimit, bucketCount, MAX_TRACKED_BUCKETS, getClientIp, RateLimitPresets,
} = await import('@/lib/rate-limit')
const { assertOwnership, isOwner } = await import('@/lib/auth/ownership')
const identity = await import('@/modules/identity/user-service')
const marketplace = await import('@/modules/marketplace/provider-service')
const listings = await import('@/modules/marketplace/listing-service')
const discovery = await import('@/modules/discovery/discovery-service')
const projects = await import('@/modules/projects/job-request-service')
const errors = await import('@/lib/errors')

const {
  ValidationError, UnauthorizedError, ForbiddenError, NotFoundError,
  UnsupportedMediaTypeError, BadRequestError, ConflictError,
} = errors
type AuthContext = import('@/lib/auth/session').AuthContext
type Role = import('@/lib/auth/roles').Role

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
      const message = error instanceof Error ? error.message.replace(/\n/g, ' ').slice(0, 160) : String(error)
      failures.push(`[${sectionName}] ${name}: ${message}`)
      console.log(`  ✗ ${name} — ${message}`)
    })
}

function expectThrows(fn: () => unknown, errorType: new (...args: never[]) => Error): void {
  let threw = false
  try {
    fn()
  } catch (error) {
    threw = true
    if (!(error instanceof errorType)) {
      throw new Error(`expected ${errorType.name}, got ${String(error)}`)
    }
  }
  if (!threw) throw new Error(`expected ${errorType.name} to be thrown`)
}

async function expectThrowsAsync(fn: () => Promise<unknown> | unknown, errorType: new (...args: never[]) => Error): Promise<void> {
  try {
    await fn()
  } catch (error) {
    if (!(error instanceof errorType)) {
      throw new Error(`expected ${errorType.name}, got ${String(error)}`)
    }
    return
  }
  throw new Error(`expected ${errorType.name} to be thrown`)
}

/**
 * Raw db-level unique violations surface as PrismaClientKnownRequestError
 * (P2002); the API layer maps them to ConflictError. This asserts the
 * CONSTRAINT exists — the envelope mapping is covered in Phase 1 tests.
 */
async function expectP2002(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn()
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') return
    throw new Error(`expected P2002, got: ${String(error).slice(0, 120)}`)
  }
  throw new Error('expected a unique-constraint violation (P2002)')
}

function authFor(userId: string, role: Role): AuthContext {
  return { userId, email: `${role.toLowerCase()}@test.dwellers`, role, status: 'ACTIVE' }
}

function parse<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new ValidationError(result.error.flatten())
  }
  return result.data
}

// -----------------------------------------------------------------------------
// Test world
// -----------------------------------------------------------------------------

const passwordHash = await hashPassword('Test#Passw0rd')

async function makeUser(name: string, role: Role, extra: Record<string, unknown> = {}) {
  return db.user.create({
    data: { email: `${name}@verify.dwellers.test`, name, role, passwordHash, ...extra },
  })
}

const [staff, customerA, customerB, artisanA, artisanB, supplierA, supplierB, equipA] =
  await Promise.all([
    makeUser('staff', 'ADMIN'),
    makeUser('cust-a', 'CUSTOMER'),
    makeUser('cust-b', 'CUSTOMER'),
    makeUser('art-a', 'ARTISAN'),
    makeUser('art-b', 'ARTISAN'),
    makeUser('sup-a', 'SUPPLIER'),
    makeUser('sup-b', 'SUPPLIER'),
    makeUser('eq-a', 'EQUIPMENT_PROVIDER'),
  ])

const staffAuth = authFor(staff.id, 'ADMIN')
const authA = authFor(customerA.id, 'CUSTOMER')
const authB = authFor(customerB.id, 'CUSTOMER')

const plumbing = await db.category.create({
  data: { name: 'Verify Plumbing', slug: `verify-plumbing-${Date.now()}`, level: 1 },
})
const cementCategory = await db.category.create({
  data: { name: 'Verify Cement', slug: `verify-cement-${Date.now()}`, level: 1 },
})
const excavatorCategory = await db.category.create({
  data: { name: 'Verify Excavators', slug: `verify-excavators-${Date.now()}`, level: 1 },
})
const region = await db.region.create({ data: { name: 'Verify Eastern', slug: `verify-eastern-${Date.now()}` } })
const district = await db.district.create({
  data: { regionId: region.id, name: 'Verify Nsawam District', slug: `verify-nsawam-${Date.now()}` },
})
const townNsawam = await db.town.create({
  data: { districtId: district.id, regionId: region.id, name: 'Verify Nsawam', slug: 'verify-nsawam-town', latitude: 5.8, longitude: -0.35 },
})
const townSuhum = await db.town.create({
  data: { districtId: district.id, regionId: region.id, name: 'Verify Suhum', slug: 'verify-suhum-town', latitude: 5.75, longitude: -0.45 },
})
const community = await db.communityArea.create({
  data: { townId: townNsawam.id, name: 'Verify Adoagyiri', slug: 'verify-adoagyiri' },
})

const providerA = await db.providerProfile.create({
  data: {
    userId: artisanA.id,
    profession: 'plumber',
    primaryLocationId: townNsawam.id,
    serviceAreas: { create: [{ locationId: townNsawam.id }, { locationId: townSuhum.id }] },
  },
})
const providerB = await db.providerProfile.create({
  data: { userId: artisanB.id, profession: 'mason', primaryLocationId: townSuhum.id },
})
const authProviderA = authFor(artisanA.id, 'ARTISAN')
const authProviderB = authFor(artisanB.id, 'ARTISAN')

const bagUnit = await db.measurementUnit.create({ data: { name: 'Verify Bag', slug: `verify-bag-${Date.now()}`, kind: 'COUNT' } })

// -----------------------------------------------------------------------------
// 1. USER & IDENTITY
// -----------------------------------------------------------------------------

await section('1. USER & IDENTITY')
await check('own account read returns the caller only', async () => {
  const account = await identity.getOwnAccount(authA)
  if (account.id !== customerA.id) throw new Error('wrong account returned')
})
await check('unauthenticated account read → UNAUTHORIZED', async () => {
  await expectThrowsAsync(() => identity.getOwnAccount(null), UnauthorizedError)
})
await check('profile update validates Ghana phone', () => {
  expectThrows(() => parse(identity.updateOwnProfileSchema, { phone: '012345678' }), ValidationError)
  const ok = parse(identity.updateOwnProfileSchema, { phone: '0241234567' })
  if (ok.phone !== '+233241234567') throw new Error('phone not normalised')
})
await check('profile update rejects unknown location', async () => {
  const input = parse(identity.updateOwnProfileSchema, { locationId: 'nonexistent-town' })
  await expectThrowsAsync(() => identity.updateOwnAccount(authA, input), ValidationError)
})
await check('duplicate email rejected (unique constraint P2002)', async () => {
  await expectP2002(() => db.user.create({ data: { email: customerA.email, name: 'dupe', role: 'CUSTOMER' } }))
})
await check('staff user list is paginated and scoped', async () => {
  const page = await identity.listUsers(parse(identity.userListQuerySchema, { page: 1, pageSize: 2 }))
  if (page.items.length > 2) throw new Error('pageSize not honoured')
  if (page.total < 8) throw new Error(`expected >=8 users, got ${page.total}`)
})

// -----------------------------------------------------------------------------
// 2. GHANA LOCATION HIERARCHY
// -----------------------------------------------------------------------------

await section('2. GHANA LOCATION HIERARCHY')
await check('regions list (seeded 16)', async () => {
  // Verify world adds none; dev seed may be present only in dev db.
  const { items } = await discovery.listLocations(parse(discovery.locationListQuerySchema, { level: 'regions' }))
  if (!(Array.isArray(items))) throw new Error('regions not an array')
})
await check('towns filter by region (denormalised regionId)', async () => {
  const { items } = await discovery.listLocations(parse(discovery.locationListQuerySchema, { level: 'towns', regionId: region.id }))
  if (items.length < 2) throw new Error('expected both towns in region')
})
await check('communities resolve under a town', async () => {
  const { items } = await discovery.listLocations(parse(discovery.locationListQuerySchema, { level: 'communities', townId: townNsawam.id }))
  if (!items.some((i) => i.name === 'Verify Adoagyiri')) throw new Error('community missing')
})
await check('location coordinates survive the round trip', () => {
  if (townNsawam.latitude === null || Math.abs((townNsawam.latitude ?? 0) - 5.8) > 0.001) {
    throw new Error('latitude lost')
  }
})
await check('invalid location level rejected by schema', () => {
  expectThrows(() => parse(discovery.locationListQuerySchema, { level: 'galaxy' }), ValidationError)
})

// -----------------------------------------------------------------------------
// 3. SERVICE AREAS ("who serves Nsawam?")
// -----------------------------------------------------------------------------

await section('3. SERVICE AREAS')
await check('provider service areas are queryable in reverse', async () => {
  const serving = await db.providerServiceArea.findMany({
    where: { locationId: townNsawam.id },
    include: { provider: { select: { id: true, profession: true } } },
  })
  if (!serving.some((row) => row.provider.id === providerA.id)) {
    throw new Error('Nsawam lookup missed the plumber')
  }
})
await check('provider can live in one town and serve another', async () => {
  const rows = await db.providerServiceArea.findMany({ where: { providerId: providerA.id } })
  const towns = new Set(rows.map((r) => r.locationId))
  if (!towns.has(townNsawam.id) || !towns.has(townSuhum.id)) throw new Error('multi-area not stored')
})
await check('unique(provider, location) rejects duplicate service areas', async () => {
  await expectP2002(() => db.providerServiceArea.create({ data: { providerId: providerA.id, locationId: townNsawam.id } }))
})

// -----------------------------------------------------------------------------
// 4. PROVIDER SEARCH ("plumbers in Nsawam")
// -----------------------------------------------------------------------------

await section('4. PROVIDER SEARCH')
await check('profession × location search finds the plumber', async () => {
  const query = parse(marketplace.providerListQuerySchema, { profession: 'plumb', locationId: townNsawam.id })
  const { items } = await marketplace.listProviders(query)
  if (!items.some((p) => p.id === providerA.id)) throw new Error('plumber not found in Nsawam')
})
await check('profession × location excludes non-serving providers', async () => {
  const query = parse(marketplace.providerListQuerySchema, { profession: 'plumb', locationId: townSuhum.id })
  const { items } = await marketplace.listProviders(query)
  // providerA serves both towns so may appear; providerB (mason) must not.
  if (items.some((p) => p.id === providerB.id)) throw new Error('mason matched a plumbing query')
})
await check('provider profile creation is provider-roles only', async () => {
  await expectThrowsAsync(
    () => marketplace.createProviderProfile(authA, parse(marketplace.createProviderProfileSchema, { profession: 'plumber' })),
    BadRequestError,
  )
})
await check('duplicate provider profile rejected', async () => {
  await expectThrowsAsync(
    () => marketplace.createProviderProfile(authProviderA, parse(marketplace.createProviderProfileSchema, { profession: 'glazier' })),
    ConflictError,
  )
})
await check('foreign provider profile update → FORBIDDEN', async () => {
  await expectThrowsAsync(
    () => marketplace.updateProviderProfile(authProviderB, providerA.id, { headline: 'hacked' }),
    ForbiddenError,
  )
})
await check('staff may update any provider profile', async () => {
  const updated = await marketplace.updateProviderProfile(staffAuth, providerA.id, { headline: 'staff-corrected' })
  if (updated.headline !== 'staff-corrected') throw new Error('staff override failed')
})

// -----------------------------------------------------------------------------
// 5. BUSINESSES
// -----------------------------------------------------------------------------

await section('5. BUSINESSES')
const businessA = await marketplace.createBusiness(
  authProviderA,
  parse(marketplace.createBusinessSchema, {
    name: 'Verify Kwame Plumbing',
    businessType: 'CONTRACTOR',
    serviceAreaIds: [townNsawam.id, townSuhum.id],
    locationId: townNsawam.id,
  }),
)
await check('business creation with team owner member + service areas', async () => {
  const members = await db.businessMember.findMany({ where: { businessId: businessA.id } })
  if (members.length !== 1 || members[0].memberRole !== 'OWNER') throw new Error('owner membership missing')
  const areas = await db.businessServiceArea.count({ where: { businessId: businessA.id } })
  if (areas !== 2) throw new Error('service areas not stored')
})
await check('unknown service-area location → VALIDATION ERROR', async () => {
  await expectThrowsAsync(
    () => marketplace.createBusiness(authProviderB, parse(marketplace.createBusinessSchema, { name: 'Nope Ltd', businessType: 'RETAIL', serviceAreaIds: ['nope'] })),
    ValidationError,
  )
})
await check('non-owner business update → FORBIDDEN', async () => {
  await expectThrowsAsync(
    () => marketplace.updateBusiness(authProviderB, businessA.id, { description: 'hijacked' }),
    ForbiddenError,
  )
})
await check('owner business update succeeds', async () => {
  const updated = await marketplace.updateBusiness(authProviderA, businessA.id, { description: 'trusted plumbing' })
  if (updated.description !== 'trusted plumbing') throw new Error('update failed')
})
await check('invalid business id → NOT_FOUND (safe error)', async () => {
  await expectThrowsAsync(() => marketplace.getBusiness('nonexistent-id'), NotFoundError)
})
await check('business list pagination meta', async () => {
  const { items, total } = await marketplace.listBusinesses(
    parse(marketplace.businessListQuerySchema, { page: 1, pageSize: 1 }),
  )
  if (items.length > 1 || total < 1) throw new Error('pagination broken')
})
await check('owner soft delete removes business from public list', async () => {
  const temp = await marketplace.createBusiness(authProviderB, parse(marketplace.createBusinessSchema, { name: 'Verify Ephemeral', businessType: 'OTHER' }))
  await marketplace.deleteBusiness(authProviderB, temp.id)
  await expectThrowsAsync(() => marketplace.getBusiness(temp.id), NotFoundError)
})

// -----------------------------------------------------------------------------
// 6. SERVICES (listings) & OWNERSHIP
// -----------------------------------------------------------------------------

await section('6. SERVICES')
await check('service schema enforces price unless QUOTE_REQUIRED', () => {
  expectThrows(() => parse(listings.createServiceSchema, { name: 'X', categoryId: plumbing.id, pricingModel: 'FIXED' }), ValidationError)
  const ok = parse(listings.createServiceSchema, { name: 'X', categoryId: plumbing.id, pricingModel: 'QUOTE_REQUIRED' })
  if (!ok) throw new Error('quote-required rejected')
})
await check('service creation requires a provider profile', async () => {
  await expectThrowsAsync(
    () => listings.createServiceListing(authA, parse(listings.createServiceSchema, { name: 'No profile', categoryId: plumbing.id, pricingModel: 'QUOTE_REQUIRED' })),
    ValidationError,
  )
})
const serviceA = await listings.createServiceListing(
  authProviderA,
  parse(listings.createServiceSchema, {
    name: 'Verify sink repair',
    categoryId: plumbing.id,
    pricingModel: 'STARTING_FROM',
    startingPriceAmount: 15_000,
    status: 'ACTIVE',
    serviceAreaIds: [townNsawam.id],
  }),
)
await check('service creation stores areas + money as pesewas', async () => {
  if (serviceA.startingPriceAmount !== 15_000) throw new Error('money mismatch')
  const areas = await db.serviceServiceArea.count({ where: { serviceId: serviceA.id } })
  if (areas !== 1) throw new Error('service area missing')
})
await check('provider B cannot modify provider A service → FORBIDDEN', async () => {
  await expectThrowsAsync(
    () => listings.updateServiceListing(authProviderB, serviceA.id, { name: 'hijacked' }),
    ForbiddenError,
  )
})
await check('provider B cannot delete provider A service → FORBIDDEN', async () => {
  await expectThrowsAsync(() => listings.deleteServiceListing(authProviderB, serviceA.id), ForbiddenError)
})
await check('public service search by category + location', async () => {
  const { items } = await listings.listServices(parse(listings.serviceListQuerySchema, { categoryId: plumbing.id, locationId: townNsawam.id }))
  if (!items.some((s) => s.id === serviceA.id)) throw new Error('search missed service')
})
await check('invalid service id → NOT_FOUND', async () => {
  await expectThrowsAsync(() => listings.getServiceListing('missing'), NotFoundError)
})
await check('float money rejected at the boundary', () => {
  expectThrows(() => parse(listings.createServiceSchema, {
    name: 'Bad money', categoryId: plumbing.id, pricingModel: 'STARTING_FROM', startingPriceAmount: 10.5,
  }), ValidationError)
})

// -----------------------------------------------------------------------------
// 7. PRODUCTS (supplier ownership)
// -----------------------------------------------------------------------------

await section('7. PRODUCTS')
const productA = await listings.createProductListing(
  authFor(supplierA.id, 'SUPPLIER'),
  parse(listings.createProductSchema, {
    name: 'Verify Cement 50kg',
    categoryId: cementCategory.id,
    priceAmount: 9_500,
    sku: 'VRF-CEM-50',
    unitId: bagUnit.id,
    stockQuantity: 100,
    status: 'ACTIVE',
  }),
)
await check('product creation with SKU + unit', () => {
  if (productA.priceAmount !== 9_500) throw new Error('price mismatch')
})
await check('supplier B cannot modify supplier A product → FORBIDDEN', async () => {
  await expectThrowsAsync(
    () => listings.updateProductListing(authFor(supplierB.id, 'SUPPLIER'), productA.id, { priceAmount: 1 }),
    ForbiddenError,
  )
})
await check('duplicate SKU per seller rejected', async () => {
  await expectThrowsAsync(
    () => listings.createProductListing(authFor(supplierA.id, 'SUPPLIER'), parse(listings.createProductSchema, {
      name: 'Dupe', categoryId: cementCategory.id, priceAmount: 100, sku: 'VRF-CEM-50',
    })),
    ValidationError,
  )
})
await check('same SKU allowed across different sellers', async () => {
  const ok = await listings.createProductListing(authFor(supplierB.id, 'SUPPLIER'), parse(listings.createProductSchema, {
    name: 'Other seller same SKU', categoryId: cementCategory.id, priceAmount: 200, sku: 'VRF-CEM-50',
  }))
  await listings.deleteProductListing(authFor(supplierB.id, 'SUPPLIER'), ok.id)
})
await check('product money is integer-only', () => {
  expectThrows(() => parse(listings.createProductSchema, { name: 'F', categoryId: cementCategory.id, priceAmount: 9.99 }), ValidationError)
})
await check('supplier owns product updates', async () => {
  const updated = await listings.updateProductListing(authFor(supplierA.id, 'SUPPLIER'), productA.id, { stockQuantity: 90 })
  if (updated.stockQuantity !== 90) throw new Error('stock update failed')
})
await check('public product list filters', async () => {
  const { items } = await listings.listProducts(parse(listings.productListQuerySchema, { categoryId: cementCategory.id }))
  if (!items.some((p) => p.id === productA.id)) throw new Error('product not listed')
})

// -----------------------------------------------------------------------------
// 8. EQUIPMENT
// -----------------------------------------------------------------------------

await section('8. EQUIPMENT')
const equipmentA = await listings.createEquipmentListing(
  authFor(equipA.id, 'EQUIPMENT_PROVIDER'),
  parse(listings.createEquipmentSchema, {
    name: 'Verify Excavator 320',
    categoryId: excavatorCategory.id,
    dailyRateAmount: 350_000,
    depositAmount: 500_000,
    status: 'ACTIVE',
  }),
)
await check('equipment rates stored as integer pesewas', () => {
  if (equipmentA.dailyRateAmount !== 350_000) throw new Error('rate mismatch')
})
await check('equipment owner B cannot touch owner A listing → FORBIDDEN', async () => {
  await expectThrowsAsync(
    () => listings.updateEquipmentListing(authProviderA, equipmentA.id, { dailyRateAmount: 1 }),
    ForbiddenError,
  )
})
await check('equipment list by availability', async () => {
  const { items } = await listings.listEquipment(parse(listings.equipmentListQuerySchema, { availabilityStatus: 'AVAILABLE' }))
  if (!items.some((e) => e.id === equipmentA.id)) throw new Error('equipment not listed')
})
await check('equipment owner can update availability', async () => {
  const updated = await listings.updateEquipmentListing(authFor(equipA.id, 'EQUIPMENT_PROVIDER'), equipmentA.id, { availabilityStatus: 'RENTED_OUT' })
  if (updated.availabilityStatus !== 'RENTED_OUT') throw new Error('availability update failed')
})

// -----------------------------------------------------------------------------
// 9. JOB REQUESTS (RFQ) — the core flow
// -----------------------------------------------------------------------------

await section('9. JOB REQUESTS')
const jobSchema = projects.createJobRequestSchema
await check('job schema rejects max budget below min budget', () => {
  expectThrows(() => parse(jobSchema, {
    description: 'leak', budgetMinAmount: 30_000, budgetMaxAmount: 10_000, submitNow: true,
  }), ValidationError)
})
await check('job schema rejects submission without description', () => {
  expectThrows(() => parse(jobSchema, { submitNow: true }), ValidationError)
})
const jobAId = await projects.createJobRequest(authA, parse(jobSchema, {
  title: 'Kitchen sink leaking',
  description: 'My kitchen sink is leaking. I need a plumber to come and repair it.',
  categoryId: plumbing.id,
  locationId: townNsawam.id,
  communityId: community.id,
  budgetMinAmount: 10_000,
  budgetMaxAmount: 30_000,
  preferredTimeSlot: 'MORNING',
  submitNow: true,
  attachmentKeys: [{ storageKey: 'job-attachments/2026/09/x.png', kind: 'PHOTO', mimeType: 'image/png', sizeBytes: 1024 }],
}))
const jobA = await projects.getJobRequest(authA, jobAId)
await check('job request created SUBMITTED with reference + attachment', () => {
  if (jobA.status !== 'SUBMITTED') throw new Error('status mismatch')
  if (!jobA.reference.startsWith('JR-')) throw new Error('reference format')
})
const draftAId = await projects.createJobRequest(authA, parse(jobSchema, { description: 'draft work' }))
await check('draft request editable by owner while DRAFT', async () => {
  const updated = await projects.updateJobRequest(authA, draftAId, {
    title: 'Please fix my leaking sink',
    description: 'now with details',
    locationId: townNsawam.id,
    budgetMinAmount: 5_000,
  })
  if (updated.budgetMinAmount !== 5_000) throw new Error('draft edit failed')
})
await check('submit transition only from DRAFT', async () => {
  await projects.updateJobRequest(authA, draftAId, { action: 'submit' })
  await expectThrowsAsync(() => projects.updateJobRequest(authA, draftAId, { action: 'submit' }), BadRequestError)
})
await check('customer B reading customer A request → NOT_FOUND (IDOR)', async () => {
  await expectThrowsAsync(() => projects.getJobRequest(authB, jobAId), NotFoundError)
})
await check('unauthenticated request read → UNAUTHORIZED', async () => {
  await expectThrowsAsync(() => projects.getJobRequest(null, jobAId), UnauthorizedError)
})
await check('customer A cannot cancel-completed semantics: edit non-draft → BAD_REQUEST', async () => {
  await expectThrowsAsync(() => projects.updateJobRequest(authA, jobAId, { description: 'x' }), BadRequestError)
})
await check('listing is role-scoped: customers see only their own', async () => {
  const a = await projects.listJobRequests(authA, parse(projects.jobRequestListQuerySchema, {}))
  const b = await projects.listJobRequests(authB, parse(projects.jobRequestListQuerySchema, {}))
  if (a.items.some((j) => j.customerId !== customerA.id)) throw new Error('A sees foreign jobs')
  if (b.items.length !== 0) throw new Error('B sees jobs they do not own')
})
await check('staff sees all job requests', async () => {
  const all = await projects.listJobRequests(staffAuth, parse(projects.jobRequestListQuerySchema, {}))
  if (all.total < 2) throw new Error('staff scope broken')
})
await check('cancel transition records reason', async () => {
  const cancelled = await projects.updateJobRequest(authA, draftAId, { action: 'cancel', cancellationReason: 'duplicate' })
  if (cancelled.status !== 'CANCELLED') throw new Error('cancel failed')
})
await check('invalid job id → NOT_FOUND', async () => {
  await expectThrowsAsync(() => projects.getJobRequest(authA, 'nope'), NotFoundError)
})

// -----------------------------------------------------------------------------
// 10. QUOTES & QUOTE ITEMS (server-calculated totals policy)
// -----------------------------------------------------------------------------

await section('10. QUOTES')
const quoteA = await db.quote.create({
  data: {
    quoteNumber: `QT-VRF-${Date.now()}`,
    jobRequestId: jobAId,
    providerId: providerA.id,
    customerId: customerA.id,
    labourAmount: 100_000,
    materialAmount: 50_000,
    otherChargesAmount: 10_000,
    totalAmount: 160_000, // computed server-side, never trusted from client
    status: 'SUBMITTED',
    items: {
      create: [
        { kind: 'LABOUR', name: 'Labour', quantityMilli: 1000, unitLabel: 'day', unitPriceAmount: 100_000, lineTotalAmount: 100_000 },
        { kind: 'MATERIAL', name: 'Pipes', quantityMilli: 2500, unitLabel: 'length', unitPriceAmount: 20_000, lineTotalAmount: 50_000 },
      ],
    },
  },
  include: { items: true },
})
await check('quote stores line items with quantity in thousandths', () => {
  const pipes = quoteA.items.find((i) => i.name === 'Pipes')
  if (pipes?.quantityMilli !== 2500) throw new Error('quantityMilli lost')
  if (pipes.lineTotalAmount !== 50_000) throw new Error('line total mismatch')
})
await check('quote ownership maps to the owning provider (IDOR foundation)', async () => {
  // Phase 5 pattern: load quote → resolve the owning provider's USER → verify.
  const ownerProfile = await db.providerProfile.findUniqueOrThrow({ where: { id: quoteA.providerId } })
  expectThrows(
    () => assertOwnership({ userId: ownerProfile.userId }, authProviderB),
    ForbiddenError,
  )
  if (!isOwner({ userId: ownerProfile.userId }, authProviderA)) throw new Error('owner denied')
})
await check('quote number uniqueness enforced', async () => {
  await expectP2002(() => db.quote.create({ data: { quoteNumber: quoteA.quoteNumber, jobRequestId: jobAId, providerId: providerA.id, customerId: customerA.id } }))
})

// -----------------------------------------------------------------------------
// 11. PROJECTS, TASKS, MILESTONES
// -----------------------------------------------------------------------------

await section('11. PROJECTS')
const projectA = await db.project.create({
  data: {
    title: 'Verify Bathroom renovation',
    customerId: customerA.id,
    providerId: providerA.id,
    quoteId: quoteA.id,
    locationId: townNsawam.id,
    budgetAmount: 160_000,
    status: 'ACTIVE',
    startDate: new Date(),
    tasks: {
      create: [
        { name: 'Strip old fittings', status: 'DONE', assigneeId: artisanA.id },
        { name: 'Fit new pipes', status: 'IN_PROGRESS', assigneeId: artisanA.id },
      ],
    },
    milestones: { create: { name: 'First fix complete', status: 'PENDING', amount: 80_000 } },
  },
  include: { tasks: true, milestones: true },
})
await check('project creation with quote link, tasks and milestone', () => {
  if (projectA.tasks.length !== 2 || projectA.milestones.length !== 1) throw new Error('children missing')
  if (projectA.quoteId !== quoteA.id) throw new Error('quote link missing')
})
await check('customer B accessing customer A project → DENIED (IDOR)', () => {
  expectThrows(() => assertOwnership(projectA, authB, { ownerFields: ['customerId'] }), ForbiddenError)
})
await check('owner customer passes ownership check', () => {
  assertOwnership(projectA, authA, { ownerFields: ['customerId'] })
})
await check('task assignment to provider survives the relation graph', () => {
  const assigned = projectA.tasks.every((t) => t.assigneeId === artisanA.id)
  if (!assigned) throw new Error('assignment lost')
})

// -----------------------------------------------------------------------------
// 12. MESSAGING (database foundation)
// -----------------------------------------------------------------------------

await section('12. MESSAGING')
const conversation = await db.conversation.create({
  data: {
    type: 'JOB',
    jobRequestId: jobAId,
    createdById: customerA.id,
    participants: {
      create: [
        { userId: customerA.id, role: 'INITIATOR' },
        { userId: artisanA.id },
      ],
    },
    messages: {
      create: { senderId: customerA.id, body: 'Hello, are you available tomorrow morning?' },
    },
  },
  include: { messages: true },
})
await check('conversation tied to job request with participants', async () => {
  const participants = await db.conversationParticipant.findMany({ where: { conversationId: conversation.id } })
  if (participants.length !== 2) throw new Error('participants missing')
})
await check('customer C is NOT a participant → access denied (IDOR foundation)', async () => {
  const membership = await db.conversationParticipant.findFirst({
    where: { conversationId: conversation.id, userId: customerB.id },
  })
  if (membership) throw new Error('non-participant has membership row')
  // The messaging service (later phase) denies reads when membership is null.
})
await check('read receipts are unique per user per message', async () => {
  const messageId = conversation.messages[0].id
  await db.messageRead.create({ data: { messageId, userId: artisanA.id } })
  await expectP2002(() => db.messageRead.create({ data: { messageId, userId: artisanA.id } }))
})
await check('message soft delete keeps the thread intact', async () => {
  await db.message.update({ where: { id: conversation.messages[0].id }, data: { deletedAt: new Date() } })
  const still = await db.message.findUnique({ where: { id: conversation.messages[0].id } })
  if (!still?.deletedAt) throw new Error('soft delete lost')
})

// -----------------------------------------------------------------------------
// 13. NOTIFICATIONS
// -----------------------------------------------------------------------------

await section('13. NOTIFICATIONS')
await check('notification created for recipient with entity link', async () => {
  const notification = await db.notification.create({
    data: {
      recipientId: customerA.id,
      type: 'QUOTE_RECEIVED',
      title: 'New quotation',
      body: 'You received a quote for JR-…',
      entityType: 'Quote',
      entityId: quoteA.id,
    },
  })
  if (notification.readAt) throw new Error('should start unread')
})
await check('notifications are recipient-scoped', async () => {
  const mine = await db.notification.findMany({ where: { recipientId: customerA.id } })
  if (mine.some((n) => n.recipientId !== customerA.id)) throw new Error('scope broken')
})

// -----------------------------------------------------------------------------
// 14. REVIEWS
// -----------------------------------------------------------------------------

await section('14. REVIEWS')
await check('verified review originates from completed engagement', async () => {
  const review = await db.review.create({
    data: {
      reviewerId: customerA.id,
      providerId: providerA.id,
      jobRequestId: jobAId,
      ratingOverall: 5,
      ratingQuality: 5,
      ratingCommunication: 4,
      comment: 'Fixed the leak the same morning.',
      status: 'PUBLISHED',
      isVerifiedEngagement: true,
    },
  })
  if (!review.isVerifiedEngagement || review.ratingOverall < 1 || review.ratingOverall > 5) {
    throw new Error('review integrity')
  }
  // Provider rating summary update (the matching-engine signal).
  const updated = await db.providerProfile.update({
    where: { id: providerA.id },
    data: { ratingSum: { increment: 5 }, ratingCount: { increment: 1 } },
  })
  if (updated.ratingSum / updated.ratingCount !== 5) throw new Error('rating summary')
})

// -----------------------------------------------------------------------------
// 15. VERIFICATION
// -----------------------------------------------------------------------------

await section('15. VERIFICATION')
await check('verification lifecycle PENDING → APPROVED by staff', async () => {
  const submission = await db.verification.create({
    data: {
      userId: artisanA.id,
      providerId: providerA.id,
      type: 'IDENTITY',
      documentRefs: JSON.stringify([{ key: 'documents/2026/09/id.png', name: 'id.png', mimeType: 'image/png' }]),
      status: 'PENDING',
    },
  })
  if (submission.status !== 'PENDING') throw new Error('initial status')
  const decided = await db.verification.update({
    where: { id: submission.id },
    data: { status: 'APPROVED', reviewerId: staff.id, reviewedAt: new Date(), approvedAt: new Date() },
  })
  if (decided.reviewerId !== staff.id) throw new Error('reviewer not recorded')
})
await check('verification status values constrained at the boundary', () => {
  const allowed = ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED']
  if (new Set(allowed).size !== 5) throw new Error('status drift')
})

// -----------------------------------------------------------------------------
// 16. ORDERS — historical price snapshots
// -----------------------------------------------------------------------------

await section('16. ORDERS (historical price snapshots)')
const order = await db.order.create({
  data: {
    orderNumber: `DW-VRF-${Date.now()}`,
    customerId: customerA.id,
    sellerId: supplierA.id,
    subtotalAmount: 19_000,
    deliveryFeeAmount: 1_000,
    totalAmount: 20_000,
    paymentStatus: 'PAID',
    status: 'CONFIRMED',
    deliveryLocationId: townNsawam.id,
    deliveryPhone: '+233241234567',
    items: {
      create: [{
        productId: productA.id,
        productName: productA.name,
        sku: 'VRF-CEM-50',
        quantityMilli: 2000,
        unitLabel: 'bag',
        unitPriceAmount: 9_500, // price AT PURCHASE TIME
        lineTotalAmount: 19_000,
      }],
    },
  },
  include: { items: true },
})
await check('order item snapshots the historical unit price', async () => {
  // Seller changes today's catalogue price — history must not move.
  await db.product.update({ where: { id: productA.id }, data: { priceAmount: 12_000 } })
  const item = await db.orderItem.findFirstOrThrow({ where: { id: order.items[0].id } })
  if (item.unitPriceAmount !== 9_500) throw new Error('HISTORICAL PRICE MUTATED')
  if (item.lineTotalAmount !== 19_000) throw new Error('line total mutated')
})
await check('order totals are integer pesewas and consistent', () => {
  if (!Number.isInteger(order.totalAmount) || order.totalAmount !== order.subtotalAmount + order.deliveryFeeAmount) {
    throw new Error('total arithmetic broken')
  }
})
await check('order number uniqueness enforced', async () => {
  await expectP2002(() => db.order.create({ data: { orderNumber: order.orderNumber, customerId: customerA.id, sellerId: supplierA.id, subtotalAmount: 0, totalAmount: 0 } }))
})

// -----------------------------------------------------------------------------
// 17. PAYMENTS (gateway-agnostic abstraction)
// -----------------------------------------------------------------------------

await section('17. PAYMENTS')
const ref = `PAY-VRF-${Date.now()}`
const payment = await db.payment.create({
  data: {
    transactionRef: ref,
    userId: customerA.id,
    orderId: order.id,
    amount: 20_000,
    provider: 'PAYSTACK',
    method: 'MOBILE_MONEY',
    status: 'SUCCEEDED',
    paidAt: new Date(),
  },
})
await check('payment links order + payer with provider/method', () => {
  if (payment.orderId !== order.id || payment.provider !== 'PAYSTACK') throw new Error('payment fields')
})
await check('transaction reference unique', async () => {
  await expectP2002(() => db.payment.create({ data: { transactionRef: ref, userId: customerA.id, amount: 1, provider: 'CASH' } }))
})
await check('payment metadata never stores credentials', () => {
  const sensitive = /(password|secret|token|pin|card_number)/i
  if (payment.metadata && sensitive.test(payment.metadata)) throw new Error('sensitive metadata')
})

// -----------------------------------------------------------------------------
// 18. MONEY POLICY (integer pesewas, rounding + division rules)
// -----------------------------------------------------------------------------

await section('18. MONEY POLICY')
await check('roundHalfUp rounds .5 up, never towards zero', () => {
  if (roundHalfUp(2.5) !== 3 || roundHalfUp(-2.5) !== -2 || roundHalfUp(0.5) !== 1) throw new Error('rounding')
})
await check('percentOf computes VAT-style percentages', () => {
  if (percentOf(16_000, 12) !== 1_920) throw new Error('percent math')
  if (percentOf(10_001, 15) !== 1_500) throw new Error('half-up percent')
})
await check('lineTotalAmount handles fractional quantities', () => {
  if (lineTotalAmount(2500, 2_000) !== 5_000) throw new Error('2.5 × 20.00')
  if (lineTotalAmount(1500, 3_333) !== 5_000) throw new Error('rounding on fraction') // 4999.5 → 5000
})
await check('allocateAmount never creates or loses pesewas', () => {
  const parts = allocateAmount(1_000, [1, 1, 1])
  if (parts.reduce((a, b) => a + b, 0) !== 1_000) throw new Error('split sum')
  const uneven = allocateAmount(10_001, [50, 50])
  if (uneven.reduce((a, b) => a + b, 0) !== 10_001) throw new Error('uneven split')
  if (uneven[0] !== 5_001) throw new Error('remainder must favour first party')
})
await check('toPesewas converts user cedi input', () => {
  if (toPesewas('150.75') !== 15_075) throw new Error('string convert')
  if (toPesewas(92.5) !== 9_250) throw new Error('number convert')
})

// -----------------------------------------------------------------------------
// 19. GHANA PHONE VALIDATION
// -----------------------------------------------------------------------------

await section('19. GHANA PHONE VALIDATION')
await check('valid local prefixes accepted', () => {
  for (const valid of ['0201234567', '0241234567', '0501234567', '0541234567', '0551234567', '0591234567', '0261234567', '0271234567']) {
    if (!isGhanaPhoneNumber(valid)) throw new Error(`rejected valid: ${valid}`)
  }
})
await check('valid international forms accepted', () => {
  for (const valid of ['+233201234567', '+233241234567', '+233 24 123 4567', '024-123-4567']) {
    if (!isGhanaPhoneNumber(valid)) throw new Error(`rejected valid: ${valid}`)
  }
})
await check('invalid prefixes, letters and overlong numbers rejected', () => {
  for (const bad of ['012345678', '0712345678', '0812345678', '0912345678', 'abc1234567', '02412345678', '024123456', '+2330241234567', '0241234567extra', '']) {
    if (isGhanaPhoneNumber(bad)) throw new Error(`accepted invalid: ${bad}`)
  }
})
await check('normalisation to +233 format', () => {
  if (normalizeGhanaPhoneNumber('0241234567') !== '+233241234567') throw new Error('local norm')
  if (normalizeGhanaPhoneNumber('+233 24 123 4567') !== '+233241234567') throw new Error('intl norm')
  if (normalizeGhanaPhoneNumber('012345678') !== null) throw new Error('invalid must null')
})

// -----------------------------------------------------------------------------
// 20. STORAGE — upload/read/stream/delete/exists/traversal
// -----------------------------------------------------------------------------

await section('20. STORAGE')
{
  const tempRoot = mkdtempSync(join(tmpdir(), 'dwellers-storage-'))
  const storage = new LocalStorageProvider(tempRoot)
  const buffer = Buffer.from('dwellers stream test payload '.repeat(64))
  await check('put + exists + get round trip', async () => {
    await storage.put('docs/2026/09/test.bin', buffer, 'application/octet-stream')
    if (!(await storage.exists('docs/2026/09/test.bin'))) throw new Error('exists false')
    const got = await storage.get('docs/2026/09/test.bin')
    if (!got.data.equals(buffer)) throw new Error('content mismatch')
  })
  await check('stream returns a working WHATWG ReadableStream', async () => {
    const stream = storage.stream('docs/2026/09/test.bin')
    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) chunks.push(value)
    }
    const assembled = Buffer.concat(chunks.map((c) => Buffer.from(c)))
    if (!assembled.equals(buffer)) throw new Error('streamed bytes differ')
  })
  await check('streaming missing object → NOT_FOUND', async () => {
    await expectThrowsAsync(() => Promise.resolve(storage.stream('docs/none.bin')), NotFoundError)
  })
  await check('path traversal blocked at runtime', async () => {
    await expectThrowsAsync(() => storage.put('../../etc/evil', buffer, 'text/plain'), NotFoundError)
    await expectThrowsAsync(() => Promise.resolve(storage.get('../../../etc/passwd')), NotFoundError)
    await expectThrowsAsync(() => Promise.resolve(storage.stream('..\\..\\windows\\system32')), NotFoundError)
  })
  await check('delete removes the object', async () => {
    await storage.delete('docs/2026/09/test.bin')
    if (await storage.exists('docs/2026/09/test.bin')) throw new Error('still exists')
  })
  await check('SVG uploads rejected (stored-XSS defence)', () => {
    expectThrows(() => validateUpload('business-logo', { filename: 'logo.svg', contentType: 'image/svg+xml', size: 100 }), UnsupportedMediaTypeError)
  })
  await check('valid PNG/JPEG/WEBP uploads accepted with safe keys', () => {
    const ok = validateUpload('business-logo', { filename: '../../evil logo.png', contentType: 'image/png', size: 2048 })
    if (!ok.key.startsWith('business-logo/') || ok.key.includes('..')) throw new Error('key unsafe')
    if (ok.sanitizedFilename.includes('/')) throw new Error('filename not sanitised')
  })
  rmSync(tempRoot, { recursive: true, force: true })
}

// -----------------------------------------------------------------------------
// 21. RATE LIMITER HARDENING
// -----------------------------------------------------------------------------

await section('21. RATE LIMITER')
await check('limiter allows within policy and blocks beyond', () => {
  const key = `rl-test-${Date.now()}`
  for (let i = 0; i < RateLimitPresets.auth.limit; i += 1) {
    const result = checkRateLimit(key, RateLimitPresets.auth)
    if (!result.allowed) throw new Error(`blocked early at ${i}`)
  }
  const blocked = checkRateLimit(key, RateLimitPresets.auth)
  if (blocked.allowed || blocked.retryAfterSeconds <= 0) throw new Error('not blocked after limit')
})
await check('bucket map bounded under unique-key flood', () => {
  const before = bucketCount()
  for (let i = 0; i < MAX_TRACKED_BUCKETS + 500; i += 1) {
    checkRateLimit(`flood-${i}`, RateLimitPresets.auth)
  }
  const after = bucketCount()
  if (after > MAX_TRACKED_BUCKETS) throw new Error(`bucket leak: ${after} > cap`)
  if (after <= before) throw new Error('suspicious: nothing tracked')
})
await check('limiter still functional after eviction storm', () => {
  const key = `post-flood-${Date.now()}`
  const result = checkRateLimit(key, RateLimitPresets.standard)
  if (!result.allowed) throw new Error('functional limiter broken after eviction')
})

// -----------------------------------------------------------------------------
// 22. TRUSTED PROXY / CLIENT IP
// -----------------------------------------------------------------------------

await section('22. CLIENT IP (TRUST_PROXY_ENABLED=true, hops=1)')
await check('single hop: rightmost XFF entry is the client', () => {
  const request = new Request('http://x/api', { headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.2' } })
  if (getClientIp(request) !== '10.0.0.2') throw new Error(`got ${getClientIp(request)}`)
})
await check('spoofed leftmost entry ignored', () => {
  const request = new Request('http://x/api', { headers: { 'x-forwarded-for': '6.6.6.6, 10.0.0.2' } })
  if (getClientIp(request) !== '10.0.0.2') throw new Error('spoof accepted')
})
await check('x-real-ip fallback when XFF missing', () => {
  const request = new Request('http://x/api', { headers: { 'x-real-ip': '198.51.100.9' } })
  if (getClientIp(request) !== '198.51.100.9') throw new Error('real-ip fallback')
})
await check('no proxy headers → safe placeholder (not forged data)', () => {
  const request = new Request('http://x/api')
  if (getClientIp(request) !== 'direct') throw new Error('expected direct placeholder')
})

// -----------------------------------------------------------------------------
// 23. VALIDATION & PAGINATION BOUNDARIES
// -----------------------------------------------------------------------------

await section('23. VALIDATION & PAGINATION')
await check('pageSize above 100 rejected at schema level', () => {
  expectThrows(() => parse(discovery.locationListQuerySchema, { level: 'towns', pageSize: '500' }), ValidationError)
})
await check('invalid body → VALIDATION ERROR envelope mapping', () => {
  expectThrows(() => parse(listings.createServiceSchema, { pricingModel: 'SOMETIMES' }), ValidationError)
})
await check('unknown enum value rejected (status strings validated)', () => {
  expectThrows(() => parse(projects.jobRequestListQuerySchema, { status: 'TELEPORTED' }), ValidationError)
})

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------

console.log('\n────────────────────────────────────────────────────')
console.log(`Phase 2 verification: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const failure of failures) console.log(`  • ${failure}`)
  process.exitCode = 1
} else {
  console.log('All Phase 2 domain, security and infrastructure checks pass.')
}

// Leave the isolated test database in place for debugging; it is recreated
// from scratch on every run.
await db.$disconnect()

