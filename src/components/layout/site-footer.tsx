/**
 * Dwellers — Site footer. Sticks to the viewport bottom via mt-auto in the
 * root layout (flex column) and respects mobile safe-area insets.
 */
import { BrandMark } from '@/components/layout/brand-mark'
import { BRAND } from '@/config/brand'

export function SiteFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="mt-auto border-t border-border/70 bg-secondary/40 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <BrandMark className="h-8 w-8" />
          <div>
            <p className="text-sm font-bold tracking-[0.18em] text-foreground">DWELLERS</p>
            <p className="text-xs text-muted-foreground">{BRAND.tagline}</p>
          </div>
        </div>

        <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
          Ghana&apos;s digital construction marketplace for artisans, contractors,
          companies, professionals, suppliers and equipment providers.
          Prices and transactions in Ghana Cedi (GH₵).
        </p>

        <div className="text-xs text-muted-foreground md:text-right">
          <p>© {year} {BRAND.name}. All rights reserved.</p>
          <p className="mt-1">Phase 1 — Project Foundation &amp; Architecture</p>
        </div>
      </div>
    </footer>
  )
}
