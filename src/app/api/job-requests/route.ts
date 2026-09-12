/**
 * Dwellers — Job requests (RFQ) — the core Dwellers flow (Phase 5).
 *   POST /api/job-requests — customers file a request (draft or direct submit)
 *   GET  /api/job-requests — customers see own; providers see targeted; staff see all
 *
 * POST is idempotent on clientToken: a double click or network retry returns
 * the same request instead of creating a duplicate (PART 43).
 */
import { createHandler } from '@/lib/api/handler'
import { jsonCreated, jsonOk } from '@/lib/api/response'
import { buildMeta } from '@/lib/api/pagination'
import {
  createJobRequest,
  createJobRequestSchema,
  getJobRequest,
  jobRequestListQuerySchema,
  listJobRequests,
} from '@/modules/projects/job-request-service'

export const POST = createHandler(
  { auth: 'required', permission: 'projects:create', bodySchema: createJobRequestSchema },
  async ({ auth, body, requestId }) => {
    const id = await createJobRequest(auth, body)
    // Return the full authorized detail so the client never has to guess.
    return jsonCreated(await getJobRequest(auth, id), { requestId })
  },
)

export const GET = createHandler(
  { auth: 'required', querySchema: jobRequestListQuerySchema },
  async ({ auth, query }) => {
    const { items, total } = await listJobRequests(auth, query)
    return jsonOk(items, { meta: buildMeta(total, query.page, query.pageSize) })
  },
)
