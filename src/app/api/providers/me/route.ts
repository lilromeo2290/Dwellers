/**
 * Dwellers — Own provider profile (PART 25).
 *   GET   /api/providers/me — the caller's provider profile + completion
 *   PATCH /api/providers/me — update own professional information
 */
import { createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import {
  getOwnProfileBundle,
  updateOwnProviderProfile,
  updateProviderProfileSchema,
} from '@/modules/identity/profile-service'

export const GET = createHandler({ auth: 'required' }, async ({ auth }) => {
  const bundle = await getOwnProfileBundle(auth)
  return jsonOk({ providerProfile: bundle.providerProfile, completion: bundle.completion })
})

export const PATCH = createHandler(
  { auth: 'required', bodySchema: updateProviderProfileSchema },
  async ({ auth, body }) => jsonOk(await updateOwnProviderProfile(auth, body)),
)
