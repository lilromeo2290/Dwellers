/**
 * Dwellers — Single category (admin-managed).
 *   PATCH  — admin update
 *   DELETE — admin soft delete (isActive=false)
 */
import { createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { z } from 'zod'
import { deleteCategory, updateCategory, updateCategorySchema } from '@/modules/discovery/discovery-service'

const idSchema = z.string().min(1)

export const PATCH = createHandler(
  { auth: 'required', permission: 'admin:marketplace:manage', bodySchema: updateCategorySchema },
  async ({ auth, body, params }) =>
    jsonOk(await updateCategory(auth, idSchema.parse(params.id), body)),
)

export const DELETE = createHandler(
  { auth: 'required', permission: 'admin:marketplace:manage' },
  async ({ auth, params }) => {
    await deleteCategory(auth, idSchema.parse(params.id))
    return jsonOk({ deleted: true })
  },
)
