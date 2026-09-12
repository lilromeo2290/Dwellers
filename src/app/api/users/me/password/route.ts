/**
 * Dwellers — Password change (PART 41).
 *   PATCH /api/users/me/password
 */
import { createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { changeOwnPassword, changePasswordSchema } from '@/modules/identity/auth-service'

export const PATCH = createHandler(
  { auth: 'required', rateLimit: 'auth', bodySchema: changePasswordSchema },
  async ({ auth, body }) => {
    await changeOwnPassword(auth, body)
    return jsonOk({ updated: true })
  },
)
