'use client'

/**
 * Dwellers — Provider JOB REQUESTS board (Phase 5, PART 28).
 *
 * Sections NEW / ACTIVE / COMPLETED / DECLINED / CANCELLED, each showing
 * exactly what a provider needs to decide: service, job title, location,
 * timing, photos, status. The customer is shown by display name only —
 * private contact details are never in the payload (PART 28/49).
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { RequestStatusBadge } from '@/components/requests/status-badge'

const GROUPS = ['NEW', 'ACTIVE', 'COMPLETED', 'DECLINED', 'CANCELLED'] as const
type Group = (typeof GROUPS)[number]

interface BoardRequest {
  id: string
  reference: string
  title: string | null
  status: string
  urgency: string | null
  service: { id: string; name: string } | null
  category: { id: string; name: string } | null
  location: { id: string; name: string } | null
  preferredTimeSlot: string | null
  preferredDate: string | null
  attachmentCount: number
  createdAt: string
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function ProviderRequestsBoard({ basePath }: { basePath: string }) {
  const [group, setGroup] = useState<Group>('NEW')
  const [items, setItems] = useState<BoardRequest[] | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (current: Group) => {
    setLoading(true)
    try {
      // The list endpoint's envelope data IS the array of requests.
      const rows = await apiGet<BoardRequest[]>(
        `/api/job-requests?statusGroup=${current}&page=1&pageSize=50`,
      )
      setItems(Array.isArray(rows) ? rows : [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(group)
  }, [group, load])

  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Request sections">
        {GROUPS.map((option) => (
          <button
            key={option}
            role="tab"
            aria-selected={group === option}
            onClick={() => setGroup(option)}
            data-testid={`requests-tab-${option.toLowerCase()}`}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
              group === option ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            {option.charAt(0) + option.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      <div className="mt-4" data-testid="provider-requests-list">
        {loading || items === null ? (
          <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading requests…
          </p>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="px-6 py-12 text-center">
              <p className="font-medium">
                {group === 'NEW' ? 'No new requests right now' : `No ${group.toLowerCase()} requests`}
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Requests from customers who found you through Dwellers will appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {items.map((request) => (
              <li key={request.id}>
                <Link
                  href={`${basePath}/requests/${request.id}`}
                  className="block rounded-xl border bg-card transition-colors hover:border-primary/40"
                >
                  <Card className="border-0 shadow-none">
                    <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">{request.reference}</span>
                          <RequestStatusBadge status={request.status} />
                          {request.urgency === 'URGENT' && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
                              Urgent
                            </span>
                          )}
                          {request.urgency === 'EMERGENCY' && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-900 dark:bg-red-500/20 dark:text-red-200">
                              Emergency
                            </span>
                          )}
                        </div>
                        <p className="truncate font-medium">{request.title ?? 'Untitled request'}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {request.service?.name ?? request.category?.name ?? 'Service'} ·{' '}
                          {request.location?.name ?? 'Location not set'}
                          {request.attachmentCount > 0 && ` · ${request.attachmentCount} photo${request.attachmentCount === 1 ? '' : 's'}`}
                        </p>
                      </div>
                      <div className="shrink-0 text-left text-xs text-muted-foreground sm:text-right">
                        <p>Received {formatDate(request.createdAt)}</p>
                        {request.preferredDate && <p>Preferred {formatDate(request.preferredDate)}</p>}
                        {!request.preferredDate && request.preferredTimeSlot && (
                          <p>Preferred: {request.preferredTimeSlot.toLowerCase()}</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path)
  const payload = (await response.json()) as { success: boolean; data?: T }
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error('Request failed')
  }
  return payload.data
}
