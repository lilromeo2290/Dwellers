/**
 * Dwellers — Mark own notifications read (PART 34).
 *   POST /api/notifications/read — { ids: [...] } or { all: true }
 */
import { createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import {
  markOwnNotificationsRead,
  markNotificationsReadSchema,
} from '@/modules/communication/notification-service'

export const POST = createHandler(
  { auth: 'required', bodySchema: markNotificationsReadSchema },
  async ({ auth, body }) => jsonOk(await markOwnNotificationsRead(auth, body)),
)
