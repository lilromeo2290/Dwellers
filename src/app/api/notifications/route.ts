/**
 * Dwellers — Own notifications (PART 34).
 *   GET /api/notifications — the caller's in-app notifications + unread count
 */
import { createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { buildMeta } from '@/lib/api/pagination'
import { listOwnNotifications, notificationListQuerySchema } from '@/modules/communication/notification-service'

export const GET = createHandler(
  { auth: 'required', querySchema: notificationListQuerySchema },
  async ({ auth, query }) => {
    const { items, total, unreadCount } = await listOwnNotifications(auth, query)
    return jsonOk({ items, unreadCount }, { meta: buildMeta(total, query.page, query.pageSize) })
  },
)
