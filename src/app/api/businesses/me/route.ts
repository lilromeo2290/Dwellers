/**
 * Dwellers — Own business profile (PART 25).
 *   GET   /api/businesses/me — the caller's owned business + completion
 *   PATCH /api/businesses/me — update own business information
 *
 * Phase 3 scope: the OWNER's business (multi-member team management arrives
 * with the company phase). Owner-only mutations — normal BusinessMembers are
 * handled by the BusinessMember permission work in a later phase.
 */
import { createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import {
  getOwnProfileBundle,
  updateOwnBusinessProfile,
  updateBusinessProfileSchema,
} from '@/modules/identity/profile-service'

export const GET = createHandler({ auth: 'required' }, async ({ auth }) => {
  const bundle = await getOwnProfileBundle(auth)
  return jsonOk({ business: bundle.business, completion: bundle.completion })
})

export const PATCH = createHandler(
  { auth: 'required', bodySchema: updateBusinessProfileSchema },
  async ({ auth, body }) => jsonOk(await updateOwnBusinessProfile(auth, body)),
)
