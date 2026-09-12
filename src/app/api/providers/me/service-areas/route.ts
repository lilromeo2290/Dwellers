/**
 * Dwellers — Own provider service areas (PART 27).
 *   PUT /api/providers/me/service-areas — replace the caller's service areas
 */
import { createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import {
  replaceOwnProviderServiceAreas,
  replaceServiceAreasSchema,
} from '@/modules/identity/profile-service'

export const PUT = createHandler(
  { auth: 'required', bodySchema: replaceServiceAreasSchema },
  async ({ auth, body }) => jsonOk(await replaceOwnProviderServiceAreas(auth, body)),
)
