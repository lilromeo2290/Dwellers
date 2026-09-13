/**
 * Dwellers — Withdraw a quotation (Phase 6, PART 40/23).
 * Provider-only. Maps the spec's "cancel" action onto the project's
 * existing WITHDRAWN vocabulary (PART 21/22 — no duplicate enum).
 */
import { createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { z } from 'zod'
import { withdrawQuote } from '@/modules/quotes/quote-service'

const idSchema = z.string().min(1)

export const POST = createHandler(
  { auth: 'required', permission: 'commerce:quotes:submit' },
  async ({ auth, params, requestId }) =>
    jsonOk(await withdrawQuote(auth, idSchema.parse(params.id)), { requestId }),
)
