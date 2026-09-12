'use client'

/**
 * Dwellers — Mobile dashboard navigation (PART 37).
 *
 * Sheet-based sidebar for small screens; the desktop sidebar is rendered by
 * the server shell. Keyboard accessible, focus-trapped by the Sheet part.
 */
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import type { DashboardNavGroup } from '@/config/dashboard-nav'
import { BrandMark } from '@/components/layout/brand-mark'
import { Menu } from 'lucide-react'

export function MobileDashboardNav({ groups }: { groups: DashboardNavGroup[] }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Open dashboard menu" className="lg:hidden">
          <Menu className="h-5 w-5" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 overflow-y-auto p-0">
        <SheetHeader className="border-b border-border p-4 text-left">
          <SheetTitle>
            <BrandMark />
          </SheetTitle>
        </SheetHeader>
        <nav aria-label="Dashboard" className="p-3">
          {groups.map((group) => (
            <div key={group.heading} className="mb-4">
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.heading}
              </p>
              {group.items.map((item) =>
                item.comingSoon ? (
                  <span
                    key={item.href}
                    aria-disabled="true"
                    className="block cursor-not-allowed rounded-lg px-3 py-2 text-sm text-muted-foreground/60"
                  >
                    {item.label}
                  </span>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={pathname === item.href ? 'page' : undefined}
                    className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      pathname === item.href
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground hover:bg-secondary'
                    }`}
                  >
                    {item.label}
                  </Link>
                ),
              )}
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
