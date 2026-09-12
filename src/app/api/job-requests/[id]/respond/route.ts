/**
 * Dwellers — Provider response to a job request (Phase 5, PART 31/32).
 *   POST /api/job-requests/[id]/respond — targeted provider only.
 *
 * The client submits an action (respond_interested | respond_info |
 * respond_declined) plus an optional short message — never a status. The
 * server owns the resulting state through the central machine.
 */
import { createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { z } from 'zod'
import {
  respondToJobRequest,
  respondToJobRequestSchema,
} from '@/modules/projects/job-request-service'

const idSchema = z.string().min(1)

export const POST = createHandler(
  { auth: 'required', bodySchema: respondToJobRequestSchema, rateLimit: 'standard' },
  async ({ auth, body, params, requestId }) =>
    jsonOk(await respondToJobRequest(auth, idSchema.parse(params.id), body), { requestId }),
)
