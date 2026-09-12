/**
 * Dwellers — Forgot password foundation (PART 29/42).
 *
 * Honest state: password reset requires an out-of-band delivery channel
 * (email/SMS), which lands with account recovery in a later phase. This page
 * does NOT pretend to send anything — no fake forms.
 */
import Link from 'next/link'
import { BrandMark } from '@/components/layout/brand-mark'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, ShieldQuestion } from 'lucide-react'
import { BRAND } from '@/config/brand'

export const metadata = { title: 'Forgot password' }

export default function ForgotPasswordPage() {
  return (
    <main className="dw-hero-surface flex min-h-[calc(100vh-4rem)] flex-1 items-center justify-center px-4 py-12 sm:px-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Link href="/" className="rounded-lg focus-visible:outline-2 focus-visible:outline-ring" aria-label={`${BRAND.name} home`}>
            <BrandMark />
          </Link>
        </div>
        <Card data-testid="forgot-password-card">
          <CardHeader className="items-center text-center">
            <ShieldQuestion className="mb-2 h-10 w-10 text-primary" aria-hidden="true" />
            <CardTitle>Password reset is coming</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center text-sm text-muted-foreground">
            <p>
              Self-service password reset needs a secure delivery channel (email or SMS) so reset
              links never fall into the wrong hands. That channel arrives with account recovery in a
              later phase of the {BRAND.name} roadmap.
            </p>
            <p>
              Until then, if you cannot access your account, contact Dwellers support, who will
              verify your identity before any account action.
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link href="/auth/sign-in">
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                Back to sign in
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
