/**
 * Dwellers — Request status badge (shared, server-safe).
 *
 * The label always tells the truth from the state machine — nothing is
 * prettified into a claim the request cannot back (PART 83).
 */
import { Badge } from '@/components/ui/badge'

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Waiting for provider',
  MATCHING: 'Waiting for provider',
  RESPONDED: 'Provider responded',
  ACCEPTED: 'Accepted',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  DECLINED: 'Declined by provider',
  CANCELLED: 'Cancelled',
}

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  DRAFT: 'outline',
  SUBMITTED: 'secondary',
  MATCHING: 'secondary',
  RESPONDED: 'default',
  ACCEPTED: 'default',
  IN_PROGRESS: 'default',
  COMPLETED: 'outline',
  DECLINED: 'destructive',
  CANCELLED: 'outline',
}

export function RequestStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={STATUS_VARIANTS[status] ?? 'outline'} data-testid="request-status">
      {STATUS_LABELS[status] ?? status}
    </Badge>
  )
}

/** What happens next — every request always shows a next step (PART 54). */
export function nextStepCopy(status: string, side: 'CUSTOMER' | 'PROVIDER'): string {
  if (side === 'CUSTOMER') {
    switch (status) {
      case 'DRAFT':
        return 'Continue the request and submit it when ready.'
      case 'SUBMITTED':
      case 'MATCHING':
        return 'Waiting for the provider to review your request.'
      case 'RESPONDED':
        return 'The provider has responded — see the response below.'
      case 'ACCEPTED':
      case 'IN_PROGRESS':
        return 'You and the provider have agreed to move forward.'
      case 'COMPLETED':
        return 'This request is complete.'
      case 'DECLINED':
        return 'The provider declined this request. You can request another provider.'
      case 'CANCELLED':
        return 'This request was cancelled.'
      default:
        return ''
    }
  }
  switch (status) {
    case 'SUBMITTED':
    case 'MATCHING':
      return 'A customer is waiting for your response.'
    case 'RESPONDED':
      return 'You responded — the customer has been notified.'
    case 'ACCEPTED':
    case 'IN_PROGRESS':
      return 'This engagement is moving forward.'
    case 'COMPLETED':
      return 'This request is complete.'
    case 'DECLINED':
      return 'You declined this request.'
    case 'CANCELLED':
      return 'The customer cancelled this request.'
    default:
      return ''
  }
}
