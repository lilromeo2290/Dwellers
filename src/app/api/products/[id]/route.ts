/**
 * Dwellers — Single product listing.
 *   GET    — public detail
 *   PATCH  — owner (or staff)
 *   DELETE — owner soft delete
 */
import { createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { z } from 'zod'
import {
  deleteProductListing,
  getProductListing,
  updateProductListing,
  updateProductSchema,
} from '@/modules/marketplace/listing-service'

const idSchema = z.string().min(1)

export const GET = createHandler({ auth: 'public' }, async ({ params }) =>
  jsonOk(await getProductListing(idSchema.parse(params.id))),
)

export const PATCH = createHandler(
  { auth: 'required', bodySchema: updateProductSchema },
  async ({ auth, body, params }) =>
    jsonOk(await updateProductListing(auth, idSchema.parse(params.id), body)),
)

export const DELETE = createHandler({ auth: 'required' }, async ({ auth, params }) => {
  await deleteProductListing(auth, idSchema.parse(params.id))
  return jsonOk({ deleted: true })
})
