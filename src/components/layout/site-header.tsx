/**
 * Dwellers — Site header (foundation landing).
 * Mobile-first: collapsed anchor nav on small screens via horizontal scroll.
 */
import Link from 'next/link'
import { BrandMark } from '@/components/layout/brand-mark'
import { BRAND } from '@/config/brand'
import { NAVIGATION_ITEMS } from '@/config/navigation'
import { Badge } from '@/components/ui/badge'

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-ring" aria-label={`${BRAND.name} — home`}>
          <BrandMark />
          <span className="flex flex-col leading-none">
            <span className="text-base font-bold tracking-[0.18em] text-foreground">DWELLERS</span>
            <span className="mt-0.5 text-[11px] font-medium tracking-wide text-muted-foreground">
              {BRAND.tagline}
            </span>
          </span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {NAVIGATION_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="hidden border-accent/60 bg-accent/15 text-accent-foreground sm:inline-flex">
            Phase 1 · Foundation
          </Badge>
          <a
            href="/api"
            className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring"
          >
            API Status
          </a>
        </div>
      </div>

      {/* Mobile anchor nav */}
      <nav aria-label="Section" className="border-t border-border/60 md:hidden">
        <div className="flex gap-1 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAVIGATION_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </div>
      </nav>
    </header>
  )
}
