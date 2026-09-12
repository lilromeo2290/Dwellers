/**
 * Dwellers — Discovery event intake (PART 32).
 *
 *   POST /api/discovery/events
 *
 * Client-side interaction events (profile views are recorded server-side).
 * The body is strictly enumerated — no free text, no user identifiers, no
 * IP capture. This endpoint exists so UX interactions (contact clicks,
 * request-service intents, filter usage) can inform Phase 5+ ranking and
 * recommendations WITHOUT building an analytics dashboard or collecting
 * personal information. Best-effort by contract: the response is 204 even
 * when the write is dropped.
 */
import { createHandler } from '@/lib/api/handler'
import { jsonNoContent } from '@/lib/api/response'
import { z } from 'zod'
import { recordDiscoveryEvent } from '@/modules/discovery/provider-discovery'

const eventBodySchema = z
  .object({
    type: z.enum(['provider_contact_clicked', 'request_service_clicked', 'filter_used']),
    providerId: z.string().min(1).max(64).optional(),
    categoryId: z.string().min(1).max(64).optional(),
    townId: z.string().min(1).max(64).optional(),
    resultCount: z.number().int().min(0).max(1_000_000).optional(),
  })
  .strict()

export const POST = createHandler(
  { auth: 'optional', querySchema: undefined, bodySchema: eventBodySchema, rateLimit: 'search' },
  async ({ body }) => {
    await recordDiscoveryEvent({
      type: body.type,
      providerId: body.providerId ?? null,
      categoryId: body.categoryId ?? null,
      townId: body.townId ?? null,
      resultCount: body.resultCount ?? null,
    })
    return jsonNoContent()
  },
)
