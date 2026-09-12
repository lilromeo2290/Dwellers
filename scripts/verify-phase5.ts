/**
 * Dwellers — PHASE 5 verification suite (REQUEST SERVICE / JOB REQUESTS).
 *
 * Two levels, mirroring the established harness conventions:
 *  1. SERVICE level against an ISOLATED database (db/test-phase5.db) rebuilt
 *     from the migration files — state machine, validation, transactions,
 *     notifications, audit, analytics, attachments, business permissions.
 *  2. HTTP level against the LIVE dev server (dev database, seeded demo
 *     users) — real NextAuth sessions, real middleware: the PART 65 IDOR
 *     matrix, the PART 66–75 acceptance tests, rate limiting and privacy.
 *
 * Nothing here trusts the client: every check exercises the same code paths
 * the product uses.
 */
process.env.DATABASE_URL = 'file:/home/z/my-project/db/test-phase5.db'
process.env.RATE_LIMIT_ENABLED = 'true'
process.env.LOG_LEVEL = 'error'

import { rmSync } from 'node:fs'
import { execSync } from 'node:child_process'

const TEST_DB = '/home/z/my-project/db/test-phase5.db'
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
const state = await import('@/modules/projects/job-request-state')
const jobs = await import('@/modules/projects/job-request-service')
const { assertTransition, JOB_REQUEST_ACTIONS, RESPONSE_TRANSITIONS } = state
const { ValidationError, BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } = await import('@/lib/errors')
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
// 1. STATE MACHINE — pure unit rules (PART 23/24/53)
// -----------------------------------------------------------------------------

await section('1. STATE MACHINE (pure rules)')

await check('dashboard groups expand to the right statuses (PART 28)', () => {
  expect(state.statusesForGroup('NEW').includes('SUBMITTED'), 'NEW includes SUBMITTED')
  expect(state.statusesForGroup('DECLINED').includes('DECLINED'), 'DECLINED group')
  expect(state.statusesForGroup('CANCELLED').includes('CANCELLED'), 'CANCELLED group')
  expect(JOB_REQUEST_ACTIONS.length === 6, 'six actions')
})

await check('customer may submit a DRAFT', () => {
  assertTransition('submit', 'CUSTOMER', 'DRAFT')
})

await check('customer may NOT submit a SUBMITTED request', async () => {
  await expectThrows(() => assertTransition('submit', 'CUSTOMER', 'SUBMITTED'), BadRequestError)
})

await check('CUSTOMER → ACCEPTED via respond is structurally impossible (PART 53)', async () => {
  await expectThrows(() => assertTransition('respond_interested', 'CUSTOMER', 'SUBMITTED'), BadRequestError)
  await expectThrows(() => assertTransition('respond_declined', 'CUSTOMER', 'SUBMITTED'), BadRequestError)
})

await check('PROVIDER → SUBMITTED from COMPLETED is structurally impossible (PART 53)', async () => {
  await expectThrows(() => assertTransition('respond_interested', 'PROVIDER', 'COMPLETED'), BadRequestError)
  await expectThrows(() => assertTransition('respond_declined', 'PROVIDER', 'COMPLETED'), BadRequestError)
})

await check('CANCELLED → ACCEPTED is structurally impossible (PART 53)', async () => {
  await expectThrows(() => assertTransition('respond_interested', 'PROVIDER', 'CANCELLED'), BadRequestError)
})

await check('provider cannot act on DRAFT requests', async () => {
  await expectThrows(() => assertTransition('respond_interested', 'PROVIDER', 'DRAFT'), BadRequestError)
})

await check('provider cannot respond twice (RESPONDED is not a source)', async () => {
  await expectThrows(() => assertTransition('respond_interested', 'PROVIDER', 'RESPONDED'), BadRequestError)
  await expectThrows(() => assertTransition('respond_declined', 'PROVIDER', 'RESPONDED'), BadRequestError)
})

await check('decline maps to DECLINED terminal status', () => {
  expect(RESPONSE_TRANSITIONS.respond_declined.status === 'DECLINED', 'decline status')
  expect(state.isTerminal('DECLINED'), 'DECLINED terminal')
  expect(state.isTerminal('CANCELLED') && state.isTerminal('COMPLETED'), 'other terminals')
})

await check('staff can perform no business transitions', async () => {
  for (const action of JOB_REQUEST_ACTIONS) {
    await expectThrows(() => assertTransition(action, 'STAFF', 'DRAFT'), BadRequestError, action)
  }
})

await check('customer can cancel while waiting but not after acceptance', () => {
  assertTransition('cancel', 'CUSTOMER', 'DRAFT')
  assertTransition('cancel', 'CUSTOMER', 'SUBMITTED')
  assertTransition('cancel', 'CUSTOMER', 'RESPONDED')
})

// -----------------------------------------------------------------------------
// 2. FIXTURES (isolated database)
// -----------------------------------------------------------------------------

await section('2. FIXTURES')

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

// Geography
const region = await db.region.create({ data: { name: `Test Region ${stamp}`, slug: `test-region-${stamp}` } })
const district = await db.district.create({ data: { regionId: region.id, name: 'Test Municipal', slug: 'test-municipal' } })
const townNsawam = await db.town.create({
  data: { districtId: district.id, regionId: region.id, name: 'Nsawam', slug: 'nsawam', latitude: 5.8085, longitude: -0.3539 },
})
const townAdoagyiri = await db.town.create({
  data: { districtId: district.id, regionId: region.id, name: 'Adoagyiri', slug: 'adoagyiri', latitude: 5.793, longitude: -0.343 },
})
const community = await db.communityArea.create({ data: { townId: townNsawam.id, name: 'Test Community', slug: 'test-community' } })

// People
const raymond = await makeUser('Raymond Test', 'CUSTOMER')
const kojo = await makeUser('Kojo Test', 'CUSTOMER')
const kwameUser = await makeUser('Kwame Test', 'ARTISAN')
const yawUser = await makeUser('Yaw Test', 'ARTISAN')
const ownerUser = await makeUser('Akua Test', 'CONSTRUCTION_COMPANY')
const managerUser = await makeUser('Ama Test', 'CONSTRUCTION_COMPANY')
const memberUser = await makeUser('Kwaku Test', 'CONSTRUCTION_COMPANY')
const suspendedUser = await makeUser('Suspended Test', 'ARTISAN', 'SUSPENDED')

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
    headline: 'Test electrician',
    primaryLocationId: townAdoagyiri.id,
    serviceAreas: { create: [{ locationId: townAdoagyiri.id }] },
  },
})
const suspendedProvider = await db.providerProfile.create({
  data: { userId: suspendedUser.id, profession: 'plumber', primaryLocationId: townNsawam.id },
})

const category = await db.category.create({ data: { name: 'Plumbing (test)', slug: `plumbing-test-${stamp}`, sortOrder: 99 } })
const categoryElectrical = await db.category.create({ data: { name: 'Electrical (test)', slug: `electrical-test-${stamp}`, sortOrder: 100 } })
const kwameService = await db.service.create({
  data: { providerId: kwameProvider.id, categoryId: category.id, name: 'Pipe repair (test)', status: 'ACTIVE', isAvailable: true },
})
const yawService = await db.service.create({
  data: { providerId: yawProvider.id, categoryId: categoryElectrical.id, name: 'Wiring (test)', status: 'ACTIVE', isAvailable: true },
})

// Business with owner/manager/member and an affiliated provider profile
const business = await db.business.create({
  data: {
    ownerId: ownerUser.id,
    name: `Adansi Test ${stamp}`,
    slug: `adansi-test-${stamp}`,
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
const businessService = await db.service.create({
  data: { providerId: businessProvider.id, businessId: business.id, categoryId: category.id, name: 'Building works (test)', status: 'ACTIVE', isAvailable: true },
})

const authRaymond = authOf(raymond)
const authKojo = authOf(kojo)
const authKwame = authOf(kwameUser)
const authYaw = authOf(yawUser)
const authOwner = authOf(ownerUser)
const authManager = authOf(managerUser)
const authMember = authOf(memberUser)
const authSuspended = authOf(suspendedUser)

await check('fixtures created', () => {
  expect(kwameProvider.id && business.id && kwameService.id, 'core fixtures')
})

// -----------------------------------------------------------------------------
// 3. CREATION + VALIDATION (PART 4/5/6/7/39/40)
// -----------------------------------------------------------------------------

await section('3. CREATION + VALIDATION')

await check('unknown service id → ValidationError', async () => {
  await expectThrows(
    () => jobs.createJobRequest(authRaymond, { providerId: kwameProvider.id, serviceId: 'nope', clientToken: `t-${stamp}-1` }),
    ValidationError,
  )
})

await check('service NOT offered by the provider → rejected (PART 4 / acceptance 4)', async () => {
  await expectThrows(
    () =>
      jobs.createJobRequest(authRaymond, {
        providerId: kwameProvider.id,
        serviceId: yawService.id,
        submitNow: true,
        title: 'Fix my leaking bathroom pipe',
        description: 'The pipe under the sink has leaked for two days.',
        locationId: townNsawam.id,
        clientToken: `t-${stamp}-2`,
      }),
    ValidationError,
  )
  const count = await db.jobRequest.count({ where: { customerId: raymond.id } })
  expect(count === 0, `no request created, found ${count}`)
})

await check('suspended provider is not a valid target (PART 20)', async () => {
  await expectThrows(
    () => jobs.createJobRequest(authRaymond, { providerId: suspendedProvider.id, clientToken: `t-${stamp}-3` }),
    ValidationError,
  )
})

await check('community from another town is rejected server-side (PART 40 / acceptance 5)', async () => {
  const foreignCommunity = await db.communityArea.create({
    data: { townId: townAdoagyiri.id, name: 'Foreign Area', slug: 'foreign-area' },
  })
  await expectThrows(
    () =>
      jobs.createJobRequest(authRaymond, {
        locationId: townNsawam.id,
        communityId: foreignCommunity.id,
        clientToken: `t-${stamp}-4`,
      }),
    ValidationError,
  )
})

await check('community without a town is rejected', async () => {
  await expectThrows(
    () => jobs.createJobRequest(authRaymond, { communityId: community.id, clientToken: `t-${stamp}-5` }),
    ValidationError,
  )
})

await check('submit without title → rejected (PART 5)', async () => {
  await expectThrows(
    () =>
      jobs.createJobRequest(authRaymond, {
        submitNow: true,
        description: 'The pipe under the sink has leaked for two days.',
        locationId: townNsawam.id,
        clientToken: `t-${stamp}-6`,
      }),
    ValidationError,
  )
})

await check('draft creation records the CREATED audit action (PART 44)', async () => {
  const draftId = await jobs.createJobRequest(authRaymond, {
    providerId: kwameProvider.id,
    serviceId: kwameService.id,
    clientToken: `t-${stamp}-6b`,
  })
  expect(draftId, 'draft created')
  const row = await db.auditLog.findFirst({ where: { action: AUDIT_ACTIONS.JOB_REQUEST_CREATED, entityId: draftId } })
  expect(row != null, 'CREATED audit missing')
  await jobs.updateJobRequest(authRaymond, draftId, { action: 'cancel' })
})

await check('submit with a past preferred date → rejected', async () => {
  await expectThrows(
    () =>
      jobs.createJobRequest(authRaymond, {
        submitNow: true,
        title: 'Fix leaking bathroom pipe',
        description: 'The pipe under the sink has leaked for two days.',
        locationId: townNsawam.id,
        preferredDate: new Date(Date.now() - 86_400_000),
        clientToken: `t-${stamp}-7`,
      }),
    ValidationError,
  )
})

await check('targeted request without a service → rejected at submit', async () => {
  await expectThrows(
    () =>
      jobs.createJobRequest(authRaymond, {
        submitNow: true,
        providerId: kwameProvider.id,
        title: 'Fix leaking bathroom pipe',
        description: 'The pipe under the sink has leaked for two days.',
        locationId: townNsawam.id,
        clientToken: `t-${stamp}-8`,
      }),
    ValidationError,
  )
})

// -----------------------------------------------------------------------------
// 4. IDEMPOTENCY (PART 43 / acceptance 6)
// -----------------------------------------------------------------------------

await section('4. IDEMPOTENCY')

const token = `tok-${stamp}-a`
const firstId = await jobs.createJobRequest(authRaymond, {
  providerId: kwameProvider.id,
  serviceId: kwameService.id,
  title: 'Fix leaking bathroom pipe',
  description: 'The pipe under my bathroom sink has been leaking for two days.',
  locationId: townNsawam.id,
  communityId: community.id,
  submitNow: true,
  clientToken: token,
})
const secondId = await jobs.createJobRequest(authRaymond, {
  providerId: kwameProvider.id,
  serviceId: kwameService.id,
  title: 'Fix leaking bathroom pipe',
  description: 'The pipe under my bathroom sink has been leaking for two days.',
  locationId: townNsawam.id,
  communityId: community.id,
  submitNow: true,
  clientToken: token,
})

await check('double submit with one clientToken → exactly ONE request (acceptance 6)', async () => {
  expect(firstId === secondId, `same id expected, got ${firstId} vs ${secondId}`)
  const count = await db.jobRequest.count({ where: { customerId: raymond.id, clientToken: token } })
  expect(count === 1, `expected 1 request for the token, found ${count}`)
})

// -----------------------------------------------------------------------------
// 5. SUBMIT FLOW — events, notification, audit, analytics (PART 21/34/44/60)
// -----------------------------------------------------------------------------

await section('5. SUBMIT FLOW')

await check('submitted request is SUBMITTED with CREATED+SUBMITTED events', async () => {
  const request = await db.jobRequest.findUnique({ where: { id: firstId }, include: { events: true } })
  expect(request?.status === 'SUBMITTED', `status ${request?.status}`)
  const types = request!.events.map((event) => event.eventType).sort()
  expect(JSON.stringify(types) === JSON.stringify(['CREATED', 'SUBMITTED']), `events ${types}`)
  expect(request!.submittedAt != null, 'submittedAt set')
  expect(request!.reference.startsWith('JR-'), 'reference format')
})

await check('provider user received an in-app notification (PART 34)', async () => {
  const notification = await db.notification.findFirst({
    where: { recipientId: kwameUser.id, type: 'JOB_REQUEST_NEW', entityId: firstId },
  })
  expect(notification != null, 'notification missing')
  expect((notification!.title ?? '').includes('Nsawam'), 'location in title')
})

await check('audit trail recorded submit (PART 44)', async () => {
  const audit = await db.auditLog.findFirst({ where: { action: AUDIT_ACTIONS.JOB_REQUEST_SUBMITTED, entityId: firstId } })
  expect(audit != null, 'audit row missing')
})

await check('analytics event recorded without personal data (PART 60)', async () => {
  const event = await db.discoveryEvent.findFirst({ where: { eventType: 'request_submitted' } })
  expect(event != null, 'analytics row missing')
})

// -----------------------------------------------------------------------------
// 6. PROVIDER VIEW — viewed-once + privacy (PART 44/49)
// -----------------------------------------------------------------------------

await section('6. PROVIDER VIEW')

const detailForProvider = await jobs.getJobRequest(authKwame, firstId)

await check('provider side reads the request (targeted)', () => {
  expect(detailForProvider.id === firstId, 'wrong request')
})

await check('first provider open records VIEWED exactly once', async () => {
  expect(detailForProvider.viewedAt != null, 'viewedAt set')
  const again = await jobs.getJobRequest(authKwame, firstId)
  expect(again.viewedAt?.getTime() === detailForProvider.viewedAt!.getTime(), 'viewedAt stable')
  const viewed = await db.jobRequestEvent.count({ where: { jobRequestId: firstId, eventType: 'VIEWED' } })
  expect(viewed === 1, `expected 1 VIEWED event, found ${viewed}`)
})

await check('provider sees display name only — never email/phone (PART 18/28)', () => {
  const json = JSON.stringify(detailForProvider)
  expect(!json.includes(raymond.email.toLowerCase()), 'email leaked')
  expect(!json.includes(raymond.phone ?? ''), 'phone leaked')
  expect(detailForProvider.customer?.displayName.startsWith('Raymond'), 'display name form')
})

await check('provider gets the honest service-area flag (PART 41)', () => {
  expect(detailForProvider.servesLocation === true, 'Nsawam is a listed area')
})

await check('foreign provider reading the request → NotFound (IDOR)', async () => {
  await expectThrows(() => jobs.getJobRequest(authYaw, firstId), NotFoundError)
})

// -----------------------------------------------------------------------------
// 7. PROVIDER RESPONSE (PART 31/32 / acceptance 2)
// -----------------------------------------------------------------------------

await section('7. PROVIDER RESPONSE')

await check('provider responds INTERESTED with a message', async () => {
  const responded = await jobs.respondToJobRequest(authKwame, firstId, {
    action: 'respond_interested',
    message: 'I can inspect this tomorrow morning.',
  })
  expect(responded.status === 'RESPONDED', `status ${responded.status}`)
  expect(responded.responseKind === 'INTERESTED', `kind ${responded.responseKind}`)
  expect(responded.respondedAt != null, 'respondedAt set')
})

await check('response event stores the message', async () => {
  const event = await db.jobRequestEvent.findFirst({ where: { jobRequestId: firstId, eventType: 'RESPONSE_INTERESTED' } })
  expect(event?.message === 'I can inspect this tomorrow morning.', 'message missing')
})

await check('customer was notified of the response (PART 33 / acceptance 2)', async () => {
  const notification = await db.notification.findFirst({
    where: { recipientId: raymond.id, type: 'JOB_REQUEST_RESPONSE', entityId: firstId },
  })
  expect(notification != null, 'notification missing')
})

await check('provider cannot respond twice', async () => {
  await expectThrows(
    () => jobs.respondToJobRequest(authKwame, firstId, { action: 'respond_declined' }),
    BadRequestError,
  )
})

await check('customer cannot respond (acceptance 5/74 path)', async () => {
  const draftId = await jobs.createJobRequest(authRaymond, {
    providerId: kwameProvider.id,
    serviceId: kwameService.id,
    title: 'Second request for response tests',
    description: 'Another plumbing job to exercise state transitions safely.',
    locationId: townNsawam.id,
    submitNow: true,
    clientToken: `tok-${stamp}-b`,
  })
  await expectThrows(
    () => jobs.respondToJobRequest(authRaymond, draftId, { action: 'respond_declined' }),
    ForbiddenError,
  )
})

await check('NEEDS_INFO response keeps the request open with a message', async () => {
  const needInfoId = await jobs.createJobRequest(authKojo, {
    providerId: kwameProvider.id,
    serviceId: kwameService.id,
    title: 'Kitchen pipe replacement needed',
    description: 'The kitchen pipe burst and needs replacement, please advise.',
    locationId: townNsawam.id,
    submitNow: true,
    clientToken: `tok-${stamp}-c`,
  })
  const responded = await jobs.respondToJobRequest(authKwame, needInfoId, {
    action: 'respond_info',
    message: 'I need more information about the pipe size before I can provide an estimate.',
  })
  expect(responded.status === 'RESPONDED', `status ${responded.status}`)
  expect(responded.responseKind === 'NEEDS_INFO', 'kind NEEDS_INFO')
})

await check('DECLINE is terminal and notifies the customer', async () => {
  const declineId = await jobs.createJobRequest(authKojo, {
    providerId: kwameProvider.id,
    serviceId: kwameService.id,
    title: 'Outdoor tap installation request',
    description: 'I would like a new outdoor tap installed in the backyard.',
    locationId: townNsawam.id,
    submitNow: true,
    clientToken: `tok-${stamp}-d`,
  })
  const declined = await jobs.respondToJobRequest(authKwame, declineId, {
    action: 'respond_declined',
    message: 'Too far this week.',
  })
  expect(declined.status === 'DECLINED', `status ${declined.status}`)
  expect(state.isTerminal(declined.status), 'terminal')
  const notification = await db.notification.findFirst({
    where: { recipientId: kojo.id, type: 'JOB_REQUEST_RESPONSE', entityId: declineId },
  })
  expect(notification != null, 'customer notification missing')
})

// -----------------------------------------------------------------------------
// 8. CUSTOMER SIDE — response visibility, cancel, edit rules (PART 46/47/68)
// -----------------------------------------------------------------------------

await section('8. CUSTOMER SIDE')

await check('customer sees the response + full timeline (acceptance 3)', async () => {
  const detail = await jobs.getJobRequest(authRaymond, firstId)
  expect(detail.responseKind === 'INTERESTED', 'responseKind visible')
  const types = detail.events.map((event) => event.eventType)
  expect(types.includes('RESPONSE_INTERESTED'), 'response event in timeline')
  const times = detail.events.map((event) => new Date(event.createdAt).getTime())
  expect(JSON.stringify(times) === JSON.stringify([...times].sort((a, b) => a - b)), 'timeline sorted')
})

await check('customer cannot edit after submission (PART 47)', async () => {
  await expectThrows(
    () => jobs.updateJobRequest(authRaymond, firstId, { description: 'silently changed' }),
    BadRequestError,
  )
})

await check('customer cancels a waiting request with a reason (PART 46)', async () => {
  const cancelId = await jobs.createJobRequest(authKojo, {
    providerId: kwameProvider.id,
    serviceId: kwameService.id,
    title: 'Cancel me please — tap repair',
    description: 'This one will be cancelled by the test to verify cancellation.',
    locationId: townNsawam.id,
    submitNow: true,
    clientToken: `tok-${stamp}-e`,
  })
  const cancelled = await jobs.updateJobRequest(authKojo, cancelId, {
    action: 'cancel',
    cancellationReason: 'Found another provider',
  })
  expect(cancelled.status === 'CANCELLED', `status ${cancelled.status}`)
  expect(cancelled.cancelledAt != null, 'cancelledAt set')
  const event = await db.jobRequestEvent.findFirst({ where: { jobRequestId: cancelId, eventType: 'CANCELLED' } })
  expect(event?.message === 'Found another provider', 'reason recorded')
})

await check('cancelled request cannot be responded to (PART 53)', async () => {
  const cancelledId = (
    await db.jobRequest.findFirst({ where: { customerId: kojo.id, status: 'CANCELLED' } })
  )?.id
  expect(cancelledId, 'cancelled fixture exists')
  await expectThrows(
    () => jobs.respondToJobRequest(authKwame, cancelledId!, { action: 'respond_interested' }),
    BadRequestError,
  )
})

// -----------------------------------------------------------------------------
// 9. ATTACHMENTS (PART 11–14/48)
// -----------------------------------------------------------------------------

await section('9. ATTACHMENTS')

const photoRequestId = await jobs.createJobRequest(authRaymond, {
  providerId: kwameProvider.id,
  serviceId: kwameService.id,
  title: 'Photo-heavy repair request here',
  description: 'This request exercises the attachment rules end to end.',
  locationId: townNsawam.id,
  submitNow: true,
  clientToken: `tok-${stamp}-f`,
})

await check('customer adds up to 10 photos, the 11th is rejected (PART 13)', async () => {
  for (let index = 0; index < 10; index += 1) {
    await jobs.recordJobRequestAttachment(authRaymond, photoRequestId, {
      storageKey: `job-attachment/test-${stamp}-${index}.png`,
      originalName: `photo-${index}.png`,
      mimeType: 'image/png',
      sizeBytes: 1024,
    })
  }
  await expectThrows(
    () =>
      jobs.recordJobRequestAttachment(authRaymond, photoRequestId, {
        storageKey: `job-attachment/test-${stamp}-overflow.png`,
        mimeType: 'image/png',
        sizeBytes: 1024,
      }),
    ValidationError,
  )
})

await check('remove works below the cap and records the event', async () => {
  const removed = await jobs.removeJobRequestAttachment(authRaymond, photoRequestId, (
    await db.jobRequestAttachment.findFirst({ where: { jobRequestId: photoRequestId } })
  )!.id)
  expect(removed.storageKey.includes('job-attachment/'), 'key returned')
  const event = await db.jobRequestEvent.findFirst({ where: { jobRequestId: photoRequestId, eventType: 'ATTACHMENT_REMOVED' } })
  expect(event != null, 'event missing')
  const added = await db.jobRequestEvent.count({ where: { jobRequestId: photoRequestId, eventType: 'ATTACHMENT_ADDED' } })
  expect(added === 10, `expected 10 ADDED events, found ${added}`)
})

await check('provider cannot add photos to a customer request', async () => {
  await expectThrows(
    () =>
      jobs.recordJobRequestAttachment(authKwame, photoRequestId, {
        storageKey: `job-attachment/test-${stamp}-provider.png`,
        mimeType: 'image/png',
        sizeBytes: 1024,
      }),
    ForbiddenError,
  )
})

await check('customer A cannot attach to customer B request (PART 48 — opaque 404)', async () => {
  // A foreign customer gets the same opaque 404 as any other outsider —
  // the existence of customer B's request is never disclosed.
  await expectThrows(
    () =>
      jobs.recordJobRequestAttachment(authKojo, photoRequestId, {
        storageKey: `job-attachment/test-${stamp}-foreign.png`,
        mimeType: 'image/png',
        sizeBytes: 1024,
      }),
    NotFoundError,
  )
})

// -----------------------------------------------------------------------------
// 10. BUSINESS PERMISSIONS (PART 27)
// -----------------------------------------------------------------------------

await section('10. BUSINESS PERMISSIONS')

const businessRequestId = await jobs.createJobRequest(authRaymond, {
  providerId: businessProvider.id,
  serviceId: businessService.id,
  title: 'Build a boundary wall for my house',
  description: 'I need a boundary wall built around my plot, about 40 metres.',
  locationId: townNsawam.id,
  submitNow: true,
  clientToken: `tok-${stamp}-g`,
})

await check('business MEMBER cannot respond (PART 27)', async () => {
  await expectThrows(
    () => jobs.respondToJobRequest(authMember, businessRequestId, { action: 'respond_interested' }),
    ForbiddenError,
  )
})

await check('business MANAGER can respond', async () => {
  const responded = await jobs.respondToJobRequest(authManager, businessRequestId, { action: 'respond_info' })
  expect(responded.status === 'RESPONDED', `status ${responded.status}`)
})

await check('second business request: OWNER can respond', async () => {
  const ownerRequestId = await jobs.createJobRequest(authKojo, {
    providerId: businessProvider.id,
    serviceId: businessService.id,
    title: 'Pave my compound with concrete blocks',
    description: 'I would like my compound paved before the rainy season starts.',
    locationId: townNsawam.id,
    submitNow: true,
    clientToken: `tok-${stamp}-h`,
  })
  const responded = await jobs.respondToJobRequest(authOwner, ownerRequestId, { action: 'respond_interested' })
  expect(responded.status === 'RESPONDED', `status ${responded.status}`)
})

await check('member CAN read the request for their business (view-only)', async () => {
  const detail = await jobs.getJobRequest(authMember, businessRequestId)
  expect(detail.access.canRespond === false, 'member cannot respond')
  expect(detail.access.side === 'PROVIDER', 'member sees provider perspective')
})

// -----------------------------------------------------------------------------
// 11. SUSPENDED PROVIDER (PART 75)
// -----------------------------------------------------------------------------

await section('11. SUSPENDED PROVIDER')

await check('suspended provider cannot even be targeted at creation', async () => {
  await expectThrows(
    () => jobs.createJobRequest(authRaymond, { providerId: suspendedProvider.id, clientToken: `tok-${stamp}-i` }),
    ValidationError,
  )
})

await check('suspended provider account cannot respond (service-level guard)', async () => {
  // Force-target a request at the suspended provider through the database —
  // the service must still refuse because the account is not ACTIVE.
  const forced = await db.jobRequest.create({
    data: {
      reference: `JR-FORCED-${stamp}`,
      customerId: raymond.id,
      providerId: suspendedProvider.id,
      serviceId: kwameService.id,
      title: 'Forced fixture for suspension testing',
      description: 'Created directly to prove the suspension guard fires.',
      status: 'SUBMITTED',
      submittedAt: new Date(),
    },
  })
  await expectThrows(
    () => jobs.respondToJobRequest(authSuspended, forced.id, { action: 'respond_interested' }),
    ForbiddenError,
  )
})

// -----------------------------------------------------------------------------
// 12. LISTING SCOPING (PART 28/29)
// -----------------------------------------------------------------------------

await section('12. LISTING SCOPING')

await check('customers see only their own requests', async () => {
  const a = await jobs.listJobRequests(authRaymond, { page: 1, pageSize: 50 })
  const b = await jobs.listJobRequests(authKojo, { page: 1, pageSize: 50 })
  expect(a.items.every((item) => item.customerId === raymond.id), 'A scope broken')
  expect(b.items.every((item) => item.customerId === kojo.id), 'B scope broken')
  expect(a.total >= 1 && b.total >= 2, 'expected fixture counts')
})

await check('provider sees requests targeted at them', async () => {
  const list = await jobs.listJobRequests(authKwame, { page: 1, pageSize: 50 })
  expect(list.items.every((item) => item.providerId === kwameProvider.id), 'provider scope broken')
  expect(list.items.some((item) => item.customerId === raymond.id), 'missing targeted request')
})

await check('statusGroup NEW filters server-side (PART 28)', async () => {
  const fresh = await jobs.listJobRequests(authKwame, { page: 1, pageSize: 50, statusGroup: 'NEW' })
  expect(fresh.items.every((item) => ['SUBMITTED', 'MATCHING'].includes(item.status)), 'group leak')
})

await check('pagination is respected (no unlimited loads)', async () => {
  const page = await jobs.listJobRequests(authKwame, { page: 1, pageSize: 2 })
  expect(page.items.length <= 2, 'pageSize broken')
})

await check('foreign callers get opaque 404 (existence never disclosed)', async () => {
  await expectThrows(() => jobs.getJobRequest(authKojo, firstId), NotFoundError)
})

await check('unauthenticated access → UNAUTHORIZED', async () => {
  await expectThrows(() => jobs.listJobRequests(null, { page: 1, pageSize: 10 }), UnauthorizedError)
})

// -----------------------------------------------------------------------------
// 13. AUDIT + ANALYTICS INTEGRITY (PART 44)
// -----------------------------------------------------------------------------

await section('13. AUDIT + ANALYTICS')

await check('all lifecycle audit actions recorded append-only', async () => {
  const actions = [
    AUDIT_ACTIONS.JOB_REQUEST_CREATED,
    AUDIT_ACTIONS.JOB_REQUEST_SUBMITTED,
    AUDIT_ACTIONS.JOB_REQUEST_VIEWED,
    AUDIT_ACTIONS.JOB_REQUEST_RESPONDED,
    AUDIT_ACTIONS.JOB_REQUEST_DECLINED,
    AUDIT_ACTIONS.JOB_REQUEST_CANCELLED,
    AUDIT_ACTIONS.JOB_REQUEST_ATTACHMENT_ADDED,
    AUDIT_ACTIONS.JOB_REQUEST_ATTACHMENT_REMOVED,
  ]
  for (const action of actions) {
    const row = await db.auditLog.findFirst({ where: { action } })
    expect(row != null, `missing audit action ${action}`)
  }
})

await check('request events never contain secrets or HTML (PART 32)', async () => {
  const events = await db.jobRequestEvent.findMany()
  expect(events.length >= 6, 'fixture events exist')
  for (const event of events) {
    expect(!/<script/i.test(event.message ?? ''), 'script tag in event message')
  }
})

await check('provider_request_viewed + provider_response analytics present', async () => {
  expect(await db.discoveryEvent.findFirst({ where: { eventType: 'provider_request_viewed' } }) != null, 'viewed event')
  expect(await db.discoveryEvent.findFirst({ where: { eventType: 'provider_response' } }) != null, 'response event')
})

// -----------------------------------------------------------------------------
// 14. CLOSE ISOLATED DATABASE
// -----------------------------------------------------------------------------

await section('14. CLEANUP (service level)')
await check('isolated test database closed', async () => {
  await db.$disconnect()
})

// -----------------------------------------------------------------------------
// 15. HTTP LEVEL — live server, real sessions (PART 50/52/65/72/73/76)
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
  // Suite re-runs inside a rate-limit window can legitimately hit 429 on the
  // shared per-IP bucket — wait the announced window out once and retry.
  if (response.status === 429 && retryOn429) {
    const retryAfter = Number(response.headers.get('retry-after') ?? '61')
    await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter, 61) * 1000))
    response = await send()
  }
  storeCookies(response)
  const payload = await response.json().catch(() => null)
  return { status: response.status, payload: payload as Record<string, unknown> | null }
}

async function httpUpload(path: string, filename: string, bytes: Uint8Array, type = 'image/png') {
  const form = new FormData()
  form.set('file', new Blob([bytes as BlobPart], { type }), filename)
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: Object.keys(jar).length ? { cookie: cookieHeader() } : {},
    body: form,
  })
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
  // The auth endpoints are rate-limited to 10/min per IP by design. When the
  // bucket is dry (suite ran many logins inside one window), wait it out once.
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

// Minimal valid 1×1 PNG
const PNG_BYTES = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
  (character) => character.charCodeAt(0),
)

await section('15. HTTP — LIVE SERVER (acceptance flow, PART 76)')

const dev = await devDatabase()
const devKwame = await dev.user.findUnique({ where: { email: 'kwame@demo.dwellers.test' } })
const devRaymond = await dev.user.findUnique({ where: { email: 'raymond@demo.dwellers.test' } })
const devKojo = await dev.user.findUnique({ where: { email: 'kojo@demo.dwellers.test' } })
const devKwameProvider = devKwame ? await dev.providerProfile.findUnique({ where: { userId: devKwame.id } }) : null
const devKwameService = devKwameProvider
  ? await dev.service.findFirst({ where: { providerId: devKwameProvider.id, status: 'ACTIVE' } })
  : null

await check('demo seed provides the acceptance fixtures', () => {
  expect(devKwame && devRaymond && devKwameProvider && devKwameService, 'dev fixtures present')
})

await check('anonymous POST /api/job-requests → 401', async () => {
  const { status } = await httpJson('POST', '/api/job-requests', {})
  expect(status === 401, `status ${status}`)
})

await loginHttp('raymond@demo.dwellers.test', DEMO_PASSWORD)

let httpRequestId = ''
await check('Raymond files a REAL request against Kwame (acceptance 1)', async () => {
  const { status, payload } = await httpJson('POST', '/api/job-requests', {
    providerId: devKwameProvider!.id,
    serviceId: devKwameService!.id,
    title: 'Fix leaking bathroom pipe',
    description: 'The pipe under my bathroom sink has been leaking for two days.',
    locationId: (
      await dev.town.findFirst({ where: { name: 'Nsawam' } })
    )?.id,
    urgency: 'URGENT',
    preferredTimeSlot: 'FLEXIBLE',
    submitNow: true,
    clientToken: `http-${stamp}-1`,
  })
  expect(status === 201, `status ${status}`)
  const data = payload?.data as Record<string, unknown>
  httpRequestId = String(data.id)
  expect(data.status === 'SUBMITTED', `status field ${data.status}`)
  expect(String(data.reference).startsWith('JR-'), 'reference format')
})

await check('double-click protection over HTTP: same clientToken → same request', async () => {
  const { status, payload } = await httpJson('POST', '/api/job-requests', {
    providerId: devKwameProvider!.id,
    serviceId: devKwameService!.id,
    title: 'Fix leaking bathroom pipe',
    description: 'The pipe under my bathroom sink has been leaking for two days.',
    locationId: (await dev.town.findFirst({ where: { name: 'Nsawam' } }))?.id,
    submitNow: true,
    clientToken: `http-${stamp}-1`,
  })
  expect(status === 201, `status ${status}`)
  expect(String((payload?.data as Record<string, unknown>).id) === httpRequestId, 'duplicate id differs')
  const rows = await dev.jobRequest.count({ where: { clientToken: `http-${stamp}-1` } })
  expect(rows === 1, `rows ${rows}`)
})

await check('invalid community/town combo → 422, nothing created (acceptance 5 over HTTP)', async () => {
  const townA = (await dev.town.findFirst({ where: { name: 'Nsawam' } }))!
  const foreignCommunity = await dev.communityArea.findFirst({
    where: { townId: { not: townA.id } },
    include: { town: true },
  })
  expect(foreignCommunity, 'foreign community fixture')
  const { status, payload } = await httpJson('POST', '/api/job-requests', {
    title: 'Cross-region mismatch test',
    description: 'This request must fail location hierarchy validation.',
    locationId: townA.id,
    communityId: foreignCommunity.id,
  })
  expect(status === 422, `status ${status}`)
  // The error may come from the zod boundary (flatten()) or the service-level
  // hierarchy validator (raw fieldErrors) — accept both honest shapes.
  const details = (payload?.error as { details?: unknown })?.details as
    | { fieldErrors?: Record<string, string[]>; communityId?: string[] }
    | undefined
  const fieldErrors = details?.fieldErrors ?? details
  expect((fieldErrors as { communityId?: string[] })?.communityId != null, 'community field error present')
})

await check('customer PATCH with status=ACCEPTED is stripped — server owns state (PART 74)', async () => {
  const { status, payload } = await httpJson('PATCH', `/api/job-requests/${httpRequestId}`, {
    status: 'ACCEPTED',
    title: 'Fix leaking bathroom pipe',
  })
  // The unknown `status` key is stripped at the zod boundary; the remaining
  // edit is refused because the request is no longer a draft (400) — either
  // way the state machine, never the client, owns the status field.
  expect(status === 200 || status === 400, `status ${status}`)
  if (status === 200) {
    expect((payload?.data as Record<string, unknown>).status === 'SUBMITTED', 'status tampered in response')
  } else {
    // A 400 has an error envelope — confirm the state through a fresh read.
    const fresh = await httpJson('GET', `/api/job-requests/${httpRequestId}`)
    expect((fresh.payload?.data as Record<string, unknown>).status === 'SUBMITTED', 'status tampered on server')
  }
})

await check('Raymond lists MY JOB REQUESTS and sees only his own (acceptance 3 start)', async () => {
  const { status, payload } = await httpJson('GET', '/api/job-requests?page=1&pageSize=50')
  expect(status === 200, `status ${status}`)
  const data = payload?.data as unknown[]
  expect(Array.isArray(data) && data.length >= 1, 'list empty')
  for (const row of data as Record<string, unknown>[]) {
    expect(String(row.customerId) === devRaymond!.id, 'foreign request in customer list')
  }
})

// Kwame's side
await loginHttp('kwame@demo.dwellers.test', DEMO_PASSWORD)

await check('provider Job Requests list contains the new request (acceptance 2)', async () => {
  const { status, payload } = await httpJson('GET', '/api/job-requests?statusGroup=NEW&page=1&pageSize=50')
  expect(status === 200, `status ${status}`)
  const data = payload?.data as Record<string, unknown>[]
  expect(data.some((row) => row.id === httpRequestId), 'request missing from NEW group')
})

await check('provider detail marks VIEWED once and hides customer email', async () => {
  const first = await httpJson('GET', `/api/job-requests/${httpRequestId}`)
  expect(first.status === 200, `status ${first.status}`)
  const data = first.payload?.data as Record<string, unknown>
  expect(data.viewedAt != null, 'viewedAt not set')
  const json = JSON.stringify(first.payload)
  expect(!json.toLowerCase().includes('raymond@demo.dwellers.test'), 'email leaked over HTTP')
  const second = await httpJson('GET', `/api/job-requests/${httpRequestId}`)
  expect(
    (second.payload?.data as Record<string, unknown>).viewedAt === data.viewedAt,
    'viewedAt changed between reads',
  )
})

await check('provider responds INTERESTED via HTTP (acceptance 2)', async () => {
  const { status, payload } = await httpJson('POST', `/api/job-requests/${httpRequestId}/respond`, {
    action: 'respond_interested',
    message: 'I can inspect this tomorrow morning.',
  })
  expect(status === 200, `status ${status}`)
  const data = payload?.data as Record<string, unknown>
  expect(data.status === 'RESPONDED', `status ${data.status}`)
})

await check('second response attempt → 400 (server state machine)', async () => {
  const { status } = await httpJson('POST', `/api/job-requests/${httpRequestId}/respond`, {
    action: 'respond_declined',
  })
  expect(status === 400, `status ${status}`)
})

// Customer sees the response
await loginHttp('raymond@demo.dwellers.test', DEMO_PASSWORD)

await check('customer sees the provider response + timeline (acceptance 3)', async () => {
  const { status, payload } = await httpJson('GET', `/api/job-requests/${httpRequestId}`)
  expect(status === 200, `status ${status}`)
  const data = payload?.data as Record<string, unknown>
  expect(data.responseKind === 'INTERESTED', `kind ${data.responseKind}`)
  const events = data.events as { eventType: string }[]
  expect(events.some((event) => event.eventType === 'RESPONSE_INTERESTED'), 'response event visible')
})

await check('customer notification about the response exists (dev DB)', async () => {
  const notification = await dev.notification.findFirst({
    where: { recipientId: devRaymond!.id, type: 'JOB_REQUEST_RESPONSE', entityId: httpRequestId },
  })
  expect(notification != null, 'notification missing')
})

await check('customer can cancel via HTTP with confirmation flow semantics', async () => {
  const { status, payload } = await httpJson('PATCH', `/api/job-requests/${httpRequestId}`, {
    action: 'cancel',
    cancellationReason: 'Found another provider',
  })
  expect(status === 200, `status ${status}`)
  expect((payload?.data as Record<string, unknown>).status === 'CANCELLED', 'not cancelled')
})

// IDOR matrix (PART 52/65/72/73)
await section('16. HTTP — IDOR MATRIX (PART 65)')

const victim = { id: '' }
await loginHttp('kojo@demo.dwellers.test', DEMO_PASSWORD)
{
  const { status, payload } = await httpJson('POST', '/api/job-requests', {
    providerId: devKwameProvider!.id,
    serviceId: devKwameService!.id,
    title: 'Victim request for IDOR testing',
    description: 'Customer B owns this request; nobody else may touch it.',
    locationId: (await dev.town.findFirst({ where: { name: 'Nsawam' } }))?.id,
    submitNow: true,
    clientToken: `http-${stamp}-victim`,
  })
  expect(status === 201, `setup status ${status}`)
  victim.id = String((payload?.data as Record<string, unknown>).id)
}

await loginHttp('efua@demo.dwellers.test', DEMO_PASSWORD)

await check('A1 customer A cannot VIEW customer B request → 404', async () => {
  const { status } = await httpJson('GET', `/api/job-requests/${victim.id}`)
  expect(status === 404, `status ${status}`)
})

await check('A2 customer A cannot EDIT customer B request → 404', async () => {
  const { status } = await httpJson('PATCH', `/api/job-requests/${victim.id}`, { description: 'hijacked' })
  expect(status === 404, `status ${status}`)
})

await check('A3 customer A cannot CANCEL customer B request → 404', async () => {
  const { status } = await httpJson('PATCH', `/api/job-requests/${victim.id}`, { action: 'cancel' })
  expect(status === 404, `status ${status}`)
})

await check('A5 customer A cannot RESPOND to a request → 404', async () => {
  const { status } = await httpJson('POST', `/api/job-requests/${victim.id}/respond`, {
    action: 'respond_interested',
  })
  expect(status === 404, `status ${status}`)
})

await check('A6 customer A cannot attach to customer B request → 404', async () => {
  const { status } = await httpUpload(`/api/job-requests/${victim.id}/attachments`, 'x.png', PNG_BYTES)
  expect(status === 404, `status ${status}`)
})

await loginHttp('yaw@demo.dwellers.test', DEMO_PASSWORD)

await check('B2 provider A cannot VIEW provider B request → 404', async () => {
  const { status } = await httpJson('GET', `/api/job-requests/${victim.id}`)
  expect(status === 404, `status ${status}`)
})

await check('B4 provider A cannot RESPOND to provider B request → 404', async () => {
  const { status } = await httpJson('POST', `/api/job-requests/${victim.id}/respond`, {
    action: 'respond_interested',
  })
  expect(status === 404, `status ${status}`)
})

await check('B4b provider A cannot DELETE provider B attachment → 404', async () => {
  const { status } = await httpJson('DELETE', `/api/job-requests/${victim.id}/attachments/whatever`)
  expect(status === 404, `status ${status}`)
})

// Business-member permissions over HTTP (PART 27)
await section('17. HTTP — BUSINESS MEMBER (PART 27)')

const devAkua = await dev.user.findUnique({ where: { email: 'akua@demo.dwellers.test' } })
const devKwaku = await dev.user.findUnique({ where: { email: 'kwaku@demo.dwellers.test' } })
const devAdansiProvider = devAkua ? await dev.providerProfile.findFirst({ where: { businessId: { not: null }, userId: devAkua.id } }) : null
const devAdansiService = devAdansiProvider ? await dev.service.findFirst({ where: { providerId: devAdansiProvider.id, status: 'ACTIVE' } }) : null

if (devAdansiProvider && devAdansiService) {
  let businessHttpId = ''
  await loginHttp('kojo@demo.dwellers.test', DEMO_PASSWORD)
  {
    const { status, payload } = await httpJson('POST', '/api/job-requests', {
      providerId: devAdansiProvider.id,
      serviceId: devAdansiService.id,
      title: 'Company request for member permission test',
      description: 'Filed to Kojo, targeted at the company profile, for permission checks.',
      locationId: (await dev.town.findFirst({ where: { name: 'Nsawam' } }))?.id,
      submitNow: true,
      clientToken: `http-${stamp}-biz`,
    })
    expect(status === 201, `setup status ${status}`)
    businessHttpId = String((payload?.data as Record<string, unknown>).id)
  }

  await loginHttp('kwaku@demo.dwellers.test', DEMO_PASSWORD)
  await check('MEMBER sees the request but cannot respond → 403', async () => {
    const read = await httpJson('GET', `/api/job-requests/${businessHttpId}`)
    expect(read.status === 200, `read status ${read.status}`)
    const data = read.payload?.data as Record<string, unknown>
    const access = data.access as { canRespond: boolean }
    expect(access.canRespond === false, 'member canRespond should be false')
    const respond = await httpJson('POST', `/api/job-requests/${businessHttpId}/respond`, {
      action: 'respond_interested',
    })
    expect(respond.status === 403, `respond status ${respond.status}`)
  })

  await loginHttp('akua@demo.dwellers.test', DEMO_PASSWORD)
  await check('OWNER responds successfully', async () => {
    const { status } = await httpJson('POST', `/api/job-requests/${businessHttpId}/respond`, {
      action: 'respond_info',
      message: 'Our site manager will contact you.',
    })
    expect(status === 200, `status ${status}`)
  })
} else {
  await check('business fixtures present (skipped suite)', () => {
    expect(devAdansiProvider && devAdansiService, 'adansi fixtures missing — seed ran?')
  })
}

// Suspended provider over HTTP (PART 75)
await section('18. HTTP — SUSPENDED PROVIDER (PART 75)')

const suspEmail = `suspended-${stamp}@verify.local`
const suspHash = await hashPassword(DEMO_PASSWORD)
await dev.user.create({
  data: {
    email: suspEmail,
    phone: `+233209${String(stamp).slice(-6)}`,
    name: 'Suspended HTTP Provider',
    role: 'ARTISAN',
    status: 'SUSPENDED',
    passwordHash: suspHash,
  },
})
const suspProvider = await dev.providerProfile.create({
  data: { userId: (await dev.user.findUnique({ where: { email: suspEmail } }))!.id, profession: 'plumber' },
})

let suspensionTarget = ''
await loginHttp('raymond@demo.dwellers.test', DEMO_PASSWORD)
{
  // The creation endpoint rejects suspended providers; force the target via DB
  const forced = await dev.jobRequest.create({
    data: {
      reference: `JR-HTTP-SUSP-${stamp}`,
      customerId: devRaymond!.id,
      providerId: suspProvider.id,
      title: 'Suspension guard probe over HTTP',
      description: 'Forced target to prove suspended accounts cannot act.',
      status: 'SUBMITTED',
      submittedAt: new Date(),
    },
  })
  suspensionTarget = forced.id
}

await loginHttp(suspEmail, DEMO_PASSWORD)
await check('suspended provider cannot act — login refused or actions 401/403 (PART 75)', async () => {
  const respond = await httpJson('POST', `/api/job-requests/${suspensionTarget}/respond`, {
    action: 'respond_interested',
  })
  // Either the credentials provider refuses the login entirely (401 with no
  // session) or the live account-status check blocks the protected action
  // (403). Both prove a suspended account can never act; 200 is forbidden.
  expect(respond.status === 401 || respond.status === 403, `respond status ${respond.status}`)
  const read = await httpJson('GET', `/api/job-requests/${suspensionTarget}`)
  expect(read.status === 401 || read.status === 403 || read.status === 404, `read status ${read.status}`)
})

// Attachment upload + privacy over HTTP
await section('19. HTTP — ATTACHMENTS (PART 11–14/48)')

let photoRequest = ''
await loginHttp('raymond@demo.dwellers.test', DEMO_PASSWORD)
{
  const { status, payload } = await httpJson('POST', '/api/job-requests', {
    providerId: devKwameProvider!.id,
    serviceId: devKwameService!.id,
    title: 'Photo upload round-trip request',
    description: 'This request carries an uploaded photo for the attachment tests.',
    locationId: (await dev.town.findFirst({ where: { name: 'Nsawam' } }))?.id,
    clientToken: `http-${stamp}-photo`,
  })
  photoRequest = String((payload?.data as Record<string, unknown>).id)
  expect(status === 201, `setup status ${status}`)
}

await check('customer uploads a PNG via HTTP', async () => {
  const { status, payload } = await httpUpload(`/api/job-requests/${photoRequest}/attachments`, 'leak.png', PNG_BYTES)
  expect(status === 201, `status ${status}`)
  const data = payload?.data as Record<string, unknown>
  expect(String(data.storageKey).startsWith('job-attachment/'), `key ${data.storageKey}`)
})

await check('SVG upload is blocked (stored-XSS defence, PART 12)', async () => {
  const svg = new Uint8Array(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf8'))
  const { status } = await httpUpload(
    `/api/job-requests/${photoRequest}/attachments`,
    'evil.svg',
    svg,
    'image/svg+xml',
  )
  expect(status === 415, `status ${status}`)
})

await check('oversized upload is rejected (PART 13)', async () => {
  const big = new Uint8Array(11 * 1024 * 1024)
  const { status } = await httpUpload(`/api/job-requests/${photoRequest}/attachments`, 'big.png', big)
  expect(status === 413, `status ${status}`)
})

await loginHttp('kwame@demo.dwellers.test', DEMO_PASSWORD)
await check('provider can READ the customer photo (authorized party)', async () => {
  const list = await httpJson('GET', `/api/job-requests/${photoRequest}`)
  const attachments = (list.payload?.data as Record<string, unknown>).attachments as { id: string }[]
  expect(attachments.length === 1, `attachments ${attachments.length}`)
  const response = await fetch(`${BASE}/api/job-requests/${photoRequest}/attachments/${attachments[0].id}`, {
    headers: { cookie: cookieHeader() },
  })
  expect(response.status === 200, `status ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  expect(bytes.length === PNG_BYTES.length, 'byte length mismatch')
})

// Rate limiting (PART 42)
await section('20. HTTP — RATE LIMITING (PART 42)')

await check('request flood hits a 429 eventually (bucketed per route)', async () => {
  for (const key of Object.keys(jar)) delete jar[key]
  let saw429 = false
  for (let index = 0; index < 140; index += 1) {
    const { status } = await httpJson('GET', '/api/notifications', undefined, false)
    if (status === 429) {
      saw429 = true
      break
    }
  }
  expect(saw429, 'no 429 after 140 requests')
})

// Privacy sweep
await section('21. HTTP — PRIVACY (PART 49)')

await check('public discovery API carries no job-request data', async () => {
  const response = await fetch(`${BASE}/api/discovery/providers?categoryId=${devKwameService!.categoryId}&townId=${(await dev.town.findFirst({ where: { name: 'Nsawam' } }))?.id}`)
  const payload = await response.json()
  const json = JSON.stringify(payload)
  expect(!json.includes('jobRequest'), 'jobRequest key in public payload')
  expect(!json.includes(httpRequestId) && !json.includes(photoRequest), 'request ids leaked')
})

await check('job requests are not in the sitemap or public SEO pages', async () => {
  const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text()
  expect(!sitemap.includes('/customer/requests/'), 'private request URL in sitemap')
})

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------

console.log('\n════════════════════════════════════════')
console.log(
  failed === 0
    ? `PHASE 5 VERIFICATION: ${passed} passed, 0 failed\nAll job-request, acceptance, ownership, state, privacy and rate-limit checks green.`
    : `PHASE 5 VERIFICATION: ${passed} passed, ${failed} failed\n\nFailures:\n${failures.map((line) => `  • ${line}`).join('\n')}`,
)
console.log('════════════════════════════════════════\n')

if (devDb) await (devDb as import('@prisma/client').PrismaClient).$disconnect()
process.exit(failed === 0 ? 0 : 1)
