/**
 * Dwellers — Identity module: self-service profile bundle.
 *
 * Powers the dashboards and the /api/users/me/profile endpoint. Ownership is
 * inherent everywhere: every query is scoped by the session user id — client
 * supplied ids are never consulted (PART 17, load→verify→act).
 *
 * The bundle is ONE round of parallel queries (PART 49): dashboard and profile
 * loads never issue per-field queries.
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import type { AuthContext } from '@/lib/auth/session'
import { requireAuth } from '@/lib/auth/guards'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { optionalGhanaPhoneSchema, optionalText, safeText } from '@/lib/api/schemas'
import type { Role } from '@/lib/auth/roles'
import { computeProfileCompletion, type ProfileCompletion } from '@/modules/identity/auth-service'
import { AUDIT_ACTIONS, recordAudit } from '@/lib/audit'

// -----------------------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------------------

export const updateProviderProfileSchema = z.object({
  profession: z.string().min(1).max(80).optional(),
  headline: optionalText(120, 'Headline'),
  biography: optionalText(2000, 'About'),
  yearsExperience: z.number().int().min(0).max(60).optional(),
  availabilityStatus: z.enum(['AVAILABLE', 'BUSY', 'UNAVAILABLE']).optional(),
  primaryLocationId: z.string().min(1).nullable().optional(),
})

export type UpdateProviderProfileInput = z.infer<typeof updateProviderProfileSchema>

export const updateBusinessProfileSchema = z.object({
  name: safeText(120, 'Business name').optional(),
  description: optionalText(2000, 'Description'),
  phone: optionalGhanaPhoneSchema,
  email: z.string().trim().toLowerCase().email().max(120).nullable().optional(),
  locationId: z.string().min(1).nullable().optional(),
  offersDelivery: z.boolean().optional(),
})

export type UpdateBusinessProfileInput = z.infer<typeof updateBusinessProfileSchema>

export const replaceServiceAreasSchema = z.object({
  locationIds: z.array(z.string().min(1)).min(1, 'Select at least one service area').max(10),
})

export type ReplaceServiceAreasInput = z.infer<typeof replaceServiceAreasSchema>

// -----------------------------------------------------------------------------
// Own profile bundle (account + role-specific profile + completion)
// -----------------------------------------------------------------------------

export interface OwnProfileBundle {
  account: {
    id: string
    email: string
    name: string | null
    phone: string | null
    role: Role
    status: string
    avatarKey: string | null
    createdAt: Date
  }
  personalProfile: {
    bio: string | null
    addressLine: string | null
    website: string | null
    location: { id: string; name: string; regionName: string | null } | null
  } | null
  providerProfile: {
    id: string
    profession: string
    headline: string | null
    biography: string | null
    yearsExperience: number
    availabilityStatus: string
    verificationStatus: string
    primaryLocation: { id: string; name: string; regionName: string | null } | null
    serviceAreas: { id: string; name: string; regionName: string | null }[]
  } | null
  business: {
    id: string
    name: string
    slug: string
    businessType: string
    description: string | null
    email: string | null
    phone: string | null
    logoKey: string | null
    offersDelivery: boolean
    verificationStatus: string
    location: { id: string; name: string; regionName: string | null } | null
    serviceAreas: { id: string; name: string; regionName: string | null }[]
    memberRole: string
  } | null
  completion: ProfileCompletion
}

async function loadTownsWithRegion(ids: string[]) {
  if (ids.length === 0) return []
  const towns = await db.town.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, district: { select: { name: true, region: { select: { name: true } } } } },
  })
  return towns.map((town) => ({
    id: town.id,
    name: town.name,
    regionName: town.district.region.name,
  }))
}

/** Everything a dashboard header/profile page needs, in one parallel load. */
export async function getOwnProfileBundle(auth: AuthContext | null): Promise<OwnProfileBundle> {
  const context = requireAuth(auth)

  const user = await db.user.findUnique({
    where: { id: context.userId },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      status: true,
      avatarKey: true,
      createdAt: true,
      profile: {
        select: {
          bio: true,
          addressLine: true,
          website: true,
          locationId: true,
        },
      },
      providerProfile: {
        select: {
          id: true,
          profession: true,
          headline: true,
          biography: true,
          yearsExperience: true,
          availabilityStatus: true,
          verificationStatus: true,
          primaryLocationId: true,
          serviceAreas: { select: { locationId: true } },
        },
      },
      ownedBusinesses: {
        where: { status: 'ACTIVE', deletedAt: null },
        select: {
          id: true,
          name: true,
          slug: true,
          businessType: true,
          description: true,
          email: true,
          phone: true,
          logoKey: true,
          offersDelivery: true,
          verificationStatus: true,
          locationId: true,
          members: { where: { userId: context.userId }, select: { memberRole: true } },
          serviceAreas: { select: { locationId: true } },
        },
        take: 1,
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!user || user.status !== 'ACTIVE') throw new NotFoundError('Account')

  // Resolve location names in parallel.
  const locationIds = [
    user.profile?.locationId,
    user.providerProfile?.primaryLocationId,
    user.ownedBusinesses[0]?.locationId ?? null,
    ...(user.providerProfile?.serviceAreas.map((area) => area.locationId) ?? []),
    ...(user.ownedBusinesses[0]?.serviceAreas.map((area) => area.locationId) ?? []),
  ].filter((id): id is string => typeof id === 'string')
  const towns = await loadTownsWithRegion([...new Set(locationIds)])
  const townById = new Map(towns.map((town) => [town.id, town]))

  const personalLocation = user.profile?.locationId
    ? townById.get(user.profile.locationId) ?? null
    : null

  const providerServiceAreas = (user.providerProfile?.serviceAreas ?? [])
    .map((area) => townById.get(area.locationId))
    .filter((town): town is NonNullable<typeof town> => Boolean(town))

  const businessRecord = user.ownedBusinesses[0] ?? null
  const businessServiceAreas = (businessRecord?.serviceAreas ?? [])
    .map((area) => townById.get(area.locationId))
    .filter((town): town is NonNullable<typeof town> => Boolean(town))

  // Portfolio count for completion (providers only, single aggregate query).
  const portfolioCount = user.providerProfile
    ? await db.portfolioItem.count({ where: { providerId: user.providerProfile.id } })
    : 0

  const completion = computeProfileCompletion({
    role: user.role as Role,
    hasName: Boolean(user.name),
    hasPhone: Boolean(user.phone),
    hasEmail: Boolean(user.email),
    hasAvatar: Boolean(user.avatarKey),
    hasLocation: Boolean(user.profile?.locationId),
    hasBio: Boolean(user.profile?.bio || user.providerProfile?.biography),
    hasProfession: Boolean(user.providerProfile?.profession),
    hasExperience: (user.providerProfile?.yearsExperience ?? 0) > 0,
    hasHeadline: Boolean(user.providerProfile?.headline),
    hasServiceAreas:
      (user.providerProfile?.serviceAreas.length ?? 0) > 0 ||
      (businessRecord?.serviceAreas.length ?? 0) > 0,
    hasPortfolio: portfolioCount > 0,
    hasBusiness: Boolean(businessRecord),
    hasBusinessDescription: Boolean(businessRecord?.description),
    hasBusinessLogo: Boolean(businessRecord?.logoKey),
  })

  return {
    account: {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role as Role,
      status: user.status,
      avatarKey: user.avatarKey,
      createdAt: user.createdAt,
    },
    personalProfile: user.profile
      ? {
          bio: user.profile.bio,
          addressLine: user.profile.addressLine,
          website: user.profile.website,
          location: personalLocation,
        }
      : null,
    providerProfile: user.providerProfile
      ? {
          id: user.providerProfile.id,
          profession: user.providerProfile.profession,
          headline: user.providerProfile.headline,
          biography: user.providerProfile.biography,
          yearsExperience: user.providerProfile.yearsExperience,
          availabilityStatus: user.providerProfile.availabilityStatus,
          verificationStatus: user.providerProfile.verificationStatus,
          primaryLocation: user.providerProfile.primaryLocationId
            ? townById.get(user.providerProfile.primaryLocationId) ?? null
            : null,
          serviceAreas: providerServiceAreas,
        }
      : null,
    business: businessRecord
      ? {
          id: businessRecord.id,
          name: businessRecord.name,
          slug: businessRecord.slug,
          businessType: businessRecord.businessType,
          description: businessRecord.description,
          email: businessRecord.email,
          phone: businessRecord.phone,
          logoKey: businessRecord.logoKey,
          offersDelivery: businessRecord.offersDelivery,
          verificationStatus: businessRecord.verificationStatus,
          location: businessRecord.locationId
            ? townById.get(businessRecord.locationId) ?? null
            : null,
          serviceAreas: businessServiceAreas,
          memberRole: businessRecord.members[0]?.memberRole ?? 'OWNER',
        }
      : null,
    completion,
  }
}

// -----------------------------------------------------------------------------
// Provider profile (own)
// -----------------------------------------------------------------------------

export async function updateOwnProviderProfile(
  auth: AuthContext | null,
  input: UpdateProviderProfileInput,
) {
  const context = requireAuth(auth)

  if (input.primaryLocationId) {
    const town = await db.town.findUnique({ where: { id: input.primaryLocationId }, select: { id: true } })
    if (!town) throw new ValidationError({ primaryLocationId: ['Unknown location'] })
  }
  if (input.profession) {
    const category = await db.category.findUnique({
      where: { slug: input.profession },
      select: { isActive: true, level: true },
    })
    if (!category || !category.isActive || category.level < 2) {
      throw new ValidationError({ profession: ['Select a valid profession from the list'] })
    }
  }

  const provider = await db.providerProfile.findUnique({
    where: { userId: context.userId },
    select: { id: true },
  })
  if (!provider) throw new NotFoundError('Provider profile')

  const updated = await db.providerProfile.update({
    where: { id: provider.id },
    data: {
      ...(input.profession !== undefined ? { profession: input.profession } : {}),
      ...(input.headline !== undefined ? { headline: input.headline } : {}),
      ...(input.biography !== undefined ? { biography: input.biography } : {}),
      ...(input.yearsExperience !== undefined ? { yearsExperience: input.yearsExperience } : {}),
      ...(input.availabilityStatus !== undefined
        ? { availabilityStatus: input.availabilityStatus }
        : {}),
      ...(input.primaryLocationId !== undefined
        ? { primaryLocationId: input.primaryLocationId }
        : {}),
    },
    select: { id: true, profession: true, updatedAt: true },
  })

  await recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.PROVIDER_PROFILE_UPDATED,
    entityType: 'ProviderProfile',
    entityId: provider.id,
  })

  return updated
}

export async function replaceOwnProviderServiceAreas(
  auth: AuthContext | null,
  input: ReplaceServiceAreasInput,
) {
  const context = requireAuth(auth)

  const provider = await db.providerProfile.findUnique({
    where: { userId: context.userId },
    select: { id: true },
  })
  if (!provider) throw new NotFoundError('Provider profile')

  await assertTownsExist(input.locationIds)

  await db.$transaction([
    db.providerServiceArea.deleteMany({ where: { providerId: provider.id } }),
    db.providerServiceArea.createMany({
      data: [...new Set(input.locationIds)].map((locationId) => ({
        providerId: provider.id,
        locationId,
      })),
    }),
  ])

  await recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.PROVIDER_PROFILE_UPDATED,
    entityType: 'ProviderProfile',
    entityId: provider.id,
    metadata: { field: 'serviceAreas', count: input.locationIds.length },
  })

  return { serviceAreaIds: [...new Set(input.locationIds)] }
}

// -----------------------------------------------------------------------------
// Business profile (own — the caller's owned ACTIVE business)
// -----------------------------------------------------------------------------

export async function getOwnBusinessRecord(auth: AuthContext | null) {
  const context = requireAuth(auth)
  const business = await db.business.findFirst({
    where: { ownerId: context.userId, status: 'ACTIVE', deletedAt: null },
    select: { id: true, ownerId: true, name: true },
    orderBy: { createdAt: 'asc' },
  })
  if (!business) throw new NotFoundError('Business profile')
  return business
}

export async function updateOwnBusinessProfile(
  auth: AuthContext | null,
  input: UpdateBusinessProfileInput,
) {
  const context = requireAuth(auth)
  const business = await getOwnBusinessRecord(auth)

  if (input.locationId) {
    const town = await db.town.findUnique({ where: { id: input.locationId }, select: { id: true } })
    if (!town) throw new ValidationError({ locationId: ['Unknown location'] })
  }

  const updated = await db.business.update({
    where: { id: business.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.locationId !== undefined ? { locationId: input.locationId } : {}),
      ...(input.offersDelivery !== undefined ? { offersDelivery: input.offersDelivery } : {}),
    },
    select: { id: true, name: true, updatedAt: true },
  })

  await recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.BUSINESS_UPDATED,
    entityType: 'Business',
    entityId: business.id,
  })

  return updated
}

export async function replaceOwnBusinessServiceAreas(
  auth: AuthContext | null,
  input: ReplaceServiceAreasInput,
) {
  const context = requireAuth(auth)
  const business = await getOwnBusinessRecord(auth)

  await assertTownsExist(input.locationIds)

  await db.$transaction([
    db.businessServiceArea.deleteMany({ where: { businessId: business.id } }),
    db.businessServiceArea.createMany({
      data: [...new Set(input.locationIds)].map((locationId) => ({
        businessId: business.id,
        locationId,
      })),
    }),
  ])

  await recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.BUSINESS_UPDATED,
    entityType: 'Business',
    entityId: business.id,
    metadata: { field: 'serviceAreas', count: input.locationIds.length },
  })

  return { serviceAreaIds: [...new Set(input.locationIds)] }
}

async function assertTownsExist(townIds: string[]): Promise<void> {
  const unique = [...new Set(townIds)]
  const towns = await db.town.findMany({ where: { id: { in: unique } }, select: { id: true } })
  if (towns.length !== unique.length) {
    throw new ValidationError({ locationIds: ['One or more selected locations are unknown'] })
  }
}
