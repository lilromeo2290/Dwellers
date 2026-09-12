/**
 * Dwellers — Site footer.
 *
 * Sticks to the viewport bottom via mt-auto in the root layout and respects
 * mobile safe-area insets. Discovery links (PART 25/48) are database-driven
 * internal links: categories come from the live taxonomy, locations from the
 * seeded Ghana hierarchy — nothing is hard-coded.
 */
import Link from 'next/link'
import { db } from '@/lib/db'
import { BrandMark } from '@/components/layout/brand-mark'
import { BRAND } from '@/config/brand'

export async function SiteFooter() {
  const year = new Date().getFullYear()

  const [categories, towns] = await Promise.all([
    db.category.findMany({
      where: { isActive: true, level: 2, deletedAt: null },
      select: { name: true, slug: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      take: 6,
    }),
    db.town.findMany({
      where: { isActive: true, isMajor: true },
      select: { id: true, name: true, slug: true },
      orderBy: { name: 'asc' },
      take: 6,
    }),
  ])

  return (
    <footer className="mt-auto border-t border-border/70 bg-secondary/40 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        {(categories.length > 0 || towns.length > 0) && (
          <div className="grid gap-6 border-b border-border/60 pb-6 sm:grid-cols-2">
            {categories.length > 0 && (
              <nav aria-label="Popular categories">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Find by category</h2>
                <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  {categories.map((category) => (
                    <li key={category.slug}>
                      <Link href={`/find/${category.slug}`} className="text-muted-foreground transition-colors hover:text-foreground hover:underline">
                        {category.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
            {towns.length > 0 && (
              <nav aria-label="Popular locations">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Popular locations</h2>
                <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  {towns.map((town) => (
                    <li key={town.id}>
                      <Link href={`/find?town=${town.id}`} className="text-muted-foreground transition-colors hover:text-foreground hover:underline">
                        Providers in {town.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
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
            <p className="mt-1">Phase 4 — Find · Nationwide Discovery</p>
          </div>
        </div>
      </div>
    </footer>
  )
}
