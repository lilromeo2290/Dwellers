'use client'

/**
 * Dwellers — Customer request actions (Phase 5, PART 46/47).
 *
 * Cancellation only where the state machine allows it, always behind a
 * confirmation dialog, always validated server-side again. Drafts surface a
 * link back to the wizard. Nothing else is offered — no fake buttons.
 */
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { apiFetch, ApiError } from '@/lib/client/api'

const CANCELLABLE = new Set(['DRAFT', 'SUBMITTED', 'MATCHING', 'RESPONDED'])

export function CustomerRequestActions({
  requestId,
  providerId,
  status,
}: {
  requestId: string
  providerId: string
  status: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canCancel = CANCELLABLE.has(status)

  async function confirmCancel() {
    setPending(true)
    setError(null)
    try {
      await apiFetch(`/api/job-requests/${requestId}`, {
        method: 'PATCH',
        json: { action: 'cancel', cancellationReason: reason.trim() || null },
      })
      setOpen(false)
      router.refresh()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The request could not be cancelled. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-3" data-testid="customer-request-actions">
      {status === 'DRAFT' && providerId && (
        <Button asChild variant="outline" className="w-full">
          <Link href={`/request-service/${providerId}`}>Continue draft</Link>
        </Button>
      )}
      {canCancel && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setOpen(true)}
          data-testid="cancel-request"
        >
          Cancel request
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        Need to change something? Cancel this request and file a new one — providers only see requests
        that are live.
      </p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you sure you want to cancel this request?</DialogTitle>
            <DialogDescription>
              The provider will see the request as cancelled. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason">Reason (optional)</Label>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              maxLength={300}
              placeholder="e.g. Found another provider"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Keep request
            </Button>
            <Button variant="destructive" onClick={() => void confirmCancel()} disabled={pending} data-testid="confirm-cancel">
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Cancel request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
