'use client'

/**
 * Dwellers — Provider profile actions (PART 23/24).
 *
 * REQUEST SERVICE and MESSAGE PROVIDER are the entry points to the Phase 5
 * job-request and messaging flows. Phase 4 does NOT fake submissions:
 *  - signed out → the user is sent to sign-in/register with the intended
 *    action preserved in the callback URL (next phase completes the loop);
 *  - signed in → an honest notice explains that job requests and messaging
 *    arrive with Phase 5, and the click is recorded (analytics only).
 */
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { MessageSquare, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'

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
  const { toast } = useToast()
  const [pending, setPending] = useState<'request' | 'message' | null>(null)

  // Preserve the intended action across the auth round-trip (PART 22).
  const currentPath = typeof window === 'undefined' ? '' : window.location.pathname
  const withIntent = (intent: string) =>
    `/auth/sign-in?callbackUrl=${encodeURIComponent(`${currentPath}?intent=${intent}`)}`

  const signedIn = status === 'authenticated' && Boolean(session?.user?.id)

  const onRequestService = () => {
    trackEvent('request_service_clicked', providerId)
    if (!signedIn) {
      router.push(withIntent('request-service'))
      return
    }
    setPending('request')
    toast({
      title: 'Job requests arrive with Phase 5',
      description:
        'Your click was recorded. Requesting service from ' +
        providerName +
        ' will create a real job request in the next release — nothing was submitted yet.',
    })
    setPending(null)
  }

  const onMessage = () => {
    trackEvent('provider_contact_clicked', providerId)
    if (!signedIn) {
      router.push(withIntent('message'))
      return
    }
    setPending('message')
    toast({
      title: 'Messaging arrives with Phase 5',
      description: `Conversations with ${providerName} open in the next release — no message was sent.`,
    })
    setPending(null)
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
        <Button size="lg" className="h-11" onClick={onRequestService} disabled={pending !== null} data-testid="request-service">
          Request service
        </Button>
        <Button size="lg" variant="outline" className="h-11" onClick={onMessage} disabled={pending !== null} data-testid="message-provider">
          <MessageSquare className="mr-2 h-4 w-4" aria-hidden="true" />
          Message provider
        </Button>
      </div>
      {!signedIn && (
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
