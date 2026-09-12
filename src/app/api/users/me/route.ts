/**
 * Dwellers — Self-service account endpoints.
 *   GET   /api/users/me — the caller's own account
 *   PATCH /api/users/me — update own profile fields
 */
import { createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import {
  getOwnAccount,
  updateOwnAccount,
  updateOwnProfileSchema,
} from '@/modules/identity/user-service'

export const GET = createHandler(
  { auth: 'required' },
  async ({ auth }) => jsonOk(await getOwnAccount(auth)),
)

export const PATCH = createHandler(
  { auth: 'required', bodySchema: updateOwnProfileSchema },
  async ({ auth, body }) => jsonOk(await updateOwnAccount(auth, body)),
)
