'use client'

/**
 * Dwellers — Provider-side quotation actions (Phase 6, PART 23).
 * EDIT DRAFT while DRAFT · SEND from the form flow · WITHDRAW while
 * DRAFT/SUBMITTED/VIEWED. An accepted/declined/expired quote is history —
 * no buttons pretend otherwise.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiFetch, ApiError } from '@/lib/client/api'

export function ProviderQuoteActions({
  quoteId,
  status,
  rolePrefix,
}: {
  quoteId: string
  status: string
  rolePrefix: string
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (status !== 'DRAFT' && status !== 'SUBMITTED' && status !== 'VIEWED') {
    return null
  }

  async function withdraw() {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      await apiFetch(`/api/quotes/${quoteId}/withdraw`, { method: 'POST' })
      router.refresh()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The quotation could not be withdrawn.')
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 print:hidden" data-testid="provider-quote-actions">
      <div className="flex flex-col gap-2 sm:flex-row">
        {status === 'DRAFT' && (
          <Button asChild variant="outline" data-testid="edit-draft">
            <Link href={`${rolePrefix}/quotes/${quoteId}/edit`}>Edit draft</Link>
          </Button>
        )}
        <Button variant="ghost" onClick={() => void withdraw()} disabled={pending} data-testid="withdraw-quote">
          {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
          Withdraw quote
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
