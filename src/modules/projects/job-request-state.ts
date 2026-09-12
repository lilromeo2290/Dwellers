/**
 * Dwellers — Job-request state machine (Phase 5, PART 23/24).
 *
 * THE single source of truth for job-request statuses and transitions.
 * Every state change in the service layer must go through
 * `assertTransition` — the client never names a status; it names an ACTION
 * and the server determines the resulting state.
 *
 * The existing Phase 2 status vocabulary is preserved (DRAFT, SUBMITTED,
 * MATCHING, RESPONDED, ACCEPTED, IN_PROGRESS, COMPLETED, CANCELLED); Phase 5
 * adds DECLINED (provider said no — a real, terminal outcome that the
 * provider dashboard reports honestly).
 */
import { BadRequestError } from '@/lib/errors'

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

export type JobRequestStatus = (typeof JOB_REQUEST_STATUSES)[number]

/** The action a client submits. Never a raw status (PART 24). */
export const JOB_REQUEST_ACTIONS = [
  'submit',
  'cancel',
  'edit',
  'respond_interested',
  'respond_declined',
  'respond_info',
] as const

export type JobRequestAction = (typeof JOB_REQUEST_ACTIONS)[number]

/** Which side of the request an actor stands on. */
export type JobRequestActorKind = 'CUSTOMER' | 'PROVIDER' | 'STAFF'

export const RESPONSE_KINDS = ['INTERESTED', 'DECLINED', 'NEEDS_INFO'] as const
export type JobRequestResponseKind = (typeof RESPONSE_KINDS)[number]

/** Response action → (status, timeline event) pairs. */
export const RESPONSE_TRANSITIONS: Record<
  'respond_interested' | 'respond_declined' | 'respond_info',
  { kind: JobRequestResponseKind; status: JobRequestStatus; eventType: string }
> = {
  respond_interested: { kind: 'INTERESTED', status: 'RESPONDED', eventType: 'RESPONSE_INTERESTED' },
  respond_declined: { kind: 'DECLINED', status: 'DECLINED', eventType: 'RESPONSE_DECLINED' },
  respond_info: { kind: 'NEEDS_INFO', status: 'RESPONDED', eventType: 'RESPONSE_INFO_REQUESTED' },
}

/** States from which each action may be performed, per actor kind. */
const TRANSITIONS: Record<JobRequestAction, Partial<Record<JobRequestActorKind, readonly JobRequestStatus[]>>> = {
  // The customer may submit a DRAFT, edit a DRAFT, and cancel until the
  // provider has committed further (acceptance/progress). Once a response
  // exists the request can still be withdrawn — the provider sees it as
  // cancelled, never silently re-opened.
  submit: { CUSTOMER: ['DRAFT'] },
  edit: { CUSTOMER: ['DRAFT'] },
  cancel: { CUSTOMER: ['DRAFT', 'SUBMITTED', 'MATCHING', 'RESPONDED'] },
  // The provider acts on a request that is waiting for them. One response
  // per request: after responding the request moves on (quotation phase
  // continues from there). Staff never perform business transitions.
  respond_interested: { PROVIDER: ['SUBMITTED', 'MATCHING'] },
  respond_declined: { PROVIDER: ['SUBMITTED', 'MATCHING'] },
  respond_info: { PROVIDER: ['SUBMITTED', 'MATCHING'] },
}

/** Statuses the customer may still edit request fields in. */
export const EDITABLE_STATUSES: readonly JobRequestStatus[] = ['DRAFT']

/** Statuses where attachments may be added/removed by the customer. */
export const ATTACHMENT_EDITABLE_STATUSES: readonly JobRequestStatus[] = ['DRAFT', 'SUBMITTED', 'MATCHING']

/** Terminal states — no further transitions, ever. */
export const TERMINAL_STATUSES: readonly JobRequestStatus[] = ['COMPLETED', 'DECLINED', 'CANCELLED']

/** Provider dashboard sections (PART 28). */
export const PROVIDER_STATUS_GROUPS = {
  NEW: ['SUBMITTED', 'MATCHING'],
  ACTIVE: ['RESPONDED', 'ACCEPTED', 'IN_PROGRESS'],
  COMPLETED: ['COMPLETED'],
  DECLINED: ['DECLINED'],
  CANCELLED: ['CANCELLED'],
} as const

export type ProviderStatusGroup = keyof typeof PROVIDER_STATUS_GROUPS

export const URGENCY_LEVELS = ['NORMAL', 'URGENT', 'EMERGENCY'] as const
export type JobRequestUrgency = (typeof URGENCY_LEVELS)[number]

/** Maps a role to its side of the request. */
export function actorKindForRole(role: string): JobRequestActorKind {
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') return 'STAFF'
  if (role === 'CUSTOMER') return 'CUSTOMER'
  return 'PROVIDER'
}

/** The status an action produces. */
export function nextStatusFor(action: JobRequestAction): JobRequestStatus {
  switch (action) {
    case 'submit':
      return 'SUBMITTED'
    case 'cancel':
      return 'CANCELLED'
    case 'respond_interested':
    case 'respond_info':
      return 'RESPONDED'
    case 'respond_declined':
      return 'DECLINED'
    case 'edit':
      // Editing does not move the request; the caller keeps the current status.
      return 'DRAFT'
  }
}

/**
 * Central transition guard. Throws a clear 400 when the action is not
 * permitted for this actor kind in this status — the ONLY gate the service
 * layer uses, so tests can exercise the whole machine through it.
 */
export function assertTransition(
  action: JobRequestAction,
  actorKind: JobRequestActorKind,
  status: string,
): void {
  const fromStatuses = TRANSITIONS[action][actorKind]
  if (!fromStatuses || fromStatuses.length === 0) {
    throw new BadRequestError(
      actorKind === 'CUSTOMER'
        ? 'Customers cannot perform this action on a service request.'
        : actorKind === 'PROVIDER'
          ? 'Providers cannot perform this action on a service request.'
          : 'Staff cannot perform this action on a service request.',
    )
  }
  if (!(fromStatuses as readonly string[]).includes(status)) {
    throw new BadRequestError(
      `This action is not available while the request is ${status.replace('_', ' ').toLowerCase()}.`,
    )
  }
}

/** True when no further transitions are possible. */
export function isTerminal(status: string): boolean {
  return TERMINAL_STATUSES.includes(status as JobRequestStatus)
}

/** Expands a dashboard group into the statuses it contains. */
export function statusesForGroup(group: ProviderStatusGroup): JobRequestStatus[] {
  return [...PROVIDER_STATUS_GROUPS[group]]
}
