/**
 * Dwellers — Dashboard widgets (server-safe presentational components).
 *
 *  - WelcomeHeader: role-appropriate greeting (PARTS 18-24)
 *  - CompletionWidget: profile completion with the missing checklist (PART 35)
 *  - VerificationBanner: "not yet verified" state — administrative workflow
 *    only, users can never self-verify (PART 28)
 *  - ComingSoon: honest placeholder for later-phase features (PART 18/51)
 *  - StatCard: small overview metric
 */
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { CheckCircle2, CircleDashed, Clock3, ShieldHalf } from 'lucide-react'
import type { ProfileCompletion } from '@/modules/identity/auth-service'

export function WelcomeHeader({
  name,
  title,
  description,
}: {
  name: string | null
  title: string
  description: string
}) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl" data-testid="welcome-heading">
        Welcome, {name ?? 'there'}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground sm:text-base">{title}</p>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

export function CompletionWidget({
  completion,
  profileHref,
}: {
  completion: ProfileCompletion
  profileHref: string
}) {
  return (
    <Card data-testid="completion-widget">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          Profile completion
          <span className="text-lg font-bold text-primary" data-testid="completion-percent">
            {completion.percent}%
          </span>
        </CardTitle>
        <Progress value={completion.percent} className="mt-1 h-2" aria-label={`Profile ${completion.percent}% complete`} />
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {completion.missing.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
            Your profile is complete. Nice work!
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Missing:</p>
            <ul className="space-y-1.5">
              {completion.missing.map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-foreground">
                  <CircleDashed className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <Button asChild size="sm" variant="outline" className="mt-2">
              <Link href={profileHref}>Complete your profile</Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function VerificationBanner({
  status,
  kind,
}: {
  status: string
  kind: 'provider' | 'business'
}) {
  if (status === 'VERIFIED') {
    return (
      <div
        className="mb-6 flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4"
        data-testid="verification-banner"
        role="status"
      >
        <ShieldHalf className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-foreground">Verified {kind}</p>
          <p className="text-sm text-muted-foreground">
            The Dwellers trust team has reviewed this {kind}. Customers see a verified badge.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="mb-6 flex items-start gap-3 rounded-xl border border-accent/50 bg-accent/10 p-4"
      data-testid="verification-banner"
      role="status"
    >
      <ShieldHalf className="mt-0.5 h-5 w-5 shrink-0 text-accent-foreground" aria-hidden="true" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-foreground">
          {status === 'PENDING' ? 'Verification in review' : `Your ${kind} profile is not yet verified.`}
        </p>
        <p className="text-sm text-muted-foreground">
          Verification is handled by the Dwellers trust team — there is nothing to click here. Keep your profile
          complete and accurate; verified {kind}s win customers faster.
        </p>
      </div>
      <Badge variant="outline" className="hidden border-accent/60 text-accent-foreground sm:inline-flex">
        {status}
      </Badge>
    </div>
  )
}

export function ComingSoon({
  title,
  phase,
  description,
  /** When set, the feature is LIVE and the card links to it. */
  href,
}: {
  title: string
  phase?: string
  description?: string
  href?: string
}) {
  return (
    <Card className={href ? 'border-primary/40' : 'border-dashed'} data-testid={href ? 'feature-live' : 'coming-soon'}>
      <CardContent className="flex items-start gap-3 p-4 sm:p-5">
        <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-sm text-muted-foreground">
            {description ?? 'This feature is on the Dwellers roadmap.'}{' '}
            {href ? (
              <Link href={href} className="font-medium text-primary underline-offset-2 hover:underline">
                Open now.
              </Link>
            ) : phase ? (
              <span className="font-medium text-foreground">Arrives in {phase}.</span>
            ) : null}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

export function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <p className="text-2xl font-bold tracking-tight text-foreground" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`}>
          {value}
        </p>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  )
}
