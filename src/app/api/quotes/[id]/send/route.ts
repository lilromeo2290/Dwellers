/**
 * Dwellers — Send a quotation (Phase 6, PART 40/68/77).
 * The provider submits the SEND action; the server moves DRAFT → SUBMITTED,
 * notifies the customer once, and writes one timeline event. A second send
 * (double click, retry) gets a clear 409 — never a duplicate notification.
 */
import { createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { z } from 'zod'
import { sendQuote } from '@/modules/quotes/quote-service'

const idSchema = z.string().min(1)

export const POST = createHandler(
  { auth: 'required', permission: 'commerce:quotes:submit' },
  async ({ auth, params, requestId }) =>
    jsonOk(await sendQuote(auth, idSchema.parse(params.id)), { requestId }),
)
