'use client'

/**
 * Dwellers — Provider profile actions (Phase 5, PART 2).
 *
 * REQUEST SERVICE is now the REAL entry into the job-request wizard:
 *  - signed out → sign-in/register with the intended action preserved in the
 *    callback URL; on return, the intent auto-continues into the wizard;
 *  - signed in → straight to /request-service/[providerId].
 *
 * MESSAGE PROVIDER remains an honest placeholder: full conversations arrive
 * with the messaging phase — nothing is faked (PART 36 scope).
 */
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { MessageSquare, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'

function trackEvent(type: 'provider_contact_clicked' | 'request_service_clicked', providerId: string) {
  try {
    void fetch('/api/discovery/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, providerId }),
      keepalive: true,
    })
  } catch {
    // Best-effort analytics.
  }
}

export function ProfileActions({ providerId, providerName }: { providerId: string; providerName: string }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [pending, setPending] = useState<'message' | null>(null)
  const intentHandled = useRef(false)

  // Preserve the intended action across the auth round-trip (PART 2).
  // The path is read at CLICK time, not render time, so a click that lands
  // during a client-side page transition still records the right destination.
  const withIntent = (intent: string) => {
    const path = typeof window === 'undefined' ? '' : window.location.pathname
    return `/auth/sign-in?callbackUrl=${encodeURIComponent(`${path}?intent=${intent}`)}`
  }

  // Returned from sign-in with ?intent=request-service → continue into the
  // wizard exactly where the customer left off.
  useEffect(() => {
    if (status !== 'authenticated' || intentHandled.current) return
    const intent = new URLSearchParams(window.location.search).get('intent')
    if (intent === 'request-service') {
      intentHandled.current = true
      router.replace(`/request-service/${providerId}`)
    }
  }, [status, providerId, router])

  const signedIn = status === 'authenticated' && Boolean(session?.user?.id)
  const showAnonymousNotice = status === 'unauthenticated'

  const onRequestService = () => {
    trackEvent('request_service_clicked', providerId)
    if (!signedIn) {
      router.push(withIntent('request-service'))
      return
    }
    router.push(`/request-service/${providerId}`)
  }

  const onMessage = () => {
    trackEvent('provider_contact_clicked', providerId)
    if (!signedIn) {
      router.push(withIntent('message'))
      return
    }
    setPending('message')
    // Honest placeholder — no message is sent, no fake conversation (PART 36).
    window.setTimeout(() => setPending(null), 1500)
  }

  if (status === 'loading') {
    return (
      <div className="grid gap-2 sm:grid-cols-2" aria-hidden="true">
        <div className="h-11 animate-pulse rounded-lg bg-muted" />
        <div className="h-11 animate-pulse rounded-lg bg-muted" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2" data-testid="profile-actions">
        <Button size="lg" className="h-11" onClick={onRequestService} data-testid="request-service">
          Request service
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-11"
          onClick={onMessage}
          disabled={pending !== null}
          data-testid="message-provider"
        >
          <MessageSquare className="mr-2 h-4 w-4" aria-hidden="true" />
          Message provider
        </Button>
      </div>
      {showAnonymousNotice && (
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          You&apos;ll be asked to{' '}
          <Link href={withIntent('request-service')} className="font-medium text-primary underline-offset-2 hover:underline">
            sign in
          </Link>{' '}
          or{' '}
          <Link href="/auth/register" className="font-medium text-primary underline-offset-2 hover:underline">
            create a free account
          </Link>{' '}
          first — your intent is preserved.
        </p>
      )}
    </div>
  )
}
