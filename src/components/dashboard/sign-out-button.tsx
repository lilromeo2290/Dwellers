'use client'

/**
 * Dwellers — Sign-out control. Server components render this client island;
 * sign-out goes through NextAuth so the session cookie is properly cleared
 * and the logout audit event fires (server-side events.signOut).
 */
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const handle = async () => {
    setBusy(true)
    await signOut({ redirect: false })
    router.push('/')
    router.refresh()
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={handle}
        disabled={busy}
        aria-label="Sign out"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
      </button>
    )
  }

  return (
    <Button variant="outline" size="sm" onClick={handle} disabled={busy} data-testid="sign-out">
      <LogOut className="mr-1.5 h-4 w-4" aria-hidden="true" />
      {busy ? 'Signing out…' : 'Sign out'}
    </Button>
  )
}
