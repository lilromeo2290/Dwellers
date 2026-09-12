/**
 * Dwellers — Single job request.
 *   GET   — owner customer, targeted provider or staff (foreign probes → 404)
 *   PATCH — owner: edit draft / submit / cancel
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
  async ({ auth, body, params }) =>
    jsonOk(await updateJobRequest(auth, idSchema.parse(params.id), body)),
)
