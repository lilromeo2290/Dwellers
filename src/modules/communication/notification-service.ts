/**
 * Dwellers — Communication module: in-app notifications.
 *
 * PART 34 scope: in-app events only (welcome, profile completion, verification
 * status). No SMS/WhatsApp/email dispatch exists in this phase — the channel
 * column and sentAt field are already schema-ready for later phases.
 *
 * Reads are strictly ownership-scoped: a caller only ever sees notifications
 * addressed to the session user (recipientId comes from the session, never
 * from the request).
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import type { AuthContext } from '@/lib/auth/session'
import { requireAuth } from '@/lib/auth/guards'
import { NotFoundError } from '@/lib/errors'
import { paginationQuerySchema, skipTake } from '@/lib/api/pagination'

/** Canonical in-app notification types. Extend as features ship. */
export const NOTIFICATION_TYPES = {
  ACCOUNT_WELCOME: 'ACCOUNT_WELCOME',
  PROFILE_COMPLETION: 'PROFILE_COMPLETION',
  VERIFICATION_STATUS: 'VERIFICATION_STATUS',
  ACCOUNT_SECURITY: 'ACCOUNT_SECURITY',
} as const

export interface CreateNotificationInput {
  recipientId: string
  type: string
  title: string
  body?: string
  entityType?: string
  entityId?: string
}

export async function createNotification(input: CreateNotificationInput) {
  return db.notification.create({
    data: {
      recipientId: input.recipientId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      channel: 'IN_APP',
    },
    select: { id: true, type: true, title: true },
  })
}

export const notificationListQuerySchema = paginationQuerySchema.extend({
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
})

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>

/** The caller's own notifications, newest first, with an unread count. */
export async function listOwnNotifications(auth: AuthContext | null, query: NotificationListQuery) {
  const context = requireAuth(auth)
  const where = {
    recipientId: context.userId,
    ...(query.unreadOnly ? { readAt: null } : {}),
  }

  const { skip, take } = skipTake(query)
  const [total, unreadCount, items] = await Promise.all([
    db.notification.count({ where }),
    db.notification.count({ where: { recipientId: context.userId, readAt: null } }),
    db.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        entityType: true,
        entityId: true,
        readAt: true,
        createdAt: true,
      },
    }),
  ])

  return { items, total, unreadCount }
}

export const markNotificationsReadSchema = z
  .object({
    ids: z.array(z.string().min(1)).max(100).optional(),
    all: z.boolean().optional(),
  })
  .refine((value) => value.all === true || (value.ids?.length ?? 0) > 0, {
    message: 'Provide notification ids or all=true',
  })

export type MarkNotificationsReadInput = z.infer<typeof markNotificationsReadSchema>

/**
 * Marks the caller's OWN notifications as read. Ownership is enforced by the
 * where-clause: ids belonging to other users simply do not match — and a
 * non-matching explicit id is reported so the client is never left guessing.
 */
export async function markOwnNotificationsRead(
  auth: AuthContext | null,
  input: MarkNotificationsReadInput,
): Promise<{ updated: number }> {
  const context = requireAuth(auth)

  if (input.all) {
    const result = await db.notification.updateMany({
      where: { recipientId: context.userId, readAt: null },
      data: { readAt: new Date() },
    })
    return { updated: result.count }
  }

  const ids = input.ids ?? []
  const result = await db.notification.updateMany({
    where: { recipientId: context.userId, id: { in: ids }, readAt: null },
    data: { readAt: new Date() },
  })

  if (result.count !== ids.length) {
    // Distinguish "already read" (fine) from "not yours / unknown" (404-ish).
    const owned = await db.notification.count({
      where: { recipientId: context.userId, id: { in: ids } },
    })
    if (owned !== ids.length) {
      throw new NotFoundError('Notification')
    }
  }

  return { updated: result.count }
}
