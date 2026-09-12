/**
 * Dwellers — Public registration endpoint (PART 39).
 *
 *   POST /api/auth/register
 *
 * Rate limited with the strict auth preset. The role is derived SERVER-SIDE
 * from the registration path (auth-service PATH_ROLE_MAP) — no client payload
 * can nominate a role, let alone a staff one.
 */
import { createHandler } from '@/lib/api/handler'
import { jsonCreated } from '@/lib/api/response'
import { registerSchema, registerDwellersAccount } from '@/modules/identity/auth-service'

export const POST = createHandler(
  { auth: 'public', rateLimit: 'auth', bodySchema: registerSchema },
  async ({ body, requestId }) =>
    jsonCreated(await registerDwellersAccount(body, requestId), { requestId }),
)
