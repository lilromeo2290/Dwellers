/**
 * Dwellers — Decline a quotation (Phase 6, PART 40/71/80).
 * Customer-only, with an optional reason (recorded on the timeline and in
 * the audit trail). The request itself stays open for other quotations.
 */
import { createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { z } from 'zod'
import { declineQuote, declineQuoteSchema } from '@/modules/quotes/quote-service'

const idSchema = z.string().min(1)

export const POST = createHandler(
  { auth: 'required', permission: 'commerce:quotes:respond', bodySchema: declineQuoteSchema },
  async ({ auth, body, params, requestId }) =>
    jsonOk(await declineQuote(auth, idSchema.parse(params.id), body), { requestId }),
)
