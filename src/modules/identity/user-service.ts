/**
 * Dwellers — Identity module: request schemas + user services.
 *
 * Self-service profile reads/updates and the staff user list. Role changes
 * are NOT exposed here — role assignment stays a staff-only operation guarded
 * by canManageRole (delivered with the admin phase; nothing public mutates
 * roles).
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { optionalGhanaPhoneSchema, optionalText, safeText } from '@/lib/api/schemas'
import type { AuthContext } from '@/lib/auth/session'
import { requireAuth } from '@/lib/auth/guards'
import { assertOwnership } from '@/lib/auth/ownership'
import { AUDIT_ACTIONS, recordAudit } from '@/lib/audit'
import { paginationQuerySchema, skipTake } from '@/lib/api/pagination'

// -----------------------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------------------

export const userListQuerySchema = paginationQuerySchema.extend({
  role: z.string().optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']).optional(),
  q: safeText(120).optional(),
})

export const updateOwnProfileSchema = z.object({
  name: safeText(80, 'Name').optional(),
  phone: optionalGhanaPhoneSchema,
  bio: optionalText(2000, 'Bio'),
  addressLine: optionalText(200, 'Address'),
  website: z.string().url().nullable().optional(),
  locationId: z.string().min(1).nullable().optional(),
})

export type UserListQuery = z.infer<typeof userListQuerySchema>
export type UpdateOwnProfileInput = z.infer<typeof updateOwnProfileSchema>

// -----------------------------------------------------------------------------
// Services
// -----------------------------------------------------------------------------

/** Staff-only paginated user list. */
export async function listUsers(query: UserListQuery) {
  const where = {
    ...(query.role ? { role: query.role } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.q
      ? {
          OR: [
            { email: { contains: query.q } },
            { name: { contains: query.q } },
          ],
        }
      : {}),
  }

  const { skip, take } = skipTake(query)
  const [total, users] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        status: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        lastLoginAt: true,
        isSeedData: true,
        createdAt: true,
      },
    }),
  ])

  return { items: users, total }
}

/** Returns the caller's own account (never another user's). */
export async function getOwnAccount(auth: AuthContext | null) {
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
      emailVerifiedAt: true,
      phoneVerifiedAt: true,
      lastLoginAt: true,
      createdAt: true,
      profile: {
        select: { bio: true, addressLine: true, website: true, locationId: true },
      },
    },
  })
  if (!user || user.status !== 'ACTIVE') throw new NotFoundError('Account')
  return user
}

/**
 * Updates the CALLER's own account + personal profile. Ownership is inherent
 * (target id comes from the session, never from the request body).
 */
export async function updateOwnAccount(
  auth: AuthContext | null,
  input: UpdateOwnProfileInput,
) {
  const context = requireAuth(auth)

  if (input.locationId) {
    const location = await db.town.findUnique({ where: { id: input.locationId } })
    if (!location) throw new ValidationError({ locationId: ['Unknown location'] })
  }

  const { bio, addressLine, website, locationId, ...userFields } = input

  const user = await db.user.update({
    where: { id: context.userId },
    data: {
      ...(userFields.name !== undefined ? { name: userFields.name } : {}),
      ...(userFields.phone !== undefined ? { phone: userFields.phone } : {}),
      profile: {
        upsert: {
          create: { bio, addressLine, website, locationId },
          update: {
            ...(bio !== undefined ? { bio } : {}),
            ...(addressLine !== undefined ? { addressLine } : {}),
            ...(website !== undefined ? { website } : {}),
            ...(locationId !== undefined ? { locationId } : {}),
          },
        },
      },
    },
    select: { id: true, email: true, name: true, phone: true, role: true, updatedAt: true },
  })

  await recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.USER_PROFILE_UPDATED,
    entityType: 'User',
    entityId: context.userId,
  })

  return user
}

/**
 * Loads a user for ownership checks. Exported for the pattern's completeness:
 * other modules verify their OWN resources; this one guards self access.
 */
export async function requireOwnUserId(auth: AuthContext | null, requestedUserId: string) {
  const context = requireAuth(auth)
  assertOwnership({ userId: requestedUserId }, { ...context, userId: context.userId })
  return context
}
