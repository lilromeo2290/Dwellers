/**
 * Dwellers — Projects module: job requests (RFQ).
 *
 * The heart of Dwellers: a customer describes what they need ("my kitchen
 * sink is leaking — I need a plumber in Nsawam"), attaches photos if helpful,
 * picks the location and submits — no phone call required. Providers and the
 * future matching engine consume these requests and respond with quotations.
 *
 * Authorization model:
 *  - CREATE: customers only ('projects:create' is customer-only in the RBAC
 *    matrix — providers cannot file job requests at themselves).
 *  - READ: customers see their OWN requests; providers see requests targeted
 *    at them; staff sees all. Cross-user reads are structurally impossible.
 *  - UPDATE: owner while DRAFT; submit/cancel transitions by the owner.
 */
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { BadRequestError, NotFoundError, ValidationError } from '@/lib/errors'
import { optionalPesewasSchema, optionalText, safeText } from '@/lib/api/schemas'
import { paginationQuerySchema, skipTake } from '@/lib/api/pagination'
import type { AuthContext } from '@/lib/auth/session'
import { requireAuth } from '@/lib/auth/guards'
import { assertOwnership } from '@/lib/auth/ownership'
import { isStaff, ROLE_DEFINITIONS } from '@/lib/auth/roles'
import { generateReference } from '@/lib/utils'
import { AUDIT_ACTIONS, recordAudit } from '@/lib/audit'

// -----------------------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------------------

export const JOB_REQUEST_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'MATCHING',
  'RESPONDED',
  'ACCEPTED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const

export const TIME_SLOTS = ['MORNING', 'AFTERNOON', 'EVENING', 'FLEXIBLE'] as const

const isoDate = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date')
  .transform((value) => new Date(value))
  .nullable()
  .optional()

export const createJobRequestSchema = z
  .object({
    title: optionalText(140, 'Title'),
    description: safeText(5000, 'Description').optional(),
    categoryId: z.string().min(1).nullable().optional(),
    serviceId: z.string().min(1).nullable().optional(),
    providerId: z.string().min(1).nullable().optional(),
    locationId: z.string().min(1).nullable().optional(),
    communityId: z.string().min(1).nullable().optional(),
    areaText: optionalText(200, 'Area'),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    budgetMinAmount: optionalPesewasSchema,
    budgetMaxAmount: optionalPesewasSchema,
    preferredDate: isoDate,
    preferredTimeSlot: z.enum(TIME_SLOTS).nullable().optional(),
    submitNow: z.boolean().optional(),
    attachmentKeys: z
      .array(
        z.object({
          storageKey: safeText(300, 'Attachment key'),
          originalName: safeText(200, 'Attachment name').optional(),
          mimeType: safeText(100).optional(),
          sizeBytes: z.number().int().min(0).optional(),
          kind: z.enum(['PHOTO', 'VIDEO', 'DOCUMENT']).optional(),
        }),
      )
      .max(10)
      .optional(),
  })
  .refine((value) => (value.description?.length ?? 0) > 0 || value.submitNow !== true, {
    message: 'Describe the work you need before submitting',
    path: ['description'],
  })
  .refine(
    (value) =>
      value.budgetMinAmount == null ||
      value.budgetMaxAmount == null ||
      value.budgetMaxAmount >= value.budgetMinAmount,
    { message: 'Maximum budget cannot be lower than the minimum', path: ['budgetMaxAmount'] },
  )

export const updateJobRequestSchema = z.object({
  title: optionalText(140, 'Title'),
  description: optionalText(5000, 'Description'),
  locationId: z.string().min(1).nullable().optional(),
  communityId: z.string().min(1).nullable().optional(),
  areaText: optionalText(200, 'Area'),
  budgetMinAmount: optionalPesewasSchema,
  budgetMaxAmount: optionalPesewasSchema,
  preferredDate: isoDate,
  preferredTimeSlot: z.enum(TIME_SLOTS).nullable().optional(),
  action: z.enum(['submit', 'cancel']).optional(),
  cancellationReason: optionalText(300, 'Cancellation reason'),
})

export const jobRequestListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(JOB_REQUEST_STATUSES).optional(),
  categoryId: z.string().optional(),
  locationId: z.string().optional(),
})

export type CreateJobRequestInput = z.infer<typeof createJobRequestSchema>
export type UpdateJobRequestInput = z.infer<typeof updateJobRequestSchema>
export type JobRequestListQuery = z.infer<typeof jobRequestListQuerySchema>

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const customerSelect = {
  select: {
    id: true,
    reference: true,
    title: true,
    description: true,
    status: true,
    customerId: true,
    budgetMinAmount: true,
    budgetMaxAmount: true,
    currency: true,
    preferredDate: true,
    preferredTimeSlot: true,
    category: { select: { id: true, name: true, slug: true } },
    service: { select: { id: true, name: true } },
    location: {
      select: { id: true, name: true, region: { select: { name: true } } },
    },
    community: { select: { id: true, name: true } },
    attachments: {
      select: { id: true, storageKey: true, kind: true, mimeType: true },
    },
    createdAt: true,
    submittedAt: true,
  },
} as const

async function assertJobRequestRefs(input: {
  categoryId?: string | null | undefined
  serviceId?: string | null | undefined
  providerId?: string | null | undefined
  locationId?: string | null | undefined
  communityId?: string | null | undefined
}) {
  if (input.categoryId) {
    const category = await db.category.findFirst({
      where: { id: input.categoryId, isActive: true },
    })
    if (!category) throw new ValidationError({ categoryId: ['Unknown category'] })
  }
  if (input.serviceId) {
    const service = await db.service.findFirst({ where: { id: input.serviceId } })
    if (!service) throw new ValidationError({ serviceId: ['Unknown service'] })
  }
  if (input.providerId) {
    const provider = await db.providerProfile.findFirst({ where: { id: input.providerId } })
    if (!provider) throw new ValidationError({ providerId: ['Unknown provider'] })
  }
  if (input.locationId) {
    const town = await db.town.findUnique({ where: { id: input.locationId } })
    if (!town) throw new ValidationError({ locationId: ['Unknown location'] })
  }
  if (input.communityId) {
    const community = await db.communityArea.findUnique({ where: { id: input.communityId } })
    if (!community) throw new ValidationError({ communityId: ['Unknown community'] })
  }
}

// -----------------------------------------------------------------------------
// Services
// -----------------------------------------------------------------------------

/** Creates a job request for the CALLING customer (draft or direct submit). */
export async function createJobRequest(auth: AuthContext | null, input: CreateJobRequestInput) {
  const context = requireAuth(auth)
  await assertJobRequestRefs(input)

  const submit = input.submitNow === true
  const request = await db.jobRequest.create({
    data: {
      reference: generateReference('JR'),
      customerId: context.userId,
      title: input.title ?? null,
      description: input.description ?? '',
      categoryId: input.categoryId ?? null,
      serviceId: input.serviceId ?? null,
      providerId: input.providerId ?? null,
      locationId: input.locationId ?? null,
      communityId: input.communityId ?? null,
      areaText: input.areaText ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      budgetMinAmount: input.budgetMinAmount ?? null,
      budgetMaxAmount: input.budgetMaxAmount ?? null,
      preferredDate: input.preferredDate ?? null,
      preferredTimeSlot: input.preferredTimeSlot ?? null,
      status: submit ? 'SUBMITTED' : 'DRAFT',
      submittedAt: submit ? new Date() : null,
      attachments: {
        create: (input.attachmentKeys ?? []).map((attachment) => ({
          storageKey: attachment.storageKey,
          originalName: attachment.originalName ?? null,
          mimeType: attachment.mimeType ?? null,
          sizeBytes: attachment.sizeBytes ?? null,
          kind: attachment.kind ?? 'DOCUMENT',
        })),
      },
    },
  })

  await recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: submit ? AUDIT_ACTIONS.JOB_REQUEST_SUBMITTED : AUDIT_ACTIONS.JOB_REQUEST_CREATED,
    entityType: 'JobRequest',
    entityId: request.id,
    metadata: { reference: request.reference },
  })

  return request
}

/**
 * Role-scoped listing: customers → own requests; provider roles → requests
 * targeted at them; staff → everything. There is no way to see another
 * customer's private requests.
 */
export async function listJobRequests(auth: AuthContext | null, query: JobRequestListQuery) {
  const context = requireAuth(auth)

  let where = {}
  if (isStaff(context.role)) {
    where = { ...(query.status ? { status: query.status } : {}) }
  } else if (ROLE_DEFINITIONS[context.role].isProvider) {
    const provider = await db.providerProfile.findUnique({ where: { userId: context.userId } })
    if (!provider) return { items: [], total: 0 }
    where = {
      providerId: provider.id,
      ...(query.status ? { status: query.status } : {}),
    }
  } else {
    where = {
      customerId: context.userId,
      ...(query.status ? { status: query.status } : {}),
    }
  }

  const filtered = {
    ...where,
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.locationId ? { locationId: query.locationId } : {}),
  }

  const { skip, take } = skipTake(query)
  const [total, items] = await Promise.all([
    db.jobRequest.count({ where: filtered }),
    db.jobRequest.findMany({
      where: filtered,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      ...customerSelect,
    }),
  ])

  return { items, total }
}

/** Owner, targeted provider or staff may read a single request. */
export async function getJobRequest(auth: AuthContext | null, id: string) {
  const context = requireAuth(auth)
  const request = await db.jobRequest.findFirst({
    where: { id },
    ...customerSelect,
    select: {
      ...customerSelect.select,
      customerId: true,
      providerId: true,
      latitude: true,
      longitude: true,
      areaText: true,
      cancellationReason: true,
      customer: { select: { id: true, name: true } },
    },
  })
  if (!request) throw new NotFoundError('Job request')

  const isOwnerCustomer = request.customerId === context.userId
  const isTargetedProvider =
    request.providerId != null &&
    (await db.providerProfile.findFirst({
      where: { id: request.providerId, userId: context.userId },
    })) != null

  if (!isOwnerCustomer && !isTargetedProvider && !isStaff(context.role)) {
    // Authenticated foreign callers get the same opaque 404 as anonymous
    // probes — existence of the request is not disclosed.
    throw new NotFoundError('Job request')
  }
  return request
}

/**
 * Owner-only transitions: edit while DRAFT, submit when ready, cancel until
 * terminal states. Status integrity is enforced here, never by the client.
 */
export async function updateJobRequest(
  auth: AuthContext | null,
  id: string,
  input: UpdateJobRequestInput,
) {
  const context = requireAuth(auth)
  const existing = assertOwnership(
    await db.jobRequest.findFirst({ where: { id } }),
    context,
    { allowStaff: true, ownerFields: ["customerId"] },
  )

  if (input.action === 'submit') {
    if (existing.status !== 'DRAFT') {
      throw new BadRequestError('Only draft requests can be submitted.')
    }
    if (!existing.description) {
      throw new ValidationError({ description: ['Describe the work you need before submitting'] })
    }
    const request = await db.jobRequest.update({
      where: { id },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
      ...customerSelect,
    })
    await recordAudit({
      actorId: context.userId,
      actorRole: context.role,
      action: AUDIT_ACTIONS.JOB_REQUEST_SUBMITTED,
      entityType: 'JobRequest',
      entityId: id,
      metadata: { reference: existing.reference },
    })
    return request
  }

  if (input.action === 'cancel') {
    if (['COMPLETED', 'CANCELLED'].includes(existing.status)) {
      throw new BadRequestError('This request is already closed.')
    }
    const request = await db.jobRequest.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: input.cancellationReason ?? null,
      },
      ...customerSelect,
    })
    await recordAudit({
      actorId: context.userId,
      actorRole: context.role,
      action: AUDIT_ACTIONS.JOB_REQUEST_CANCELLED,
      entityType: 'JobRequest',
      entityId: id,
      metadata: { reference: existing.reference },
    })
    return request
  }

  if (existing.status !== 'DRAFT') {
    throw new BadRequestError('Only draft requests can be edited. Cancel it and create a new one.')
  }

  await assertJobRequestRefs(input)
  const { action: _action, cancellationReason: _reason, ...fields } = input
  // fields come from the validated zod schema; every key mirrors a scalar
  // column (id-only FK references), so the unchecked update input is exact.
  const data = fields as Prisma.JobRequestUncheckedUpdateInput
  const request = await db.jobRequest.update({
    where: { id },
    data,
    ...customerSelect,
  })

  await recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.JOB_REQUEST_UPDATED,
    entityType: 'JobRequest',
    entityId: id,
    metadata: { reference: existing.reference },
  })

  return request
}
