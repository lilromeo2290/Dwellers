/**
 * Dwellers — Request timeline (PART 45).
 *
 * Renders REAL JobRequestEvent rows — created/submitted/viewed/responded/
 * cancelled — with their actual timestamps. Nothing here is inferred or
 * fabricated: no event, no entry.
 */
import { CheckCircle2, Eye, FileText, Flag, Image as ImageIcon, Info, MessageSquareReply, Pencil, Upload, XCircle } from 'lucide-react'

export interface TimelineEvent {
  id: string
  eventType: string
  message: string | null
  createdAt: string | Date
  actorRole: string | null
}

const EVENT_META: Record<string, { label: string; icon: typeof FileText }> = {
  CREATED: { label: 'Request created', icon: FileText },
  SUBMITTED: { label: 'Request submitted', icon: CheckCircle2 },
  VIEWED: { label: 'Provider viewed', icon: Eye },
  EDITED: { label: 'Request edited', icon: Pencil },
  ATTACHMENT_ADDED: { label: 'Photo added', icon: Upload },
  ATTACHMENT_REMOVED: { label: 'Photo removed', icon: ImageIcon },
  RESPONSE_INTERESTED: { label: 'Provider responded — interested', icon: MessageSquareReply },
  RESPONSE_INFO_REQUESTED: { label: 'Provider asked for more information', icon: Info },
  RESPONSE_DECLINED: { label: 'Provider declined', icon: XCircle },
  CANCELLED: { label: 'Request cancelled', icon: Flag },
}

function formatDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function RequestTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No events yet.</p>
  }

  const ordered = [...events].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )

  return (
    <ol className="relative space-y-4 border-l pl-5" data-testid="request-timeline">
      {ordered.map((event) => {
        const meta = EVENT_META[event.eventType] ?? { label: event.eventType, icon: FileText }
        const Icon = meta.icon
        return (
          <li key={event.id} className="relative">
            <span className="absolute -left-[27px] flex h-4 w-4 items-center justify-center rounded-full border bg-background">
              <Icon className="h-2.5 w-2.5 text-primary" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium">{meta.label}</p>
            <p className="text-xs text-muted-foreground">{formatDate(event.createdAt)}</p>
            {event.message && (
              <p className="mt-1 rounded-lg bg-muted px-3 py-2 text-sm">&ldquo;{event.message}&rdquo;</p>
            )}
          </li>
        )
      })}
    </ol>
  )
}
