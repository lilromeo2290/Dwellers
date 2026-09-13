/**
 * Dwellers — Quotes module: the quotation lifecycle (Phase 6, QUOTATIONS).
 *
 * A quotation is the provider's priced answer to a job request:
 *
 *   JOB REQUEST → PROVIDER RESPONSE (INTERESTED) → QUOTE DRAFT → SENT
 *     → CUSTOMER REVIEWS → ACCEPTED | DECLINED      (PART 85 flow)
 *
 * It stops there — an accepted quotation is an ACCEPTANCE, never a payment
 * (PART 51). The payment phase will pick up from `Quote.status === ACCEPTED`
 * (PART 85 — future payment handoff).
 *
 * Architecture (built on the existing seams — nothing new invented):
 *  - STATE: one central machine in quote-state.ts; clients submit ACTIONS.
 *  - MONEY: integer pesewas only, via src/lib/finance.ts helpers. The server
 *    recalculates every line total, subtotal, discount and total from the
 *    submitted item data — client-supplied amounts are structurally
 *    impossible in the schemas (PART 12/13/17).
 *  - TAX: none. No VAT/NHIL/GETFund is invented; `taxAmount` stays 0
 *    (PART 16) until a controlled tax feature exists.
 *  - AUTHORIZATION: reuse of the job-request access resolver (the targeted
 *    provider side, BusinessMember OWNER/MANAGER manage, MEMBER read-only),
 *    plus the Phase 1 permission matrix (`commerce:quotes:*`).
 *  - ATOMICITY: every state change runs status + timeline event +
 *    notification inside one transaction, with conditional updates so races
 *    (double send, concurrent accept) have exactly one winner (PART 46/47).
 *  - TIMELINE: quote events are written to the request's JobRequestEvent
 *    timeline — one real history, no duplicate timelines (PART 34).
 *  - AUDIT: quote.* actions recorded for every important change (PART 35).
 */
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors'
import { optionalText, safeText } from '@/lib/api/schemas'
import { paginationQuerySchema, skipTake } from '@/lib/api/pagination'
import type { AuthContext } from '@/lib/auth/session'
import { requireAuth } from '@/lib/auth/guards'
import { hasPermission } from '@/lib/auth/permissions'
import { generateReference } from '@/lib/utils'
import { lineTotalAmount, toPesewas } from '@/lib/finance'
import { AUDIT_ACTIONS, recordAudit } from '@/lib/audit'
import { recordDiscoveryEvent } from '@/modules/discovery/provider-discovery'
import { NOTIFICATION_TYPES } from '@/modules/communication/notification-service'
import { displayNameInitial, resolveJobRequestAccess } from '@/modules/projects/job-request-service'
import { assertTransition } from '@/modules/projects/job-request-state'
import {
  assertQuoteTransition,
  isQuotePastValidity,
  QUOTE_EVENT_TYPES,
  QUOTE_ITEM_KINDS,
  type QuoteAction,
  type QuoteItemKind,
  type QuoteActorKind,
} from '@/modules/quotes/quote-state'

// -----------------------------------------------------------------------------
// Configuration (PART 10/11/12/18/20 — protective limits, all configurable)
// -----------------------------------------------------------------------------

/** Maximum line items per quotation — generous, but bounded (PART 10). */
export const MAX_QUOTE_ITEMS = 50
/** Notes/terms length cap (PART 18). */
export const MAX_QUOTE_TEXT_LENGTH = 5_000
/** Item name/description caps. */
export const MAX_ITEM_NAME_LENGTH = 120
export const MAX_ITEM_DESCRIPTION_LENGTH = 1_000
export const MAX_UNIT_LABEL_LENGTH = 20
/** Decline reason cap (PART 30). */
export const MAX_DECLINE_REASON_LENGTH = 500
/**
 * Money ceilings: a single unit price tops out at GH₵999,999.99 and a
 * quantity at 1,000,000 — far above real Ghanaian trade, small enough to
 * keep every intermediate product inside safe integer range (PART 11/45).
 */
export const MAX_UNIT_PRICE_PESEWAS = 99_999_999
export const MAX_QUANTITY_MILLI = 1_000_000_000
/** Quotes may be requested up to 2 years ahead — validity is a business
 * window, not a lifetime (PART 20: nothing is valid forever). */
export const MAX_VALIDITY_DAYS = 730

// -----------------------------------------------------------------------------
// Validation schemas — the client can NEVER send amounts/status (PART 13/42)
// -----------------------------------------------------------------------------

const finiteMoneyCedis = z
  .number({ error: 'Enter a valid amount' })
  .finite('Enter a valid amount')
  .min(0, 'Unit price cannot be negative')

/** One quotation line. Amount is deliberately ABSENT — the server computes it. */
export const quoteItemInputSchema = z.object({
  kind: z.enum(QUOTE_ITEM_KINDS, { message: 'Choose an item type' }),
  name: safeText(MAX_ITEM_NAME_LENGTH, 'Item name').refine(
    (value) => value.length >= 1,
    'Give every item a short name',
  ),
  description: optionalText(MAX_ITEM_DESCRIPTION_LENGTH, 'Item description'),
  /** Decimal quantity in units (e.g. 2.5 bags); stored as qty × 1000. */
  quantity: z
    .number({ error: 'Enter a valid quantity' })
    .finite('Enter a valid quantity')
    .positive('Quantity must be greater than zero')
    .max(MAX_QUANTITY_MILLI / 1000, 'Quantity is unreasonably large'),
  /** Free-form unit snapshot, e.g. "bag", "day", "trip" (PART 5-9). */
  unit: optionalText(MAX_UNIT_LABEL_LENGTH, 'Unit'),
  /** Decimal cedis per unit, e.g. 350.00 — converted to integer pesewas here. */
  unitPrice: finiteMoneyCedis.max(
    MAX_UNIT_PRICE_PESEWAS / 100,
    'Unit price is unreasonably large',
  ),
})

export const createQuoteSchema = z.object({
  jobRequestId: safeText(64, 'Job request').refine((value) => value.length >= 1, {
    message: 'Job request is required',
  }),
  /** Optional quote-level headline, e.g. "Bathroom pipe repair — full quote". */
  description: optionalText(500, 'Quote description'),
  items: z
    .array(quoteItemInputSchema)
    .min(1, 'Add at least one quote item')
    .max(MAX_QUOTE_ITEMS, `A quotation can hold at most ${MAX_QUOTE_ITEMS} items`),
  /** Fixed-amount discount in cedis (PART 15 — no percentage discounts). */
  discount: finiteMoneyCedis.optional(),
  /** Required business window (PART 20 — never valid forever). */
  validUntil: z.coerce
    .date()
    .refine((value) => !Number.isNaN(value.getTime()), 'Enter a valid validity date'),
  notes: optionalText(MAX_QUOTE_TEXT_LENGTH, 'Notes'),
  terms: optionalText(MAX_QUOTE_TEXT_LENGTH, 'Terms'),
  estimatedDurationDays: z.number().int().positive().max(3650).nullable().optional(),
})

/** Draft edits — same shape minus the immutable linkage fields (PART 28). */
export const updateQuoteSchema = createQuoteSchema
  .omit({ jobRequestId: true })
  .partial()

export const declineQuoteSchema = z.object({
  reason: optionalText(MAX_DECLINE_REASON_LENGTH, 'Reason'),
})

export const quoteListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['ALL', 'DRAFT', 'SUBMITTED', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN']).default('ALL'),
  q: optionalText(80, 'Search'),
})

export type QuoteItemInput = z.infer<typeof quoteItemInputSchema>
export type CreateQuoteInput = z.infer<typeof createQuoteSchema>
export type UpdateQuoteInput = z.infer<typeof updateQuoteSchema>
export type QuoteListQuery = z.infer<typeof quoteListQuerySchema>

// -----------------------------------------------------------------------------
// Server-side money calculation (PART 13/14/15/17 — the core integrity rule)
// -----------------------------------------------------------------------------

export interface ComputedLine {
  kind: QuoteItemKind
  name: string
  description: string | null
  quantityMilli: number
  unitLabel: string | null
  unitPriceAmount: number
  lineTotalAmount: number
  sortOrder: number
}

export interface ComputedTotals {
  lines: ComputedLine[]
  labourAmount: number
  materialAmount: number
  equipmentAmount: number
  otherChargesAmount: number
  subtotalAmount: number
  discountAmount: number
  totalAmount: number
}

/**
 * Recomputes EVERYTHING from raw item inputs. Quantity is converted to
 * integer thousandths and the price to integer pesewas BEFORE any
 * arithmetic; line totals use the sanctioned round-half-up helper. A
 * browser-declared "total" cannot exist here by construction.
 */
export function computeQuoteTotals(
  items: QuoteItemInput[],
  discountCedis: number | null | undefined,
): ComputedTotals {
  const lines: ComputedLine[] = items.map((item, index) => {
    const quantityMilli = Math.round(item.quantity * 1000)
    if (!Number.isInteger(quantityMilli) || quantityMilli <= 0) {
      throw new ValidationError({ items: ['Item quantities must be positive numbers.'] })
    }
    if (quantityMilli > MAX_QUANTITY_MILLI) {
      throw new ValidationError({ items: ['Item quantity is unreasonably large.'] })
    }
    const unitPriceAmount = toPesewas(item.unitPrice)
    if (unitPriceAmount > MAX_UNIT_PRICE_PESEWAS) {
      throw new ValidationError({ items: ['Item unit price is unreasonably large.'] })
    }
    return {
      kind: item.kind,
      name: item.name,
      description: item.description ?? null,
      quantityMilli,
      unitLabel: item.unit ?? null,
      unitPriceAmount,
      lineTotalAmount: lineTotalAmount(quantityMilli, unitPriceAmount),
      sortOrder: index,
    }
  })

  const labourAmount = sumByKind(lines, 'LABOUR')
  const materialAmount = sumByKind(lines, 'MATERIAL')
  const equipmentAmount = sumByKind(lines, 'EQUIPMENT')
  // The Quote model's denormalised buckets keep TRANSPORT inside the
  // "other charges" bucket (the line items remain the source of truth).
  const otherChargesAmount =
    sumByKind(lines, 'TRANSPORT') + sumByKind(lines, 'OTHER')
  const subtotalAmount =
    labourAmount + materialAmount + equipmentAmount + otherChargesAmount

  const discountAmount = discountCedis ? toPesewas(discountCedis) : 0
  if (discountAmount > subtotalAmount) {
    throw new ValidationError({
      discount: ['Discount cannot be greater than the quotation subtotal.'],
    })
  }

  return {
    lines,
    labourAmount,
    materialAmount,
    equipmentAmount,
    otherChargesAmount,
    subtotalAmount,
    discountAmount,
    totalAmount: subtotalAmount - discountAmount,
  }
}

function sumByKind(lines: ComputedLine[], kind: QuoteItemKind): number {
  return lines
    .filter((line) => line.kind === kind)
    .reduce((sum, line) => sum + line.lineTotalAmount, 0)
}

/** Validity guard shared by create/update/send (PART 20). */
function assertValidityDate(validUntil: Date, reference = 'validUntil'): void {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  if (validUntil.getTime() < startOfToday.getTime()) {
    throw new ValidationError({
      [reference]: ['Validity date cannot be in the past.'],
    })
  }
  const maxDate = new Date(startOfToday)
  maxDate.setDate(maxDate.getDate() + MAX_VALIDITY_DAYS)
  if (validUntil.getTime() > maxDate.getTime()) {
    throw new ValidationError({
      [reference]: [`Validity date cannot be more than ${MAX_VALIDITY_DAYS} days ahead.`],
    })
  }
}

// -----------------------------------------------------------------------------
// Access resolution (PART 2/43 — reuse of the request-side authorization)
// -----------------------------------------------------------------------------

interface QuoteAccess {
  quote: {
    id: string
    quoteNumber: string
    status: string
    jobRequestId: string
    providerId: string
    customerId: string
    validUntil: Date | null
    submittedAt: Date | null
    respondedAt: Date | null
    createdAt: Date
  }
  side: 'CUSTOMER' | 'PROVIDER' | 'STAFF'
  /** Provider side may act (edit/send/withdraw) — owner user, OWNER/MANAGER. */
  canManageProviderSide: boolean
}

/**
 * Loads a quotation and resolves the caller's relationship to it. Foreign
 * callers receive the same opaque 404 as anonymous probes — the existence of
 * a quotation is never disclosed (PART 43: never 200, never 500).
 */
async function resolveQuoteAccess(auth: AuthContext | null, id: string): Promise<QuoteAccess> {
  const context = requireAuth(auth)
  const quote = await db.quote.findUnique({
    where: { id },
    select: {
      id: true,
      quoteNumber: true,
      status: true,
      jobRequestId: true,
      providerId: true,
      customerId: true,
      validUntil: true,
      submittedAt: true,
      respondedAt: true,
      createdAt: true,
    },
  })
  if (!quote) throw new NotFoundError('Quotation')

  if (quote.customerId === context.userId) {
    return { quote, side: 'CUSTOMER', canManageProviderSide: false }
  }

  if (context.role === 'ADMIN' || context.role === 'SUPER_ADMIN') {
    return { quote, side: 'STAFF', canManageProviderSide: false }
  }

  const provider = await db.providerProfile.findUnique({
    where: { id: quote.providerId },
    select: { userId: true, businessId: true },
  })
  if (provider) {
    if (provider.userId === context.userId) {
      return { quote, side: 'PROVIDER', canManageProviderSide: true }
    }
    if (provider.businessId) {
      // Business-affiliated profile: OWNER/MANAGER manage; MEMBER read-only
      // (PART 63 — never blanket owner-level quotation powers).
      const membership = await db.businessMember.findUnique({
        where: { businessId_userId: { businessId: provider.businessId, userId: context.userId } },
        select: { memberRole: true, status: true },
      })
      if (membership && membership.status === 'ACTIVE') {
        return {
          quote,
          side: 'PROVIDER',
          canManageProviderSide:
            membership.memberRole === 'OWNER' || membership.memberRole === 'MANAGER',
        }
      }
    }
  }

  throw new NotFoundError('Quotation')
}

/** The role behind a provider-side caller must hold the submit permission. */
function assertQuoteSubmitPermission(auth: AuthContext): void {
  if (!hasPermission(auth.role, 'commerce:quotes:submit')) {
    throw new ForbiddenError('Your account type cannot create quotations.')
  }
}

/** Defense in depth: a suspended provider account can never act (PART 64). */
async function assertProviderAccountActive(providerId: string): Promise<void> {
  const provider = await db.providerProfile.findUnique({
    where: { id: providerId },
    select: { user: { select: { status: true } } },
  })
  if (!provider || provider.user.status !== 'ACTIVE') {
    throw new ForbiddenError('This account can no longer be used. Contact Dwellers support.')
  }
}

// -----------------------------------------------------------------------------
// Select shapes (PART 60 — fixed, efficient query patterns, no N+1)
// -----------------------------------------------------------------------------

const quoteDetailInclude = {
  items: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  },
  jobRequest: {
    select: {
      id: true,
      reference: true,
      title: true,
      description: true,
      status: true,
      responseKind: true,
      service: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      location: {
        select: {
          id: true,
          name: true,
          region: { select: { name: true } },
          district: { select: { name: true } },
        },
      },
      community: { select: { id: true, name: true } },
    },
  },
  provider: {
    select: {
      id: true,
      profession: true,
      business: { select: { name: true } },
      user: { select: { id: true, name: true } },
    },
  },
  customer: { select: { id: true, name: true } },
} satisfies Prisma.QuoteInclude

type QuoteRow = Prisma.QuoteGetPayload<{ include: typeof quoteDetailInclude }>

/** Provider display name: business name when affiliated, else the person. */
function providerDisplayName(provider: QuoteRow['provider']): string {
  return provider.business?.name ?? provider.user?.name ?? 'Provider'
}

// -----------------------------------------------------------------------------
// Create (PART 2/3/4/13/42 — eligibility ladder, server-resolved ownership)
// -----------------------------------------------------------------------------

/**
 * Creates a DRAFT quotation for a job request. Every eligibility rule in
 * PART 2 is enforced here, server-side, in order — and every linkage field
 * (customer, provider, service, location) is resolved from authorized
 * database records, never from the request body (PART 42).
 */
export async function createQuote(auth: AuthContext | null, input: CreateQuoteInput) {
  const context = requireAuth(auth)
  assertQuoteSubmitPermission(context)

  // 1. The request must exist and the caller must BE its targeted provider
  //    side (foreign probes get the same opaque 404 — PART 43).
  const access = await resolveJobRequestAccess(auth, input.jobRequestId)
  if (access.side !== 'PROVIDER' || !access.canManageProviderSide) {
    throw new ForbiddenError('You cannot create a quotation for this request.')
  }
  const request = await db.jobRequest.findUnique({
    where: { id: access.request.id },
    select: {
      id: true,
      reference: true,
      customerId: true,
      providerId: true,
      status: true,
      responseKind: true,
    },
  })
  if (!request) throw new NotFoundError('Job request')

  // 2. Quote-eligible state: the provider must have responded INTERESTED and
  //    the request must still be open (PART 2 — not cancelled, not declined,
  //    not completed, not committed elsewhere).
  if (request.status !== 'RESPONDED' || request.responseKind !== 'INTERESTED') {
    throw new BadRequestError(
      'You cannot create a quotation for this request — it is not in a quote-eligible state.',
    )
  }

  // 3. The provider account must still be live (PART 64).
  await assertProviderAccountActive(request.providerId!)

  // 4. One quotation per provider per request — a withdrawn/declined/expired
  //    quote is history, not a template (PART 28: no silent revisions).
  const existing = await db.quote.findFirst({
    where: { jobRequestId: request.id, providerId: request.providerId! },
    select: { id: true, quoteNumber: true, status: true },
  })
  if (existing) {
    throw new ConflictError(
      `You already created quotation ${existing.quoteNumber} for this request.`,
    )
  }

  // 5. Server-side totals from the item data (PART 13) + validity window.
  const totals = computeQuoteTotals(input.items, input.discount)
  assertValidityDate(input.validUntil)

  const quote = await db.$transaction(async (tx) => {
    const created = await tx.quote.create({
      data: {
        quoteNumber: await generateQuoteNumber(),
        jobRequestId: request.id,
        providerId: request.providerId!,
        customerId: request.customerId, // resolved from the request — never the body
        description: input.description ?? null,
        labourAmount: totals.labourAmount,
        materialAmount: totals.materialAmount,
        equipmentAmount: totals.equipmentAmount,
        otherChargesAmount: totals.otherChargesAmount,
        discountAmount: totals.discountAmount,
        taxAmount: 0, // PART 16 — no tax is invented in Phase 6
        totalAmount: totals.totalAmount,
        validUntil: input.validUntil,
        estimatedDurationDays: input.estimatedDurationDays ?? null,
        terms: input.terms ?? null,
        notes: input.notes ?? null,
        status: 'DRAFT',
        items: {
          create: totals.lines.map((line) => ({
            kind: line.kind,
            name: line.name,
            description: line.description,
            quantityMilli: line.quantityMilli,
            unitLabel: line.unitLabel,
            unitPriceAmount: line.unitPriceAmount,
            lineTotalAmount: line.lineTotalAmount,
            sortOrder: line.sortOrder,
          })),
        },
      },
    })
    await tx.jobRequestEvent.create({
      data: {
        jobRequestId: request.id,
        eventType: QUOTE_EVENT_TYPES.created,
        actorId: context.userId,
        actorRole: context.role,
        message: created.quoteNumber,
      },
    })
    return created
  })

  recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.QUOTE_CREATED,
    entityType: 'Quote',
    entityId: quote.id,
    metadata: {
      quoteNumber: quote.quoteNumber,
      jobRequestId: request.id,
      itemCount: totals.lines.length,
      totalAmount: totals.totalAmount,
    },
  })
  recordDiscoveryEvent({ type: 'quote_created' })

  return getQuote(auth, quote.id)
}

/** Unique, non-sequential quotation reference (PART 27). Retries on the
 * astronomically unlikely alphabet collision. */
async function generateQuoteNumber(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const quoteNumber = generateReference('QT')
    const clash = await db.quote.findUnique({ where: { quoteNumber }, select: { id: true } })
    if (!clash) return quoteNumber
  }
  throw new InternalQuoteNumberError()
}

class InternalQuoteNumberError extends Error {
  constructor() {
    super('Could not allocate a unique quotation reference')
  }
}

// -----------------------------------------------------------------------------
// Read (PART 25/31/60 — the customer open records the real VIEWED event)
// -----------------------------------------------------------------------------

/**
 * Loads one quotation for an authorized caller. The customer's first open of
 * a SENT quotation moves it SUBMITTED → VIEWED exactly once — real timeline
 * event, provider notification, audit row (PART 69). Expiry is enforced
 * lazily on read so both sides see the honest state (PART 31).
 */
export async function getQuote(auth: AuthContext | null, id: string) {
  const context = requireAuth(auth)
  const access = await resolveQuoteAccess(auth, id)

  await lazilyExpireQuote(access.quote)
  // Re-resolve after a possible lazy expiry so the caller sees the truth.
  const fresh = await db.quote.findUnique({ where: { id }, include: quoteDetailInclude })
  if (!fresh) throw new NotFoundError('Quotation')

  // Customer's first open marks the quote VIEWED (idempotent via the
  // conditional update — concurrent opens produce at most one event).
  if (access.side === 'CUSTOMER' && fresh.status === 'SUBMITTED') {
    assertQuoteTransition('view', 'CUSTOMER', fresh.status)
    const now = new Date()
    const viewed = await db.$transaction(async (tx) => {
      const claim = await tx.quote.updateMany({
        where: { id, status: 'SUBMITTED' },
        data: { status: 'VIEWED' },
      })
      if (claim.count === 0) return false
      await tx.jobRequestEvent.create({
        data: {
          jobRequestId: fresh.jobRequestId,
          eventType: QUOTE_EVENT_TYPES.viewed,
          actorId: context.userId,
          actorRole: context.role,
          message: fresh.quoteNumber,
        },
      })
      await tx.notification.create({
        data: {
          recipientId: fresh.provider.user.id,
          type: NOTIFICATION_TYPES.QUOTE_VIEWED,
          channel: 'IN_APP',
          title: 'Your quotation has been viewed.',
          body: `Quotation ${fresh.quoteNumber} was opened by the customer.`,
          entityType: 'Quote',
          entityId: fresh.id,
        },
        select: { id: true },
      })
      return true
    })
    if (viewed) {
      recordAudit({
        actorId: context.userId,
        actorRole: context.role,
        action: AUDIT_ACTIONS.QUOTE_VIEWED,
        entityType: 'Quote',
        entityId: fresh.id,
        metadata: { quoteNumber: fresh.quoteNumber },
      })
      recordDiscoveryEvent({ type: 'quote_viewed' })
      fresh.status = 'VIEWED'
    }
  }

  return shapeQuoteDetail(fresh, access)
}

/**
 * A quotation past its validity date is expired — transitioned on sight
 * (read or decision path), never silently accepted (PART 31). The lazy
 * transition is conditional, so concurrent readers cannot duplicate events.
 */
async function lazilyExpireQuote(quote: {
  id: string
  quoteNumber: string
  status: string
  jobRequestId: string
  validUntil: Date | null
}): Promise<void> {
  if (quote.status !== 'SUBMITTED' && quote.status !== 'VIEWED') return
  if (!isQuotePastValidity(quote.validUntil)) return

  const claimed = await db.$transaction(async (tx) => {
    const claim = await tx.quote.updateMany({
      where: { id: quote.id, status: { in: ['SUBMITTED', 'VIEWED'] } },
      data: { status: 'EXPIRED' },
    })
    if (claim.count === 0) return false
    await tx.jobRequestEvent.create({
      data: {
        jobRequestId: quote.jobRequestId,
        eventType: QUOTE_EVENT_TYPES.expired,
        message: quote.quoteNumber,
      },
    })
    return true
  })
  if (claimed) {
    recordAudit({
      action: AUDIT_ACTIONS.QUOTE_EXPIRED,
      entityType: 'Quote',
      entityId: quote.id,
      metadata: { quoteNumber: quote.quoteNumber, reason: 'validity_passed' },
    })
    recordDiscoveryEvent({ type: 'quote_expired' })
  }
}

/** Projects a quote row for API/page consumption, privacy-aware (PART 39/43). */
function shapeQuoteDetail(quote: QuoteRow, access: QuoteAccess) {
  const providerPerspective = access.side !== 'CUSTOMER'
  const locationLine = [
    quote.jobRequest.community?.name,
    quote.jobRequest.location?.name,
    quote.jobRequest.location?.district?.name,
    quote.jobRequest.location?.region?.name,
  ]
    .filter(Boolean)
    .join(', ')

  return {
    id: quote.id,
    quoteNumber: quote.quoteNumber,
    status: quote.status,
    description: quote.description,
    validUntil: quote.validUntil,
    estimatedDurationDays: quote.estimatedDurationDays,
    terms: quote.terms,
    notes: quote.notes,
    currency: quote.currency,
    subtotalAmount:
      quote.labourAmount + quote.materialAmount + quote.equipmentAmount + quote.otherChargesAmount,
    discountAmount: quote.discountAmount,
    taxAmount: quote.taxAmount,
    totalAmount: quote.totalAmount,
    createdAt: quote.createdAt,
    submittedAt: quote.submittedAt,
    respondedAt: quote.respondedAt,
    items: quote.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      name: item.name,
      description: item.description,
      quantityMilli: item.quantityMilli,
      unitLabel: item.unitLabel,
      unitPriceAmount: item.unitPriceAmount,
      lineTotalAmount: item.lineTotalAmount,
      sortOrder: item.sortOrder,
    })),
    jobRequest: {
      id: quote.jobRequest.id,
      reference: quote.jobRequest.reference,
      title: quote.jobRequest.title,
      status: quote.jobRequest.status,
      serviceLine: quote.jobRequest.service?.name ?? quote.jobRequest.category?.name ?? null,
      locationLine: locationLine || '—',
    },
    provider: {
      id: quote.provider.id,
      displayName: providerDisplayName(quote.provider),
    },
    // Privacy: the provider side sees a display name only — never the
    // customer's email, phone or account details (PART 39).
    customer: {
      displayName: providerPerspective
        ? displayNameInitial(quote.customer.name)
        : (quote.customer.name ?? 'You'),
    },
    access: {
      side: access.side,
      canDecide: access.side === 'CUSTOMER' && ['SUBMITTED', 'VIEWED'].includes(quote.status),
      canManage: access.side === 'PROVIDER' && access.canManageProviderSide,
      canEditDraft:
        access.side === 'PROVIDER' && access.canManageProviderSide && quote.status === 'DRAFT',
    },
  }
}

// -----------------------------------------------------------------------------
// List (PART 36/37/38/39/49/50 — scoped lists, filters, search, counts)
// -----------------------------------------------------------------------------

/**
 * Lists quotations for the caller: customers see quotes on THEIR requests,
 * providers see quotes from THEIR profile (own or business-affiliated),
 * staff sees all. Server-side status filtering + reference/title/name
 * search (PART 38/39), paginated, with per-status counts for the tabs.
 */
export async function listQuotes(auth: AuthContext | null, query: QuoteListQuery) {
  const context = requireAuth(auth)

  const where: Prisma.QuoteWhereInput = {}
  if (context.role === 'ADMIN' || context.role === 'SUPER_ADMIN') {
    // Staff sees everything — no scoping filter.
  } else if (hasPermission(context.role, 'commerce:quotes:respond')) {
    // Customer side: quotes addressed to me. (Respond implies request.)
    where.customerId = context.userId
  } else if (hasPermission(context.role, 'commerce:quotes:submit')) {
    // Provider side: my own profile or any profile of a business I belong to.
    const memberships = await db.businessMember.findMany({
      where: { userId: context.userId, status: 'ACTIVE' },
      select: { businessId: true },
    })
    const businessIds = memberships.map((membership) => membership.businessId)
    const ownProfiles = await db.providerProfile.findMany({
      where: { OR: [{ userId: context.userId }, { businessId: { in: businessIds } }] },
      select: { id: true },
    })
    where.providerId = { in: ownProfiles.map((profile) => profile.id) }
  } else {
    // Neither side — structurally nothing to see.
    where.id = { in: [] }
  }

  if (query.status !== 'ALL') {
    where.status = query.status
  }

  const trimmedQuery = query.q?.trim()
  if (trimmedQuery) {
    where.OR = [
      { quoteNumber: { contains: trimmedQuery } },
      { jobRequest: { title: { contains: trimmedQuery } } },
      { jobRequest: { reference: { contains: trimmedQuery } } },
      { provider: { business: { name: { contains: trimmedQuery } } } },
      { provider: { user: { name: { contains: trimmedQuery } } } },
      { customer: { name: { contains: trimmedQuery } } },
    ]
  }

  const { skip, take } = skipTake(query)
  const [rows, total, statusCounts] = await Promise.all([
    db.quote.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        quoteNumber: true,
        status: true,
        totalAmount: true,
        discountAmount: true,
        currency: true,
        validUntil: true,
        createdAt: true,
        submittedAt: true,
        jobRequest: { select: { id: true, reference: true, title: true } },
        provider: {
          select: {
            id: true,
            business: { select: { name: true } },
            user: { select: { name: true } },
          },
        },
        customer: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
    }),
    db.quote.count({ where }),
    db.quote.groupBy({
      by: ['status'],
      where: { ...where, status: undefined },
      _count: { _all: true },
    }),
  ])

  const providerPerspective = hasPermission(context.role, 'commerce:quotes:submit') &&
    !hasPermission(context.role, 'commerce:quotes:respond')

  return {
    items: rows.map((row) => ({
      id: row.id,
      quoteNumber: row.quoteNumber,
      status: row.status,
      totalAmount: row.totalAmount,
      discountAmount: row.discountAmount,
      currency: row.currency,
      validUntil: row.validUntil,
      createdAt: row.createdAt,
      itemCount: row._count.items,
      jobRequest: {
        id: row.jobRequest.id,
        reference: row.jobRequest.reference,
        title: row.jobRequest.title,
      },
      provider: {
        id: row.provider.id,
        displayName: row.provider.business?.name ?? row.provider.user?.name ?? 'Provider',
      },
      customer: {
        displayName: providerPerspective
          ? displayNameInitial(row.customer.name)
          : (row.customer.name ?? 'Customer'),
      },
    })),
    total,
    counts: Object.fromEntries(
      statusCounts.map((entry) => [entry.status, entry._count._all]),
    ) as Record<string, number>,
  }
}

// -----------------------------------------------------------------------------
// Draft edit (PART 23/28/72 — only DRAFT, item set replaced atomically)
// -----------------------------------------------------------------------------

/**
 * Edits a DRAFT quotation: replaces the item set and recalculates every
 * total server-side. A SENT quotation is never silently edited (PART 28/72)
 * — the state machine rejects the action with a clear message.
 */
export async function updateQuote(auth: AuthContext | null, id: string, input: UpdateQuoteInput) {
  const context = requireAuth(auth)
  const access = await resolveQuoteAccess(auth, id)
  if (access.side !== 'PROVIDER' || !access.canManageProviderSide) {
    throw new ForbiddenError('Only the provider who created this quotation can edit it.')
  }
  // Central machine — draft edits only while DRAFT (PART 23).
  assertQuoteTransition('edit_draft', 'PROVIDER', access.quote.status)
  await assertProviderAccountActive(access.quote.providerId)

  const current = await db.quote.findUnique({
    where: { id },
    select: { items: { orderBy: { sortOrder: 'asc' } }, discountAmount: true },
  })
  if (!current) throw new NotFoundError('Quotation')

  // Merge semantics: omitted sections keep their current values so a partial
  // PATCH can never wipe the draft.
  const nextItems = input.items ?? current.items.map((item) => ({
    kind: item.kind as QuoteItemKind,
    name: item.name,
    description: item.description,
    quantity: item.quantityMilli / 1000,
    unit: item.unitLabel,
    unitPrice: item.unitPriceAmount / 100,
  }))
  const nextDiscount =
    input.discount !== undefined ? input.discount : current.discountAmount / 100
  const nextValidUntil = input.validUntil ?? undefined

  const totals = computeQuoteTotals(nextItems, nextDiscount)
  if (nextValidUntil) assertValidityDate(nextValidUntil)

  const itemDiff = diffItems(current.items, totals.lines)

  await db.$transaction(async (tx) => {
    await tx.quote.update({
      where: { id },
      data: {
        description: input.description !== undefined ? (input.description ?? null) : undefined,
        labourAmount: totals.labourAmount,
        materialAmount: totals.materialAmount,
        equipmentAmount: totals.equipmentAmount,
        otherChargesAmount: totals.otherChargesAmount,
        discountAmount: totals.discountAmount,
        taxAmount: 0,
        totalAmount: totals.totalAmount,
        ...(input.validUntil !== undefined ? { validUntil: input.validUntil } : {}),
        notes: input.notes !== undefined ? (input.notes ?? null) : undefined,
        terms: input.terms !== undefined ? (input.terms ?? null) : undefined,
        estimatedDurationDays:
          input.estimatedDurationDays !== undefined
            ? (input.estimatedDurationDays ?? null)
            : undefined,
        items: {
          deleteMany: {},
          create: totals.lines.map((line) => ({
            kind: line.kind,
            name: line.name,
            description: line.description,
            quantityMilli: line.quantityMilli,
            unitLabel: line.unitLabel,
            unitPriceAmount: line.unitPriceAmount,
            lineTotalAmount: line.lineTotalAmount,
            sortOrder: line.sortOrder,
          })),
        },
      },
    })
    await tx.jobRequestEvent.create({
      data: {
        jobRequestId: access.quote.jobRequestId,
        eventType: 'QUOTE_DRAFT_UPDATED',
        actorId: context.userId,
        actorRole: context.role,
        message: access.quote.quoteNumber,
      },
    })
  })

  recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.QUOTE_UPDATED,
    entityType: 'Quote',
    entityId: id,
    metadata: {
      quoteNumber: access.quote.quoteNumber,
      itemsAdded: itemDiff.added,
      itemsUpdated: itemDiff.updated,
      itemsRemoved: itemDiff.removed,
      totalAmount: totals.totalAmount,
    },
  })
  // Item-level audit actions (PART 35) — recorded alongside QUOTE_UPDATED
  // whenever the draft edit actually changed the item set.
  const itemAuditBase = {
    actorId: context.userId,
    actorRole: context.role,
    entityType: 'Quote',
    entityId: id,
  }
  if (itemDiff.added > 0) {
    recordAudit({ ...itemAuditBase, action: AUDIT_ACTIONS.QUOTE_ITEM_ADDED, metadata: { quoteNumber: access.quote.quoteNumber, count: itemDiff.added } })
  }
  if (itemDiff.updated > 0) {
    recordAudit({ ...itemAuditBase, action: AUDIT_ACTIONS.QUOTE_ITEM_UPDATED, metadata: { quoteNumber: access.quote.quoteNumber, count: itemDiff.updated } })
  }
  if (itemDiff.removed > 0) {
    recordAudit({ ...itemAuditBase, action: AUDIT_ACTIONS.QUOTE_ITEM_REMOVED, metadata: { quoteNumber: access.quote.quoteNumber, count: itemDiff.removed } })
  }
  recordDiscoveryEvent({ type: 'quote_updated' })

  return getQuote(auth, id)
}

/** Item-level change counts for the audit trail (PART 35). */
function diffItems(
  before: { id: string; name: string; unitPriceAmount: number; quantityMilli: number }[],
  after: ComputedLine[],
): { added: number; updated: number; removed: number } {
  const beforeKeys = new Set(before.map((item) => `${item.name}|${item.quantityMilli}|${item.unitPriceAmount}`))
  const afterKeys = new Set(after.map((line) => `${line.name}|${line.quantityMilli}|${line.unitPriceAmount}`))
  let updated = 0
  const beforeByName = new Map(before.map((item) => [item.name, item]))
  for (const line of after) {
    const previous = beforeByName.get(line.name)
    if (previous && !beforeKeys.has(`${line.name}|${line.quantityMilli}|${line.unitPriceAmount}`)) {
      updated += 1
    }
  }
  return {
    added: after.filter((line) => !beforeByName.has(line.name)).length,
    updated,
    removed: before.filter((item) => !afterKeys.has(`${item.name}|${item.quantityMilli}|${item.unitPriceAmount}`)).length,
  }
}

// -----------------------------------------------------------------------------
// Provider transitions: SEND / WITHDRAW (PART 23/26/46/68/77)
// -----------------------------------------------------------------------------

/**
 * Sends a DRAFT quotation to the customer: DRAFT → SUBMITTED, one timeline
 * event, one customer notification. Double clicks are race-safe — the
 * conditional update only matches a DRAFT row, so the losing request sees
 * "already sent" and no duplicate notification/event exists (PART 46/77).
 */
export async function sendQuote(auth: AuthContext | null, id: string) {
  const context = requireAuth(auth)
  const access = await resolveQuoteAccess(auth, id)
  if (access.side !== 'PROVIDER' || !access.canManageProviderSide) {
    throw new ForbiddenError('Only the provider who created this quotation can send it.')
  }
  // Central machine — sending only from DRAFT (PART 22).
  assertQuoteTransition('send', 'PROVIDER', access.quote.status)
  await assertProviderAccountActive(access.quote.providerId)

  const quote = await db.quote.findUnique({
    where: { id },
    select: {
      quoteNumber: true,
      validUntil: true,
      totalAmount: true,
      jobRequestId: true,
      customerId: true,
      _count: { select: { items: true } },
    },
  })
  if (!quote) throw new NotFoundError('Quotation')
  if (quote._count.items === 0) {
    throw new ValidationError({ items: ['Add at least one quote item before sending.'] })
  }
  // A draft that sat around past its own validity cannot be sent (PART 20).
  if (isQuotePastValidity(quote.validUntil)) {
    throw new ValidationError({
      validUntil: ['The validity date has passed — choose a future date before sending.'],
    })
  }

  const providerName = await providerDisplayNameFor(access.quote.providerId)

  await db.$transaction(async (tx) => {
    const claim = await tx.quote.updateMany({
      where: { id, status: 'DRAFT' },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    })
    if (claim.count === 0) {
      throw new ConflictError('This quotation has already been sent.')
    }
    await tx.jobRequestEvent.create({
      data: {
        jobRequestId: quote.jobRequestId,
        eventType: QUOTE_EVENT_TYPES.sent,
        actorId: context.userId,
        actorRole: context.role,
        message: quote.quoteNumber,
      },
    })
    await tx.notification.create({
      data: {
        recipientId: quote.customerId,
        type: NOTIFICATION_TYPES.QUOTE_SENT,
        channel: 'IN_APP',
        title: `${providerName} has sent you a quotation.`,
        body: `Open My Job Requests to review quotation ${quote.quoteNumber}.`,
        entityType: 'Quote',
        entityId: id,
      },
      select: { id: true },
    })
  })

  recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.QUOTE_SENT,
    entityType: 'Quote',
    entityId: id,
    metadata: { quoteNumber: quote.quoteNumber, totalAmount: quote.totalAmount },
  })
  recordDiscoveryEvent({ type: 'quote_sent' })

  return getQuote(auth, id)
}

/**
 * The provider withdraws its own quotation (draft or sent, before any
 * decision): → WITHDRAWN. Terminal; the request timeline records it.
 */
export async function withdrawQuote(auth: AuthContext | null, id: string) {
  const context = requireAuth(auth)
  const access = await resolveQuoteAccess(auth, id)
  if (access.side !== 'PROVIDER' || !access.canManageProviderSide) {
    throw new ForbiddenError('Only the provider who created this quotation can withdraw it.')
  }
  assertQuoteTransition('withdraw', 'PROVIDER', access.quote.status)
  await assertProviderAccountActive(access.quote.providerId)

  await db.$transaction(async (tx) => {
    const claim = await tx.quote.updateMany({
      where: { id, status: { in: ['DRAFT', 'SUBMITTED', 'VIEWED'] } },
      data: { status: 'WITHDRAWN' },
    })
    if (claim.count === 0) {
      throw new ConflictError('This quotation can no longer be withdrawn.')
    }
    await tx.jobRequestEvent.create({
      data: {
        jobRequestId: access.quote.jobRequestId,
        eventType: QUOTE_EVENT_TYPES.withdrawn,
        actorId: context.userId,
        actorRole: context.role,
        message: access.quote.quoteNumber,
      },
    })
  })

  recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.QUOTE_WITHDRAWN,
    entityType: 'Quote',
    entityId: id,
    metadata: { quoteNumber: access.quote.quoteNumber },
  })
  recordDiscoveryEvent({ type: 'quote_withdrawn' })

  return getQuote(auth, id)
}

// -----------------------------------------------------------------------------
// Customer decisions: ACCEPT / DECLINE (PART 24/29/30/47/48/70/71/78)
// -----------------------------------------------------------------------------

/**
 * The customer accepts a quotation. Server validations (PART 29) run in
 * order: ownership (404 for strangers), quote state, expiry, request state,
 * no other accepted quote. The acceptance itself is a conditional update —
 * of two simultaneous accepts exactly one wins (PART 47/78) — and the whole
 * effect lands atomically: quote state + request state (PART 48) + timeline
 * event + provider notification. NO payment is created (PART 51).
 */
export async function acceptQuote(auth: AuthContext | null, id: string) {
  const context = requireAuth(auth)
  const access = await resolveQuoteAccess(auth, id)
  if (access.side !== 'CUSTOMER') {
    // Providers accept nothing; staff never perform business transitions.
    throw new ForbiddenError('Only the customer who received this quotation can accept it.')
  }
  // Central machine — deciding only from SUBMITTED/VIEWED (PART 22).
  assertQuoteTransition('accept', 'CUSTOMER', access.quote.status)

  // Expiry is checked HERE, at acceptance time — never only by a background
  // job (PART 31). An expired quote transitions to EXPIRED and is refused.
  if (isQuotePastValidity(access.quote.validUntil)) {
    await lazilyExpireQuote(access.quote)
    throw new BadRequestError('This quotation has expired.')
  }

  // The request must be in a state that can accept a quote (PART 48): only
  // RESPONDED — cancelled, declined or already-committed requests refuse.
  const request = await db.jobRequest.findUnique({
    where: { id: access.quote.jobRequestId },
    select: { id: true, reference: true, status: true, customerId: true },
  })
  if (!request) throw new NotFoundError('Job request')
  assertTransition('accept_quote', 'CUSTOMER', request.status)

  // No incompatible quotation may already be accepted for this request
  // (PART 29) — and the customer must never be able to accept two quotes.
  const acceptedSibling = await db.quote.findFirst({
    where: { jobRequestId: request.id, status: 'ACCEPTED', id: { not: id } },
    select: { quoteNumber: true },
  })
  if (acceptedSibling) {
    throw new ConflictError(
      `You already accepted quotation ${acceptedSibling.quoteNumber} for this request.`,
    )
  }

  const now = new Date()
  const [providerUserId, quoteRow] = await Promise.all([
    quoteProviderUserId(access.quote.providerId),
    db.quote.findUnique({ where: { id }, select: { totalAmount: true } }),
  ])

  await db.$transaction(async (tx) => {
    // THE race guard: only a row still in SUBMITTED/VIEWED moves to ACCEPTED.
    const claim = await tx.quote.updateMany({
      where: { id, status: { in: ['SUBMITTED', 'VIEWED'] } },
      data: { status: 'ACCEPTED', respondedAt: now },
    })
    if (claim.count === 0) {
      throw new ConflictError('This quotation can no longer be accepted.')
    }
    // PART 48: the request follows into its existing ACCEPTED status — via
    // the request state machine, inside the same transaction. The update is
    // CONDITIONAL on RESPONDED so two different quotes of the same request
    // can never both commit: the loser rolls back whole (PART 47/78).
    const requestClaim = await tx.jobRequest.updateMany({
      where: { id: request.id, status: 'RESPONDED' },
      data: { status: 'ACCEPTED' },
    })
    if (requestClaim.count === 0) {
      throw new ConflictError('This request has already moved on.')
    }
    await tx.jobRequestEvent.create({
      data: {
        jobRequestId: request.id,
        eventType: QUOTE_EVENT_TYPES.accepted,
        actorId: context.userId,
        actorRole: context.role,
        message: access.quote.quoteNumber,
      },
    })
    await tx.notification.create({
      data: {
        recipientId: providerUserId!,
        type: NOTIFICATION_TYPES.QUOTE_ACCEPTED,
        channel: 'IN_APP',
        title: 'Your quotation was accepted.',
        body: `Quotation ${access.quote.quoteNumber} was accepted. Next: agree how the work starts.`,
        entityType: 'Quote',
        entityId: id,
      },
      select: { id: true },
    })
  })

  recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.QUOTE_ACCEPTED,
    entityType: 'Quote',
    entityId: id,
    metadata: {
      quoteNumber: access.quote.quoteNumber,
      jobRequestId: request.id,
      totalAmount: quoteRow?.totalAmount ?? null,
    },
  })
  recordDiscoveryEvent({ type: 'quote_accepted' })

  return getQuote(auth, id)
}

/**
 * The customer declines a quotation, with an optional reason (PART 30).
 * DECLINED is terminal on the quote; the request stays open so the customer
 * can still accept a different provider's quotation (PART 49).
 */
export async function declineQuote(
  auth: AuthContext | null,
  id: string,
  input: z.infer<typeof declineQuoteSchema>,
) {
  const context = requireAuth(auth)
  const access = await resolveQuoteAccess(auth, id)
  if (access.side !== 'CUSTOMER') {
    throw new ForbiddenError('Only the customer who received this quotation can decline it.')
  }
  assertQuoteTransition('decline', 'CUSTOMER', access.quote.status)

  const now = new Date()
  const providerUserId = await quoteProviderUserId(access.quote.providerId)

  await db.$transaction(async (tx) => {
    const claim = await tx.quote.updateMany({
      where: { id, status: { in: ['SUBMITTED', 'VIEWED'] } },
      data: { status: 'DECLINED', respondedAt: now },
    })
    if (claim.count === 0) {
      throw new ConflictError('This quotation can no longer be declined.')
    }
    await tx.jobRequestEvent.create({
      data: {
        jobRequestId: access.quote.jobRequestId,
        eventType: QUOTE_EVENT_TYPES.declined,
        actorId: context.userId,
        actorRole: context.role,
        message: access.quote.quoteNumber,
      },
    })
    await tx.notification.create({
      data: {
        recipientId: providerUserId!,
        type: NOTIFICATION_TYPES.QUOTE_DECLINED,
        channel: 'IN_APP',
        title: 'Your quotation was declined.',
        body: `Quotation ${access.quote.quoteNumber} was declined by the customer.`,
        entityType: 'Quote',
        entityId: id,
      },
      select: { id: true },
    })
  })

  recordAudit({
    actorId: context.userId,
    actorRole: context.role,
    action: AUDIT_ACTIONS.QUOTE_DECLINED,
    entityType: 'Quote',
    entityId: id,
    metadata: {
      quoteNumber: access.quote.quoteNumber,
      ...(input.reason ? { reason: input.reason } : {}),
    },
  })
  recordDiscoveryEvent({ type: 'quote_declined' })

  return getQuote(auth, id)
}

// -----------------------------------------------------------------------------
// Small helpers
// -----------------------------------------------------------------------------

async function providerDisplayNameFor(providerId: string): Promise<string> {
  const provider = await db.providerProfile.findUnique({
    where: { id: providerId },
    select: { business: { select: { name: true } }, user: { select: { name: true } } },
  })
  return provider?.business?.name ?? provider?.user?.name ?? 'The provider'
}

async function quoteProviderUserId(providerId: string): Promise<string | null> {
  const provider = await db.providerProfile.findUnique({
    where: { id: providerId },
    select: { userId: true },
  })
  return provider?.userId ?? null
}

/**
 * Lists the quotations on ONE job request — the customer-side comparison
 * foundation (PART 49/50): provider, reference, total, validity, status.
 * Same authorization as reading the request itself.
 */
export async function listRequestQuotes(auth: AuthContext | null, jobRequestId: string) {
  const access = await resolveJobRequestAccess(auth, jobRequestId)
  const rows = await db.quote.findMany({
    where: { jobRequestId: access.request.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      quoteNumber: true,
      status: true,
      totalAmount: true,
      currency: true,
      validUntil: true,
      createdAt: true,
      _count: { select: { items: true } },
      provider: {
        select: {
          id: true,
          business: { select: { name: true } },
          user: { select: { name: true } },
        },
      },
    },
  })
  return rows.map((row) => ({
    id: row.id,
    quoteNumber: row.quoteNumber,
    status: row.status,
    totalAmount: row.totalAmount,
    currency: row.currency,
    validUntil: row.validUntil,
    createdAt: row.createdAt,
    itemCount: row._count.items,
    provider: {
      id: row.provider.id,
      displayName: row.provider.business?.name ?? row.provider.user?.name ?? 'Provider',
    },
  }))
}

/**
 * The provider side's view of one request's quotations for THIS caller's
 * profile — used to decide whether CREATE QUOTE may be offered (PART 3) and
 * to link straight to an existing draft/sent quote.
 */
export async function findOwnQuoteForRequest(auth: AuthContext | null, jobRequestId: string) {
  const access = await resolveJobRequestAccess(auth, jobRequestId)
  if (access.side !== 'PROVIDER') return null
  const quote = await db.quote.findFirst({
    where: { jobRequestId: access.request.id, providerId: access.request.providerId! },
    select: { id: true, status: true },
  })
  return quote
}
