/**
 * Dwellers — Own profile bundle (PART 39).
 *   GET /api/users/me/profile
 *
 * Returns the account, the role-specific profile(s), location names and the
 * profile-completion guidance in a single response.
 */
import { createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { getOwnProfileBundle } from '@/modules/identity/profile-service'

export const GET = createHandler({ auth: 'required' }, async ({ auth }) =>
  jsonOk(await getOwnProfileBundle(auth)),
)
