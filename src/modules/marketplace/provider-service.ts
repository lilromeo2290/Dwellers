/**
 * Dwellers — Marketplace module: businesses & providers.
 *
 * Business profiles (owned companies with teams) and ProviderProfiles (the
 * professional marketplace identity of artisans, contractors and company
 * staff). Every mutation follows load → verify ownership → act.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { BadRequestError, ConflictError, NotFoundError, ValidationError } from '@/lib/errors'
import { optionalGhanaPhoneSchema, optionalText, safeText } from '@/lib/api/schemas'
import { paginationQuerySchema, skipTake } from '@/lib/api/pagination'
import type { AuthContext } from '@/lib/auth/session'
import { requireAuth } from '@/lib/auth/guards'
import { assertOwnership } from '@/lib/auth/ownership'
import { isProviderRole } from '@/lib/auth/roles'
import { slugify } from '@/lib/utils'
import { AUDIT_ACTIONS, recordAudit } from '@/lib/audit'

// -----------------------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------------------

export const BUSINESS_TYPES = [
  'CONTRACTOR',
  'CONSTRUCTION_COMPANY',
  'SUPPLIER',
  'EQUIPMENT_RENTAL',
  'RETAIL',
  'OTHER',
] as const

export const createBusinessSchema = z.object({
  name: safeText(120, 'Business name'),
  businessType: z.enum(BUSINESS_TYPES),
  description: optionalText(4000, 'Description'),
  email: z.string().email().nullable().optional(),
  phone: optionalGhanaPhoneSchema,
  locationId: z.string().min(1).nullable().optional(),
  registrationNumber: optionalText(60, 'Registration number'),
  taxId: optionalText(60, 'Tax ID'),
  serviceAreaIds: z.array(z.string().min(1)).max(50).optional(),
})

export const updateBusinessSchema = createBusinessSchema.partial()

export const businessListQuerySchema = paginationQuerySchema.extend({
  businessType: z.enum(BUSINESS_TYPES).optional(),
  locationId: z.string().optional(),
  q: safeText(120).optional(),
})

export const PROVIDER_PROFESSIONS_MAX = 60

export const createProviderProfileSchema = z.object({
  profession: safeText(PROVIDER_PROFESSIONS_MAX, 'Profession'),
  headline: optionalText(120, 'Headline'),
  biography: optionalText(4000, 'Biography'),
  yearsExperience: z.number().int().min(0).max(70).optional(),
  startingPriceAmount: z.number().int().min(0).nullable().optional(),
  primaryLocationId: z.string().min(1).nullable().optional(),
  serviceAreaIds: z.array(z.string().min(1)).max(50).optional(),
  businessId: z.string().min(1).nullable().optional(),
})

export const updateProviderProfileSchema = createProviderProfileSchema.partial()

export const providerListQuerySchema = paginationQuerySchema.extend({
  profession: safeText(PROVIDER_PROFESSIONS_MAX).optional(),
  locationId: z.string().optional(),
  regionId: z.string().optional(),
  verifiedOnly: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  q: safeText(120).optional(),
})

export type CreateBusinessInput = z.infer<typeof createBusinessSchema>
export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>
export type BusinessListQuery = z.infer<typeof businessListQuerySchema>
export type CreateProviderProfileInput = z.infer<typeof createProviderProfileSchema>
export type UpdateProviderProfileInput = z.infer<typeof updateProviderProfileSchema>
export type ProviderListQuery = z.infer<typeof providerListQuerySchema>

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Resolves an available unique slug for the given base name. */
async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || 'business'
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = attempt === 0 ? root : `${root}-${attempt + 1}`
    const clash = await db.business.findUnique({ where: { slug: candidate } })
    if (!clash) return candidate
  }
  throw new ConflictError('Could not derive a unique business URL. Try a different name.')
}

async function assertLocationsExist(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const unique = [...new Set(ids)]
  const found = await db.town.count({ where: { id: { in: unique } } })
  if (found !== unique.length) {
    throw new ValidationError({ serviceAreaIds: ['One or more service areas are unknown locations'] })
  }
}

// -----------------------------------------------------------------------------
// Businesses
// -----------------------------------------------------------------------------

export async function listBusinesses(query: BusinessListQuery) {
  const where = {
    status: 'ACTIVE',
    deletedAt: null,
    ...(query.businessType ? { businessType: query.businessType } : {}),
    ...(query.locationId ? { locationId: query.locationId } : {}),
    ...(query.q ? { name: { contains: query.q } } : {}),
  }

  const { skip, take } = skipTake(query)
  const [total, businesses] = await Promise.all([
    db.business.count({ where }),
    db.business.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        name: true,
        slug: true,
        businessType: true,
        description: true,
        logoKey: true,
        location: { select: { name: true, region: { select: { name: true } } } },
        verificationStatus: true,
        createdAt: true,
      },
    }),
  ])

  return { items: businesses, total }
}

/** Creates a business owned by the CALLER (permission-gated upstream). */
export async function createBusiness(auth: AuthContext | null, input: CreateBusinessInput) {
  const context = requireAuth(auth)
  const serviceAreaIds = input.serviceAreaIds ?? []
  await assertLocationsExist(serviceAreaIds)
  if (input.locationId) await assertLocationsExist([input.locationId])

  const business = await db.business.create({
    data: {
      ownerId: context.userId,
      name: input.name,
      slug: await uniqueSlug(input.name),
      businessType: input.businessType,
      description: input.description ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      locationId: input.locationId ?? null,
      registrationNumber: input.registrationNumber ?? null,
      taxId: input.taxId ?? null,
      serviceAreas: {
        create: [...new Set(serviceAreaIds)].map((locationId) => ({ locationId })),
      },
      members: {
        create: { userId: context.userId, memberRole: 'OWNER', status: 'ACTIVE' },
      },
    },
  })

  await recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.BUSINESS_CREATED,
    entityType: 'Business',
    entityId: business.id,
    metadata: { name: business.name, businessType: business.businessType },
  })

  return business
}

/** Public business detail (active, non-deleted only). */
export async function getBusiness(id: string) {
  const business = await db.business.findFirst({
    where: { id, status: 'ACTIVE', deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      businessType: true,
      description: true,
      logoKey: true,
      email: true,
      phone: true,
      location: { select: { id: true, name: true, region: { select: { name: true } } } },
      registrationNumber: true,
      verificationStatus: true,
      serviceAreas: {
        select: { location: { select: { id: true, name: true, region: { select: { name: true } } } } },
      },
      createdAt: true,
    },
  })
  if (!business) throw new NotFoundError('Business')
  return business
}

/** Owner-only update (staff override allowed). */
export async function updateBusiness(
  auth: AuthContext | null,
  id: string,
  input: UpdateBusinessInput,
) {
  const context = requireAuth(auth)
  const existing = await db.business.findFirst({ where: { id, deletedAt: null } })
  assertOwnership(existing, context, { allowStaff: true, ownerFields: ['ownerId'] })

  const serviceAreaIds = input.serviceAreaIds
  if (serviceAreaIds) await assertLocationsExist(serviceAreaIds)
  if (input.locationId) await assertLocationsExist([input.locationId])

  const { serviceAreaIds: areas, ...fields } = input
  const business = await db.business.update({
    where: { id },
    data: {
      ...fields,
      ...(areas
        ? {
            serviceAreas: {
              deleteMany: {},
              create: [...new Set(areas)].map((locationId) => ({ locationId })),
            },
          }
        : {}),
    },
  })

  await recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.BUSINESS_UPDATED,
    entityType: 'Business',
    entityId: business.id,
  })

  return business
}

/** Owner-only soft delete. */
export async function deleteBusiness(auth: AuthContext | null, id: string) {
  const context = requireAuth(auth)
  const existing = await db.business.findFirst({ where: { id, deletedAt: null } })
  assertOwnership(existing, context, { allowStaff: true, ownerFields: ['ownerId'] })

  await db.business.update({
    where: { id },
    data: { status: 'DELETED', deletedAt: new Date() },
  })

  await recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.BUSINESS_DEACTIVATED,
    entityType: 'Business',
    entityId: id,
  })
}

// -----------------------------------------------------------------------------
// Provider profiles
// -----------------------------------------------------------------------------

/**
 * Creates the CALLER's provider profile. Only provider roles (artisan,
 * contractor, construction company) may become providers — a customer cannot
 * self-escalate into the supply side.
 */
export async function createProviderProfile(
  auth: AuthContext | null,
  input: CreateProviderProfileInput,
) {
  const context = requireAuth(auth)
  if (!isProviderRole(context.role)) {
    throw new BadRequestError('Only artisan, contractor or company accounts can offer services.')
  }

  const existing = await db.providerProfile.findUnique({ where: { userId: context.userId } })
  if (existing) throw new ConflictError('You already have a provider profile.')

  const serviceAreaIds = input.serviceAreaIds ?? []
  await assertLocationsExist(serviceAreaIds)
  if (input.primaryLocationId) await assertLocationsExist([input.primaryLocationId])

  if (input.businessId) {
    const business = await db.business.findFirst({
      where: { id: input.businessId, deletedAt: null },
    })
    assertOwnership(business, context, { allowStaff: false })
  }

  const profile = await db.providerProfile.create({
    data: {
      userId: context.userId,
      profession: input.profession.toLowerCase(),
      headline: input.headline ?? null,
      biography: input.biography ?? null,
      yearsExperience: input.yearsExperience ?? 0,
      startingPriceAmount: input.startingPriceAmount ?? null,
      primaryLocationId: input.primaryLocationId ?? null,
      businessId: input.businessId ?? null,
      serviceAreas: {
        create: [...new Set(serviceAreaIds)].map((locationId) => ({ locationId })),
      },
    },
  })

  await recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.PROVIDER_PROFILE_CREATED,
    entityType: 'ProviderProfile',
    entityId: profile.id,
    metadata: { profession: profile.profession },
  })

  return profile
}

/**
 * THE discovery query foundation: "plumbers in Nsawam" resolves to
 * providers whose profession matches AND who serve the requested town —
 * via their base location OR an explicit service-area row (both indexed).
 */
export async function listProviders(query: ProviderListQuery) {
  const where = {
    deletedAt: null,
    user: { status: 'ACTIVE' },
    ...(query.profession ? { profession: { contains: query.profession.toLowerCase() } } : {}),
    ...(query.verifiedOnly ? { verificationStatus: 'VERIFIED' } : {}),
    ...(query.q
      ? {
          OR: [
            { profession: { contains: query.q.toLowerCase() } },
            { headline: { contains: query.q } },
          ],
        }
      : {}),
    ...(query.locationId
      ? {
          OR: [
            { primaryLocationId: query.locationId },
            { serviceAreas: { some: { locationId: query.locationId } } },
          ],
        }
      : {}),
    ...(query.regionId
      ? {
          OR: [
            { primaryLocation: { regionId: query.regionId } },
            { serviceAreas: { some: { location: { regionId: query.regionId } } } },
          ],
        }
      : {}),
  }

  const { skip, take } = skipTake(query)
  const [total, providers] = await Promise.all([
    db.providerProfile.count({ where }),
    db.providerProfile.findMany({
      where,
      orderBy: [{ ratingCount: 'desc' }, { createdAt: 'desc' }],
      skip,
      take,
      select: {
        id: true,
        profession: true,
        headline: true,
        yearsExperience: true,
        availabilityStatus: true,
        startingPriceAmount: true,
        verificationStatus: true,
        ratingSum: true,
        ratingCount: true,
        completedJobsCount: true,
        primaryLocation: { select: { id: true, name: true, region: { select: { name: true } } } },
        serviceAreas: {
          select: { location: { select: { id: true, name: true, region: { select: { name: true } } } } },
        },
        user: { select: { name: true, avatarKey: true } },
        business: { select: { id: true, name: true } },
      },
    }),
  ])

  return { items: providers, total }
}

/** Public provider detail. */
export async function getProvider(id: string) {
  const provider = await db.providerProfile.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      profession: true,
      headline: true,
      biography: true,
      yearsExperience: true,
      availabilityStatus: true,
      startingPriceAmount: true,
      verificationStatus: true,
      ratingSum: true,
      ratingCount: true,
      completedJobsCount: true,
      responseRatePercent: true,
      primaryLocation: { select: { id: true, name: true, region: { select: { name: true } } } },
      serviceAreas: {
        select: { location: { select: { id: true, name: true, region: { select: { name: true } } } } },
      },
      business: { select: { id: true, name: true, verificationStatus: true } },
      user: { select: { name: true, avatarKey: true } },
      _count: { select: { services: true, portfolioItems: true, reviews: true } },
    },
  })
  if (!provider) throw new NotFoundError('Provider')
  return provider
}

/** Provider-only update of their own profile (staff override allowed). */
export async function updateProviderProfile(
  auth: AuthContext | null,
  id: string,
  input: UpdateProviderProfileInput,
) {
  const context = requireAuth(auth)
  const existing = await db.providerProfile.findFirst({ where: { id, deletedAt: null } })
  assertOwnership(existing, context, { allowStaff: true })

  const serviceAreaIds = input.serviceAreaIds
  if (serviceAreaIds) await assertLocationsExist(serviceAreaIds)
  if (input.primaryLocationId) await assertLocationsExist([input.primaryLocationId])

  const { serviceAreaIds: areas, profession, ...fields } = input
  const profile = await db.providerProfile.update({
    where: { id },
    data: {
      ...(profession !== undefined ? { profession: profession.toLowerCase() } : {}),
      ...fields,
      ...(areas
        ? {
            serviceAreas: {
              deleteMany: {},
              create: [...new Set(areas)].map((locationId) => ({ locationId })),
            },
          }
        : {}),
    },
  })

  await recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.PROVIDER_PROFILE_UPDATED,
    entityType: 'ProviderProfile',
    entityId: profile.id,
  })

  return profile
}
