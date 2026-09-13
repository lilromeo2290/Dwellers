/**
 * Dwellers — Projects module: job requests (Phase 5, REQUEST SERVICE).
 *
 * The heart of Dwellers: a customer describes what they need ("my kitchen
 * sink is leaking — I need a plumber in Nsawam"), attaches photos if helpful,
 * picks the job location and submits — no phone call required. The targeted
 * provider responds (interested / needs info / declines), and both sides
 * follow the SAME real state machine (see job-request-state.ts).
 *
 * Authorization model:
 *  - CREATE/EDIT/SUBMIT/CANCEL: the owning customer only ('projects:create'
 *    is customer-only in the RBAC matrix). Providers cannot file requests.
 *  - PROVIDER RESPONSE: the targeted provider — the profile's own user, or
 *    (for business-affiliated profiles) an ACTIVE OWNER/MANAGER business
 *    member. Plain MEMBERs may read but not act (PART 27).
 *  - READ: customers see their OWN requests; the targeted provider side sees
 *    requests addressed to them; staff sees all. Cross-user reads are
 *    structurally impossible (404 — existence is never disclosed).
 *
 * State changes are validated by the central machine, executed inside
 * transactions together with their timeline event, and never trust the
 * client to name a status (PART 24). The timeline (PART 45) is derived from
 * real JobRequestEvent rows written in the same transaction.
 */
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors'
import { optionalPesewasSchema, optionalText, safeText } from '@/lib/api/schemas'
import { paginationQuerySchema, skipTake } from '@/lib/api/pagination'
import type { AuthContext } from '@/lib/auth/session'
import { requireAuth } from '@/lib/auth/guards'
import { isStaff, ROLE_DEFINITIONS } from '@/lib/auth/roles'
import { generateReference } from '@/lib/utils'
import { AUDIT_ACTIONS, recordAudit } from '@/lib/audit'
import { recordDiscoveryEvent } from '@/modules/discovery/provider-discovery'
import {
  assertTransition,
  ATTACHMENT_EDITABLE_STATUSES,
  EDITABLE_STATUSES,
  actorKindForRole,
  isTerminal,
  RESPONSE_TRANSITIONS,
  statusesForGroup,
  URGENCY_LEVELS,
  type JobRequestAction,
  type ProviderStatusGroup,
} from '@/modules/projects/job-request-state'
import { NOTIFICATION_TYPES } from '@/modules/communication/notification-service'

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

/** Maximum photos per request (PART 13) — configurable, never unlimited. */
export const MAX_JOB_REQUEST_ATTACHMENTS = 10

export const TIME_SLOTS = ['MORNING', 'AFTERNOON', 'EVENING', 'FLEXIBLE'] as const

// -----------------------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------------------

const isoDate = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date')
  .transform((value) => new Date(value))
  .nullable()
  .optional()

export const createJobRequestSchema = z
  .object({
    title: optionalText(120, 'Title'),
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
    urgency: z.enum(URGENCY_LEVELS).nullable().optional(),
    submitNow: z.boolean().optional(),
    /** Browser-generated idempotency key — a retry never duplicates a request. */
    clientToken: safeText(64, 'Client token').optional(),
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
      .max(MAX_JOB_REQUEST_ATTACHMENTS)
      .optional(),
  })
  .refine((value) => (value.description?.trim().length ?? 0) > 0 || value.submitNow !== true, {
    message: 'Describe the work you need before submitting',
    path: ['description'],
  })
  .refine((value) => value.budgetMinAmount == null || value.budgetMaxAmount == null ||
    value.budgetMaxAmount >= value.budgetMinAmount, {
    message: 'Maximum budget cannot be lower than the minimum',
    path: ['budgetMaxAmount'],
  })

export const updateJobRequestSchema = z.object({
  title: optionalText(120, 'Title'),
  description: optionalText(5000, 'Description'),
  serviceId: z.string().min(1).nullable().optional(),
  categoryId: z.string().min(1).nullable().optional(),
  locationId: z.string().min(1).nullable().optional(),
  communityId: z.string().min(1).nullable().optional(),
  areaText: optionalText(200, 'Area'),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  budgetMinAmount: optionalPesewasSchema,
  budgetMaxAmount: optionalPesewasSchema,
  preferredDate: isoDate,
  preferredTimeSlot: z.enum(TIME_SLOTS).nullable().optional(),
  urgency: z.enum(URGENCY_LEVELS).nullable().optional(),
  action: z.enum(['submit', 'cancel']).optional(),
  cancellationReason: optionalText(300, 'Cancellation reason'),
})

export const respondToJobRequestSchema = z.object({
  action: z.enum(['respond_interested', 'respond_declined', 'respond_info']),
  message: optionalText(1000, 'Response message'),
})

export const JOB_REQUEST_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'MATCHING',
  'RESPONDED',
  'ACCEPTED',
  'IN_PROGRESS',
  'COMPLETED',
  'DECLINED',
  'CANCELLED',
] as const

export const jobRequestListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(JOB_REQUEST_STATUSES).optional(),
  /** Provider dashboard sections (PART 28) — expanded server-side. */
  statusGroup: z.enum(['NEW', 'ACTIVE', 'COMPLETED', 'DECLINED', 'CANCELLED']).optional(),
  categoryId: z.string().optional(),
  locationId: z.string().optional(),
})

export type CreateJobRequestInput = z.infer<typeof createJobRequestSchema>
export type UpdateJobRequestInput = z.infer<typeof updateJobRequestSchema>
export type RespondToJobRequestInput = z.infer<typeof respondToJobRequestSchema>
export type JobRequestListQuery = z.infer<typeof jobRequestListQuerySchema>

// -----------------------------------------------------------------------------
// Privileges
// -----------------------------------------------------------------------------

export interface RequestAccess {
  request: {
    id: string
    reference: string
    customerId: string
    providerId: string | null
    serviceId: string | null
    locationId: string | null
    communityId: string | null
    status: string
    viewedAt: Date | null
  }
  /** CUSTOMER = owner; PROVIDER = targeted side; STAFF. */
  side: 'CUSTOMER' | 'PROVIDER' | 'STAFF'
  /** Provider side may act (respond) — owner user, OWNER or MANAGER member. */
  canManageProviderSide: boolean
}

/**
 * Loads a request and resolves the caller's relationship to it. Foreign
 * callers receive the same opaque 404 as anonymous probes — the existence of
 * a request is never disclosed (PART 49/52).
 *
 * Exported for the Phase 6 quotation service: quote eligibility (PART 2) is
 * defined against the SAME access resolution — the targeted provider side,
 * resolved through BusinessMember roles — so both modules share one
 * implementation instead of drifting apart.
 */
export async function resolveJobRequestAccess(
  auth: AuthContext | null,
  id: string,
): Promise<RequestAccess> {
  return resolveAccess(auth, id)
}
async function resolveAccess(auth: AuthContext | null, id: string): Promise<RequestAccess> {
  const context = requireAuth(auth)
  const request = await db.jobRequest.findUnique({
    where: { id },
    select: {
      id: true,
      reference: true,
      customerId: true,
      providerId: true,
      serviceId: true,
      locationId: true,
      communityId: true,
      status: true,
      viewedAt: true,
    },
  })
  if (!request) throw new NotFoundError('Job request')

  if (request.customerId === context.userId) {
    return { request, side: 'CUSTOMER', canManageProviderSide: false }
  }

  if (isStaff(context.role)) {
    return { request, side: 'STAFF', canManageProviderSide: false }
  }

  if (request.providerId && ROLE_DEFINITIONS[context.role].isProvider) {
    const provider = await db.providerProfile.findUnique({
      where: { id: request.providerId },
      select: { userId: true, businessId: true },
    })
    if (provider) {
      if (provider.userId === context.userId) {
        return { request, side: 'PROVIDER', canManageProviderSide: true }
      }
      if (provider.businessId) {
        // Business-affiliated profile: OWNER/MANAGER manage; MEMBER read-only
        // (PART 27 — never blanket owner-level powers).
        const membership = await db.businessMember.findUnique({
          where: { businessId_userId: { businessId: provider.businessId, userId: context.userId } },
          select: { memberRole: true, status: true },
        })
        if (membership && membership.status === 'ACTIVE') {
          return {
            request,
            side: 'PROVIDER',
            canManageProviderSide: membership.memberRole === 'OWNER' || membership.memberRole === 'MANAGER',
          }
        }
      }
    }
  }

  throw new NotFoundError('Job request')
}

// -----------------------------------------------------------------------------
// Validation helpers
// -----------------------------------------------------------------------------

/** Strips undefined entries — explicit nulls are kept (they clear a field). */
function pruneUndefined<T extends Record<string, unknown>>(input: T): T {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) result[key] = value
  }
  return result as T
}

/**
 * Ghana location hierarchy is validated SERVER-SIDE (PART 40) — the
 * cascading frontend selectors are never trusted: a community must belong to
 * the chosen town, or it is rejected.
 */
async function validateLocationHierarchy(input: { locationId?: string | null; communityId?: string | null }) {
  if (input.locationId) {
    const town = await db.town.findFirst({ where: { id: input.locationId, isActive: true } })
    if (!town) throw new ValidationError({ locationId: ['Unknown location'] })
  }
  if (input.communityId) {
    const community = await db.communityArea.findFirst({
      where: { id: input.communityId, isActive: true },
      select: { townId: true },
    })
    if (!community) throw new ValidationError({ communityId: ['Unknown community'] })
    if (input.locationId && community.townId !== input.locationId) {
      throw new ValidationError({
        communityId: ['The selected area is not in the selected town'],
      })
    }
    if (!input.locationId) {
      throw new ValidationError({ locationId: ['Select the town for this community'] })
    }
  }
}

/**
 * A request may only target a service the provider GENUINELY offers (PART 4):
 * active, available, and owned by that provider. Server-side — never trusted
 * from the client.
 */
async function assertProviderOffersService(providerId: string, serviceId: string) {
  const service = await db.service.findFirst({
    where: { id: serviceId, providerId, deletedAt: null, status: 'ACTIVE', isAvailable: true },
    select: { id: true },
  })
  if (!service) {
    throw new ValidationError({
      serviceId: ['This service is not currently offered by this provider.'],
    })
  }
}

/** Does the provider list this town among its service areas? (PART 41) */
async function providerServesTown(
  providerId: string | null | undefined,
  townId: string | null | undefined,
): Promise<boolean> {
  if (!providerId || !townId) return false
  const area = await db.providerServiceArea.findUnique({
    where: { providerId_locationId: { providerId, locationId: townId } },
    select: { id: true },
  })
  return area != null
}

/** Every referenced record must exist and be usable (PART 20). */
async function assertJobRequestRefs(input: {
  categoryId?: string | null
  serviceId?: string | null
  providerId?: string | null
  locationId?: string | null
  communityId?: string | null
}) {
  if (input.categoryId) {
    const category = await db.category.findFirst({ where: { id: input.categoryId, isActive: true } })
    if (!category) throw new ValidationError({ categoryId: ['Unknown category'] })
  }
  if (input.serviceId) {
    const service = await db.service.findFirst({ where: { id: input.serviceId, deletedAt: null } })
    if (!service) throw new ValidationError({ serviceId: ['Unknown service'] })
  }
  if (input.providerId) {
    const provider = await db.providerProfile.findFirst({
      where: { id: input.providerId, deletedAt: null, user: { status: 'ACTIVE' } },
      select: { id: true },
    })
    if (!provider) throw new ValidationError({ providerId: ['This provider is not currently available.'] })
  }
  await validateLocationHierarchy(input)
}

/** Submit-time completeness rules (PARTS 4/5/6/7/20) — enforced again server-side. */
function assertSubmittable(data: {
  title: string | null
  description: string | null
  serviceId: string | null
  providerId: string | null
  locationId: string | null
  preferredDate: Date | null
}) {
  const fieldErrors: Record<string, string[]> = {}
  const title = data.title?.trim() ?? ''
  if (title.length < 10 || title.length > 120) {
    fieldErrors.title = ['Give the job a short, clear title (10–120 characters).']
  }
  if ((data.description?.trim().length ?? 0) < 10) {
    fieldErrors.description = ['Please describe the job (at least 10 characters).']
  }
  if (!data.locationId) {
    fieldErrors.locationId = ['Please select where the job is.']
  }
  if (data.providerId && !data.serviceId) {
    fieldErrors.serviceId = ['Please select the service you need.']
  }
  if (data.preferredDate) {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    if (data.preferredDate < startOfToday) {
      fieldErrors.preferredDate = ['Preferred date cannot be in the past.']
    }
  }
  if (Object.keys(fieldErrors).length > 0) throw new ValidationError(fieldErrors)
}

// -----------------------------------------------------------------------------
// Select shapes
// -----------------------------------------------------------------------------

/** Provider display name: business name when affiliated, else the person. */
const providerDisplaySelect = {
  select: {
    id: true,
    profession: true,
    business: { select: { name: true } },
    user: { select: { name: true } },
  },
} as const

const requestInclude = {
  category: { select: { id: true, name: true, slug: true } },
  service: { select: { id: true, name: true } },
  location: {
    select: { id: true, name: true, region: { select: { name: true } }, district: { select: { name: true } } },
  },
  community: { select: { id: true, name: true } },
  provider: providerDisplaySelect,
  attachments: {
    select: { id: true, storageKey: true, kind: true, mimeType: true, originalName: true, sizeBytes: true },
  },
} as const

const listSelect = {
  select: {
    id: true,
    reference: true,
    title: true,
    description: true,
    status: true,
    customerId: true,
    providerId: true,
    urgency: true,
    viewedAt: true,
    respondedAt: true,
    responseKind: true,
    areaText: true,
    cancellationReason: true,
    cancelledAt: true,
    budgetMinAmount: true,
    budgetMaxAmount: true,
    currency: true,
    preferredDate: true,
    preferredTimeSlot: true,
    ...requestInclude,
    _count: { select: { attachments: true } },
    createdAt: true,
    submittedAt: true,
    updatedAt: true,
  },
} as const

/** _count alias projected onto the list shape (attachments). */
function withListCount<T extends { _count: { attachments: number } }>(row: T) {
  const { _count, ...rest } = row
  return { ...rest, attachmentCount: _count.attachments }
}

// -----------------------------------------------------------------------------
// Create
// -----------------------------------------------------------------------------

/**
 * Creates a job request for the CALLING customer (draft or direct submit).
 * Idempotent on clientToken (PART 43): a network retry or double click
 * returns the SAME request instead of creating a duplicate.
 */
export async function createJobRequest(auth: AuthContext | null, input: CreateJobRequestInput) {
  const context = requireAuth(auth)

  // Idempotency first — a retry with the same token resolves to the
  // original request no matter where the first attempt failed.
  if (input.clientToken) {
    const existing = await db.jobRequest.findFirst({
      where: { customerId: context.userId, clientToken: input.clientToken },
      select: { id: true },
    })
    if (existing) return existing.id
  }

  await assertJobRequestRefs(input)
  if (input.serviceId && input.providerId) {
    await assertProviderOffersService(input.providerId, input.serviceId)
  }

  const submit = input.submitNow === true
  const data = {
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
    urgency: input.urgency ?? null,
    clientToken: input.clientToken ?? null,
  }
  if (submit) assertSubmittable({ ...data, description: data.description ?? null })

  try {
    const id = await db.$transaction(async (tx) => {
      // Live provider-service re-check inside the transaction (PART 20).
      if (input.providerId) {
        const provider = await tx.providerProfile.findFirst({
          where: { id: input.providerId, deletedAt: null, user: { status: 'ACTIVE' } },
          select: { id: true },
        })
        if (!provider) {
          throw new ValidationError({ providerId: ['This provider is not currently available.'] })
        }
      }
      if (input.serviceId && input.providerId) {
        await assertProviderOffersService(input.providerId, input.serviceId)
      }

      const now = new Date()
      const request = await tx.jobRequest.create({
        data: {
          reference: generateReference('JR'),
          customerId: context.userId,
          status: submit ? 'SUBMITTED' : 'DRAFT',
          submittedAt: submit ? now : null,
          attachments: {
            create: (input.attachmentKeys ?? []).map((attachment) => ({
              storageKey: attachment.storageKey,
              originalName: attachment.originalName ?? null,
              mimeType: attachment.mimeType ?? null,
              sizeBytes: attachment.sizeBytes ?? null,
              kind: attachment.kind ?? 'PHOTO',
              uploadedById: context.userId,
            })),
          },
          events: {
            create: submit
              ? [
                  { eventType: 'CREATED', actorId: context.userId, actorRole: context.role },
                  { eventType: 'SUBMITTED', actorId: context.userId, actorRole: context.role },
                ]
              : [{ eventType: 'CREATED', actorId: context.userId, actorRole: context.role }],
          },
          ...data,
        },
        select: { id: true, providerId: true, serviceId: true, locationId: true },
      })

      if (submit) {
        await notifyProviderOfNewRequest(tx, request)
      }
      return request.id
    })

    await recordAudit({
      actorId: context.userId,
      actorRole: context.role,
      action: submit ? AUDIT_ACTIONS.JOB_REQUEST_SUBMITTED : AUDIT_ACTIONS.JOB_REQUEST_CREATED,
      entityType: 'JobRequest',
      entityId: id,
      metadata: { submitNow: submit },
    })
    if (submit) recordDiscoveryEvent({ type: 'request_submitted' })
    return id
  } catch (error) {
    // Concurrent duplicate with the same clientToken → return the winner.
    if (
      input.clientToken &&
      (error as { code?: string }).code === 'P2002' &&
      (await duplicateTokenExists(context.userId, input.clientToken))
    ) {
      const existing = await db.jobRequest.findFirst({
        where: { customerId: context.userId, clientToken: input.clientToken },
        select: { id: true },
      })
      if (existing) return existing.id
    }
    throw error
  }
}

async function duplicateTokenExists(customerId: string, token: string): Promise<boolean> {
  const existing = await db.jobRequest.findFirst({
    where: { customerId, clientToken: token },
    select: { id: true },
  })
  return existing != null
}

/** In-app notification to the targeted provider (PART 34), inside the caller's transaction. */
async function notifyProviderOfNewRequest(
  tx: Prisma.TransactionClient,
  request: { id: string; providerId: string | null; serviceId: string | null; locationId: string | null },
) {
  if (!request.providerId) return
  const provider = await tx.providerProfile.findUnique({
    where: { id: request.providerId },
    select: { userId: true, business: { select: { name: true } }, user: { select: { name: true } } },
  })
  if (!provider) return
  const [service, town] = await Promise.all([
    request.serviceId
      ? tx.service.findUnique({ where: { id: request.serviceId }, select: { name: true } })
      : Promise.resolve(null),
    request.locationId
      ? tx.town.findUnique({ where: { id: request.locationId }, select: { name: true } })
      : Promise.resolve(null),
  ])
  await tx.notification.create({
    data: {
      recipientId: provider.userId,
      type: NOTIFICATION_TYPES.JOB_REQUEST_NEW,
      channel: 'IN_APP',
      title: `New service request${town ? ` in ${town.name}` : ''}.`,
      body: `${service?.name ?? 'A service'} request — open Job Requests to respond.`,
      entityType: 'JobRequest',
      entityId: request.id,
    },
    select: { id: true },
  })
}

// -----------------------------------------------------------------------------
// List / read
// -----------------------------------------------------------------------------

/**
 * Role-scoped listing: customers → own requests; provider roles → requests
 * targeted at them (including business-affiliated profiles they belong to);
 * staff → everything. There is no way to see another customer's requests.
 */
export async function listJobRequests(auth: AuthContext | null, query: JobRequestListQuery) {
  const context = requireAuth(auth)

  const statusFilter: Prisma.JobRequestWhereInput = query.status
    ? { status: query.status }
    : query.statusGroup
      ? { status: { in: statusesForGroup(query.statusGroup) } }
      : {}

  let where: Prisma.JobRequestWhereInput
  if (isStaff(context.role)) {
    where = { ...statusFilter }
  } else if (ROLE_DEFINITIONS[context.role].isProvider) {
    const provider = await db.providerProfile.findUnique({
      where: { userId: context.userId },
      select: { id: true, businessId: true },
    })
    if (!provider) return { items: [], total: 0 }
    // Business members see requests addressed to their business's profiles.
    const businessProviderIds = provider.businessId
      ? (
          await db.providerProfile.findMany({
            where: { businessId: provider.businessId, deletedAt: null },
            select: { id: true },
          })
        ).map((p) => p.id)
      : []
    const providerIds = [...new Set([provider.id, ...businessProviderIds])]
    where = { providerId: { in: providerIds }, ...statusFilter }
  } else {
    where = { customerId: context.userId, ...statusFilter }
  }

  const filtered: Prisma.JobRequestWhereInput = {
    ...where,
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.locationId ? { locationId: query.locationId } : {}),
  }

  const { skip, take } = skipTake(query)
  const [total, rows] = await Promise.all([
    db.jobRequest.count({ where: filtered }),
    db.jobRequest.findMany({
      where: filtered,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      ...listSelect,
    }),
  ])

  return { items: rows.map(withListCount), total }
}

/**
 * Owner, targeted provider side or staff may read a single request. Provider
 * side reads mark VIEWED exactly once (real timeline event, PART 44/45).
 */
export async function getJobRequest(auth: AuthContext | null, id: string) {
  const context = requireAuth(auth)
  const access = await resolveAccess(auth, id)
  const request = await db.jobRequest.findUnique({ where: { id }, ...listSelect })
  if (!request) throw new NotFoundError('Job request')

  // Privacy: the provider side sees a display name only — never the
  // customer's email, phone or account details (PART 18/28/49).
  const providerPerspective = access.side !== 'CUSTOMER'
  const customer = providerPerspective
    ? await db.user.findUnique({
        where: { id: access.request.customerId },
        select: { name: true },
      })
    : null

  // First provider-side open → VIEWED (idempotent).
  let viewedAt = request.viewedAt
  if (providerPerspective && !viewedAt && !isTerminal(request.status)) {
    const now = new Date()
    await db.$transaction([
      db.jobRequest.update({ where: { id }, data: { viewedAt: now } }),
      db.jobRequestEvent.create({
        data: { jobRequestId: id, eventType: 'VIEWED', actorId: context.userId, actorRole: context.role },
      }),
    ])
    viewedAt = now
    recordDiscoveryEvent({ type: 'provider_request_viewed' })
    recordAudit({
      actorId: context.userId,
      actorRole: context.role,
      action: AUDIT_ACTIONS.JOB_REQUEST_VIEWED,
      entityType: 'JobRequest',
      entityId: id,
      metadata: { reference: request.reference },
    })
  }

  // Honest coverage notice (PART 41): flag — never a claim — when the job
  // location is outside the provider's listed service areas.
  const servesLocation =
    access.side === 'CUSTOMER' || access.side === 'STAFF'
      ? undefined
      : await providerServesTown(access.request.providerId, request.location?.id)

  const events = await listRequestEvents(id)

  const result = {
    ...withListCount(request),
    viewedAt,
    events,
    access: {
      side: access.side,
      canRespond: access.side === 'PROVIDER' && access.canManageProviderSide,
      canManage: access.side === 'CUSTOMER' || access.canManageProviderSide,
    },
    ...(providerPerspective && customer
      ? {
          customer: {
            // First name + last initial only — display-name privacy.
            displayName: displayNameInitial(customer.name),
          },
        }
      : {}),
    ...(servesLocation !== undefined ? { servesLocation } : {}),
  }
  return result
}

/** "Raymond A." — enough to feel human, not enough to expose identity. */
export function displayNameInitial(name: string | null): string {
  const parts = (name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    // Skip parenthesised suffixes like "(Demo)" — never part of a real name.
    .filter((part) => !/^[(@[]/.test(part))
  if (parts.length === 0) return 'A Dwellers customer'
  const first = parts[0]
  const initial = parts.length > 1 ? ` ${parts[parts.length - 1][0]?.toUpperCase() ?? ''}.` : ''
  return `${first}${initial}`
}

/** Real timeline rows, oldest first (PART 45 — never fabricated). */
async function listRequestEvents(requestId: string) {
  const events = await db.jobRequestEvent.findMany({
    where: { jobRequestId: requestId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, eventType: true, message: true, createdAt: true, actorRole: true },
  })
  return events
}

// -----------------------------------------------------------------------------
// Customer transitions (edit / submit / cancel)
// -----------------------------------------------------------------------------

/**
 * Owner-only transitions through the central machine: edit while DRAFT,
 * submit when ready, cancel until the provider has committed further.
 * Status integrity is enforced here, never by the client (PART 24/74).
 */
export async function updateJobRequest(
  auth: AuthContext | null,
  id: string,
  input: UpdateJobRequestInput,
) {
  const context = requireAuth(auth)
  const access = await resolveAccess(auth, id)
  if (access.side !== 'CUSTOMER') {
    // Providers and staff never edit customer requests (PART 25/26).
    throw new ForbiddenError('Only the customer who created this request can change it.')
  }

  if (input.action === 'submit' || input.action === 'cancel') {
    const action: JobRequestAction = input.action
    assertTransition(action, 'CUSTOMER', access.request.status)
  }

  if (input.action === 'submit') {
    const full = await db.jobRequest.findUnique({
      where: { id },
      select: {
        title: true,
        description: true,
        serviceId: true,
        providerId: true,
        locationId: true,
        preferredDate: true,
      },
    })
    if (!full) throw new NotFoundError('Job request')
    assertSubmittable({
      ...full,
      title: input.title ?? full.title,
      description: input.description ?? full.description,
      serviceId: input.serviceId !== undefined ? (input.serviceId ?? null) : full.serviceId,
      locationId: input.locationId !== undefined ? (input.locationId ?? null) : full.locationId,
    })
    if (input.serviceId && access.request.providerId) {
      await assertProviderOffersService(access.request.providerId, input.serviceId)
    }
    await assertJobRequestRefs(input)
  }

  if (input.action === 'cancel') {
    await db.$transaction(async (tx) => {
      await tx.jobRequest.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationReason: input.cancellationReason ?? null,
        },
      })
      await tx.jobRequestEvent.create({
        data: {
          jobRequestId: id,
          eventType: 'CANCELLED',
          actorId: context.userId,
          actorRole: context.role,
          message: input.cancellationReason ?? undefined,
        },
      })
    })
    recordAudit({
      actorId: context.userId,
      actorRole: context.role,
      action: AUDIT_ACTIONS.JOB_REQUEST_CANCELLED,
      entityType: 'JobRequest',
      entityId: id,
      metadata: { reference: access.request.reference },
    })
    recordDiscoveryEvent({ type: 'request_cancelled' })
    const request = await db.jobRequest.findUnique({ where: { id }, ...listSelect })
    return withListCount(request!)
  }

  if (input.action === 'submit') {
    // Field updates ride along with the submit action (wizard final step);
    // undefined entries are stripped so only provided fields change.
    const fieldData = pruneUndefined({
      title: input.title,
      description: input.description,
      serviceId: input.serviceId,
      categoryId: input.categoryId,
      locationId: input.locationId,
      communityId: input.communityId,
      areaText: input.areaText,
      latitude: input.latitude,
      longitude: input.longitude,
      budgetMinAmount: input.budgetMinAmount,
      budgetMaxAmount: input.budgetMaxAmount,
      preferredDate: input.preferredDate,
      preferredTimeSlot: input.preferredTimeSlot,
      urgency: input.urgency,
    }) as Prisma.JobRequestUncheckedUpdateInput
    await db.$transaction(async (tx) => {
      await tx.jobRequest.update({
        where: { id },
        data: {
          ...fieldData,
          status: 'SUBMITTED',
          submittedAt: new Date(),
        },
      })
      await tx.jobRequestEvent.create({
        data: { jobRequestId: id, eventType: 'SUBMITTED', actorId: context.userId, actorRole: context.role },
      })
      await notifyProviderOfNewRequest(tx, {
        id,
        providerId: access.request.providerId,
        serviceId: access.request.serviceId,
        locationId: access.request.locationId,
      })
    })
    recordAudit({
      actorId: context.userId,
      actorRole: context.role,
      action: AUDIT_ACTIONS.JOB_REQUEST_SUBMITTED,
      entityType: 'JobRequest',
      entityId: id,
      metadata: { reference: access.request.reference },
    })
    recordDiscoveryEvent({ type: 'request_submitted' })
    const request = await db.jobRequest.findUnique({ where: { id }, ...listSelect })
    return withListCount(request!)
  }

  // Plain edit — DRAFT only (central machine), never after submission.
  assertTransition('edit', 'CUSTOMER', access.request.status)
  if (!EDITABLE_STATUSES.includes(access.request.status as never)) {
    throw new BadRequestError('Only draft requests can be edited. Cancel it and create a new one.')
  }
  await assertJobRequestRefs(input)
  if (input.serviceId && access.request.providerId) {
    await assertProviderOffersService(access.request.providerId, input.serviceId)
  }

  const { action: _action, cancellationReason: _reason, ...fields } = input
  await db.$transaction(async (tx) => {
    await tx.jobRequest.update({
      where: { id },
      data: fields as Prisma.JobRequestUncheckedUpdateInput,
    })
    if (Object.keys(fields).length > 0) {
      await tx.jobRequestEvent.create({
        data: { jobRequestId: id, eventType: 'EDITED', actorId: context.userId, actorRole: context.role },
      })
    }
  })
  recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.JOB_REQUEST_UPDATED,
    entityType: 'JobRequest',
    entityId: id,
    metadata: { reference: access.request.reference },
  })
  const request = await db.jobRequest.findUnique({ where: { id }, ...listSelect })
  return withListCount(request!)
}

// -----------------------------------------------------------------------------
// Provider response (PART 31/32)
// -----------------------------------------------------------------------------

/**
 * The targeted provider responds: express interest, ask for more
 * information, or decline — with an optional short message. The response is
 * atomic: status + responseKind + timeline event + customer notification.
 */
export async function respondToJobRequest(
  auth: AuthContext | null,
  id: string,
  input: RespondToJobRequestInput,
) {
  const context = requireAuth(auth)
  const access = await resolveAccess(auth, id)
  if (access.side !== 'PROVIDER' || !access.canManageProviderSide) {
    throw new ForbiddenError('Only the provider this request was sent to can respond.')
  }

  // Central machine — provider actions only from waiting states.
  assertTransition(input.action, 'PROVIDER', access.request.status)
  const transition = RESPONSE_TRANSITIONS[input.action]

  // Defense in depth: a suspended/deactivated provider can never act on a
  // request even if the HTTP layer were bypassed (PART 75).
  const provider = await db.providerProfile.findUnique({
    where: { id: access.request.providerId! },
    select: { id: true, userId: true, user: { select: { status: true } } },
  })
  if (!provider || provider.user.status !== 'ACTIVE') {
    throw new ForbiddenError('This account can no longer be used. Contact Dwellers support.')
  }

  await db.$transaction(async (tx) => {
    await tx.jobRequest.update({
      where: { id },
      data: {
        status: transition.status,
        responseKind: transition.kind,
        respondedAt: new Date(),
        viewedAt: access.request.viewedAt ?? new Date(),
      },
    })
    await tx.jobRequestEvent.create({
      data: {
        jobRequestId: id,
        eventType: transition.eventType,
        actorId: context.userId,
        actorRole: context.role,
        message: input.message ?? undefined,
      },
    })
    await tx.notification.create({
      data: {
        recipientId: access.request.customerId,
        type: NOTIFICATION_TYPES.JOB_REQUEST_RESPONSE,
        channel: 'IN_APP',
        title: RESPONSE_NOTIFICATION_TITLES[transition.kind],
        body: 'Open My Job Requests to see the full response.',
        entityType: 'JobRequest',
        entityId: id,
      },
      select: { id: true },
    })
  })

  recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action:
      transition.kind === 'DECLINED' ? AUDIT_ACTIONS.JOB_REQUEST_DECLINED : AUDIT_ACTIONS.JOB_REQUEST_RESPONDED,
    entityType: 'JobRequest',
    entityId: id,
    metadata: { reference: access.request.reference, kind: transition.kind },
  })
  recordDiscoveryEvent({ type: 'provider_response' })

  const request = await db.jobRequest.findUnique({ where: { id }, ...listSelect })
  return withListCount(request!)
}

const RESPONSE_NOTIFICATION_TITLES: Record<string, string> = {
  INTERESTED: 'Your service request has been accepted.',
  NEEDS_INFO: 'Your service request needs more information.',
  DECLINED: 'Your service request was declined.',
}

// -----------------------------------------------------------------------------
// Attachments (PART 11–14, 48)
// -----------------------------------------------------------------------------

/** The customer manages photos until the provider acts; never afterwards. */
async function assertAttachmentsEditable(requestId: string) {
  const request = await db.jobRequest.findUnique({
    where: { id: requestId },
    select: { status: true },
  })
  if (!request) throw new NotFoundError('Job request')
  if (!ATTACHMENT_EDITABLE_STATUSES.includes(request.status as never)) {
    throw new BadRequestError('Photos can no longer be changed on this request.')
  }
  return request.status
}

export async function recordJobRequestAttachment(
  auth: AuthContext | null,
  requestId: string,
  photo: { storageKey: string; originalName?: string | null; mimeType?: string | null; sizeBytes?: number | null },
) {
  const context = requireAuth(auth)
  const access = await resolveAccess(auth, requestId)
  if (access.side !== 'CUSTOMER') {
    throw new ForbiddenError('Only the customer who created this request can add photos.')
  }
  await assertAttachmentsEditable(requestId)

  const count = await db.jobRequestAttachment.count({ where: { jobRequestId: requestId } })
  if (count >= MAX_JOB_REQUEST_ATTACHMENTS) {
    throw new ValidationError({
      attachments: [`A request can hold at most ${MAX_JOB_REQUEST_ATTACHMENTS} photos.`],
    })
  }

  const created = await db.$transaction(async (tx) => {
    const row = await tx.jobRequestAttachment.create({
      data: {
        jobRequestId: requestId,
        storageKey: photo.storageKey,
        originalName: photo.originalName ?? null,
        mimeType: photo.mimeType ?? null,
        sizeBytes: photo.sizeBytes ?? null,
        kind: 'PHOTO',
        uploadedById: context.userId,
      },
    })
    await tx.jobRequestEvent.create({
      data: {
        jobRequestId: requestId,
        eventType: 'ATTACHMENT_ADDED',
        actorId: context.userId,
        actorRole: context.role,
        message: row.originalName ?? undefined,
      },
    })
    return row
  })

  recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.JOB_REQUEST_ATTACHMENT_ADDED,
    entityType: 'JobRequest',
    entityId: requestId,
    metadata: { attachmentId: created.id },
  })
  recordDiscoveryEvent({ type: 'request_attachment_added' })
  return created
}

export async function removeJobRequestAttachment(
  auth: AuthContext | null,
  requestId: string,
  attachmentId: string,
) {
  const context = requireAuth(auth)
  const access = await resolveAccess(auth, requestId)
  if (access.side !== 'CUSTOMER') {
    throw new ForbiddenError('Only the customer who created this request can remove photos.')
  }
  await assertAttachmentsEditable(requestId)

  const attachment = await db.jobRequestAttachment.findFirst({
    where: { id: attachmentId, jobRequestId: requestId },
  })
  if (!attachment) throw new NotFoundError('Attachment')

  await db.$transaction(async (tx) => {
    await tx.jobRequestAttachment.delete({ where: { id: attachment.id } })
    await tx.jobRequestEvent.create({
      data: {
        jobRequestId: requestId,
        eventType: 'ATTACHMENT_REMOVED',
        actorId: context.userId,
        actorRole: context.role,
      },
    })
  })

  recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.JOB_REQUEST_ATTACHMENT_REMOVED,
    entityType: 'JobRequest',
    entityId: requestId,
    metadata: { attachmentId: attachment.id },
  })
  return { id: attachment.id, storageKey: attachment.storageKey }
}

/** Timeline read — both authorized sides see the same real events. */
export async function getJobRequestTimeline(auth: AuthContext | null, id: string) {
  await resolveAccess(auth, id)
  return listRequestEvents(id)
}

/** Attachment read authorization — the file bytes themselves never leak. */
export async function getJobRequestAttachmentForViewing(
  auth: AuthContext | null,
  requestId: string,
  attachmentId: string,
) {
  await resolveAccess(auth, requestId)
  const attachment = await db.jobRequestAttachment.findFirst({
    where: { id: attachmentId, jobRequestId: requestId },
  })
  if (!attachment) throw new NotFoundError('Attachment')
  return attachment
}
