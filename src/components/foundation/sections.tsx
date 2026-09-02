/**
 * Dwellers — Foundation landing sections (server components, data-driven).
 * Presents the Phase 1 architecture honestly: what the platform WILL become
 * is described as designed modules, never faked with placeholder content.
 */
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  ClipboardList,
  FileCheck2,
  Fingerprint,
  Gauge,
  HardHat,
  KeyRound,
  Landmark,
  LockKeyhole,
  MapPinned,
  MessagesSquare,
  ScrollText,
  Search,
  ShieldCheck,
  Store,
  Truck,
  Upload,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ROLE_DEFINITIONS, ROLES } from '@/lib/auth/roles'
import { PROVIDER_CATEGORIES } from '@/config/brand'

const MODULES = [
  {
    icon: Fingerprint,
    name: 'Identity & Access',
    charter: 'Authentication, users, roles, permissions, sessions and password management — live in Phase 1 as the RBAC engine.',
  },
  {
    icon: Store,
    name: 'Marketplace',
    charter: 'Categories, services, products, equipment, providers and business profiles with per-role listing rules.',
  },
  {
    icon: Search,
    name: 'Discovery',
    charter: 'Search, filtering, nationwide location browsing and later personalised recommendations.',
  },
  {
    icon: ClipboardList,
    name: 'Projects',
    charter: 'Projects, tasks, milestones, budgets, documents and progress reporting for build work.',
  },
  {
    icon: MessagesSquare,
    name: 'Communication',
    charter: 'Conversations, messages with attachments and a multi-channel notification dispatcher.',
  },
  {
    icon: Banknote,
    name: 'Commerce',
    charter: 'Cart, orders, quotations, payments and an append-only transaction ledger in GH₵.',
  },
  {
    icon: BadgeCheck,
    name: 'Trust',
    charter: 'Verification badges, reviews, ratings and abuse reporting restricted to real engagements.',
  },
  {
    icon: Gauge,
    name: 'Administration',
    charter: 'Staff back office: user/provider management, moderation, settings and the audit-log browser.',
  },
] as const

const SECURITY_PILLARS = [
  {
    icon: ShieldCheck,
    title: 'Authorization at the API layer',
    detail: 'Every protected route verifies role permissions server-side through a single handler factory — hiding buttons in the UI is never the security gate.',
  },
  {
    icon: KeyRound,
    title: 'Session-based identity only',
    detail: 'Route handlers learn the caller exclusively from the signed server session; client-supplied user IDs and roles are never trusted (IDOR defence).',
  },
  {
    icon: LockKeyhole,
    title: 'Escalation-proof role management',
    detail: 'Staff can only manage roles strictly below their own trust level — an administrator can never create or edit a super administrator.',
  },
  {
    icon: ScrollText,
    title: 'Validated inputs, everywhere',
    detail: 'Bodies, queries and route parameters pass schema validation before business logic runs; failures return structured field-level errors.',
  },
  {
    icon: Gauge,
    title: 'Rate limiting & abuse control',
    detail: 'Every request is bucketed per client with platform-wide and per-route budgets; excess traffic receives a clean, retry-aware 429.',
  },
  {
    icon: Upload,
    title: 'Defensive file handling',
    detail: 'Uploads are bounded per category by type and size, renamed to generated keys and stored behind a path-traversal-proof provider interface.',
  },
  {
    icon: FileCheck2,
    title: 'Audit trail & structured logs',
    detail: 'Security-relevant events append to a queryable audit table while operations stream structured, secret-redacting logs with request IDs.',
  },
  {
    icon: Landmark,
    title: 'Secrets out of the codebase',
    detail: 'Credentials live only in environment configuration with a validated schema — the repository ships an example file, never real values.',
  },
] as const

const ROADMAP = [
  {
    phase: 'Phase 1',
    title: 'Foundation & Standards',
    detail: 'Architecture, module boundaries, API conventions, RBAC engine, security middleware, environment strategy, documentation.',
    state: 'current' as const,
  },
  {
    phase: 'Phase 2',
    title: 'Database Schema & Backend Foundation',
    detail: 'Full marketplace data model (geo hierarchy, providers, listings, projects, commerce, trust) plus authentication endpoints.',
    state: 'next' as const,
  },
  {
    phase: 'Phase 3',
    title: 'Marketplace & Discovery',
    detail: 'Provider onboarding, listings, search and location browsing — indicative sequencing, confirmed per product priorities.',
    state: 'planned' as const,
  },
  {
    phase: 'Phase 4+',
    title: 'Projects, Commerce & Trust',
    detail: 'Quotations, orders and payments, messaging with attachments, verification and reviews — indicative sequencing.',
    state: 'planned' as const,
  },
] as const

export function ValueChainSection() {
  const steps = ['Find', 'Compare', 'Connect', 'Quote', 'Buy', 'Build']
  return (
    <section aria-labelledby="value-chain-heading" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
      <h2 id="value-chain-heading" className="text-center text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        One journey from idea to keys
      </h2>
      <ol className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-3">
        {steps.map((step, index) => (
          <li key={step} className="flex items-center gap-2">
            <span className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-semibold text-foreground shadow-sm">
              {step}
            </span>
            {index < steps.length - 1 && <ArrowRight className="h-4 w-4 text-accent" aria-hidden="true" />}
          </li>
        ))}
      </ol>
    </section>
  )
}

export function CategoriesSection() {
  return (
    <section aria-labelledby="categories-heading" className="border-y border-border/70 bg-secondary/40">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent-foreground/80">Who you&apos;ll meet</p>
          <h2 id="categories-heading" className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Every professional the build needs, in one marketplace
          </h2>
          <p className="mt-3 text-muted-foreground">
            Dwellers onboards the full construction value chain — from the artisan fixing a
            single roof to the company raising an estate — with suppliers and equipment
            providers alongside them.
          </p>
        </div>
        <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PROVIDER_CATEGORIES.map((category) => (
            <li key={category.name}>
              <Card className="h-full border-border/80 shadow-none transition-colors hover:border-primary/40">
                <CardContent className="flex items-start gap-3 p-4">
                  <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <HardHat className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{category.name}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{category.description}</p>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export function ModulesSection() {
  return (
    <section id="modules" aria-labelledby="modules-heading" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6">
      <div className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent-foreground/80">System architecture</p>
        <h2 id="modules-heading" className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Eight domain modules, one coherent platform
        </h2>
        <p className="mt-3 text-muted-foreground">
          Each module owns its data, rules and API surface, so features ship without
          rewrites. Charters live beside the code in <code className="rounded bg-muted px-1.5 py-0.5 text-xs">src/modules/</code>.
        </p>
      </div>
      <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {MODULES.map((module) => (
          <li key={module.name}>
            <Card className="h-full border-border/80 shadow-none transition-colors hover:border-primary/40">
              <CardContent className="p-5">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <module.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-foreground">{module.name}</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{module.charter}</p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function RolesSection() {
  return (
    <section id="roles" aria-labelledby="roles-heading" className="border-y border-border/70 bg-secondary/40">
      <div className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent-foreground/80">Access model</p>
          <h2 id="roles-heading" className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Eight roles, enforced where it counts
          </h2>
          <p className="mt-3 text-muted-foreground">
            Role permissions are evaluated server-side on every request through the
            permission matrix — the interface simply reflects decisions already made.
          </p>
        </div>
        <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((role) => {
            const definition = ROLE_DEFINITIONS[role]
            return (
              <li key={role}>
                <Card className="h-full border-border/80 bg-card shadow-none">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">{definition.label}</p>
                      {definition.isStaff ? (
                        <Badge variant="outline" className="border-primary/40 bg-primary/10 text-[10px] text-primary">
                          Staff
                        </Badge>
                      ) : definition.isProvider ? (
                        <Badge variant="outline" className="border-accent/50 bg-accent/15 text-[10px] text-accent-foreground">
                          Provider
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">Customer</Badge>
                      )}
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{definition.description}</p>
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

export function SecuritySection() {
  return (
    <section id="security" aria-labelledby="security-heading" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6">
      <div className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent-foreground/80">Security foundation</p>
        <h2 id="security-heading" className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Built like infrastructure, from day one
        </h2>
        <p className="mt-3 text-muted-foreground">
          These guarantees are implemented in Phase 1 code — not aspirations. See{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">ARCHITECTURE.md</code> for how each one works.
        </p>
      </div>
      <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SECURITY_PILLARS.map((pillar) => (
          <li key={pillar.title}>
            <div className="h-full rounded-xl border border-border/80 bg-card p-5">
              <pillar.icon className="h-5 w-5 text-primary" aria-hidden="true" />
              <h3 className="mt-3 text-sm font-semibold text-foreground">{pillar.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{pillar.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function RoadmapSection() {
  return (
    <section id="roadmap" aria-labelledby="roadmap-heading" className="border-t border-border/70 bg-secondary/40">
      <div className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent-foreground/80">Delivery roadmap</p>
          <h2 id="roadmap-heading" className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Foundations first, features in layers
          </h2>
        </div>
        <ol className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {ROADMAP.map((stage) => (
            <li key={stage.phase}>
              <div
                className={`h-full rounded-xl border p-5 ${
                  stage.state === 'current'
                    ? 'border-primary/50 bg-card ring-1 ring-primary/20'
                    : stage.state === 'next'
                      ? 'border-accent/50 bg-card'
                      : 'border-border/80 bg-card/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{stage.phase}</p>
                  {stage.state === 'current' && (
                    <Badge className="bg-primary text-primary-foreground">In progress</Badge>
                  )}
                  {stage.state === 'next' && (
                    <Badge variant="outline" className="border-accent/60 bg-accent/15 text-accent-foreground">Next up</Badge>
                  )}
                </div>
                <h3 className="mt-3 text-sm font-semibold text-foreground">{stage.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{stage.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

export function GeographicCoverageStrip() {
  return (
    <section aria-label="Market coverage" className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
      <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-border/80 bg-card p-6 sm:flex-row">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MapPinned className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">All 16 regions of Ghana</span> —
            every feature is location-aware from Region down to Area.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15 text-accent-foreground">
            <Truck className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="text-sm text-muted-foreground">
            Prices and settlements in{' '}
            <span className="font-semibold text-foreground">Ghana Cedi (GH₵)</span>, stored
            as exact minor units.
          </p>
        </div>
      </div>
    </section>
  )
}
