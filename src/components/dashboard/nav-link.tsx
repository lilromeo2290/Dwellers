'use client'

/**
 * Dwellers — Active dashboard link (client island; highlights the current
 * route with aria-current so state is never faked by colour alone — PART 38).
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function DashboardNavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname()
  const active = pathname === href

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      data-testid={`nav-${href.replace(/\//g, '-')}`}
      className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
        active ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-secondary'
      }`}
    >
      {label}
    </Link>
  )
}
