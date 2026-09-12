/**
 * Dwellers — Single business.
 *   GET    /api/businesses/[id] — public detail
 *   PATCH  — owner (or staff)
 *   DELETE — owner soft delete
 */
import { createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { z } from 'zod'
import {
  deleteBusiness,
  getBusiness,
  updateBusiness,
  updateBusinessSchema,
} from '@/modules/marketplace/provider-service'

const idSchema = z.string().min(1)

export const GET = createHandler({ auth: 'public' }, async ({ params }) =>
  jsonOk(await getBusiness(idSchema.parse(params.id))),
)

export const PATCH = createHandler(
  { auth: 'required', bodySchema: updateBusinessSchema },
  async ({ auth, body, params }) => jsonOk(await updateBusiness(auth, idSchema.parse(params.id), body)),
)

export const DELETE = createHandler({ auth: 'required' }, async ({ auth, params }) => {
  await deleteBusiness(auth, idSchema.parse(params.id))
  return jsonOk({ deleted: true })
})
