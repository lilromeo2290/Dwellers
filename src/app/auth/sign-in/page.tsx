'use client'

/**
 * Dwellers — Sign in (PART 29).
 *
 * Premium, simple, branded. Identifier accepts email OR Ghana phone; errors
 * arrive as server-decided codes (invalid credentials vs suspended vs
 * deactivated) and are mapped to friendly copy. Role routing is NEVER done
 * here: after sign-in the client lands on /dashboard and the SERVER decides
 * the destination from the authenticated identity (PART 31).
 */
import { useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { BrandMark } from '@/components/layout/brand-mark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, LockKeyhole, Mail, TriangleAlert } from 'lucide-react'
import { BRAND } from '@/config/brand'

const ERROR_COPY: Record<string, string> = {
  CredentialsSignin: 'Email/phone or password is incorrect.',
  INVALID_CREDENTIALS: 'Email/phone or password is incorrect.',
  ACCOUNT_SUSPENDED: 'This account has been suspended. Contact Dwellers support.',
  ACCOUNT_DEACTIVATED: 'This account is deactivated. Sign in is unavailable.',
  RATE_LIMITED: 'Too many sign-in attempts. Please wait a moment and try again.',
}

function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') ?? '/dashboard'
  const oauthError = searchParams.get('error')

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(
    oauthError ? ERROR_COPY[oauthError] ?? 'Sign in failed. Please try again.' : null,
  )

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const result = await signIn('credentials', {
        identifier: identifier.trim(),
        password,
        redirect: false,
      })
      if (!result || result.error) {
        setError(ERROR_COPY[result?.error ?? ''] ?? 'Email/phone or password is incorrect.')
        setSubmitting(false)
        return
      }
      // The server owns role routing: /dashboard redirects by role.
      router.push(callbackUrl.startsWith('/') ? callbackUrl : '/dashboard')
      router.refresh()
    } catch {
      setError('Network problem. Check your connection and try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="w-full max-w-md" data-testid="sign-in-card">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <Link href="/" className="flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-ring" aria-label={`${BRAND.name} home`}>
          <BrandMark />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Welcome back</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to your {BRAND.name} account — {BRAND.tagline}
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        {error ? (
          <Alert variant="destructive" className="mb-5" role="alert" data-testid="sign-in-error">
            <TriangleAlert className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-5" noValidate={false}>
          <div className="space-y-1.5">
            <Label htmlFor="identifier">Email or phone</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                id="identifier"
                name="identifier"
                type="text"
                autoComplete="username"
                required
                placeholder="you@example.com or 024 000 0000"
                className="pl-9"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                aria-describedby="identifier-hint"
              />
            </div>
            <p id="identifier-hint" className="text-xs text-muted-foreground">
              Use your email address or your Ghana phone number (e.g. 0241234567).
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                href="/auth/forgot-password"
                className="text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                placeholder="Your password"
                className="pl-9"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                aria-pressed={showPassword}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={submitting} data-testid="sign-in-submit">
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </Button>
        </form>

        <div className="mt-6 border-t border-border pt-5 text-center text-sm text-muted-foreground">
          New to {BRAND.name}?{' '}
          <Link
            href="/auth/register"
            className="font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            data-testid="register-link"
          >
            Create an account
          </Link>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Protected by server-side session security, rate limiting and audit logging.
      </p>
    </div>
  )
}

export default function SignInPage() {
  return (
    <main className="dw-hero-surface flex min-h-[calc(100vh-4rem)] flex-1 items-center justify-center px-4 py-12 sm:px-6">
      <Suspense fallback={null}>
        <SignInForm />
      </Suspense>
    </main>
  )
}
