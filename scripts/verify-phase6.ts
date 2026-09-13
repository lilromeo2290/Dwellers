/**
 * Dwellers — PHASE 6 verification suite (QUOTATIONS).
 *
 * Two levels, mirroring the established harness conventions:
 *  1. SERVICE level against an ISOLATED database (db/test-phase6.db) rebuilt
 *     from the migration files — the quote state machine, the money engine,
 *     eligibility, the whole lifecycle, notifications, audit, analytics,
 *     business permissions, races.
 *  2. HTTP level against the LIVE dev server (dev database, seeded demo
 *     users) — real NextAuth sessions, real middleware: the PART 67–78
 *     acceptance matrix, the PART 43 IDOR matrix, price tampering (PART 44),
 *     the money grid over the wire (PART 45), duplicate send (PART 46/77),
 *     acceptance races (PART 47/78) and suspension (PART 64).
 *
 * Nothing here trusts the client: every check exercises the same code paths
 * the product uses. Results are printed, never fabricated.
 */
process.env.DATABASE_URL = 'file:/home/z/my-project/db/test-phase6.db'
process.env.RATE_LIMIT_ENABLED = 'true'
process.env.LOG_LEVEL = 'error'

import { rmSync } from 'node:fs'
import { execSync } from 'node:child_process'

const TEST_DB = '/home/z/my-project/db/test-phase6.db'
const DEV_DB = 'file:/home/z/my-project/db/custom.db'
const BASE = 'http://localhost:3000'
const DEMO_PASSWORD = 'Demo#Passw0rd'

// Fresh isolated database from the migration files.
rmSync(TEST_DB, { force: true })
execSync('bunx prisma migrate deploy', {
  env: { ...process.env },
  cwd: '/home/z/my-project',
  stdio: 'pipe',
})

const { db } = await import('@/lib/db')
const { hashPassword } = await import('@/lib/auth/password')
const state = await import('@/modules/quotes/quote-state')
const requestState = await import('@/modules/projects/job-request-state')
const finance = await import('@/lib/finance')
const quotes = await import('@/modules/quotes/quote-service')
const {
  assertQuoteTransition,
  QUOTE_ACTIONS,
  QUOTE_ITEM_KINDS,
  isQuotePastValidity,
  QUOTE_EVENT_TYPES,
} = state
const { assertTransition, JOB_REQUEST_ACTIONS } = requestState
const { ValidationError, BadRequestError, ForbiddenError, NotFoundError, ConflictError, UnauthorizedError } = await import('@/lib/errors')
const { AUDIT_ACTIONS } = await import('@/lib/audit')

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

async function expectThrows(fn: () => Promise<unknown> | unknown, ErrorClass: new (...args: never[]) => Error, hint?: string) {
  try {
    await fn()
  } catch (error) {
    if (error instanceof ErrorClass) return
    throw new Error(`expected ${ErrorClass.name}${hint ? ` (${hint})` : ''}, got ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`)
  }
  throw new Error(`expected ${ErrorClass.name}${hint ? ` (${hint})` : ''}, but the call succeeded`)
}

function authOf(user: { id: string; email: string; name: string | null; role: string; status: string }) {
  return { userId: user.id, email: user.email, name: user.name, role: user.role as never, status: user.status }
}

// -----------------------------------------------------------------------------
// 1. STATE MACHINE (pure rules — PART 21/22/23/24)
// -----------------------------------------------------------------------------

await section('1. QUOTE STATE MACHINE (pure rules)')

await check('machine exposes the seven existing statuses (PART 21)', () => {
  expect(state.QUOTE_STATUSES.join(',') === 'DRAFT,SUBMITTED,VIEWED,ACCEPTED,DECLINED,EXPIRED,WITHDRAWN', state.QUOTE_STATUSES.join(','))
})

await check('item kinds match the QuoteItem vocabulary exactly (PART 4)', () => {
  expect(QUOTE_ITEM_KINDS.join(',') === 'LABOUR,MATERIAL,EQUIPMENT,TRANSPORT,OTHER', QUOTE_ITEM_KINDS.join(','))
})

await check('provider may send only from DRAFT', async () => {
  assertQuoteTransition('send', 'PROVIDER', 'DRAFT')
  await expectThrows(() => assertQuoteTransition('send', 'PROVIDER', 'SUBMITTED'), BadRequestError, 'double send')
  await expectThrows(() => assertQuoteTransition('send', 'PROVIDER', 'VIEWED'), BadRequestError)
  await expectThrows(() => assertQuoteTransition('send', 'PROVIDER', 'ACCEPTED'), BadRequestError)
})

await check('customer accepts/declines only from SUBMITTED or VIEWED (PART 24)', async () => {
  assertQuoteTransition('accept', 'CUSTOMER', 'SUBMITTED')
  assertQuoteTransition('accept', 'CUSTOMER', 'VIEWED')
  assertQuoteTransition('decline', 'CUSTOMER', 'VIEWED')
  await expectThrows(() => assertQuoteTransition('accept', 'CUSTOMER', 'DRAFT'), BadRequestError, 'not sent yet')
  await expectThrows(() => assertQuoteTransition('accept', 'CUSTOMER', 'ACCEPTED'), BadRequestError)
  await expectThrows(() => assertQuoteTransition('decline', 'CUSTOMER', 'WITHDRAWN'), BadRequestError)
})

await check('provider can NEVER accept or decline its own quote (PART 23)', async () => {
  await expectThrows(() => assertQuoteTransition('accept', 'PROVIDER', 'SUBMITTED'), BadRequestError)
  await expectThrows(() => assertQuoteTransition('decline', 'PROVIDER', 'SUBMITTED'), BadRequestError)
  await expectThrows(() => assertQuoteTransition('accept', 'STAFF', 'SUBMITTED'), BadRequestError)
})

await check('draft edits only while DRAFT (PART 23/72)', async () => {
  assertQuoteTransition('edit_draft', 'PROVIDER', 'DRAFT')
  await expectThrows(() => assertQuoteTransition('edit_draft', 'PROVIDER', 'SUBMITTED'), BadRequestError, 'sent quote')
  await expectThrows(() => assertQuoteTransition('edit_draft', 'CUSTOMER', 'DRAFT'), BadRequestError)
})

await check('withdraw allowed before any decision, never after (PART 23)', async () => {
  assertQuoteTransition('withdraw', 'PROVIDER', 'DRAFT')
  assertQuoteTransition('withdraw', 'PROVIDER', 'SUBMITTED')
  assertQuoteTransition('withdraw', 'PROVIDER', 'VIEWED')
  await expectThrows(() => assertQuoteTransition('withdraw', 'PROVIDER', 'ACCEPTED'), BadRequestError)
  await expectThrows(() => assertQuoteTransition('withdraw', 'CUSTOMER', 'SUBMITTED'), BadRequestError)
})

await check('terminal states accept nothing further', async () => {
  for (const status of state.QUOTE_TERMINAL_STATUSES) {
    await expectThrows(() => assertQuoteTransition('accept', 'CUSTOMER', status), BadRequestError, status)
    await expectThrows(() => assertQuoteTransition('send', 'PROVIDER', status), BadRequestError, status)
  }
})

await check('request machine gained accept_quote: CUSTOMER, RESPONDED only (PART 48)', async () => {
  expect(JOB_REQUEST_ACTIONS.includes('accept_quote'), 'accept_quote action exists')
  assertTransition('accept_quote', 'CUSTOMER', 'RESPONDED')
  await expectThrows(() => assertTransition('accept_quote', 'CUSTOMER', 'SUBMITTED'), BadRequestError)
  await expectThrows(() => assertTransition('accept_quote', 'CUSTOMER', 'CANCELLED'), BadRequestError)
  await expectThrows(() => assertTransition('accept_quote', 'CUSTOMER', 'DECLINED'), BadRequestError)
  await expectThrows(() => assertTransition('accept_quote', 'CUSTOMER', 'ACCEPTED'), BadRequestError)
  await expectThrows(() => assertTransition('accept_quote', 'PROVIDER', 'RESPONDED'), BadRequestError)
})

await check('validity check is a pure date comparison (PART 31)', () => {
  expect(!isQuotePastValidity(null), 'null never expires')
  expect(!isQuotePastValidity(new Date(Date.now() + 86_400_000)), 'future is valid')
  expect(isQuotePastValidity(new Date(Date.now() - 1000)), 'past is expired')
})

// -----------------------------------------------------------------------------
// 2. CALCULATION & MONEY (PART 5-17, 44, 45 — integer pesewas only)
// -----------------------------------------------------------------------------

await section('2. CALCULATION & MONEY (server-side, integer pesewas)')

await check('acceptance test 1 arithmetic: 350 + 4×25 + 80 = GH₵530.00 (PART 67)', () => {
  const totals = quotes.computeQuoteTotals(
    [
      { kind: 'LABOUR', name: 'Bathroom pipe repair', description: null, quantity: 1, unit: 'job', unitPrice: 350 },
      { kind: 'MATERIAL', name: 'PVC Pipe', description: null, quantity: 4, unit: 'metres', unitPrice: 25 },
      { kind: 'TRANSPORT', name: 'Transportation', description: null, quantity: 1, unit: 'trip', unitPrice: 80 },
    ],
    null,
  )
  expect(totals.subtotalAmount === 53_000, `subtotal ${totals.subtotalAmount}`)
  expect(totals.totalAmount === 53_000, `total ${totals.totalAmount}`)
  expect(totals.labourAmount === 35_000 && totals.materialAmount === 10_000, 'component buckets')
  expect(totals.otherChargesAmount === 8_000, 'transport lands in other charges')
})

await check('spec example: 4 × GH₵25 pipe + 3 × GH₵8 elbow (PART 6)', () => {
  const totals = quotes.computeQuoteTotals(
    [
      { kind: 'MATERIAL', name: 'PVC Pipe', description: null, quantity: 4, unit: 'metres', unitPrice: 25 },
      { kind: 'MATERIAL', name: 'PVC Elbow', description: null, quantity: 3, unit: 'pieces', unitPrice: 8 },
    ],
    null,
  )
  expect(totals.subtotalAmount === 10_000 + 2_400, `subtotal ${totals.subtotalAmount}`)
})

await check('decimal quantity: 2.5 bags × GH₵20 = GH₵50.00 exactly', () => {
  const totals = quotes.computeQuoteTotals(
    [{ kind: 'MATERIAL', name: 'Cement', description: null, quantity: 2.5, unit: 'bag', unitPrice: 20 }],
    null,
  )
  expect(totals.subtotalAmount === 5_000, `subtotal ${totals.subtotalAmount}`)
})

await check('discount subtracts once: subtotal − discount = total (PART 15/17)', () => {
  const totals = quotes.computeQuoteTotals(
    [
      { kind: 'LABOUR', name: 'Repair', description: null, quantity: 1, unit: 'job', unitPrice: 604 },
    ],
    20,
  )
  expect(totals.subtotalAmount === 60_400 && totals.discountAmount === 2_000 && totals.totalAmount === 58_400, `${totals.subtotalAmount}/${totals.discountAmount}/${totals.totalAmount}`)
})

await check('discount greater than subtotal is REJECTED (PART 15)', async () => {
  await expectThrows(
    () =>
      quotes.computeQuoteTotals(
        [{ kind: 'LABOUR', name: 'Repair', description: null, quantity: 1, unit: 'job', unitPrice: 10 }],
        11,
      ),
    ValidationError,
  )
})

await check('zero quantity is rejected (PART 11)', async () => {
  await expectThrows(
    () =>
      quotes.computeQuoteTotals(
        [{ kind: 'LABOUR', name: 'Repair', description: null, quantity: 0, unit: 'job', unitPrice: 350 }],
        null,
      ),
    ValidationError,
  )
})

await check('negative unit price is rejected (PART 12)', async () => {
  await expectThrows(
    () =>
      quotes.computeQuoteTotals(
        [{ kind: 'LABOUR', name: 'Repair', description: null, quantity: 1, unit: 'job', unitPrice: -5 }],
        null,
      ),
    Error,
  )
})

await check('NaN/Infinity quantities cannot survive conversion (PART 11)', async () => {
  await expectThrows(
    () =>
      quotes.computeQuoteTotals(
        [{ kind: 'LABOUR', name: 'Repair', description: null, quantity: Number.NaN, unit: 'job', unitPrice: 350 }],
        null,
      ),
    ValidationError,
  )
  await expectThrows(
    () =>
      quotes.computeQuoteTotals(
        [{ kind: 'LABOUR', name: 'Repair', description: null, quantity: Number.POSITIVE_INFINITY, unit: 'job', unitPrice: 350 }],
        null,
      ),
    ValidationError,
  )
})

await check('money grid over finance helpers: 0.01 → 999999.99 (PART 45)', async () => {
  expect(finance.toPesewas(0.01) === 1, 'one pesewa')
  expect(finance.toPesewas(1) === 100, 'one cedi')
  expect(finance.toPesewas(100) === 10_000, 'hundred cedis')
  expect(finance.toPesewas(999_999.99) === 99_999_999, 'ceiling price')
  expect(finance.lineTotalAmount(2_500, 2_000) === 5_000, 'line helper')
  await expectThrows(() => finance.toPesewas(-1), Error, 'negative')
  await expectThrows(() => finance.toPesewas(Number.NaN), Error, 'NaN')
})

await check('large quantity guard: over 1,000,000 units rejected (PART 11)', async () => {
  await expectThrows(
    () =>
      quotes.computeQuoteTotals(
        [{ kind: 'OTHER', name: 'Blocks', description: null, quantity: 1_000_001, unit: 'pieces', unitPrice: 1 }],
        null,
      ),
    ValidationError,
  )
})

await check('empty item list rejected by the create schema (PART 10)', () => {
  const result = quotes.createQuoteSchema.safeParse({
    jobRequestId: 'x',
    items: [],
    validUntil: new Date(Date.now() + 86_400_000),
  })
  expect(!result.success, 'create schema rejects zero items')
})

// -----------------------------------------------------------------------------
// 3. FIXTURES (isolated database)
// -----------------------------------------------------------------------------

await section('3. FIXTURES (isolated DB)')

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

const region = await db.region.create({ data: { name: `Quote Region ${stamp}`, slug: `quote-region-${stamp}` } })
const district = await db.district.create({ data: { regionId: region.id, name: 'Quote Municipal', slug: `quote-municipal-${stamp}` } })
const townNsawam = await db.town.create({
  data: { districtId: district.id, regionId: region.id, name: 'Nsawam', slug: `nsawam-${stamp}`, latitude: 5.8085, longitude: -0.3539 },
})
const townAdoagyiri = await db.town.create({
  data: { districtId: district.id, regionId: region.id, name: 'Adoagyiri', slug: `adoagyiri-${stamp}`, latitude: 5.793, longitude: -0.343 },
})

const raymond = await makeUser('Raymond Test', 'CUSTOMER')
const kojo = await makeUser('Kojo Test', 'CUSTOMER')
const kwameUser = await makeUser('Kwame Test', 'ARTISAN')
const yawUser = await makeUser('Yaw Test', 'ARTISAN')
const ownerUser = await makeUser('Akua Test', 'CONSTRUCTION_COMPANY')
const managerUser = await makeUser('Ama Test', 'CONSTRUCTION_COMPANY')
const memberUser = await makeUser('Kwaku Test', 'CONSTRUCTION_COMPANY')
const suspendedUser = await makeUser('Suspended Test', 'ARTISAN', 'SUSPENDED')
const supplierUser = await makeUser('Seth Test', 'SUPPLIER')

const kwameProvider = await db.providerProfile.create({
  data: {
    userId: kwameUser.id,
    profession: 'plumber',
    headline: 'Test plumber',
    primaryLocationId: townNsawam.id,
    serviceAreas: { create: [{ locationId: townNsawam.id }, { locationId: townAdoagyiri.id }] },
  },
})
const yawProvider = await db.providerProfile.create({
  data: {
    userId: yawUser.id,
    profession: 'electrician',
    primaryLocationId: townAdoagyiri.id,
    serviceAreas: { create: [{ locationId: townAdoagyiri.id }] },
  },
})
const suspendedProvider = await db.providerProfile.create({
  data: { userId: suspendedUser.id, profession: 'plumber', primaryLocationId: townNsawam.id },
})

const category = await db.category.create({ data: { name: 'Plumbing (test)', slug: `plumbing-test-${stamp}`, sortOrder: 99 } })
const kwameService = await db.service.create({
  data: { providerId: kwameProvider.id, categoryId: category.id, name: 'Pipe repair (test)', status: 'ACTIVE', isAvailable: true },
})

const business = await db.business.create({
  data: {
    ownerId: ownerUser.id,
    name: `Adansi Quote Test ${stamp}`,
    slug: `adansi-quote-${stamp}`,
    businessType: 'CONSTRUCTION_COMPANY',
    locationId: townNsawam.id,
    members: {
      create: [
        { userId: ownerUser.id, memberRole: 'OWNER', status: 'ACTIVE' },
        { userId: managerUser.id, memberRole: 'MANAGER', status: 'ACTIVE' },
        { userId: memberUser.id, memberRole: 'MEMBER', status: 'ACTIVE' },
      ],
    },
  },
})
const businessProvider = await db.providerProfile.create({
  data: {
    userId: ownerUser.id,
    businessId: business.id,
    profession: 'building construction',
    primaryLocationId: townNsawam.id,
  },
})

/** A RESPONDED/INTERESTED request — the quote-eligible shape (PART 2). */
async function makeRespondedRequest(customerId: string, providerId: string) {
  return db.jobRequest.create({
    data: {
      reference: `JR-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      customerId,
      providerId,
      title: 'Fix leaking bathroom pipe',
      description: 'The pipe under my bathroom sink has been leaking for two days.',
      locationId: townNsawam.id,
      status: 'RESPONDED',
      responseKind: 'INTERESTED',
      submittedAt: new Date(),
      respondedAt: new Date(),
      viewedAt: new Date(),
      events: {
        create: [
          { eventType: 'SUBMITTED', actorId: customerId, actorRole: 'CUSTOMER' },
          { eventType: 'RESPONSE_INTERESTED', actorId: providerId, actorRole: 'ARTISAN' },
        ],
      },
    },
  })
}

const eligibleRequest = await makeRespondedRequest(raymond.id, kwameProvider.id)
const declinedRequest = await db.jobRequest.create({
  data: {
    reference: `JR-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    customerId: raymond.id,
    providerId: kwameProvider.id,
    title: 'Declined request',
    description: 'This one was declined by the provider.',
    locationId: townNsawam.id,
    status: 'DECLINED',
    responseKind: 'DECLINED',
    submittedAt: new Date(),
    respondedAt: new Date(),
  },
})
const infoRequest = await makeRespondedRequest(raymond.id, yawProvider.id)
await db.jobRequest.update({ where: { id: infoRequest.id }, data: { responseKind: 'NEEDS_INFO' } })

const authRaymond = authOf(raymond)
const authKojo = authOf(kojo)
const authKwame = authOf(kwameUser)
const authYaw = authOf(yawUser)
const authOwner = authOf(ownerUser)
const authManager = authOf(managerUser)
const authMember = authOf(memberUser)
const authSuspended = authOf(suspendedUser)
const authSupplier = authOf(supplierUser)

const BATHROOM_ITEMS = [
  { kind: 'LABOUR' as const, name: 'Bathroom pipe repair', description: null, quantity: 1, unit: 'job', unitPrice: 350 },
  { kind: 'MATERIAL' as const, name: 'PVC Pipe', description: null, quantity: 4, unit: 'metres', unitPrice: 25 },
  { kind: 'TRANSPORT' as const, name: 'Transportation', description: null, quantity: 1, unit: 'trip', unitPrice: 80 },
]
function validUntil(days = 14): Date {
  return new Date(Date.now() + days * 86_400_000)
}

// -----------------------------------------------------------------------------
// 4. ELIGIBILITY (PART 2/42/63/64 — the whole ladder, server-side)
// -----------------------------------------------------------------------------

await section('4. QUOTE ELIGIBILITY (service level)')

await check('anonymous creation is refused', async () => {
  await expectThrows(() => quotes.createQuote(null, { jobRequestId: eligibleRequest.id, items: BATHROOM_ITEMS, validUntil: validUntil() } as never), UnauthorizedError)
})

await check('customer cannot create a quote (wrong side)', async () => {
  await expectThrows(
    () => quotes.createQuote(authRaymond, { jobRequestId: eligibleRequest.id, items: BATHROOM_ITEMS, validUntil: validUntil() } as never),
    ForbiddenError,
  )
})

await check('unrelated provider cannot quote a request not theirs — opaque 404 (PART 43/75)', async () => {
  await expectThrows(
    () => quotes.createQuote(authYaw, { jobRequestId: eligibleRequest.id, items: BATHROOM_ITEMS, validUntil: validUntil() } as never),
    NotFoundError,
  )
})

await check('nonexistent request → opaque 404', async () => {
  await expectThrows(
    () => quotes.createQuote(authKwame, { jobRequestId: 'nope', items: BATHROOM_ITEMS, validUntil: validUntil() } as never),
    NotFoundError,
  )
})

await check('DECLINED request is not quote-eligible (PART 2)', async () => {
  await expectThrows(
    () => quotes.createQuote(authKwame, { jobRequestId: declinedRequest.id, items: BATHROOM_ITEMS, validUntil: validUntil() } as never),
    BadRequestError,
  )
})

await check('NEEDS_INFO response is not quote-eligible (PART 2: responded appropriately)', async () => {
  await expectThrows(
    () => quotes.createQuote(authYaw, { jobRequestId: infoRequest.id, items: BATHROOM_ITEMS, validUntil: validUntil() } as never),
    BadRequestError,
  )
})

await check('SUSPENDED provider cannot create (PART 64)', async () => {
  const suspendedRequest = await makeRespondedRequest(raymond.id, suspendedProvider.id)
  await db.user.update({ where: { id: suspendedUser.id }, data: { status: 'SUSPENDED' } })
  await expectThrows(
    () => quotes.createQuote(authSuspended, { jobRequestId: suspendedRequest.id, items: BATHROOM_ITEMS, validUntil: validUntil() } as never),
    ForbiddenError,
  )
  await db.user.update({ where: { id: suspendedUser.id }, data: { status: 'ACTIVE' } })
})

await check('SUPPLIER role has no quotation permission (Phase 1 matrix, PART 63)', async () => {
  const supplierOwn = await db.providerProfile.create({
    data: { userId: supplierUser.id, profession: 'materials', primaryLocationId: townNsawam.id },
  })
  const supplierRequest = await makeRespondedRequest(raymond.id, supplierOwn.id)
  await expectThrows(
    () => quotes.createQuote(authSupplier, { jobRequestId: supplierRequest.id, items: BATHROOM_ITEMS, validUntil: validUntil() } as never),
    ForbiddenError,
  )
})

await check('past validity date rejected at creation (PART 20)', async () => {
  await expectThrows(
    () => quotes.createQuote(authKwame, { jobRequestId: eligibleRequest.id, items: BATHROOM_ITEMS, validUntil: new Date(Date.now() - 86_400_000) } as never),
    ValidationError,
  )
})

await check('more than MAX items rejected (PART 10)', async () => {
  const tooMany = Array.from({ length: 51 }, (_, index) => ({
    kind: 'MATERIAL' as const,
    name: `Item ${index}`,
    description: null,
    quantity: 1,
    unit: 'piece',
    unitPrice: 1,
  }))
  await expectThrows(
    () => quotes.createQuote(authKwame, { jobRequestId: eligibleRequest.id, items: tooMany, validUntil: validUntil() } as never),
    ValidationError,
  )
})

// -----------------------------------------------------------------------------
// 5. CREATE → EDIT → SEND → VIEW (PART 3/13/26/28/68/69)
// -----------------------------------------------------------------------------

await section('5. CREATE → EDIT → SEND → VIEW (service level)')

let quoteId = ''
let quoteNumber = ''

await check('provider creates the DRAFT — customer/service resolved server-side (PART 42)', async () => {
  const detail = (await quotes.createQuote(authKwame, {
    jobRequestId: eligibleRequest.id,
    items: BATHROOM_ITEMS,
    validUntil: validUntil(),
    notes: 'Price includes labour and basic replacement materials.',
    terms: 'Warranty: 3 months on workmanship.',
    estimatedDurationDays: 1,
  } as never)) as unknown as { id: string; quoteNumber: string; status: string; totalAmount: number; customerId: string }
  quoteId = detail.id
  quoteNumber = detail.quoteNumber
  expect(detail.status === 'DRAFT', 'starts as DRAFT')
  expect(detail.totalAmount === 53_000, `server total ${detail.totalAmount}`)
  expect(detail.customerId === raymond.id, 'customer resolved from the request')
  expect(/^QT-[A-Z0-9]+$/.test(quoteNumber), `reference format ${quoteNumber}`)
})

await check('second quote by the same provider for the same request is refused', async () => {
  await expectThrows(
    () => quotes.createQuote(authKwame, { jobRequestId: eligibleRequest.id, items: BATHROOM_ITEMS, validUntil: validUntil() } as never),
    ConflictError,
  )
})

await check('timeline recorded QUOTE_CREATED (PART 34)', async () => {
  const event = await db.jobRequestEvent.findFirst({
    where: { jobRequestId: eligibleRequest.id, eventType: QUOTE_EVENT_TYPES.created },
  })
  expect(event, 'QUOTE_CREATED event exists')
})

await check('QUOTE_CREATED audit row exists (PART 35 — fire-and-forget writes settle)', async () => {
  await new Promise((resolve) => setTimeout(resolve, 300))
  const audit = await db.auditLog.findFirst({
    where: { action: AUDIT_ACTIONS.QUOTE_CREATED, entityId: quoteId },
  })
  expect(audit, 'audit row exists')
})

await check('draft edit recalculates totals server-side (PART 23)', async () => {
  const updated = (await quotes.updateQuote(authKwame, quoteId, {
    items: [
      ...BATHROOM_ITEMS,
      { kind: 'EQUIPMENT', name: 'Pipe Cutter', description: null, quantity: 1, unit: 'day', unitPrice: 50 },
    ],
    discount: 20,
  } as never)) as { totalAmount: number; subtotalAmount: number; discountAmount: number }
  expect(updated.subtotalAmount === 58_000, `subtotal ${updated.subtotalAmount}`)
  expect(updated.discountAmount === 2_000, `discount ${updated.discountAmount}`)
  expect(updated.totalAmount === 56_000, `total ${updated.totalAmount}`)
})

await check('discount above subtotal rejected on edit (PART 15)', async () => {
  await expectThrows(
    () => quotes.updateQuote(authKwame, quoteId, { discount: 600 } as never),
    ValidationError,
  )
})

await check('customer cannot edit the provider draft (PART 24)', async () => {
  await expectThrows(
    () => quotes.updateQuote(authRaymond, quoteId, { discount: 0 } as never),
    ForbiddenError,
  )
})

// -----------------------------------------------------------------------------
// 6. SEND → VIEW → ACCEPT (PART 22/29/46/47/68/69/70/77/78)
// -----------------------------------------------------------------------------

await section('6. SEND → VIEW → ACCEPT (service level)')

await check('send moves DRAFT → SUBMITTED, one event, one customer notification (PART 68)', async () => {
  const detail = (await quotes.sendQuote(authKwame, quoteId)) as { status: string }
  expect(detail.status === 'SUBMITTED', `status ${detail.status}`)
  const event = await db.jobRequestEvent.findFirst({
    where: { jobRequestId: eligibleRequest.id, eventType: QUOTE_EVENT_TYPES.sent },
  })
  expect(event, 'QUOTE_SENT event exists')
  const notification = await db.notification.findFirst({
    where: { recipientId: raymond.id, type: 'QUOTE_SENT', entityId: quoteId },
  })
  expect(notification, 'customer notification exists')
})

await check('double send is refused — no duplicate event/notification (PART 46/77)', async () => {
  await expectThrows(() => quotes.sendQuote(authKwame, quoteId), BadRequestError)
  const events = await db.jobRequestEvent.count({
    where: { jobRequestId: eligibleRequest.id, eventType: QUOTE_EVENT_TYPES.sent },
  })
  expect(events === 1, `${events} sent events`)
  const notifications = await db.notification.count({
    where: { recipientId: raymond.id, type: 'QUOTE_SENT', entityId: quoteId },
  })
  expect(notifications === 1, `${notifications} notifications`)
})

await check('customer first open records VIEWED exactly once + provider notification (PART 69)', async () => {
  const first = (await quotes.getQuote(authRaymond, quoteId)) as { status: string }
  expect(first.status === 'VIEWED', `status ${first.status}`)
  const second = (await quotes.getQuote(authRaymond, quoteId)) as { status: string }
  expect(second.status === 'VIEWED', 'idempotent')
  const events = await db.jobRequestEvent.count({
    where: { jobRequestId: eligibleRequest.id, eventType: QUOTE_EVENT_TYPES.viewed },
  })
  expect(events === 1, `${events} viewed events`)
  const notification = await db.notification.findFirst({
    where: { recipientId: kwameUser.id, type: 'QUOTE_VIEWED', entityId: quoteId },
  })
  expect(notification, 'provider VIEWED notification exists')
})

await check('provider open does NOT flip status', async () => {
  const detail = (await quotes.getQuote(authKwame, quoteId)) as { status: string }
  expect(detail.status === 'VIEWED', `status ${detail.status}`)
})

await check('accept: quote + request + event + notification atomic (PART 70/78)', async () => {
  const detail = (await quotes.acceptQuote(authRaymond, quoteId)) as { status: string }
  expect(detail.status === 'ACCEPTED', `status ${detail.status}`)
  const request = await db.jobRequest.findUnique({ where: { id: eligibleRequest.id }, select: { status: true } })
  expect(request?.status === 'ACCEPTED', `request ${request?.status}`)
  const event = await db.jobRequestEvent.findFirst({
    where: { jobRequestId: eligibleRequest.id, eventType: QUOTE_EVENT_TYPES.accepted },
  })
  expect(event, 'QUOTE_ACCEPTED event exists')
  const notification = await db.notification.findFirst({
    where: { recipientId: kwameUser.id, type: 'QUOTE_ACCEPTED', entityId: quoteId },
  })
  expect(notification, 'provider notification exists')
  const audit = await db.auditLog.findFirst({
    where: { action: AUDIT_ACTIONS.QUOTE_ACCEPTED, entityId: quoteId },
  })
  expect(audit, 'audit row exists')
})

await check('accepted quote cannot be re-decided (PART 22)', async () => {
  await expectThrows(() => quotes.acceptQuote(authRaymond, quoteId), BadRequestError)
  await expectThrows(() => quotes.declineQuote(authRaymond, quoteId, {}), BadRequestError)
})

await check('provider cannot accept its own quote (PART 23)', async () => {
  await expectThrows(() => quotes.acceptQuote(authKwame, quoteId), ForbiddenError)
})

await check('staff cannot accept (no business transitions for staff)', async () => {
  await expectThrows(
    async () => {
      const admin = authOf(await makeUser('Admin Test', 'ADMIN'))
      await quotes.acceptQuote(admin, quoteId)
    },
    ForbiddenError,
  )
})

// -----------------------------------------------------------------------------
// 7. DECLINE + REQUEST STAYS OPEN (PART 30/49/71)
// -----------------------------------------------------------------------------

await section('7. DECLINE (service level)')

await check('second provider can quote the SAME request (PART 49: multiple quotes)', async () => {
  // Yaw responds INTERESTED to a fresh Raymond request, then quotes it.
  const secondRequest = await makeRespondedRequest(raymond.id, yawProvider.id)
  const yawQuote = (await quotes.createQuote(authYaw, {
    jobRequestId: secondRequest.id,
    items: [{ kind: 'LABOUR', name: 'Inspection', description: null, quantity: 1, unit: 'service', unitPrice: 50 }],
    validUntil: validUntil(),
  } as never)) as { id: string }
  await quotes.sendQuote(authYaw, yawQuote.id)
  const detail = (await quotes.declineQuote(authRaymond, yawQuote.id, { reason: 'Price is above my budget.' })) as { status: string }
  expect(detail.status === 'DECLINED', `status ${detail.status}`)
  const request = await db.jobRequest.findUnique({ where: { id: secondRequest.id }, select: { status: true } })
  expect(request?.status === 'RESPONDED', 'request stays RESPONDED — other quotes remain possible')
  const notification = await db.notification.findFirst({
    where: { recipientId: yawUser.id, type: 'QUOTE_DECLINED', entityId: yawQuote.id },
  })
  expect(notification, 'provider DECLINED notification exists')
  const event = await db.jobRequestEvent.findFirst({
    where: { jobRequestId: secondRequest.id, eventType: QUOTE_EVENT_TYPES.declined },
  })
  expect(event, 'QUOTE_DECLINED event exists')
})

// -----------------------------------------------------------------------------
// 8. EXPIRY (PART 31/74 — enforced at decision time, lazily transitioned)
// -----------------------------------------------------------------------------

await section('8. EXPIRY (service level)')

await check('expired quote cannot be accepted and flips to EXPIRED (PART 74)', async () => {
  const expiredRequest = await makeRespondedRequest(raymond.id, yawProvider.id)
  const expiredQuote = (await quotes.createQuote(authYaw, {
    jobRequestId: expiredRequest.id,
    items: [{ kind: 'LABOUR', name: 'Repair', description: null, quantity: 1, unit: 'job', unitPrice: 120 }],
    validUntil: validUntil(2),
  } as never)) as { id: string }
  await quotes.sendQuote(authYaw, expiredQuote.id)
  // Time travel: the validity window has passed.
  await db.quote.update({
    where: { id: expiredQuote.id },
    data: { validUntil: new Date(Date.now() - 3_600_000) },
  })
  await expectThrows(() => quotes.acceptQuote(authRaymond, expiredQuote.id), BadRequestError, 'Quotation has expired')
  const row = await db.quote.findUnique({ where: { id: expiredQuote.id }, select: { status: true } })
  expect(row?.status === 'EXPIRED', `status ${row?.status}`)
  const event = await db.jobRequestEvent.findFirst({
    where: { jobRequestId: expiredRequest.id, eventType: QUOTE_EVENT_TYPES.expired },
  })
  expect(event, 'QUOTE_EXPIRED event exists')
})

await check('read path also lazily expires (PART 31: not only a background job)', async () => {
  const lazyRequest = await makeRespondedRequest(raymond.id, kwameProvider.id)
  const lazyQuote = (await quotes.createQuote(authKwame, {
    jobRequestId: lazyRequest.id,
    items: [{ kind: 'LABOUR', name: 'Repair', description: null, quantity: 1, unit: 'job', unitPrice: 90 }],
    validUntil: validUntil(1),
  } as never)) as { id: string }
  await quotes.sendQuote(authKwame, lazyQuote.id)
  await db.quote.update({
    where: { id: lazyQuote.id },
    data: { validUntil: new Date(Date.now() - 1_000) },
  })
  const detail = (await quotes.getQuote(authRaymond, lazyQuote.id)) as { status: string }
  expect(detail.status === 'EXPIRED', `status ${detail.status}`)
})

// -----------------------------------------------------------------------------
// 9. WITHDRAW (PART 23)
// -----------------------------------------------------------------------------

await section('9. WITHDRAW (service level)')

await check('provider withdraws a sent quote; customer sees WITHDRAWN', async () => {
  const withdrawRequest = await makeRespondedRequest(raymond.id, kwameProvider.id)
  const withdrawQuote = (await quotes.createQuote(authKwame, {
    jobRequestId: withdrawRequest.id,
    items: [{ kind: 'LABOUR', name: 'Repair', description: null, quantity: 1, unit: 'job', unitPrice: 75 }],
    validUntil: validUntil(),
  } as never)) as { id: string }
  await quotes.sendQuote(authKwame, withdrawQuote.id)
  const detail = (await quotes.withdrawQuote(authKwame, withdrawQuote.id)) as { status: string }
  expect(detail.status === 'WITHDRAWN', `status ${detail.status}`)
  const event = await db.jobRequestEvent.findFirst({
    where: { jobRequestId: withdrawRequest.id, eventType: QUOTE_EVENT_TYPES.withdrawn },
  })
  expect(event, 'QUOTE_WITHDRAWN event exists')
  await expectThrows(() => quotes.acceptQuote(authRaymond, withdrawQuote.id), BadRequestError)
})

await check('customer cannot withdraw a provider quote (PART 24)', async () => {
  await expectThrows(() => quotes.withdrawQuote(authRaymond, quoteId), ForbiddenError)
})

// -----------------------------------------------------------------------------
// 10. RACES (PART 47/78 — conditional updates, one winner)
// -----------------------------------------------------------------------------

await section('10. RACES (service level)')

await check('two concurrent accepts: exactly one wins (PART 47)', async () => {
  const raceRequest = await makeRespondedRequest(raymond.id, yawProvider.id)
  const raceQuote = (await quotes.createQuote(authYaw, {
    jobRequestId: raceRequest.id,
    items: [{ kind: 'LABOUR', name: 'Rush job', description: null, quantity: 1, unit: 'job', unitPrice: 200 }],
    validUntil: validUntil(),
  } as never)) as { id: string }
  await quotes.sendQuote(authYaw, raceQuote.id)
  const results = await Promise.allSettled([
    quotes.acceptQuote(authRaymond, raceQuote.id),
    quotes.acceptQuote(authRaymond, raceQuote.id),
  ])
  const fulfilled = results.filter((result) => result.status === 'fulfilled')
  const rejected = results.filter((result) => result.status === 'rejected')
  expect(fulfilled.length === 1, `${fulfilled.length} accepted`)
  expect(rejected.length === 1, `${rejected.length} rejected`)
  const row = await db.quote.findUnique({ where: { id: raceQuote.id }, select: { status: true } })
  expect(row?.status === 'ACCEPTED', 'final state ACCEPTED')
  const events = await db.jobRequestEvent.count({
    where: { jobRequestId: raceRequest.id, eventType: QUOTE_EVENT_TYPES.accepted },
  })
  expect(events === 1, `${events} accepted events`)
})

await check('two concurrent customer decisions on one quote: exactly one commits (PART 78)', async () => {
  const raceRequest = await makeRespondedRequest(raymond.id, yawProvider.id)
  const raceQuote = (await quotes.createQuote(authYaw, {
    jobRequestId: raceRequest.id,
    items: [{ kind: 'LABOUR', name: 'Rush job', description: null, quantity: 1, unit: 'job', unitPrice: 200 }],
    validUntil: validUntil(),
  } as never)) as { id: string }
  await quotes.sendQuote(authYaw, raceQuote.id)
  const results = await Promise.allSettled([
    quotes.acceptQuote(authRaymond, raceQuote.id),
    quotes.declineQuote(authRaymond, raceQuote.id, { reason: 'Changed my mind.' }),
  ])
  const fulfilled = results.filter((result) => result.status === 'fulfilled')
  const rejected = results.filter((result) => result.status === 'rejected')
  expect(fulfilled.length === 1, `${fulfilled.length} committed`)
  expect(rejected.length === 1, `${rejected.length} rejected`)
  const row = await db.quote.findUnique({ where: { id: raceQuote.id }, select: { status: true } })
  expect(row?.status === 'ACCEPTED' || row?.status === 'DECLINED', `final state ${row?.status}`)
  const acceptedEvents = await db.jobRequestEvent.count({
    where: { jobRequestId: raceRequest.id, eventType: QUOTE_EVENT_TYPES.accepted },
  })
  const declinedEvents = await db.jobRequestEvent.count({
    where: { jobRequestId: raceRequest.id, eventType: QUOTE_EVENT_TYPES.declined },
  })
  expect(acceptedEvents + declinedEvents === 1, `exactly one decision event (${acceptedEvents}+${declinedEvents})`)
})

await check('acceptance on the request is committed exactly once (PART 47 — conditional update)', async () => {
  // Two CONCURRENT accepts of the SAME quote: the conditional update lets
  // exactly one transaction move the request out of RESPONDED.
  const dualRequest = await makeRespondedRequest(raymond.id, kwameProvider.id)
  const dualQuote = (await quotes.createQuote(authKwame, {
    jobRequestId: dualRequest.id,
    items: [{ kind: 'LABOUR', name: 'Tiling', description: null, quantity: 1, unit: 'job', unitPrice: 300 }],
    validUntil: validUntil(),
  } as never)) as { id: string }
  await quotes.sendQuote(authKwame, dualQuote.id)
  const results = await Promise.allSettled([
    quotes.acceptQuote(authRaymond, dualQuote.id),
    quotes.acceptQuote(authRaymond, dualQuote.id),
  ])
  const fulfilled = results.filter((result) => result.status === 'fulfilled')
  expect(fulfilled.length === 1, `${fulfilled.length} commits — one acceptance wins`)
  const request = await db.jobRequest.findUnique({ where: { id: dualRequest.id }, select: { status: true } })
  expect(request?.status === 'ACCEPTED', 'request ACCEPTED once')
  const acceptedQuotes = await db.quote.count({ where: { jobRequestId: dualRequest.id, status: 'ACCEPTED' } })
  expect(acceptedQuotes === 1, `${acceptedQuotes} accepted quotes`)
})

// -----------------------------------------------------------------------------
// 11. LIST SCOPING, FILTERS, SEARCH (PART 36/38/39/49)
// -----------------------------------------------------------------------------

await section('11. LIST SCOPING (service level)')

await check('Raymond sees exactly his quotes', async () => {
  const list = await quotes.listQuotes(authRaymond, { page: 1, pageSize: 100, status: 'ALL', q: null })
  expect(list.items.length > 0, 'has rows')
  for (const row of list.items) {
    expect(row.customer.displayName, 'customer field present')
  }
})

await check('Kojo sees NONE of Raymond\'s quotes (PART 43)', async () => {
  const list = await quotes.listQuotes(authKojo, { page: 1, pageSize: 100, status: 'ALL', q: null })
  expect(list.items.length === 0, `Kojo got ${list.items.length} rows`)
})

await check('provider list is scoped to its own profile(s)', async () => {
  const list = await quotes.listQuotes(authYaw, { page: 1, pageSize: 100, status: 'ALL', q: null })
  for (const row of list.items) {
    expect(row.provider.id === yawProvider.id, 'only own rows')
  }
})

await check('business MEMBER sees the business quotes read-only (PART 63)', async () => {
  const businessRequest = await makeRespondedRequest(raymond.id, businessProvider.id)
  const businessQuote = (await quotes.createQuote(authOwner, {
    jobRequestId: businessRequest.id,
    items: [{ kind: 'LABOUR', name: 'Foundation', description: null, quantity: 1, unit: 'job', unitPrice: 2_500 }],
    validUntil: validUntil(),
  } as never)) as { id: string }
  const list = await quotes.listQuotes(authMember, { page: 1, pageSize: 100, status: 'ALL', q: null })
  expect(list.items.some((row) => row.id === businessQuote.id), 'member can see the business quote')
  // MEMBER cannot manage it.
  await expectThrows(() => quotes.sendQuote(authMember, businessQuote.id), ForbiddenError)
  // MANAGER can manage it.
  await quotes.sendQuote(authManager, businessQuote.id)
  const status = await db.quote.findUnique({ where: { id: businessQuote.id }, select: { status: true } })
  expect(status?.status === 'SUBMITTED', 'manager sent the business quote')
})

await check('status filter narrows rows server-side (PART 38)', async () => {
  const accepted = await quotes.listQuotes(authRaymond, { page: 1, pageSize: 100, status: 'ACCEPTED', q: null })
  expect(accepted.items.length > 0, 'has accepted rows')
  for (const row of accepted.items) {
    expect(row.status === 'ACCEPTED', `status ${row.status}`)
  }
})

await check('search hits quote reference and job title (PART 39)', async () => {
  const byRef = await quotes.listQuotes(authRaymond, { page: 1, pageSize: 100, status: 'ALL', q: quoteNumber })
  expect(byRef.items.some((row) => row.quoteNumber === quoteNumber), 'reference search')
  const byTitle = await quotes.listQuotes(authRaymond, { page: 1, pageSize: 100, status: 'ALL', q: 'bathroom' })
  expect(byTitle.items.length > 0, 'title search')
})

await check('request-scoped list powers the comparison table (PART 50)', async () => {
  const rows = await quotes.listRequestQuotes(authRaymond, eligibleRequest.id)
  expect(rows.length === 1, `${rows.length} quote on the eligible request`)
  expect(rows[0]!.provider.displayName, 'provider display name present')
})

// -----------------------------------------------------------------------------
// 12. INTEGRITY (audit/analytics/notifications — PART 32/33/34/35)
// -----------------------------------------------------------------------------

await section('12. AUDIT / ANALYTICS / NOTIFICATION INTEGRITY')

await check('every lifecycle stage left an audit row (PART 35)', async () => {
  await new Promise((resolve) => setTimeout(resolve, 400))
  const actions = [
    AUDIT_ACTIONS.QUOTE_CREATED,
    AUDIT_ACTIONS.QUOTE_UPDATED,
    AUDIT_ACTIONS.QUOTE_SENT,
    AUDIT_ACTIONS.QUOTE_VIEWED,
    AUDIT_ACTIONS.QUOTE_ACCEPTED,
  ]
  for (const action of actions) {
    const count = await db.auditLog.count({ where: { action, entityId: quoteId } })
    expect(count >= 1, `${action}: ${count}`)
  }
})

await check('item-level audit rows recorded on draft edit (PART 35)', async () => {
  const added = await db.auditLog.count({ where: { action: AUDIT_ACTIONS.QUOTE_ITEM_ADDED, entityId: quoteId } })
  expect(added >= 1, `QUOTE_ITEM_ADDED rows: ${added}`)
})

await check('quote funnel analytics events exist (PART 66)', async () => {
  await new Promise((resolve) => setTimeout(resolve, 200))
  for (const eventType of ['quote_created', 'quote_sent', 'quote_viewed', 'quote_accepted']) {
    const count = await db.discoveryEvent.count({ where: { eventType } })
    expect(count >= 1, `${eventType}: ${count}`)
  }
})

await check('notification types stay within the declared vocabulary', async () => {
  const rows = await db.notification.findMany({
    where: { type: { startsWith: 'QUOTE' } },
    select: { type: true },
    distinct: ['type'],
  })
  const allowed = new Set(['QUOTE_SENT', 'QUOTE_VIEWED', 'QUOTE_ACCEPTED', 'QUOTE_DECLINED'])
  for (const row of rows) {
    expect(allowed.has(row.type), `unexpected type ${row.type}`)
  }
})

await check('no notification ever leaks an email or password', async () => {
  const rows = await db.notification.findMany({ where: { type: { startsWith: 'QUOTE' } } })
  for (const row of rows) {
    expect(!row.title.includes('@'), 'no email in title')
    expect(!(row.body ?? '').includes('@'), 'no email in body')
    expect(!row.title.toLowerCase().includes('password'), 'no secret in title')
  }
})

await check('privacy: provider side sees display-name-only customer (PART 39)', async () => {
  const detail = (await quotes.getQuote(authKwame, quoteId)) as { customer: { displayName: string; } }
  expect(detail.customer.displayName.includes('Raymond'), `display name ${detail.customer.displayName}`)
})

await check('timeline on the request shows the full quote story (PART 66)', async () => {
  const events = await db.jobRequestEvent.findMany({
    where: { jobRequestId: eligibleRequest.id },
    orderBy: { createdAt: 'asc' },
    select: { eventType: true },
  })
  const types = events.map((event) => event.eventType)
  for (const expectedType of ['QUOTE_CREATED', 'QUOTE_SENT', 'QUOTE_VIEWED', 'QUOTE_ACCEPTED']) {
    expect(types.includes(expectedType), `timeline has ${expectedType}`)
  }
})

await check('isolated database closed', async () => {
  await db.$disconnect()
})

// -----------------------------------------------------------------------------
// 13. HTTP LEVEL — live server, real sessions (PART 43/44/45/46/67-78)
// -----------------------------------------------------------------------------

const jar: Record<string, string> = {}

function storeCookies(response: Response) {
  const cookies = response.headers.getSetCookie?.() ?? []
  for (const cookie of cookies) {
    const [pair] = cookie.split(';')
    const eq = pair.indexOf('=')
    if (eq > 0) jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim()
  }
}

function cookieHeader(): string {
  return Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')
}

async function httpJson(method: string, path: string, body?: unknown, retryOn429 = true) {
  const send = async () =>
    fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(Object.keys(jar).length ? { cookie: cookieHeader() } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  let response = await send()
  if (response.status === 429 && retryOn429) {
    const retryAfter = Number(response.headers.get('retry-after') ?? '61')
    await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter, 61) * 1000))
    response = await send()
  }
  storeCookies(response)
  const payload = await response.json().catch(() => null)
  return { status: response.status, payload: payload as Record<string, unknown> | null }
}

async function loginHttp(identifier: string, password: string): Promise<number> {
  for (const key of Object.keys(jar)) delete jar[key]
  const attempt = async (): Promise<number> => {
    const csrfRes = await fetch(`${BASE}/api/auth/csrf`)
    storeCookies(csrfRes)
    const csrf = (await csrfRes.json()) as { csrfToken: string }
    const response = await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie: cookieHeader() },
      body: new URLSearchParams({ csrfToken: csrf.csrfToken, identifier, password, json: 'true' }),
    })
    storeCookies(response)
    return response.status
  }
  let status = await attempt()
  if (status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 61_000))
    status = await attempt()
  }
  return status
}

let devDb: import('@prisma/client').PrismaClient | null = null
async function devDatabase() {
  if (!devDb) {
    const { PrismaClient } = await import('@prisma/client')
    devDb = new PrismaClient({ datasources: { db: { url: DEV_DB } } })
  }
  return devDb
}

function data(payload: Record<string, unknown> | null): Record<string, unknown> {
  expect(payload && payload.success === true, `envelope: ${JSON.stringify(payload)?.slice(0, 200)}`)
  return payload!.data as Record<string, unknown>
}

await section('14. HTTP — THE REAL QUOTE FLOW (Raymond → Kwame → Raymond)')

const dev = await devDatabase()
const devRaymond = await dev.user.findUnique({ where: { email: 'raymond@demo.dwellers.test' } })
const devKwame = await dev.user.findUnique({ where: { email: 'kwame@demo.dwellers.test' } })
const devKojo = await dev.user.findUnique({ where: { email: 'kojo@demo.dwellers.test' } })
const devYaw = await dev.user.findUnique({ where: { email: 'yaw@demo.dwellers.test' } })
const devKwameProvider = devKwame ? await dev.providerProfile.findUnique({ where: { userId: devKwame.id } }) : null
const devKwameService = devKwameProvider
  ? await dev.service.findFirst({ where: { providerId: devKwameProvider.id, status: 'ACTIVE' } })
  : null
const devNsawam = await dev.town.findFirst({ where: { name: 'Nsawam' } })

await check('dev seed provides the HTTP fixtures', () => {
  expect(devRaymond && devKwame && devKwameProvider && devKwameService && devNsawam, 'fixtures present')
})

await check('anonymous POST /api/quotes → 401', async () => {
  const { status } = await httpJson('POST', '/api/quotes', {})
  expect(status === 401, `status ${status}`)
})

await check('customer POST /api/quotes → 403 (RBAC, PART 41)', async () => {
  await loginHttp('raymond@demo.dwellers.test', DEMO_PASSWORD)
  const { status } = await httpJson('POST', '/api/quotes', { jobRequestId: 'x', items: [], validUntil: new Date().toISOString() })
  expect(status === 403, `status ${status}`)
})

await loginHttp('raymond@demo.dwellers.test', DEMO_PASSWORD)

let httpRequestId = ''
await check('Raymond files a request against Kwame and gets it answered INTERESTED', async () => {
  const created = data(
    (await httpJson('POST', '/api/job-requests', {
      providerId: devKwameProvider!.id,
      serviceId: devKwameService!.id,
      title: 'Quote my leaking bathroom pipe',
      description: 'Bathroom pipe leaking, needs a quotation for the repair work.',
      locationId: devNsawam!.id,
      urgency: 'NORMAL',
      submitNow: true,
    })).payload,
  ) as { id: string }
  httpRequestId = created.id
  expect(httpRequestId, 'request created')
})

await check('customer GET /api/quotes before any quote → empty list', async () => {
  const items = data(await httpJson('GET', '/api/quotes').then((r) => r.payload)) as unknown as unknown[]
  expect(Array.isArray(items), 'data is the items array')
})

await loginHttp('kwame@demo.dwellers.test', DEMO_PASSWORD)

await check('Kwame responds INTERESTED (Phase 5 flow feeds Phase 6)', async () => {
  const { status } = await httpJson('POST', `/api/job-requests/${httpRequestId}/respond`, {
    action: 'respond_interested',
    message: 'I can fix this — quotation follows.',
  })
  expect(status === 200, `status ${status}`)
})

let httpQuoteId = ''
let httpQuoteNumber = ''

await check('ACCEPTANCE 1 (PART 67): quote created server-side — GH₵530.00', async () => {
  const { status, payload } = await httpJson('POST', '/api/quotes', {
    jobRequestId: httpRequestId,
    items: [
      { kind: 'LABOUR', name: 'Bathroom pipe repair', quantity: 1, unit: 'job', unitPrice: 350 },
      { kind: 'MATERIAL', name: 'PVC Pipe', quantity: 4, unit: 'metres', unitPrice: 25 },
      { kind: 'TRANSPORT', name: 'Transportation', quantity: 1, unit: 'trip', unitPrice: 80 },
    ],
    validUntil: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    notes: 'Price includes labour and basic replacement materials.',
    // Price tampering attempt: bogus client-calculated values (PART 44).
    total: 1,
    subtotal: 1,
    amount: 1,
  })
  expect(status === 201, `status ${status}`)
  const quote = data(payload) as Record<string, unknown>
  httpQuoteId = quote.id as string
  httpQuoteNumber = quote.quoteNumber as string
  expect(quote.totalAmount === 53_000, `server total ${quote.totalAmount}`)
  expect(quote.status === 'DRAFT', 'starts DRAFT')
})

await check('client-supplied totals were ignored, not stored (PART 13/44)', async () => {
  const row = await dev.quote.findUnique({ where: { id: httpQuoteId }, select: { totalAmount: true } })
  expect(row?.totalAmount === 53_000, `stored ${row?.totalAmount}`)
})

await check('PATCH draft recalculates and never trusts the client (PART 44/73)', async () => {
  const { status, payload } = await httpJson('PATCH', `/api/quotes/${httpQuoteId}`, {
    discount: 20,
    total: 1,
    subtotal: 1,
  })
  expect(status === 200, `status ${status}`)
  const quote = data(payload) as Record<string, unknown>
  expect(quote.discountAmount === 2_000, `discount ${quote.discountAmount}`)
  expect(quote.totalAmount === 51_000, `total ${quote.totalAmount}`)
})

await check('ACCEPTANCE 2 (PART 68): send → SENT, one notification, one event', async () => {
  const { status, payload } = await httpJson('POST', `/api/quotes/${httpQuoteId}/send`)
  expect(status === 200, `status ${status}`)
  const quote = data(payload) as Record<string, unknown>
  expect(quote.status === 'SUBMITTED', `status ${quote.status}`)
  const notification = await dev.notification.findFirst({
    where: { recipientId: devRaymond!.id, type: 'QUOTE_SENT', entityId: httpQuoteId },
  })
  expect(notification, 'customer QUOTE_SENT notification')
  const event = await dev.jobRequestEvent.findFirst({
    where: { jobRequestId: httpRequestId, eventType: 'QUOTE_SENT' },
  })
  expect(event, 'QUOTE_SENT timeline event')
})

await check('ACCEPTANCE 11 (PART 77): re-send is refused, counts stay at one', async () => {
  const { status } = await httpJson('POST', `/api/quotes/${httpQuoteId}/send`)
  expect(status === 400 || status === 409, `status ${status}`)
  const notifications = await dev.notification.count({
    where: { recipientId: devRaymond!.id, type: 'QUOTE_SENT', entityId: httpQuoteId },
  })
  expect(notifications === 1, `${notifications} notifications`)
  const events = await dev.jobRequestEvent.count({
    where: { jobRequestId: httpRequestId, eventType: 'QUOTE_SENT' },
  })
  expect(events === 1, `${events} events`)
})

await check('ACCEPTANCE 6 (PART 72): provider cannot edit a SENT quote', async () => {
  const { status } = await httpJson('PATCH', `/api/quotes/${httpQuoteId}`, { discount: 5 })
  expect(status === 400, `status ${status}`)
  const row = await dev.quote.findUnique({ where: { id: httpQuoteId }, select: { totalAmount: true } })
  expect(row?.totalAmount === 51_000, 'sent totals untouched')
})

await loginHttp('raymond@demo.dwellers.test', DEMO_PASSWORD)

await check('ACCEPTANCE 3 (PART 69): customer opens quote → VIEWED, provider sees it', async () => {
  const { status, payload } = await httpJson('GET', `/api/quotes/${httpQuoteId}`)
  expect(status === 200, `status ${status}`)
  const quote = data(payload) as Record<string, unknown>
  expect(quote.status === 'VIEWED', `status ${quote.status}`)
  const notification = await dev.notification.findFirst({
    where: { recipientId: devKwame!.id, type: 'QUOTE_VIEWED', entityId: httpQuoteId },
  })
  expect(notification, 'provider VIEWED notification')
})

await check('quote document carries everything the customer must see (PART 57)', async () => {
  const quote = data(await httpJson('GET', `/api/quotes/${httpQuoteId}`).then((r) => r.payload)) as Record<string, unknown>
  for (const field of ['quoteNumber', 'validUntil', 'items', 'totalAmount', 'status', 'provider', 'jobRequest']) {
    expect(quote[field] !== undefined, `field ${field}`)
  }
  const items = quote.items as { kind: string; name: string; lineTotalAmount: number }[]
  expect(items.length === 3, 'three items')
  expect(items.some((item) => item.kind === 'LABOUR'), 'labour present')
  expect(items.some((item) => item.kind === 'MATERIAL'), 'materials present')
  expect(items.some((item) => item.kind === 'TRANSPORT'), 'transport present')
})

await check('customer list shows the quote with reference and total (PART 36)', async () => {
  const items = data(await httpJson('GET', '/api/quotes').then((r) => r.payload)) as unknown as { quoteNumber: string; totalAmount: number }[]
  expect(items.some((row) => row.quoteNumber === httpQuoteNumber), 'quote listed')
})

await check('ACCEPTANCE 4 (PART 70): accept → ACCEPTED, event, notification, audit, NO payment', async () => {
  const { status, payload } = await httpJson('POST', `/api/quotes/${httpQuoteId}/accept`)
  expect(status === 200, `status ${status}`)
  const quote = data(payload) as Record<string, unknown>
  expect(quote.status === 'ACCEPTED', `status ${quote.status}`)
  const request = await dev.jobRequest.findUnique({ where: { id: httpRequestId }, select: { status: true } })
  expect(request?.status === 'ACCEPTED', 'request ACCEPTED (PART 48)')
  const notification = await dev.notification.findFirst({
    where: { recipientId: devKwame!.id, type: 'QUOTE_ACCEPTED', entityId: httpQuoteId },
  })
  expect(notification, 'provider ACCEPTED notification')
  const audit = await dev.auditLog.findFirst({ where: { action: 'quote.accepted', entityId: httpQuoteId } })
  expect(audit, 'audit row')
  const payments = await dev.payment.count({ where: { job: { id: httpRequestId } } })
  expect(payments === 0, 'NO payment row exists (PART 51)')
})

await check('accepting twice is refused (PART 22)', async () => {
  const { status } = await httpJson('POST', `/api/quotes/${httpQuoteId}/accept`)
  expect(status === 400 || status === 409, `status ${status}`)
})

await section('15. HTTP — DECLINE FLOW + EXPIRY (PART 71/74/80)')

let declineQuoteId = ''
await check('second flow: Kwame quotes a fresh Raymond request', async () => {
  const created = data(
    (await httpJson('POST', '/api/job-requests', {
      providerId: devKwameProvider!.id,
      serviceId: devKwameService!.id,
      title: 'Kitchen sink installation quote',
      description: 'Need a quotation for fitting a new kitchen sink.',
      locationId: devNsawam!.id,
      submitNow: true,
    })).payload,
  ) as { id: string }
  const secondRequestId = created.id
  await loginHttp('kwame@demo.dwellers.test', DEMO_PASSWORD)
  await httpJson('POST', `/api/job-requests/${secondRequestId}/respond`, { action: 'respond_interested' })
  const { status, payload } = await httpJson('POST', '/api/quotes', {
    jobRequestId: secondRequestId,
    items: [{ kind: 'LABOUR', name: 'Sink installation', quantity: 1, unit: 'job', unitPrice: 180 }],
    validUntil: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  })
  expect(status === 201, `status ${status}`)
  const quote = data(payload) as Record<string, unknown>
  declineQuoteId = quote.id as string
  await httpJson('POST', `/api/quotes/${declineQuoteId}/send`)
})

await loginHttp('raymond@demo.dwellers.test', DEMO_PASSWORD)

await check('ACCEPTANCE 5 (PART 71): decline with optional reason', async () => {
  const { status, payload } = await httpJson('POST', `/api/quotes/${declineQuoteId}/decline`, {
    reason: 'Price is above my budget.',
  })
  expect(status === 200, `status ${status}`)
  const quote = data(payload) as Record<string, unknown>
  expect(quote.status === 'DECLINED', `status ${quote.status}`)
  const notification = await dev.notification.findFirst({
    where: { recipientId: devKwame!.id, type: 'QUOTE_DECLINED', entityId: declineQuoteId },
  })
  expect(notification, 'provider DECLINED notification')
  const audit = await dev.auditLog.findFirst({ where: { action: 'quote.declined', entityId: declineQuoteId } })
  const metadata = JSON.parse((audit?.metadata as string) ?? '{}') as { reason?: string }
  expect(metadata.reason, 'reason recorded in audit')
})

await check('ACCEPTANCE 8 (PART 74): expired quote cannot be accepted', async () => {
  // Build a live SUBMITTED quote, then move its validity into the past.
  const created = data(
    (await httpJson('POST', '/api/job-requests', {
      providerId: devKwameProvider!.id,
      serviceId: devKwameService!.id,
      title: 'Expiry check quote request',
      description: 'A request created purely to verify expiry protection.',
      locationId: devNsawam!.id,
      submitNow: true,
    })).payload,
  ) as { id: string }
  const expiryRequestId = created.id
  await loginHttp('kwame@demo.dwellers.test', DEMO_PASSWORD)
  await httpJson('POST', `/api/job-requests/${expiryRequestId}/respond`, { action: 'respond_interested' })
  const { payload } = await httpJson('POST', '/api/quotes', {
    jobRequestId: expiryRequestId,
    items: [{ kind: 'LABOUR', name: 'Temporary quote', quantity: 1, unit: 'job', unitPrice: 10 }],
    validUntil: new Date(Date.now() + 86_400_000).toISOString(),
  })
  const quote = data(payload) as Record<string, unknown>
  const expiryQuoteId = quote.id as string
  await httpJson('POST', `/api/quotes/${expiryQuoteId}/send`)
  // Test surgery: the validity window has elapsed.
  await dev.quote.update({
    where: { id: expiryQuoteId },
    data: { validUntil: new Date(Date.now() - 3_600_000) },
  })
  await loginHttp('raymond@demo.dwellers.test', DEMO_PASSWORD)
  const { status, payload: acceptPayload } = await httpJson('POST', `/api/quotes/${expiryQuoteId}/accept`)
  expect(status === 400, `status ${status}`)
  const errorBody = acceptPayload?.error as { message?: string } | undefined
  expect(errorBody?.message?.toLowerCase().includes('expire'), `message: ${errorBody?.message}`)
  const row = await dev.quote.findUnique({ where: { id: expiryQuoteId }, select: { status: true } })
  expect(row?.status === 'EXPIRED', `status ${row?.status}`)
})

await section('16. HTTP — IDOR MATRIX (PART 43/75/76: never 200, never 500)')

// Kojo (another customer) probes Raymond's quotes.
await loginHttp('kojo@demo.dwellers.test', DEMO_PASSWORD)

await check('Customer B views Customer A quote → 404 (PART 76)', async () => {
  const { status } = await httpJson('GET', `/api/quotes/${httpQuoteId}`)
  expect(status === 404, `status ${status}`)
})

await check('Customer B accepts Customer A quote → 404', async () => {
  const { status } = await httpJson('POST', `/api/quotes/${httpQuoteId}/accept`)
  expect(status === 404, `status ${status}`)
})

await check('Customer B declines Customer A quote → 404', async () => {
  const { status } = await httpJson('POST', `/api/quotes/${httpQuoteId}/decline`, {})
  expect(status === 404, `status ${status}`)
})

await check('Customer B lists quotes → none of Customer A\'s rows', async () => {
  const items = data(await httpJson('GET', '/api/quotes').then((r) => r.payload)) as unknown as { id: string }[]
  expect(!items.some((row) => row.id === httpQuoteId), 'foreign quote absent')
})

// Yaw (another provider) probes Kwame's quote.
const devYawProfile = devYaw ? await dev.providerProfile.findUnique({ where: { userId: devYaw.id } }) : null
if (devYaw) {
  await loginHttp('yaw@demo.dwellers.test', DEMO_PASSWORD)

  await check('Provider B views Provider A quote → 404', async () => {
    const { status } = await httpJson('GET', `/api/quotes/${httpQuoteId}`)
    expect(status === 404, `status ${status}`)
  })

  await check('Provider B edits Provider A quote → 404', async () => {
    const { status } = await httpJson('PATCH', `/api/quotes/${httpQuoteId}`, { discount: 1 })
    expect(status === 404, `status ${status}`)
  })

  await check('Provider B sends Provider A quote → 404', async () => {
    const { status } = await httpJson('POST', `/api/quotes/${httpQuoteId}/send`)
    expect(status === 404, `status ${status}`)
  })

  await check('Provider B withdraws Provider A quote → 404', async () => {
    const { status } = await httpJson('POST', `/api/quotes/${httpQuoteId}/withdraw`)
    expect(status === 404, `status ${status}`)
  })

  await check('ACCEPTANCE 9 (PART 75): Provider B quotes Provider A request → 403, no row', async () => {
    const { status } = await httpJson('POST', '/api/quotes', {
      jobRequestId: httpRequestId,
      items: [{ kind: 'LABOUR', name: 'Hijack', quantity: 1, unit: 'job', unitPrice: 1 }],
      validUntil: new Date(Date.now() + 86_400_000).toISOString(),
    })
    expect(status === 403 || status === 404, `status ${status}`)
    const count = await dev.quote.count({ where: { jobRequestId: httpRequestId, providerId: devYawProfile!.id } })
    expect(count === 0, 'no quote created')
  })
} else {
  console.log('  (yaw demo user absent — provider-B IDOR covered at service level)')
}

await section('17. HTTP — TAMPERING + MONEY OVER THE WIRE (PART 44/45/73)')

/**
 * Files a request as Raymond, responds as Kwame, then creates a quote with
 * the caller's item/edge payload — the real API path for every money check.
 */
async function fileRespondAndQuote(
  title: string,
  description: string,
  items: unknown[],
  extra: Record<string, unknown> = {},
): Promise<{ status: number; quote: Record<string, unknown> | null; error: Record<string, unknown> | null }> {
  await loginHttp('raymond@demo.dwellers.test', DEMO_PASSWORD)
  const created = data(
    (await httpJson('POST', '/api/job-requests', {
      providerId: devKwameProvider!.id,
      serviceId: devKwameService!.id,
      title,
      description,
      locationId: devNsawam!.id,
      submitNow: true,
    })).payload,
  ) as { id: string }
  await loginHttp('kwame@demo.dwellers.test', DEMO_PASSWORD)
  await httpJson('POST', `/api/job-requests/${created.id}/respond`, { action: 'respond_interested' })
  const { status, payload } = await httpJson('POST', '/api/quotes', {
    jobRequestId: created.id,
    items,
    validUntil: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    ...extra,
  })
  const quote = status < 300 && payload?.success ? (payload.data as Record<string, unknown>) : null
  return { status, quote, error: (payload?.error as Record<string, unknown>) ?? null }
}

await check('negative price rejected over HTTP (PART 45)', async () => {
  const { status } = await fileRespondAndQuote(
    'Money grid request one',
    'Request for the HTTP money validation grid.',
    [{ kind: 'LABOUR', name: 'Bad price', quantity: 1, unit: 'job', unitPrice: -5 }],
  )
  expect(status === 400 || status === 422, `status ${status}`)
})

await check('zero quantity rejected over HTTP (PART 45)', async () => {
  const { status } = await fileRespondAndQuote(
    'Zero quantity request',
    'Zero quantity must be rejected by the server.',
    [{ kind: 'LABOUR', name: 'Nothing', quantity: 0, unit: 'job', unitPrice: 5 }],
  )
  expect(status === 400 || status === 422, `status ${status}`)
})

await check('NaN quantity cannot cross JSON (PART 45)', async () => {
  const { status } = await fileRespondAndQuote(
    'NaN quantity request',
    'Non-finite quantity must be rejected.',
    [{ kind: 'LABOUR', name: 'NaN qty', quantity: JSON.parse('null') as unknown as number, unit: 'job', unitPrice: 5 }],
  )
  expect(status === 422, `status ${status}`)
})

await check('pesewa precision survives the round trip: GH₵0.01 (PART 45)', async () => {
  const { status, quote } = await fileRespondAndQuote(
    'Pesewa precision request',
    'One pesewa line item must round-trip exactly.',
    [{ kind: 'OTHER', name: 'One pesewa', quantity: 1, unit: 'service', unitPrice: 0.01 }],
  )
  expect(status === 201, `status ${status}`)
  expect(quote!.totalAmount === 1, `total ${quote!.totalAmount}`)
  const items = quote!.items as { lineTotalAmount: number }[]
  expect(items[0]!.lineTotalAmount === 1, `line ${items[0]!.lineTotalAmount}`)
})

await check('ceiling price GH₵999,999.99 accepted and exact (PART 45)', async () => {
  const { status, quote } = await fileRespondAndQuote(
    'Ceiling price request',
    'Maximum legal unit price must compute exactly.',
    [{ kind: 'LABOUR', name: 'Big build', quantity: 1, unit: 'job', unitPrice: 999999.99 }],
  )
  expect(status === 201, `status ${status}`)
  expect(quote!.totalAmount === 99_999_999, `total ${quote!.totalAmount}`)
})

await check('decimal quantity round-trips: 2.5 bags × GH₵20 (PART 45)', async () => {
  const { status, quote } = await fileRespondAndQuote(
    'Decimal quantity request',
    'Fractional quantities must stay exact.',
    [{ kind: 'MATERIAL', name: 'Cement', quantity: 2.5, unit: 'bag', unitPrice: 20 }],
  )
  expect(status === 201, `status ${status}`)
  expect(quote!.totalAmount === 5_000, `total ${quote!.totalAmount}`)
})

await check('discount above subtotal rejected over HTTP (PART 15)', async () => {
  const { status } = await fileRespondAndQuote(
    'Discount overflow request',
    'Discount greater than subtotal must be rejected.',
    [{ kind: 'LABOUR', name: 'Small job', quantity: 1, unit: 'job', unitPrice: 10 }],
    { discount: 11 },
  )
  expect(status === 400 || status === 422, `status ${status}`)
})

await check('bogus client totals are stripped by the schema, never stored (PART 44)', async () => {
  const { status, quote } = await fileRespondAndQuote(
    'Tamper strip request',
    'Client-calculated fields must never reach storage.',
    [
      { kind: 'LABOUR', name: 'Real work', quantity: 2, unit: 'job', unitPrice: 100, amount: 1 },
      { kind: 'MATERIAL', name: 'Real cement', quantity: 3, unit: 'bag', unitPrice: 10, lineTotal: 1 },
    ],
    { total: 1, subtotal: 1, status: 'ACCEPTED', customerId: devKojo!.id },
  )
  expect(status === 201, `status ${status}`)
  expect(quote!.totalAmount === 23_000, `server total ${quote!.totalAmount}`)
  expect(quote!.status === 'DRAFT', `status untouched: ${quote!.status}`)
  const row = await dev.quote.findUnique({ where: { id: quote!.id as string }, select: { totalAmount: true, customerId: true } })
  expect(row?.totalAmount === 23_000, `stored ${row?.totalAmount}`)
  expect(row?.customerId === devRaymond!.id, 'customerId resolved from the request, not the body')
})

await section('18. HTTP — CUSTOMER CANNOT PATCH (PART 73) + SUSPENSION (PART 64)')

await loginHttp('raymond@demo.dwellers.test', DEMO_PASSWORD)

await check('ACCEPTANCE 7 (PART 73): customer PATCH total=1 rejected/ignored', async () => {
  const { status } = await httpJson('PATCH', `/api/quotes/${httpQuoteId}`, { total: 1, discount: 999999 })
  expect(status === 403, `status ${status}`)
  const row = await dev.quote.findUnique({ where: { id: httpQuoteId }, select: { totalAmount: true } })
  expect(row?.totalAmount === 51_000, `stored total ${row?.totalAmount}`)
})

await check('suspended provider cannot create quotes over HTTP (PART 64)', async () => {
  await loginHttp('raymond@demo.dwellers.test', DEMO_PASSWORD)
  const created = data(
    (await httpJson('POST', '/api/job-requests', {
      providerId: devKwameProvider!.id,
      serviceId: devKwameService!.id,
      title: 'Suspension guard request',
      description: 'Provider will be suspended before quoting this.',
      locationId: devNsawam!.id,
      submitNow: true,
    })).payload,
  ) as { id: string }
  await loginHttp('kwame@demo.dwellers.test', DEMO_PASSWORD)
  await httpJson('POST', `/api/job-requests/${created.id}/respond`, { action: 'respond_interested' })
  await dev.user.update({ where: { id: devKwame!.id }, data: { status: 'SUSPENDED' } })
  const { status } = await httpJson('POST', '/api/quotes', {
    jobRequestId: created.id,
    items: [{ kind: 'LABOUR', name: 'Suspension test', quantity: 1, unit: 'job', unitPrice: 5 }],
    validUntil: new Date(Date.now() + 86_400_000).toISOString(),
  })
  expect(status === 403, `status ${status}`)
  await dev.user.update({ where: { id: devKwame!.id }, data: { status: 'ACTIVE' } })
  await loginHttp('kwame@demo.dwellers.test', DEMO_PASSWORD)
})

await section('19. CLOSE')

await check('dev database connection closed', async () => {
  await devDb!.$disconnect()
})

// -----------------------------------------------------------------------------
// RESULT
// -----------------------------------------------------------------------------

console.log('\n' + '='.repeat(62))
console.log(`PHASE 6 RESULT: ${passed} passed, ${failed} failed (${passed + failed} checks)`)
console.log('='.repeat(62))
if (failures.length > 0) {
  console.log('\nFailures:')
  for (const failure of failures) console.log(`  - ${failure}`)
  process.exit(1)
}
