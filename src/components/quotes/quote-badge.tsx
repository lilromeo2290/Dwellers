/**
 * Dwellers — Quote status badge (shared, server-safe, Phase 6 PART 21/58).
 *
 * The stored machine vocabulary is SUBMITTED/WITHDRAWN; the labels speak
 * human ("Sent", "Withdrawn"). The label always tells the truth from the
 * state machine — nothing is prettified into a claim the quote cannot back.
 * Status is never conveyed by colour alone: the word is always on the badge.
 */
import { Badge } from '@/components/ui/badge'

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Sent',
  VIEWED: 'Viewed',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  EXPIRED: 'Expired',
  WITHDRAWN: 'Withdrawn',
}

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  DRAFT: 'outline',
  SUBMITTED: 'secondary',
  VIEWED: 'secondary',
  ACCEPTED: 'default',
  DECLINED: 'destructive',
  EXPIRED: 'destructive',
  WITHDRAWN: 'outline',
}

export function QuoteStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={STATUS_VARIANTS[status] ?? 'outline'} data-testid="quote-status">
      {STATUS_LABELS[status] ?? status}
    </Badge>
  )
}

export function quoteStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status
}

/** Filter tabs for the quote boards (PART 38). */
export const QUOTE_FILTERS = [
  'ALL',
  'DRAFT',
  'SUBMITTED',
  'VIEWED',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'WITHDRAWN',
] as const
