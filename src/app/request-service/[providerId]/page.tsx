/**
 * Dwellers — Request Service (Phase 5, PART 1/2).
 *
 * The REAL job-request form. A customer arrives here from a provider profile
 * ("Request service"), describes the job, picks the JOB location (which may
 * differ from their own — PART 8), attaches photos, reviews and submits.
 *
 * Server-side guard: unauthenticated visitors are redirected to sign-in with
 * this exact page as the callback target — the provider context and the
 * customer's intent survive the auth round-trip (PART 2).
 */
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { getAuthContext } from '@/lib/auth/session'
import { getPublicProviderProfile } from '@/modules/discovery/provider-discovery'
import { RequestWizard } from '@/components/requests/request-wizard'

interface RequestServicePageProps {
  params: Promise<{ providerId: string }>
  searchParams: Promise<{ service?: string }>
}

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Request service',
  robots: { index: false },
}

export default async function RequestServicePage({ params, searchParams }: RequestServicePageProps) {
  const { providerId } = await params
  const { service } = await searchParams

  const auth = await getAuthContext()
  if (!auth) {
    // PART 2 — never lose the customer's intent across the auth round-trip.
    redirect(`/auth/sign-in?callbackUrl=${encodeURIComponent(`/request-service/${providerId}`)}`)
  }

  // Suspended/deleted providers 404 exactly like the public profile (PART 20).
  const provider = await getPublicProviderProfile(providerId).catch(() => notFound())

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12" data-testid="request-service-page">
      <Link
        href={`/providers/${providerId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to provider
      </Link>

      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Service request</p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight sm:text-3xl">Request service</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tell <span className="font-medium text-foreground">{provider.displayName}</span> what you need —
          it takes about two minutes and no phone call.
        </p>
      </header>

      <RequestWizard
        provider={{
          id: provider.id,
          displayName: provider.displayName,
          verificationStatus: provider.verificationStatus,
          serviceAreas: provider.serviceAreas.map((area) => area.id),
          services: provider.services,
        }}
        preselectedServiceId={service ?? null}
      />

      <p className="mt-6 flex items-start gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Your request is private. Only you and {provider.displayName} can see it — it never appears in
        public search results.
      </p>
    </main>
  )
}
