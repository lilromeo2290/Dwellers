/**
 * Dwellers — Identity module: registration, password & completion services.
 *
 * Registration is PATH-based: the client submits which onboarding journey it
 * is on ("customer" | "artisan" | …) — NEVER a role. The path→role map below
 * is the single authoritative assignment table; staff roles are unreachable
 * through public registration by construction (PART 3/10 of the phase plan).
 *
 * Security invariants:
 *  - passwords are hashed with the existing scrypt utility, never logged
 *  - phones are normalised to canonical +233 form via the shared validator
 *  - duplicate email OR phone yields one generic conflict message (no
 *    account-enumeration signal)
 *  - provider/business records are created inside one transaction with the
 *    user, so a half-registered account can never exist
 *  - every registration/password change writes an audit event
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors'
import {
  ghanaPhoneSchema,
  safeText,
  slugSchema,
  optionalText,
} from '@/lib/api/schemas'
import type { AuthContext } from '@/lib/auth/session'
import { requireAuth } from '@/lib/auth/guards'
import { ROLES, type Role } from '@/lib/auth/roles'
import { hashPassword, verifyPassword, assessPasswordStrength } from '@/lib/auth/password'
import { normalizeGhanaPhoneNumber } from '@/lib/constants/ghana'
import { AUDIT_ACTIONS, recordAudit } from '@/lib/audit'
import { slugify } from '@/lib/utils'
import { createNotification } from '@/modules/communication/notification-service'

// -----------------------------------------------------------------------------
// Registration paths — the ONLY public way to obtain a role
// -----------------------------------------------------------------------------

export const REGISTRATION_PATHS = [
  'customer',
  'artisan',
  'contractor',
  'company',
  'supplier',
  'equipment',
] as const

export type RegistrationPath = (typeof REGISTRATION_PATHS)[number]

/** Authoritative path → role assignment. Never exposed to client choice. */
export const PATH_ROLE_MAP: Record<RegistrationPath, Role> = {
  customer: 'CUSTOMER',
  artisan: 'ARTISAN',
  contractor: 'CONTRACTOR',
  company: 'CONSTRUCTION_COMPANY',
  supplier: 'SUPPLIER',
  equipment: 'EQUIPMENT_PROVIDER',
}

/** Paths that create a professional ProviderProfile for the account. */
const PROVIDER_PATHS: RegistrationPath[] = ['artisan', 'contractor']

// -----------------------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------------------

/** Password policy — reasonable, aligned with assessPasswordStrength(). */
export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine((value) => assessPasswordStrength(value).problems.length === 0, {
    message: 'Use at least 8 characters including an uppercase letter, a lowercase letter and a number',
  })

const accountFields = {
  name: safeText(80, 'Full name'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(120),
  phone: ghanaPhoneSchema,
  password: passwordSchema,
  locationId: z.string().min(1, 'Select your location'),
}

const customerRegistrationSchema = z.object({
  path: z.literal('customer'),
  ...accountFields,
})

const providerRegistrationSchema = z.object({
  path: z.enum(['artisan', 'contractor']),
  ...accountFields,
  profession: slugSchema,
  yearsExperience: z.number().int().min(0).max(60).default(0),
  headline: optionalText(120, 'Headline'),
  biography: optionalText(2000, 'About'),
  serviceAreaIds: z.array(z.string().min(1)).min(1, 'Select at least one service area').max(10),
})

const businessFields = {
  name: safeText(120, 'Business name'),
  description: optionalText(2000, 'Description'),
  phone: ghanaPhoneSchema.optional(),
  email: z.string().trim().toLowerCase().email().max(120).optional(),
  offersDelivery: z.boolean().default(false),
}

const companyRegistrationSchema = z.object({
  path: z.literal('company'),
  ...accountFields,
  business: z.object({
    ...businessFields,
    name: safeText(120, 'Company name'),
  }),
  serviceAreaIds: z.array(z.string().min(1)).min(1, 'Select at least one service area').max(10),
})

const supplierRegistrationSchema = z.object({
  path: z.literal('supplier'),
  ...accountFields,
  business: z.object({
    ...businessFields,
    name: safeText(120, 'Business name'),
  }),
  serviceAreaIds: z.array(z.string().min(1)).min(1, 'Select at least one service area').max(10),
})

const equipmentRegistrationSchema = z.object({
  path: z.literal('equipment'),
  ...accountFields,
  business: z
    .object({
      ...businessFields,
      name: safeText(120, 'Business name').optional(),
    })
    .optional(),
  serviceAreaIds: z.array(z.string().min(1)).min(1, 'Select at least one service area').max(10),
})

export const registerSchema = z.discriminatedUnion('path', [
  customerRegistrationSchema,
  providerRegistrationSchema,
  companyRegistrationSchema,
  supplierRegistrationSchema,
  equipmentRegistrationSchema,
])

export type RegistrationInput = z.infer<typeof registerSchema>

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password').max(128),
    newPassword: passwordSchema,
    confirmPassword: z.string().max(128),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: 'New passwords do not match',
    path: ['confirmPassword'],
  })

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

// -----------------------------------------------------------------------------
// Profile completion (PART 35) — guidance only, never an access gate
// -----------------------------------------------------------------------------

export interface ProfileCompletion {
  percent: number
  missing: string[]
}

export function computeProfileCompletion(input: {
  role: Role
  hasName: boolean
  hasPhone: boolean
  hasEmail: boolean
  hasAvatar: boolean
  hasLocation: boolean
  hasBio: boolean
  hasProfession: boolean
  hasExperience: boolean
  hasHeadline: boolean
  hasServiceAreas: boolean
  hasPortfolio: boolean
  hasBusiness: boolean
  hasBusinessDescription: boolean
  hasBusinessLogo: boolean
}): ProfileCompletion {
  const { role } = input
  const missing: string[] = []
  let total = 0
  let done = 0

  const track = (label: string, ok: boolean) => {
    total += 1
    if (ok) done += 1
    else missing.push(label)
  }

  // Shared identity items (every role).
  track('Full name', input.hasName)
  track('Phone number', input.hasPhone)
  track('Email address', input.hasEmail)
  track('Profile photo', input.hasAvatar)
  track('Location', input.hasLocation)

  if (role === 'CUSTOMER') {
    track('Tell us about yourself', input.hasBio)
  } else if (role === 'ARTISAN' || role === 'CONTRACTOR') {
    track('Profession', input.hasProfession)
    track('Years of experience', input.hasExperience)
    track('Professional headline', input.hasHeadline)
    track('About you', input.hasBio)
    track('Service areas', input.hasServiceAreas)
    track('Portfolio items', input.hasPortfolio)
  } else {
    track('Business name', input.hasBusiness)
    track('Business description', input.hasBusinessDescription)
    track('Business logo', input.hasBusinessLogo)
    track('Service areas', input.hasServiceAreas)
  }

  const percent = total === 0 ? 100 : Math.round((done / total) * 100)
  return { percent, missing }
}

// -----------------------------------------------------------------------------
// Registration
// -----------------------------------------------------------------------------

async function assertLocationsExist(townIds: string[]): Promise<void> {
  const unique = [...new Set(townIds)]
  const towns = await db.town.findMany({
    where: { id: { in: unique } },
    select: { id: true },
  })
  if (towns.length !== unique.length) {
    throw new ValidationError({ locationId: ['One or more selected locations are unknown'] })
  }
}

async function assertProfessionExists(slug: string): Promise<void> {
  const category = await db.category.findUnique({
    where: { slug },
    select: { id: true, isActive: true, level: true },
  })
  if (!category || !category.isActive || category.level < 2) {
    throw new ValidationError({ profession: ['Select a valid profession from the list'] })
  }
}

/** Collision-resistant unique business slug from the business name. */
async function generateBusinessSlug(name: string): Promise<string> {
  const base = slugify(name).slice(0, 60) || 'business'
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `${base}-${Math.random().toString(36).slice(2, 8)}`
    const existing = await db.business.findUnique({ where: { slug: candidate }, select: { id: true } })
    if (!existing) return candidate
  }
  throw new ConflictError('Could not allocate a business URL slug. Try a different business name.')
}

export interface RegisteredAccount {
  id: string
  email: string
  name: string
  role: Role
}

/**
 * Creates a Dwellers account from a public registration path. Role is
 * assigned server-side from PATH_ROLE_MAP — the client cannot nominate one.
 */
export async function registerDwellersAccount(
  input: RegistrationInput,
  requestId: string,
): Promise<RegisteredAccount> {
  // PART 3/10: staff roles are unreachable — defence in depth behind the
  // path enum itself. A crafted payload can never reach a staff role here.
  const role = PATH_ROLE_MAP[input.path]
  if (!role || ROLES.includes(role) === false) {
    throw new ValidationError({ path: ['Unknown registration path'] })
  }
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
    await recordAudit({
      action: AUDIT_ACTIONS.USER_REGISTERED,
      entityType: 'User',
      metadata: { outcome: 'blocked_staff_role', requestId },
    })
    throw new ForbiddenError('This role cannot be registered publicly.')
  }

  const email = input.email.toLowerCase()
  const phone = normalizeGhanaPhoneNumber(input.phone)
  if (!phone) throw new ValidationError({ phone: ['Enter a valid Ghanaian phone number'] })

  // Anti-enumeration: one generic message for either duplicate signal.
  const duplicate = await db.user.findFirst({
    where: { OR: [{ email }, { phone }], deletedAt: null },
    select: { id: true },
  })
  if (duplicate) {
    throw new ConflictError('An account with this email or phone number already exists.')
  }

  await assertLocationsExist([input.locationId])

  // Business payload resolution — supplier/company always; equipment only
  // when a business name was supplied (PART 9: "business name where applicable").
  const resolvedBusiness: {
    name: string
    description: string | null
    email: string | null
    phone: string | null
    offersDelivery: boolean
  } | null =
    input.path === 'company' || input.path === 'supplier'
      ? {
          name: input.business.name,
          description: input.business.description ?? null,
          email: input.business.email ?? null,
          phone: input.business.phone
            ? normalizeGhanaPhoneNumber(input.business.phone)
            : null,
          offersDelivery: input.business.offersDelivery,
        }
      : input.path === 'equipment' && input.business?.name
        ? {
            name: input.business.name,
            description: input.business.description ?? null,
            email: input.business.email ?? null,
            phone: input.business.phone
              ? normalizeGhanaPhoneNumber(input.business.phone)
              : null,
            offersDelivery: input.business.offersDelivery,
          }
        : null

  // Service areas are collected for every non-customer path.
  const areaIds: string[] = input.path === 'customer' ? [] : input.serviceAreaIds

  if (input.path === 'artisan' || input.path === 'contractor') {
    await assertProfessionExists(input.profession)
    await assertLocationsExist(input.serviceAreaIds)
  }
  if (areaIds.length > 0) {
    await assertLocationsExist(areaIds)
  }

  const passwordHash = await hashPassword(input.password)

  const created = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        phone,
        name: input.name,
        passwordHash,
        role,
        status: 'ACTIVE',
        profile: {
          create: { locationId: input.locationId },
        },
      },
      select: { id: true, email: true, name: true, role: true },
    })

    if (input.path === 'artisan' || input.path === 'contractor') {
      await tx.providerProfile.create({
        data: {
          userId: user.id,
          profession: input.profession,
          headline: input.headline ?? null,
          biography: input.biography ?? null,
          yearsExperience: input.yearsExperience,
          primaryLocationId: input.locationId,
          serviceAreas: {
            create: input.serviceAreaIds.map((locationId) => ({ locationId })),
          },
        },
      })
    }

    if (resolvedBusiness) {
      const business = await tx.business.create({
        data: {
          ownerId: user.id,
          name: resolvedBusiness.name,
          slug: await generateBusinessSlug(resolvedBusiness.name),
          businessType:
            input.path === 'company'
              ? 'CONSTRUCTION_COMPANY'
              : input.path === 'supplier'
                ? 'SUPPLIER'
                : 'EQUIPMENT_RENTAL',
          description: resolvedBusiness.description,
          email: resolvedBusiness.email,
          phone: resolvedBusiness.phone,
          locationId: input.locationId,
          offersDelivery: resolvedBusiness.offersDelivery,
          members: {
            create: { userId: user.id, memberRole: 'OWNER', status: 'ACTIVE' },
          },
          serviceAreas: {
            create: areaIds.map((locationId) => ({ locationId })),
          },
        },
        select: { id: true },
      })

      // Business-operated providers also get a ProviderProfile bound to the
      // business so the marketplace treats the company as one provider.
      await tx.providerProfile.create({
        data: {
          userId: user.id,
          businessId: business.id,
          profession: input.path === 'company' ? 'construction-company' : input.path,
          headline: resolvedBusiness.name,
          biography: resolvedBusiness.description,
          primaryLocationId: input.locationId,
          serviceAreas: {
            create: areaIds.map((locationId) => ({ locationId })),
          },
        },
      })
    }

    return user
  })

  await recordAudit({
    actorId: created.id,
    actorRole: role,
    action: AUDIT_ACTIONS.USER_REGISTERED,
    entityType: 'User',
    entityId: created.id,
    metadata: { path: input.path, role },
  })

  // PART 34: in-app welcome + completion guidance (no SMS/email providers).
  await createNotification({
    recipientId: created.id,
    type: 'ACCOUNT_WELCOME',
    title: 'Welcome to Dwellers',
    body:
      role === 'CUSTOMER'
        ? 'Your account is ready. Find trusted artisans, suppliers and construction companies across Ghana.'
        : 'Your account is ready. Complete your profile so customers can find and contact you.',
  })
  if (role !== 'CUSTOMER') {
    await createNotification({
      recipientId: created.id,
      type: 'PROFILE_COMPLETION',
      title: 'Complete your profile',
      body: 'Add your details, service areas and portfolio to build trust with customers.',
    })
  }

  return {
    id: created.id,
    email: created.email,
    name: created.name ?? input.name,
    role: created.role as Role,
  }
}

// -----------------------------------------------------------------------------
// Password change (PART 41)
// -----------------------------------------------------------------------------

/**
 * Changes the CALLER's password. The current password is verified server
 * side; failures are deliberately vague (no "close" signal). Passwords are
 * never logged. Note: stateless JWT sessions remain valid until expiry —
 * session revocation is a prepared future capability (see AUTHENTICATION.md).
 */
export async function changeOwnPassword(
  auth: AuthContext | null,
  input: ChangePasswordInput,
): Promise<void> {
  const context = requireAuth(auth)

  const user = await db.user.findUnique({
    where: { id: context.userId },
    select: { id: true, passwordHash: true, deletedAt: true, status: true },
  })
  if (!user || !user.passwordHash || user.deletedAt || user.status !== 'ACTIVE') {
    throw new NotFoundError('Account')
  }

  const currentOk = await verifyPassword(input.currentPassword, user.passwordHash)
  if (!currentOk) {
    throw new ValidationError({ currentPassword: ['Current password is incorrect'] })
  }

  const passwordHash = await hashPassword(input.newPassword)
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash },
    select: { id: true },
  })

  await recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.USER_PASSWORD_CHANGED,
    entityType: 'User',
    entityId: context.userId,
  })
}
