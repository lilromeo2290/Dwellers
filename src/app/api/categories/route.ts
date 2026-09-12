/**
 * Dwellers — Marketplace categories.
 *   GET  /api/categories — public (flat or ?tree=true two-level tree)
 *   POST — admin only ('admin:marketplace:manage')
 */
import { createHandler } from '@/lib/api/handler'
import { jsonCreated, jsonOk } from '@/lib/api/response'
import {
  createCategory,
  createCategorySchema,
  listCategories,
  categoryListQuerySchema,
} from '@/modules/discovery/discovery-service'

export const GET = createHandler(
  { auth: 'public', querySchema: categoryListQuerySchema, rateLimit: 'search' },
  async ({ query }) => {
    const { items, total } = await listCategories(query)
    return jsonOk({ items, total })
  },
)

export const POST = createHandler(
  { auth: 'required', permission: 'admin:marketplace:manage', bodySchema: createCategorySchema },
  async ({ auth, body, requestId }) => jsonCreated(await createCategory(auth, body), { requestId }),
)
