/**
 * Dwellers — Single provider profile.
 *   GET   — public detail (service areas, ratings, portfolio counts)
 *   PATCH — own profile (or staff)
 */
import { createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { z } from 'zod'
import {
  getProvider,
  updateProviderProfile,
  updateProviderProfileSchema,
} from '@/modules/marketplace/provider-service'

const idSchema = z.string().min(1)

export const GET = createHandler({ auth: 'public' }, async ({ params }) =>
  jsonOk(await getProvider(idSchema.parse(params.id))),
)

export const PATCH = createHandler(
  { auth: 'required', bodySchema: updateProviderProfileSchema },
  async ({ auth, body, params }) =>
    jsonOk(await updateProviderProfile(auth, idSchema.parse(params.id), body)),
)
