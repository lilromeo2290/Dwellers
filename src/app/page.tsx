/**
 * Dwellers — Foundation landing (Phase 1).
 *
 * Server component: zero client JS beyond framework runtime. Presents the
 * brand, the product thesis and the technical foundation honestly — the
 * architecture is real and inspectable, marketplace features arrive in
 * later phases.
 */
import { ArrowRight, BookOpenCheck, Building2, Hammer, ShieldCheck } from 'lucide-react'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import {
  CategoriesSection,
  GeographicCoverageStrip,
  ModulesSection,
  RoadmapSection,
  RolesSection,
  SecuritySection,
  ValueChainSection,
} from '@/components/foundation/sections'
import { Badge } from '@/components/ui/badge'
import { BRAND } from '@/config/brand'

const STATS = [
  { value: '11', label: 'Provider categories' },
  { value: '8', label: 'Platform roles' },
  { value: '16', label: 'Regions of Ghana' },
  { value: 'GH₵', label: 'Native currency' },
] as const

export default function Home() {
  return (
    <>
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="dw-hero-surface border-b border-border/70">
          <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pb-20 sm:pt-24">
            <div className="max-w-3xl">
              <Badge variant="outline" className="border-primary/40 bg-primary/5 text-primary">
                <Building2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Phase 1 — Project Foundation &amp; Architecture
              </Badge>

              <h1 className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight text-foreground sm:text-6xl">
                {BRAND.tagline.split(' ').map((word, index) => (
                  <span key={word}>
                    {index === 2 ? <span className="text-accent">{word}</span> : word}
                    {index < 2 ? <span className="text-muted-foreground/50"> / </span> : null}
                  </span>
                ))}
              </h1>

              <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                {BRAND.description.split('—')[0]} — connecting every build need with the
                trusted professionals and suppliers who can deliver it, anywhere in Ghana.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <a
                  href="#modules"
                  className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  Explore the architecture
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>
                <a
                  href="#security"
                  className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-5 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                  How we protect the platform
                </a>
                <a
                  href="/api"
                  className="inline-flex h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <BookOpenCheck className="h-4 w-4" aria-hidden="true" />
                  API conventions
                </a>
              </div>
            </div>

            {/* Stat strip */}
            <dl className="mt-14 grid grid-cols-2 gap-3 sm:mt-16 sm:grid-cols-4">
              {STATS.map((stat) => (
                <div key={stat.label} className="flex flex-col rounded-xl border border-border/80 bg-card/80 p-4 backdrop-blur-sm">
                  <dt className="order-2 mt-1 text-xs font-medium text-muted-foreground">{stat.label}</dt>
                  <dd className="order-1 text-2xl font-bold tracking-tight text-foreground">{stat.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <ValueChainSection />
        <CategoriesSection />
        <ModulesSection />
        <RolesSection />
        <SecuritySection />
        <GeographicCoverageStrip />
        <RoadmapSection />
      </main>

      <SiteFooter />
    </>
  )
}

export const dynamic = 'force-static'
