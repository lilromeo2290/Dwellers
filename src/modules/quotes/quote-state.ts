/**
 * Dwellers — Quote state machine (Phase 6, PART 21/22/23/24).
 *
 * THE single source of truth for quotation statuses and transitions, exactly
 * like job-request-state.ts on the request side. The client submits an
 * ACTION — never a raw status (PART 22); the server determines the resulting
 * state inside a transaction.
 *
 * The existing Phase 2 status vocabulary on the Quote model is PRESERVED
 * (PART 21 — "Do not duplicate an existing enum"):
 *
 *   DRAFT → SUBMITTED → VIEWED → ACCEPTED | DECLINED | EXPIRED | WITHDRAWN
 *
 * Spec-to-vocabulary mapping (documented, PART 22 "reconciled with the
 * existing Quote model"):
 *   spec SENT     ≡ SUBMITTED  (the provider has sent the quotation)
 *   spec CANCELLED ≡ WITHDRAWN (the provider cancelled the quotation)
 *
 * Money policy lives in the service layer; this module is pure transition
 * logic with no I/O so tests can exercise the whole machine directly.
 */
import { BadRequestError } from '@/lib/errors'

export const QUOTE_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'VIEWED',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'WITHDRAWN',
] as const

export type QuoteStatus = (typeof QUOTE_STATUSES)[number]

/** The action a client submits. Never a raw status (PART 22). */
export const QUOTE_ACTIONS = [
  'edit_draft',
  'send',
  'view',
  'accept',
  'decline',
  'withdraw',
] as const

export type QuoteAction = (typeof QUOTE_ACTIONS)[number]

/** Which side of the quotation an actor stands on. */
export type QuoteActorKind = 'CUSTOMER' | 'PROVIDER' | 'STAFF'

/** Item kinds — exactly the QuoteItem model's vocabulary (PART 4). */
export const QUOTE_ITEM_KINDS = ['LABOUR', 'MATERIAL', 'EQUIPMENT', 'TRANSPORT', 'OTHER'] as const
export type QuoteItemKind = (typeof QUOTE_ITEM_KINDS)[number]

/** States from which each action may be performed, per actor kind. */
const TRANSITIONS: Record<QuoteAction, Partial<Record<QuoteActorKind, readonly QuoteStatus[]>>> = {
  // The provider manages its own quotation while it is still a draft.
  edit_draft: { PROVIDER: ['DRAFT'] },
  send: { PROVIDER: ['DRAFT'] },
  withdraw: { PROVIDER: ['DRAFT', 'SUBMITTED', 'VIEWED'] },
  // The customer decides on a quotation that has been sent. The first open
  // moves SUBMITTED → VIEWED (service layer keeps this idempotent); the
  // decision itself is allowed from either state so a "mark viewed" race can
  // never block the real decision.
  view: { CUSTOMER: ['SUBMITTED'] },
  accept: { CUSTOMER: ['SUBMITTED', 'VIEWED'] },
  decline: { CUSTOMER: ['SUBMITTED', 'VIEWED'] },
}

/** Terminal states — no further transitions, ever. */
export const QUOTE_TERMINAL_STATUSES: readonly QuoteStatus[] = [
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'WITHDRAWN',
]

/** The status an action produces (view is resolved by the service layer). */
export function nextStatusFor(action: QuoteAction): QuoteStatus {
  switch (action) {
    case 'edit_draft':
      return 'DRAFT'
    case 'send':
      return 'SUBMITTED'
    case 'view':
      return 'VIEWED'
    case 'accept':
      return 'ACCEPTED'
    case 'decline':
      return 'DECLINED'
    case 'withdraw':
      return 'WITHDRAWN'
  }
}

/**
 * Central transition guard. Throws a clear 400 when the action is not
 * permitted for this actor kind in this status — the ONLY gate the service
 * layer uses, so tests can exercise the whole machine through it.
 */
export function assertQuoteTransition(
  action: QuoteAction,
  actorKind: QuoteActorKind,
  status: string,
): void {
  const fromStatuses = TRANSITIONS[action][actorKind]
  if (!fromStatuses || fromStatuses.length === 0) {
    throw new BadRequestError(
      actorKind === 'CUSTOMER'
        ? 'Customers cannot perform this action on a quotation.'
        : actorKind === 'PROVIDER'
          ? 'Providers cannot perform this action on a quotation.'
          : 'Staff cannot perform this action on a quotation.',
    )
  }
  if (!(fromStatuses as readonly string[]).includes(status)) {
    throw new BadRequestError(statusMessageFor(action, status))
  }
}

function statusMessageFor(action: QuoteAction, status: string): string {
  const state = status.replace('_', ' ').toLowerCase()
  switch (action) {
    case 'send':
      return 'This quotation has already been sent.' // the common double-click case (PART 59)
    case 'accept':
      return status === 'ACCEPTED'
        ? 'You have already accepted this quotation.'
        : `You cannot accept a quotation that is ${state}.`
    case 'decline':
      return status === 'DECLINED'
        ? 'You have already declined this quotation.'
        : `You cannot decline a quotation that is ${state}.`
    case 'withdraw':
      return `You cannot withdraw a quotation that is ${state}.`
    case 'edit_draft':
      return 'Only draft quotations can be edited.'
    case 'view':
      return 'This quotation cannot be viewed in its current state.'
  }
}

/** True when no further transitions are possible. */
export function isQuoteTerminal(status: string): boolean {
  return QUOTE_TERMINAL_STATUSES.includes(status as QuoteStatus)
}

/** Job-request timeline event types emitted for quote actions (PART 34). */
export const QUOTE_EVENT_TYPES = {
  created: 'QUOTE_CREATED',
  sent: 'QUOTE_SENT',
  viewed: 'QUOTE_VIEWED',
  accepted: 'QUOTE_ACCEPTED',
  declined: 'QUOTE_DECLINED',
  expired: 'QUOTE_EXPIRED',
  withdrawn: 'QUOTE_WITHDRAWN',
} as const

/**
 * A quotation that has passed its validity date is no longer decidable
 * (PART 31). Expiry is enforced lazily — at read and acceptance time — never
 * only by a background job (there is no background job).
 */
export function isQuotePastValidity(validUntil: Date | null, now = new Date()): boolean {
  return validUntil != null && validUntil.getTime() < now.getTime()
}
