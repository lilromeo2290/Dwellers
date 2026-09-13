/**
 * Dwellers — Quotations (Phase 6, PART 40).
 *   POST /api/quotes — the targeted provider creates a DRAFT quotation
 *   GET  /api/quotes — scoped list: customer → own, provider → own profile(s)
 *
 * Both routes run the full security pipeline through the handler factory
 * (PART 41): rate limit → auth → live account status → RBAC → Zod →
 * ownership/eligibility/state machine/transaction in the service layer →
 * audit → notification → standard response. The client never names a
 * status and never supplies an amount that is trusted (PART 13/42).
 */
import { createHandler } from '@/lib/api/handler'
import { jsonCreated, jsonOk } from '@/lib/api/response'
import { buildMeta } from '@/lib/api/pagination'
import {
  createQuote,
  createQuoteSchema,
  listQuotes,
  quoteListQuerySchema,
} from '@/modules/quotes/quote-service'

export const POST = createHandler(
  { auth: 'required', permission: 'commerce:quotes:submit', bodySchema: createQuoteSchema },
  async ({ auth, body, requestId }) => {
    const detail = await createQuote(auth, body)
    return jsonCreated(detail, { requestId })
  },
)

export const GET = createHandler(
  { auth: 'required', querySchema: quoteListQuerySchema },
  async ({ auth, query }) => {
    const { items, total, counts } = await listQuotes(auth, query)
    return jsonOk(items, { meta: { ...buildMeta(total, query.page, query.pageSize), counts } })
  },
)
