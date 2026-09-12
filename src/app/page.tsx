/**
 * Dwellers — Landing (Phase 4: discovery-first).
 *
 * The hero IS the product: WHAT do you need? + WHERE? + FIND. Quick links
 * below the panel are database-driven categories (no hard-coded services).
 * The platform sections remain below for visitors who want the full story.
 */
import Link from 'next/link'
import { ArrowRight, Building2, ShieldCheck } from 'lucide-react'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { SearchPanel } from '@/components/discovery/search-panel'
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
import { db } from '@/lib/db'

const STATS = [
  { value: '16', label: 'Regions of Ghana covered' },
  { value: '8', label: 'Platform roles' },
  { value: '100%', label: 'Database-driven search' },
  { value: 'GH₵', label: 'Native currency' },
] as const

async function quickCategories() {
  return db.category.findMany({
    where: { isActive: true, level: 2, deletedAt: null },
    select: { name: true, slug: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    take: 8,
  })
}

export default async function Home() {
  const categories = await quickCategories()

  return (
    <>
      <SiteHeader />

      <main className="flex-1">
        {/* Hero — the discovery experience (PART 1) */}
        <section className="dw-hero-surface border-b border-border/70">
          <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-20">
            <div className="max-w-3xl">
              <Badge variant="outline" className="border-primary/40 bg-primary/5 text-primary">
                <Building2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Find · Nationwide discovery across Ghana
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
                Tell us what you need and where you need it. Dwellers finds
                trusted plumbers, electricians, masons, contractors and more
                who genuinely serve your area — anywhere in Ghana.
              </p>
            </div>

            <div className="mt-8 max-w-4xl">
              <SearchPanel idPrefix="home" />
              {categories.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2" data-testid="quick-categories">
                  <span className="text-xs font-medium text-muted-foreground">Popular:</span>
                  {categories.map((category) => (
                    <Link
                      key={category.slug}
                      href={`/find/${category.slug}`}
                      className="inline-flex h-8 items-center rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {category.name}
                    </Link>
                  ))}
                  <Link
                    href="/find"
                    className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-xs font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    Browse all
                    <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </Link>
                </div>
              )}
            </div>

            {/* Trust + stat strip */}
            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                Verified professionals
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
                Real service areas — not guesses
              </span>
            </div>

            <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
