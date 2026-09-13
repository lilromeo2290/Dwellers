/**
 * Dwellers — Single quotation (Phase 6, PART 40).
 *   GET   — the quote's customer, the quote's provider side, or staff.
 *           The customer's first open records the real VIEWED event.
 *   PATCH — the provider edits its own DRAFT (never a sent quote, PART 28).
 *
 * Foreign probes receive the same opaque 404 as anonymous ones — the
 * existence of a quotation is never disclosed (PART 43).
 */
import { createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { z } from 'zod'
import { getQuote, updateQuote, updateQuoteSchema } from '@/modules/quotes/quote-service'

const idSchema = z.string().min(1)

export const GET = createHandler({ auth: 'required' }, async ({ auth, params }) =>
  jsonOk(await getQuote(auth, idSchema.parse(params.id))),
)

export const PATCH = createHandler(
  { auth: 'required', permission: 'commerce:quotes:submit', bodySchema: updateQuoteSchema },
  async ({ auth, body, params, requestId }) =>
    jsonOk(await updateQuote(auth, idSchema.parse(params.id), body), { requestId }),
)
