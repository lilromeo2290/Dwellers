/**
 * Dwellers — Accept a quotation (Phase 6, PART 40/70/78).
 * Customer-only. The server validates expiry, quote state, request state
 * and sibling acceptances, then commits quote + request + event +
 * notification atomically. Accepting NEVER creates a payment (PART 51).
 */
import { createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { z } from 'zod'
import { acceptQuote } from '@/modules/quotes/quote-service'

const idSchema = z.string().min(1)

export const POST = createHandler(
  { auth: 'required', permission: 'commerce:quotes:respond' },
  async ({ auth, params, requestId }) =>
    jsonOk(await acceptQuote(auth, idSchema.parse(params.id)), { requestId }),
)
