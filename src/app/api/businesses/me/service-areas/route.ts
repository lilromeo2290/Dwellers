/**
 * Dwellers — Own business service areas (PART 27).
 *   PUT /api/businesses/me/service-areas — replace the business's service areas
 */
import { createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import {
  replaceOwnBusinessServiceAreas,
  replaceServiceAreasSchema,
} from '@/modules/identity/profile-service'

export const PUT = createHandler(
  { auth: 'required', bodySchema: replaceServiceAreasSchema },
  async ({ auth, body }) => jsonOk(await replaceOwnBusinessServiceAreas(auth, body)),
)
