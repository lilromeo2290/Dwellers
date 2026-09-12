/**
 * Dwellers — Staff user list (admin only).
 */
import { createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { buildMeta } from '@/lib/api/pagination'
import { listUsers, userListQuerySchema } from '@/modules/identity/user-service'

export const GET = createHandler(
  {
    auth: 'required',
    permission: 'identity:users:manage',
    querySchema: userListQuerySchema,
    rateLimit: 'search',
  },
  async ({ query }) => {
    const { items, total } = await listUsers(query)
    return jsonOk(items, { meta: buildMeta(total, query.page, query.pageSize) })
  },
)
