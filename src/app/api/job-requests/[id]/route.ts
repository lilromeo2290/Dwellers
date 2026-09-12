/**
 * Dwellers — Single job request.
 *   GET   — owner customer, targeted provider side or staff (foreign probes → 404).
 *           The provider side's first open records the real VIEWED event.
 *   PATCH — the owning customer only: edit while DRAFT / submit / cancel.
 *           The client submits an ACTION — never a status (PART 24/74).
 */
import { createHandler } from '@/lib/api/handler'
import { jsonOk } from '@/lib/api/response'
import { z } from 'zod'
import {
  getJobRequest,
  updateJobRequest,
  updateJobRequestSchema,
} from '@/modules/projects/job-request-service'

const idSchema = z.string().min(1)

export const GET = createHandler({ auth: 'required' }, async ({ auth, params }) =>
  jsonOk(await getJobRequest(auth, idSchema.parse(params.id))),
)

export const PATCH = createHandler(
  { auth: 'required', bodySchema: updateJobRequestSchema },
  async ({ auth, body, params, requestId }) =>
    jsonOk(await updateJobRequest(auth, idSchema.parse(params.id), body), { requestId }),
)
