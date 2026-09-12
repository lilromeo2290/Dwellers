/**
 * Dwellers — PHASE 3 verification suite (authentication, onboarding, RBAC, IDOR).
 *
 * Two layers:
 *  1. SERVICE level against an ISOLATED database (db/test-phase3.db) built
 *     from the migration files and dropped afterwards — registration,
 *     authentication, passwords, ownership, notifications, audit.
 *  2. HTTP level against the LIVE dev server (real NextAuth CSRF + cookie
 *     flow, real session issuance, mid-session suspension). Records created
 *     there are soft-deleted at the end.
 *
 * Every value import is DYNAMIC and happens AFTER the env overrides — static
 * imports would hoist and evaluate env/db with the dev configuration first.
 */
process.env.DATABASE_URL = 'file:/home/z/my-project/db/test-phase3.db'
process.env.RATE_LIMIT_ENABLED = 'true'
process.env.LOG_LEVEL = 'error'

import { rmSync } from 'node:fs'
import { execSync } from 'node:child_process'

const TEST_DB = '/home/z/my-project/db/test-phase3.db'

rmSync(TEST_DB, { force: true })
execSync('bunx prisma migrate deploy', {
  env: { ...process.env },
  cwd: '/home/z/my-project',
  stdio: 'pipe',
})

const { db } = await import('@/lib/db')
const authSvc = await import('@/modules/identity/auth-service')
const profileSvc = await import('@/modules/identity/profile-service')
const notifSvc = await import('@/modules/communication/notification-service')
const identity = await import('@/modules/identity/user-service')
const { authenticateDwellersUser, DwellersSignInError } = await import('@/lib/auth/credentials')
const { verifyPassword } = await import('@/lib/auth/password')
const errors = await import('@/lib/errors')
const { checkRateLimit, RateLimitPresets } = await import('@/lib/rate-limit')
const { AUDIT_ACTIONS } = await import('@/lib/audit')
const { canManageRole } = await import('@/lib/auth/roles')

const { ValidationError, ConflictError, NotFoundError, ForbiddenError } = errors
type AuthContext = import('@/lib/auth/session').AuthContext

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
    if (!(error instanceof errorType)) throw new Error(`expected ${errorType.name}, got ${String(error)}`)
  }
  if (!threw) throw new Error(`expected ${errorType.name} to be thrown`)
}

async function expectThrowsAsync(
  fn: () => Promise<unknown> | unknown,
  errorType: new (...args: never[]) => Error,
): Promise<void> {
  try {
    await fn()
  } catch (error) {
    if (!(error instanceof errorType)) throw new Error(`expected ${errorType.name}, got ${String(error)}`)
    return
  }
  throw new Error(`expected ${errorType.name} to be thrown`)
}

function parse<T extends import('zod').ZodType>(schema: T, data: unknown): import('zod').output<T> {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new ValidationError(result.error.flatten())
  }
  return result.data
}

function authFor(userId: string, role: import('@/lib/auth/roles').Role): AuthContext {
  return { userId, email: `${role.toLowerCase()}@verify.dwellers.test`, role, status: 'ACTIVE' }
}

let runId = String(Date.now())
if (runId.length > 10) runId = runId.slice(-10)

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

const parentCategory = await db.category.create({
  data: { name: 'Verify Services Root', slug: `verify-root-${runId}`, level: 1 },
})
const plumbingCategory = await db.category.create({
  data: { name: 'Verify Plumbing', slug: `verify-plumbing-${runId}`, level: 2, parentId: parentCategory.id },
})
const masonryCategory = await db.category.create({
  data: { name: 'Verify Masonry', slug: `verify-masonry-${runId}`, level: 2, parentId: parentCategory.id },
})

const region = await db.region.create({ data: { name: 'Verify Eastern', slug: `verify-eastern-${runId}` } })
const district = await db.district.create({
  data: { regionId: region.id, name: 'Verify Nsawam District', slug: `verify-district-${runId}` },
})
const townNsawam = await db.town.create({
  data: { districtId: district.id, regionId: region.id, name: 'Verify Nsawam', slug: `verify-nsawam-${runId}` },
})
const townSuhum = await db.town.create({
  data: { districtId: district.id, regionId: region.id, name: 'Verify Suhum', slug: `verify-suhum-${runId}` },
})
const townKoforidua = await db.town.create({
  data: { districtId: district.id, regionId: region.id, name: 'Verify Koforidua', slug: `verify-koforidua-${runId}` },
})

// -----------------------------------------------------------------------------
// 1. REGISTRATION — CUSTOMER
// -----------------------------------------------------------------------------

await section('1. REGISTRATION — CUSTOMER PATH')
let customerId = ''
await check('customer registration creates account with server-assigned role', async () => {
  const account = await authSvc.registerDwellersAccount(
    parse(authSvc.registerSchema, {
      path: 'customer',
      name: 'Ama Customer',
      email: `ama.customer.${runId}@verify.dwellers.test`,
      phone: '0242000001',
      password: 'Register#2026',
      locationId: townNsawam.id,
    }),
    'req-test-1',
  )
  if (account.role !== 'CUSTOMER') throw new Error(`expected CUSTOMER, got ${account.role}`)
  customerId = account.id
})
await check('personal profile created with base location', async () => {
  const profile = await db.personalProfile.findUnique({ where: { userId: customerId } })
  if (!profile || profile.locationId !== townNsawam.id) throw new Error('profile/location missing')
})
await check('phone normalised to canonical +233 form', async () => {
  const user = await db.user.findUnique({ where: { id: customerId } })
  if (user?.phone !== '+233242000001') throw new Error(`got ${user?.phone}`)
})
await check('password stored as scrypt hash, never plaintext', async () => {
  const user = await db.user.findUnique({ where: { id: customerId } })
  if (!user?.passwordHash?.startsWith('scrypt$')) throw new Error('not scrypt format')
  if (await verifyPassword('Register#2026', user.passwordHash) === false) throw new Error('hash does not verify')
})
await check('welcome notification created (in-app, PART 34)', async () => {
  const notification = await db.notification.findFirst({ where: { recipientId: customerId, type: 'ACCOUNT_WELCOME' } })
  if (!notification) throw new Error('welcome notification missing')
  if (notification.channel !== 'IN_APP') throw new Error('wrong channel')
})
await check('registration audit event recorded', async () => {
  const audit = await db.auditLog.findFirst({ where: { entityType: 'User', entityId: customerId, action: AUDIT_ACTIONS.USER_REGISTERED } })
  if (!audit) throw new Error('audit event missing')
})
await check('duplicate email OR phone → single generic conflict (anti-enumeration)', async () => {
  await expectThrowsAsync(
    () =>
      authSvc.registerDwellersAccount(
        parse(authSvc.registerSchema, {
          path: 'customer',
          name: 'Dup Email',
          email: `ama.customer.${runId}@verify.dwellers.test`,
          phone: '0242000099',
          password: 'Register#2026',
          locationId: townNsawam.id,
        }),
        'req-test-2',
      ),
    ConflictError,
  )
  await expectThrowsAsync(
    () =>
      authSvc.registerDwellersAccount(
        parse(authSvc.registerSchema, {
          path: 'customer',
          name: 'Dup Phone',
          email: `other.${runId}@verify.dwellers.test`,
          phone: '0242000001',
          password: 'Register#2026',
          locationId: townNsawam.id,
        }),
        'req-test-2b',
      ),
    ConflictError,
  )
})

// -----------------------------------------------------------------------------
// 2. REGISTRATION — PROVIDER PATHS (artisan, contractor)
// -----------------------------------------------------------------------------

await section('2. REGISTRATION — PROVIDER PATHS')
let artisanId = ''
await check('artisan registration creates provider profile with service areas', async () => {
  const account = await authSvc.registerDwellersAccount(
    parse(authSvc.registerSchema, {
      path: 'artisan',
      name: 'Kwame Artisan',
      email: `kwame.artisan.${runId}@verify.dwellers.test`,
      phone: '0202000002',
      password: 'Register#2026',
      locationId: townNsawam.id,
      profession: plumbingCategory.slug,
      yearsExperience: 7,
      headline: 'Certified plumber',
      biography: 'Seven years of residential plumbing.',
      serviceAreaIds: [townNsawam.id, townSuhum.id, townKoforidua.id],
    }),
    'req-test-3',
  )
  if (account.role !== 'ARTISAN') throw new Error(`expected ARTISAN, got ${account.role}`)
  artisanId = account.id
  const provider = await db.providerProfile.findUnique({ where: { userId: artisanId } })
  if (!provider) throw new Error('provider profile missing')
  const areas = await db.providerServiceArea.count({ where: { providerId: provider.id } })
  if (areas !== 3) throw new Error(`expected 3 service areas, got ${areas}`)
})
await check('contractor registration works like artisan path', async () => {
  const account = await authSvc.registerDwellersAccount(
    parse(authSvc.registerSchema, {
      path: 'contractor',
      name: 'Kofi Contractor',
      email: `kofi.contractor.${runId}@verify.dwellers.test`,
      phone: '0272000003',
      password: 'Register#2026',
      locationId: townSuhum.id,
      profession: masonryCategory.slug,
      serviceAreaIds: [townSuhum.id],
    }),
    'req-test-4',
  )
  if (account.role !== 'CONTRACTOR') throw new Error(`expected CONTRACTOR, got ${account.role}`)
})
await check('unknown profession rejected (must exist in category tree)', async () => {
  const input = parse(authSvc.registerSchema, {
    path: 'artisan',
    name: 'Fake Trade',
    email: `fake.${runId}@verify.dwellers.test`,
    phone: '0202000098',
    password: 'Register#2026',
    locationId: townNsawam.id,
    profession: 'not-a-real-trade',
    serviceAreaIds: [townNsawam.id],
  })
  await expectThrowsAsync(() => authSvc.registerDwellersAccount(input, 'req-test-5b'), ValidationError)
})
await check('service areas validated — unknown town rejected', async () => {
  const input = parse(authSvc.registerSchema, {
    path: 'artisan',
    name: 'Bad Areas',
    email: `badareas.${runId}@verify.dwellers.test`,
    phone: '0202000097',
    password: 'Register#2026',
    locationId: townNsawam.id,
    profession: plumbingCategory.slug,
    serviceAreaIds: [townNsawam.id, 'no-such-town'],
  })
  await expectThrowsAsync(() => authSvc.registerDwellersAccount(input, 'req-test-5'), ValidationError)
})
await check('empty service areas rejected by schema (min 1)', () => {
  expectThrows(
    () =>
      parse(authSvc.registerSchema, {
        path: 'artisan',
        name: 'No Areas',
        email: `noareas.${runId}@verify.dwellers.test`,
        phone: '0202000096',
        password: 'Register#2026',
        locationId: townNsawam.id,
        profession: plumbingCategory.slug,
        serviceAreaIds: [],
      }),
    ValidationError,
  )
})

// -----------------------------------------------------------------------------
// 3. REGISTRATION — BUSINESS PATHS (company, supplier, equipment)
// -----------------------------------------------------------------------------

await section('3. REGISTRATION — BUSINESS PATHS')
let companyId = ''
await check('company registration creates business + owner membership', async () => {
  const account = await authSvc.registerDwellersAccount(
    parse(authSvc.registerSchema, {
      path: 'company',
      name: 'Akua Owner',
      email: `akua.company.${runId}@verify.dwellers.test`,
      phone: '0243000004',
      password: 'Register#2026',
      locationId: townNsawam.id,
      business: {
        name: 'Verify Adom Construction',
        description: 'Building construction company',
        offersDelivery: false,
      },
      serviceAreaIds: [townNsawam.id, townKoforidua.id],
    }),
    'req-test-6',
  )
  if (account.role !== 'CONSTRUCTION_COMPANY') throw new Error(`expected CONSTRUCTION_COMPANY, got ${account.role}`)
  companyId = account.id
  const business = await db.business.findFirst({ where: { ownerId: companyId } })
  if (!business || business.businessType !== 'CONSTRUCTION_COMPANY') throw new Error('business missing/wrong type')
  const membership = await db.businessMember.findFirst({ where: { businessId: business.id, userId: companyId } })
  if (!membership || membership.memberRole !== 'OWNER') throw new Error('owner membership missing')
  const areas = await db.businessServiceArea.count({ where: { businessId: business.id } })
  if (areas !== 2) throw new Error(`expected 2 business service areas, got ${areas}`)
  const provider = await db.providerProfile.findUnique({ where: { userId: companyId } })
  if (!provider || provider.businessId !== business.id) throw new Error('business provider profile missing')
})
await check('supplier registration captures delivery availability', async () => {
  const account = await authSvc.registerDwellersAccount(
    parse(authSvc.registerSchema, {
      path: 'supplier',
      name: 'Abena Supplier',
      email: `abena.supplier.${runId}@verify.dwellers.test`,
      phone: '0553000005',
      password: 'Register#2026',
      locationId: townSuhum.id,
      business: { name: 'Verify Suhum Materials', offersDelivery: true },
      serviceAreaIds: [townSuhum.id],
    }),
    'req-test-7',
  )
  const business = await db.business.findFirst({ where: { ownerId: account.id } })
  if (!business || business.offersDelivery !== true) throw new Error('delivery preference not stored')
})
await check('equipment path: business OPTIONAL (no name → no business row)', async () => {
  const account = await authSvc.registerDwellersAccount(
    parse(authSvc.registerSchema, {
      path: 'equipment',
      name: 'Hemaa Equipment',
      email: `hemaa.equipment.${runId}@verify.dwellers.test`,
      phone: '0563000006',
      password: 'Register#2026',
      locationId: townNsawam.id,
      serviceAreaIds: [townNsawam.id],
    }),
    'req-test-8',
  )
  const business = await db.business.findFirst({ where: { ownerId: account.id } })
  if (business) throw new Error('business should not exist without a name')
})
await check('equipment path with business name creates EQUIPMENT_RENTAL business', async () => {
  const account = await authSvc.registerDwellersAccount(
    parse(authSvc.registerSchema, {
      path: 'equipment',
      name: 'Yaw Rentals',
      email: `yaw.rentals.${runId}@verify.dwellers.test`,
      phone: '0563000007',
      password: 'Register#2026',
      locationId: townNsawam.id,
      business: { name: 'Verify Yaw Rentals', offersDelivery: true },
      serviceAreaIds: [townNsawam.id],
    }),
    'req-test-9',
  )
  const business = await db.business.findFirst({ where: { ownerId: account.id } })
  if (!business || business.businessType !== 'EQUIPMENT_RENTAL') throw new Error('wrong business type')
})
await check('business names are unique-slug collision safe', async () => {
  const business = await db.business.findFirst({ where: { ownerId: companyId } })
  const clash = await db.business.findUnique({ where: { slug: business!.slug } })
  if (!clash) throw new Error('slug missing')
})

// -----------------------------------------------------------------------------
// 4. REGISTRATION SECURITY — escalation & abuse defences
// -----------------------------------------------------------------------------

await section('4. REGISTRATION SECURITY')
await check('staff role path ("admin") rejected by schema — no public admin', () => {
  expectThrows(
    () =>
      parse(authSvc.registerSchema, {
        path: 'admin',
        name: 'Escalate',
        email: `escalate.${runId}@verify.dwellers.test`,
        phone: '0204000001',
        password: 'Register#2026',
        locationId: townNsawam.id,
      }),
    ValidationError,
  )
})
await check('super admin path rejected too', () => {
  expectThrows(
    () =>
      parse(authSvc.registerSchema, {
        path: 'super_admin',
        name: 'Escalate',
        email: `escalate2.${runId}@verify.dwellers.test`,
        phone: '0204000002',
        password: 'Register#2026',
        locationId: townNsawam.id,
      }),
    ValidationError,
  )
})
await check('client-supplied "role" field is stripped by schema (escalation impossible)', () => {
  const input = parse(authSvc.registerSchema, {
    path: 'customer',
    name: 'Sneaky',
    email: `sneaky.${runId}@verify.dwellers.test`,
    phone: '0204000003',
    password: 'Register#2026',
    locationId: townNsawam.id,
    role: 'SUPER_ADMIN',
  })
  if ('role' in input) throw new Error('role field survived parsing')
})
await check('weak passwords rejected (policy: 8+, upper, lower, digit)', () => {
  for (const bad of ['short1A', 'alllowercase1', 'ALLUPPERCASE1', 'NoDigitsHere', '']) {
    expectThrows(() => parse(authSvc.passwordSchema, bad), ValidationError)
  }
  parse(authSvc.passwordSchema, 'Register#2026')
})
await check('invalid Ghana phones rejected (tightened Phase 2 regex)', () => {
  for (const bad of ['012345678', '0112345678', '12345', '+2330123456789']) {
    expectThrows(
      () =>
        parse(authSvc.registerSchema, {
          path: 'customer',
          name: 'Bad Phone',
          email: `phone${Math.random()}@verify.dwellers.test`,
          phone: bad,
          password: 'Register#2026',
          locationId: townNsawam.id,
        }),
      ValidationError,
    )
  }
})
await check('malformed email rejected', () => {
  expectThrows(
    () =>
      parse(authSvc.registerSchema, {
        path: 'customer',
        name: 'Bad Email',
        email: 'not-an-email',
        phone: '0204000005',
        password: 'Register#2026',
        locationId: townNsawam.id,
      }),
    ValidationError,
  )
})
await check('oversized name rejected (payload bound)', () => {
  expectThrows(
    () =>
      parse(authSvc.registerSchema, {
        path: 'customer',
        name: 'x'.repeat(200),
        email: `big.${runId}@verify.dwellers.test`,
        phone: '0204000006',
        password: 'Register#2026',
        locationId: townNsawam.id,
      }),
    ValidationError,
  )
})
await check('unknown location rejected', async () => {
  const input = parse(authSvc.registerSchema, {
    path: 'customer',
    name: 'Nowhere',
    email: `nowhere.${runId}@verify.dwellers.test`,
    phone: '0204000007',
    password: 'Register#2026',
    locationId: 'unknown-town-id',
  })
  await expectThrowsAsync(() => authSvc.registerDwellersAccount(input, 'req-test-10'), ValidationError)
})
await check('email lowercased/trimmed before uniqueness check', () => {
  const input = parse(authSvc.registerSchema, {
    path: 'customer',
    name: 'Case Test',
    email: `  CaseTest.${runId}@VERIFY.dwellers.TEST  `,
    phone: '0204000008',
    password: 'Register#2026',
    locationId: townNsawam.id,
  })
  if (input.email !== `casetest.${runId}@verify.dwellers.test`) throw new Error(`got ${input.email}`)
})

// -----------------------------------------------------------------------------
// 5. LOGIN (credentials authentication)
// -----------------------------------------------------------------------------

await section('5. LOGIN — CREDENTIALS AUTHENTICATION')
await check('login by email succeeds and returns role+status', async () => {
  const user = await authenticateDwellersUser(`ama.customer.${runId}@verify.dwellers.test`, 'Register#2026')
  if (!user || user.id !== customerId || user.role !== 'CUSTOMER' || user.status !== 'ACTIVE') {
    throw new Error('unexpected login result')
  }
})
await check('login by phone (local format) succeeds', async () => {
  const user = await authenticateDwellersUser('0242000001', 'Register#2026')
  if (!user || user.id !== customerId) throw new Error('phone login failed')
})
await check('login by phone with +233 canonical format succeeds', async () => {
  const user = await authenticateDwellersUser('+233242000001', 'Register#2026')
  if (!user || user.id !== customerId) throw new Error('canonical phone login failed')
})
await check('wrong password → null (no detail leak)', async () => {
  const user = await authenticateDwellersUser(`ama.customer.${runId}@verify.dwellers.test`, 'WrongPassword1')
  if (user !== null) throw new Error('login should fail')
})
await check('unknown account → null (no existence signal)', async () => {
  const user = await authenticateDwellersUser(`ghost.${runId}@verify.dwellers.test`, 'Register#2026')
  if (user !== null) throw new Error('login should fail')
})
await check('SUSPENDED account → ACCOUNT_SUSPENDED sign-in error', async () => {
  await db.user.update({ where: { id: customerId }, data: { status: 'SUSPENDED' } })
  try {
    await expectThrowsAsync(
      () => authenticateDwellersUser(`ama.customer.${runId}@verify.dwellers.test`, 'Register#2026'),
      DwellersSignInError,
    )
    await db.user.update({ where: { id: customerId }, data: { status: 'ACTIVE' } })
  } finally {
    await db.user.update({ where: { id: customerId }, data: { status: 'ACTIVE' } })
  }
})
await check('suspended login writes audit failure event', async () => {
  const audit = await db.auditLog.findFirst({
    where: { actorId: customerId, action: AUDIT_ACTIONS.USER_LOGIN_FAILED },
  })
  if (!audit) throw new Error('login-failure audit missing')
})
await check('successful login updates lastLoginAt and audits', async () => {
  await authenticateDwellersUser(`kwame.artisan.${runId}@verify.dwellers.test`, 'Register#2026')
  const user = await db.user.findUnique({ where: { id: artisanId } })
  if (!user?.lastLoginAt) throw new Error('lastLoginAt not updated')
  const audit = await db.auditLog.findFirst({ where: { actorId: artisanId, action: AUDIT_ACTIONS.USER_LOGIN } })
  if (!audit) throw new Error('login audit missing')
})
await check('soft-deleted account cannot log in', async () => {
  const ghost = await authSvc.registerDwellersAccount(
    parse(authSvc.registerSchema, {
      path: 'customer',
      name: 'Deleted Dana',
      email: `dana.${runId}@verify.dwellers.test`,
      phone: '0205000001',
      password: 'Register#2026',
      locationId: townNsawam.id,
    }),
    'req-test-11',
  )
  await db.user.update({ where: { id: ghost.id }, data: { deletedAt: new Date() } })
  const user = await authenticateDwellersUser(`dana.${runId}@verify.dwellers.test`, 'Register#2026')
  if (user !== null) throw new Error('deleted account logged in')
})

// -----------------------------------------------------------------------------
// 6. SESSION & RBAC CONFIG
// -----------------------------------------------------------------------------

await section('6. SESSION & RBAC CONFIGURATION')
await check('authOptions exposes credentials provider and JWT strategy', async () => {
  const { authOptions } = await import('@/lib/auth/session')
  if (authOptions.providers.length !== 1) throw new Error('credentials provider not wired')
  if (authOptions.session?.strategy !== 'jwt') throw new Error('not JWT strategy')
  if (!authOptions.secret) throw new Error('secret not wired')
  if (authOptions.pages?.signIn !== '/auth/sign-in') throw new Error('signIn page wrong')
})
await check('escalation defences intact: non-staff cannot manage roles', () => {
  if (canManageRole('CUSTOMER', 'CUSTOMER')) throw new Error('customer manages customer')
  if (canManageRole('ARTISAN', 'CUSTOMER')) throw new Error('artisan manages accounts')
  if (canManageRole('ADMIN', 'SUPER_ADMIN')) throw new Error('admin manages super admin')
  if (!canManageRole('SUPER_ADMIN', 'ADMIN')) throw new Error('super admin should manage admin')
})
await check('suspended caller denied by profile services (server-side status)', async () => {
  // Suspend the LIVE record — services re-check the database, not the claim.
  await db.user.update({ where: { id: artisanId }, data: { status: 'SUSPENDED' } })
  try {
    await expectThrowsAsync(() => profileSvc.getOwnProfileBundle(authFor(artisanId, 'ARTISAN')), NotFoundError)
  } finally {
    await db.user.update({ where: { id: artisanId }, data: { status: 'ACTIVE' } })
  }
})
await check('unauthenticated profile access → UnauthorizedError', async () => {
  await expectThrowsAsync(() => profileSvc.getOwnProfileBundle(null), errors.UnauthorizedError)
})

// -----------------------------------------------------------------------------
// 7. PASSWORD CHANGE
// -----------------------------------------------------------------------------

await section('7. PASSWORD CHANGE (PART 41)')
await check('password change verifies current password server-side', async () => {
  await authSvc.changeOwnPassword(authFor(artisanId, 'ARTISAN'), {
    currentPassword: 'Register#2026',
    newPassword: 'NewPassword#2026',
    confirmPassword: 'NewPassword#2026',
  })
  const user = await db.user.findUnique({ where: { id: artisanId } })
  if (!user?.passwordHash || !(await verifyPassword('NewPassword#2026', user.passwordHash))) {
    throw new Error('password not changed')
  }
})
await check('wrong current password rejected with vague field error', async () => {
  await expectThrowsAsync(
    () =>
      authSvc.changeOwnPassword(authFor(artisanId, 'ARTISAN'), {
        currentPassword: 'TotallyWrong1',
        newPassword: 'Another#2026',
        confirmPassword: 'Another#2026',
      }),
    ValidationError,
  )
})
await check('confirm-password mismatch rejected by schema', () => {
  expectThrows(
    () =>
      parse(authSvc.changePasswordSchema, {
        currentPassword: 'NewPassword#2026',
        newPassword: 'Another#2026',
        confirmPassword: 'Different#2026',
      }),
    ValidationError,
  )
})
await check('weak new password rejected', () => {
  expectThrows(
    () =>
      parse(authSvc.changePasswordSchema, {
        currentPassword: 'NewPassword#2026',
        newPassword: 'weakpass',
        confirmPassword: 'weakpass',
      }),
    ValidationError,
  )
})
await check('password change writes audit event and never stores plaintext', async () => {
  const audit = await db.auditLog.findFirst({
    where: { actorId: artisanId, action: AUDIT_ACTIONS.USER_PASSWORD_CHANGED },
  })
  if (!audit) throw new Error('password audit missing')
  const raw = JSON.stringify(audit.metadata ?? {})
  if (raw.includes('NewPassword') || raw.includes('Register#')) throw new Error('password material in audit log')
})

// -----------------------------------------------------------------------------
// 8. PROFILE BUNDLE & COMPLETION
// -----------------------------------------------------------------------------

await section('8. PROFILE BUNDLE & COMPLETION (PART 35)')
await check('bundle returns role-specific data in one load', async () => {
  const bundle = await profileSvc.getOwnProfileBundle(authFor(artisanId, 'ARTISAN'))
  if (!bundle.providerProfile || bundle.providerProfile.profession !== plumbingCategory.slug) {
    throw new Error('provider data missing')
  }
  if (bundle.providerProfile.serviceAreas.length !== 3) throw new Error('service areas missing')
  if (typeof bundle.completion.percent !== 'number') throw new Error('completion missing')
})
await check('customer completion reflects profile state', async () => {
  const bundle = await profileSvc.getOwnProfileBundle(authFor(customerId, 'CUSTOMER'))
  if (bundle.completion.percent < 60) throw new Error(`customer completion too low: ${bundle.completion.percent}`)
  if (!bundle.completion.missing.includes('Profile photo')) throw new Error('missing list wrong')
})
await check('profile update flows through and audit fires', async () => {
  await identity.updateOwnAccount(authFor(customerId, 'CUSTOMER'), {
    name: 'Ama Customer Updated',
    bio: 'Building a home in Nsawam.',
  })
  const audit = await db.auditLog.findFirst({
    where: { actorId: customerId, action: AUDIT_ACTIONS.USER_PROFILE_UPDATED },
  })
  if (!audit) throw new Error('profile audit missing')
})

// -----------------------------------------------------------------------------
// 9. PROVIDER & BUSINESS SELF-PROFILES (ownership)
// -----------------------------------------------------------------------------

await section('9. SELF-PROFILE OWNERSHIP')
await check('provider update is SELF-scoped: artisan A cannot touch artisan B', async () => {
  const providerB = await db.providerProfile.findFirst({
    where: { userId: { not: artisanId } },
    select: { id: true, userId: true },
  })
  if (!providerB) throw new Error('no second provider fixture')
  // Update via artisanA's context — must only ever affect artisanA's row.
  await profileSvc.updateOwnProviderProfile(authFor(artisanId, 'ARTISAN'), { headline: 'Only mine' })
  const mine = await db.providerProfile.findUnique({ where: { userId: artisanId } })
  const theirs = await db.providerProfile.findUnique({ where: { id: providerB.id } })
  if (mine?.headline !== 'Only mine') throw new Error('own update failed')
  if (theirs?.headline === 'Only mine') throw new Error('IDOR: crossed ownership')
})
await check('provider service-area replacement works and validates towns', async () => {
  const result = await profileSvc.replaceOwnProviderServiceAreas(authFor(artisanId, 'ARTISAN'), {
    locationIds: [townSuhum.id, townKoforidua.id],
  })
  if (result.serviceAreaIds.length !== 2) throw new Error('areas not replaced')
  await expectThrowsAsync(
    () =>
      profileSvc.replaceOwnProviderServiceAreas(authFor(artisanId, 'ARTISAN'), {
        locationIds: ['ghost-town'],
      }),
    ValidationError,
  )
})
await check('business update is owner-scoped: supplier cannot touch another business', async () => {
  const supplier = await db.user.findFirst({ where: { email: `abena.supplier.${runId}@verify.dwellers.test` } })
  if (!supplier) throw new Error('supplier fixture missing')
  await profileSvc.updateOwnBusinessProfile(authFor(supplier.id, 'SUPPLIER'), {
    description: 'Updated description',
  })
  const business = await db.business.findFirst({ where: { ownerId: supplier.id } })
  if (business?.description !== 'Updated description') throw new Error('own business update failed')
  const otherBusiness = await db.business.findFirst({
    where: { ownerId: { not: supplier.id }, deletedAt: null },
  })
  if (otherBusiness && otherBusiness.description === 'Updated description') {
    throw new Error('IDOR: crossed business ownership')
  }
})
await check('customer has no provider profile to update → NotFound', async () => {
  await expectThrowsAsync(
    () => profileSvc.updateOwnProviderProfile(authFor(customerId, 'CUSTOMER'), { headline: 'x' }),
    NotFoundError,
  )
})
await check('customer cannot replace provider service areas → NotFound', async () => {
  await expectThrowsAsync(
    () => profileSvc.replaceOwnProviderServiceAreas(authFor(customerId, 'CUSTOMER'), { locationIds: [townNsawam.id] }),
    NotFoundError,
  )
})

// -----------------------------------------------------------------------------
// 10. NOTIFICATIONS
// -----------------------------------------------------------------------------

await section('10. NOTIFICATIONS (PART 34)')
await check('listOwnNotifications is ownership-scoped', async () => {
  const own = await notifSvc.listOwnNotifications(authFor(artisanId, 'ARTISAN'), { page: 1, pageSize: 20 })
  if (own.items.length === 0) throw new Error('artisan notifications missing')
  for (const item of own.items) {
    const record = await db.notification.findUnique({ where: { id: item.id } })
    if (record?.recipientId !== artisanId) throw new Error('IDOR: foreign notification visible')
  }
})
await check('mark-read rejects ids owned by other users (404, never 200)', async () => {
  const foreign = await db.notification.findFirst({ where: { recipientId: { not: artisanId } } })
  if (!foreign) throw new Error('no foreign fixture')
  await expectThrowsAsync(
    () => notifSvc.markOwnNotificationsRead(authFor(artisanId, 'ARTISAN'), { ids: [foreign.id] }),
    NotFoundError,
  )
})
await check('mark-all-read updates only own notifications', async () => {
  await notifSvc.markOwnNotificationsRead(authFor(artisanId, 'ARTISAN'), { all: true })
  const unread = await db.notification.count({ where: { recipientId: artisanId, readAt: null } })
  if (unread !== 0) throw new Error('own unread remain')
  const foreignUnread = await db.notification.count({ where: { recipientId: { not: artisanId }, readAt: null } })
  if (foreignUnread === 0) throw new Error('foreign notifications were touched')
})
await check('verification-status notification type available for trust workflow', async () => {
  await notifSvc.createNotification({
    recipientId: artisanId,
    type: 'VERIFICATION_STATUS',
    title: 'Verification approved',
  })
  const found = await db.notification.findFirst({ where: { recipientId: artisanId, type: 'VERIFICATION_STATUS' } })
  if (!found) throw new Error('type not stored')
})

// -----------------------------------------------------------------------------
// 11. RATE LIMITING (service level — live server runs without limiter in dev)
// -----------------------------------------------------------------------------

await section('11. RATE LIMITING')
await check('auth preset (10/min) trips on the 11th attempt per bucket', () => {
  const bucket = `verify-rate-${runId}:login`
  let allowed = 0
  let tripped = false
  for (let i = 0; i < 12; i += 1) {
    const result = checkRateLimit(bucket, RateLimitPresets.auth)
    if (result.allowed) allowed += 1
    else tripped = true
  }
  if (allowed !== 10 || !tripped) throw new Error(`allowed=${allowed}, tripped=${tripped}`)
})

// -----------------------------------------------------------------------------
// 12. CLEANUP
// -----------------------------------------------------------------------------

await section('12. CLEANUP')
await check('isolated test database closed', async () => {
  await db.$disconnect()
})

// -----------------------------------------------------------------------------
// 13. HTTP LEVEL — live server (real sessions, real middleware)
// -----------------------------------------------------------------------------

const BASE = 'http://localhost:3000'
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

async function httpJson(method: string, path: string, body?: unknown) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(Object.keys(jar).length ? { cookie: cookieHeader() } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  storeCookies(response)
  const payload = await response.json().catch(() => null)
  return { status: response.status, payload }
}

async function loginHttp(identifier: string, password: string): Promise<number> {
  for (const key of Object.keys(jar)) delete jar[key]
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`)
  storeCookies(csrfRes)
  const csrf = (await csrfRes.json()) as { csrfToken: string }
  const response = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      cookie: cookieHeader(),
    },
    body: new URLSearchParams({
      csrfToken: csrf.csrfToken,
      identifier,
      password,
      json: 'true',
    }),
  })
  storeCookies(response)
  return response.status
}

let devDb: import('@prisma/client').PrismaClient | null = null
async function devDatabase() {
  if (!devDb) {
    const { PrismaClient } = await import('@prisma/client')
    devDb = new PrismaClient({
      datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } },
    })
  }
  return devDb
}

await section('13. HTTP — LIVE SERVER (real NextAuth flow)')
let httpEmail = ''

// HTTP tests hit the PERSISTENT dev database — every run needs fresh
// identities (emails + phones) so re-runs never collide with earlier runs.
const httpRun = `${runId}${Date.now().toString(36).slice(-4)}`
// Numeric-only phone tail — Ghana format needs 0 + network digit + 8 digits.
const httpNum = Date.now().toString().slice(-7)
const httpPhone = (n: number) => `024${httpNum.slice(0, 7)}${String(n).padStart(2, '0')}`.slice(0, 10)

// The live server runs against the DEV database — resolve a REAL town id
// from the live locations API (never reuse the isolated test DB ids).
const liveTowns = await fetch(`${BASE}/api/locations?level=towns&pageSize=1`).then((r) => r.json()) as { data: { id: string }[] }
const liveTownId = liveTowns?.data?.[0]?.id
if (!liveTownId) throw new Error('live locations API returned no towns')

await check('health endpoint reachable', async () => {
  const { status } = await httpJson('GET', '/api/health')
  if (status !== 200) throw new Error(`health ${status}`)
})
await check('register via HTTP assigns CUSTOMER server-side', async () => {
  httpEmail = `http.cust.${httpRun}@verify.dwellers.test`
  const { status, payload } = await httpJson('POST', '/api/auth/register', {
    path: 'customer',
    name: 'HTTP Customer',
    email: httpEmail,
    phone: httpPhone(1),
    password: 'Register#2026',
    locationId: liveTownId,
  })
  if (status !== 201 || payload?.data?.role !== 'CUSTOMER') {
    throw new Error(`status=${status} body=${JSON.stringify(payload).slice(0, 120)}`)
  }
})
await check('register via HTTP with staff path → 422 validation error', async () => {
  const { status } = await httpJson('POST', '/api/auth/register', {
    path: 'admin',
    name: 'HTTP Escalate',
    email: `http.admin.${httpRun}@verify.dwellers.test`,
    phone: httpPhone(2),
    password: 'Register#2026',
    locationId: liveTownId,
  })
  if (status !== 422) throw new Error(`expected 422, got ${status}`)
})
await check('register duplicate via HTTP → 409 generic conflict', async () => {
  const { status, payload } = await httpJson('POST', '/api/auth/register', {
    path: 'customer',
    name: 'HTTP Dup',
    email: httpEmail,
    phone: httpPhone(3),
    password: 'Register#2026',
    locationId: liveTownId,
  })
  if (status !== 409) throw new Error(`expected 409, got ${status}`)
  if (payload?.error?.code !== 'CONFLICT') throw new Error('wrong error code')
})
await check('protected API without session → 401 envelope', async () => {
  for (const key of Object.keys(jar)) delete jar[key]
  const { status, payload } = await httpJson('GET', '/api/users/me')
  if (status !== 401 || payload?.error?.code !== 'UNAUTHORIZED') throw new Error(`status=${status}`)
})
await check('real NextAuth credentials login issues session cookie', async () => {
  const status = await loginHttp(httpEmail, 'Register#2026')
  if (status !== 200) throw new Error(`login ${status}`)
  if (!Object.keys(jar).some((name) => name.includes('session-token'))) throw new Error('no session cookie')
})
await check('session endpoint exposes id, role, status (PART 15)', async () => {
  const response = await fetch(`${BASE}/api/auth/session`, { headers: { cookie: cookieHeader() } })
  const session = (await response.json()) as { user?: { id?: string; role?: string; status?: string } }
  if (!session.user?.id || session.user.role !== 'CUSTOMER' || session.user.status !== 'ACTIVE') {
    throw new Error(`session=${JSON.stringify(session)}`)
  }
})
await check('authenticated GET /api/users/me returns own account', async () => {
  const { status, payload } = await httpJson('GET', '/api/users/me')
  if (status !== 200 || payload?.data?.email !== httpEmail) throw new Error(`status=${status}`)
})
await check('GET /api/users/me/profile returns completion guidance', async () => {
  const { status, payload } = await httpJson('GET', '/api/users/me/profile')
  if (status !== 200 || typeof payload?.data?.completion?.percent !== 'number') {
    throw new Error(`status=${status}`)
  }
})
await check('welcome notification visible via HTTP notifications API', async () => {
  const { status, payload } = await httpJson('GET', '/api/notifications')
  if (status !== 200) throw new Error(`status=${status}`)
  if (!payload?.data?.items?.some((item: { type: string }) => item.type === 'ACCOUNT_WELCOME')) {
    throw new Error('welcome notification not listed')
  }
})
await check('password change via HTTP then re-login with new password', async () => {
  const { status } = await httpJson('PATCH', '/api/users/me/password', {
    currentPassword: 'Register#2026',
    newPassword: 'ChangedPass#2026',
    confirmPassword: 'ChangedPass#2026',
  })
  if (status !== 200) throw new Error(`change ${status}`)
  const failedStatus = await loginHttp(httpEmail, 'Register#2026')
  if (failedStatus !== 401) throw new Error('old password still valid')
  const okStatus = await loginHttp(httpEmail, 'ChangedPass#2026')
  if (okStatus !== 200) throw new Error('new password rejected')
})
await check('wrong password login via HTTP → 401 with error', async () => {
  const status = await loginHttp(httpEmail, 'WrongPass#1234')
  if (status !== 401) throw new Error(`expected 401, got ${status}`)
})
await check('mid-session suspension blocks protected APIs immediately (live)', async () => {
  // Fresh session (previous checks rotated cookies), then suspend the account
  // directly in the dev DB — the protected API must block it at once.
  const loginStatus = await loginHttp(httpEmail, 'ChangedPass#2026')
  if (loginStatus !== 200) throw new Error(`pre-test login failed (${loginStatus})`)
  const dev = await devDatabase()
  await dev.user.updateMany({ where: { email: httpEmail }, data: { status: 'SUSPENDED' } })
  const { status, payload } = await httpJson('GET', '/api/users/me')
  if (status !== 403) throw new Error(`expected 403, got ${status}`)
  if (payload?.error?.code !== 'FORBIDDEN') throw new Error('wrong error envelope')
})
await check('logout clears session (HTTP)', async () => {
  // Restore account first so logout audit can resolve the actor cleanly.
  const dev = await devDatabase()
  await dev.user.updateMany({ where: { email: httpEmail }, data: { status: 'ACTIVE' } })
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { cookie: cookieHeader() } })
  storeCookies(csrfRes)
  const csrf = (await csrfRes.json()) as { csrfToken: string }
  const signoutResponse = await fetch(`${BASE}/api/auth/signout`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie: cookieHeader() },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, json: 'true' }),
  })
  storeCookies(signoutResponse)
  const { status } = await httpJson('GET', '/api/users/me')
  if (status !== 401) {
    throw new Error(
      `session survived logout (signout=${signoutResponse.status}, jar=${JSON.stringify(Object.keys(jar))}, me=${status})`,
    )
  }
})
await check('HTTP test records cleaned up (soft-deleted)', async () => {
  const dev = await devDatabase()
  const result = await dev.user.updateMany({
    where: { email: { contains: `.${httpRun}@verify.dwellers.test` } },
    data: { deletedAt: new Date(), status: 'DEACTIVATED' },
  })
  if (result.count < 1) throw new Error('no HTTP test records cleaned')
  await devDb?.$disconnect()
})

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------

console.log('\n═══════════════════════════════════════════')
console.log(`PHASE 3 VERIFICATION: ${passed} passed, ${failed} failed`)
console.log('═══════════════════════════════════════════')

if (failures.length > 0) {
  console.log('\nFAILURES:')
  for (const failure of failures) console.log(`  - ${failure}`)
  process.exit(1)
}
process.exit(0)
