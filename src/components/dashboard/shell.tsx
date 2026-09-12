/**
 * Dwellers — Dashboard shell (server component).
 *
 * Responsive two-pane layout: persistent sidebar ≥lg, sheet nav <lg, sticky
 * header with account identity and sign-out. Footer sits at the bottom via
 * the page-level flex column (sticky-footer rule).
 */
import Link from 'next/link'
import { BrandMark } from '@/components/layout/brand-mark'
import { MobileDashboardNav } from '@/components/dashboard/mobile-nav'
import { SignOutButton } from '@/components/dashboard/sign-out-button'
import { DashboardNavLink } from '@/components/dashboard/nav-link'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DASHBOARD_NAV } from '@/config/dashboard-nav'
import { ROLE_DEFINITIONS, type Role } from '@/lib/auth/roles'
import type { DashboardPageContext } from '@/lib/auth/page-guards'

interface DashboardShellProps {
  context: DashboardPageContext
  children: React.ReactNode
}

export function DashboardShell({ context, children }: DashboardShellProps) {
  const { account } = context
  const groups = DASHBOARD_NAV[account.role as Role]
  const roleLabel = ROLE_DEFINITIONS[account.role as Role].label
  const initials = (account.name ?? account.email)
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <MobileDashboardNav groups={groups} />
            <Link href="/" className="hidden items-center gap-2 rounded-lg sm:flex focus-visible:outline-2 focus-visible:outline-ring" aria-label="Dwellers home">
              <BrandMark />
            </Link>
            <Badge variant="outline" className="hidden border-primary/30 bg-primary/5 text-primary md:inline-flex">
              {roleLabel}
            </Badge>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden text-right sm:block">
              <span className="block text-sm font-semibold leading-tight text-foreground" data-testid="header-name">
                {account.name ?? account.email}
              </span>
              <span className="block text-xs text-muted-foreground">{roleLabel} dashboard</span>
            </span>
            <Avatar className="h-9 w-9 border border-border">
              <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials}</AvatarFallback>
            </Avatar>
            <SignOutButton compact />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6 sm:px-6">
        {/* Sidebar (desktop) */}
        <aside className="hidden w-60 shrink-0 lg:block" aria-label="Dashboard sections">
          <nav className="sticky top-24 space-y-5">
            {groups.map((group) => (
              <div key={group.heading}>
                <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.heading}
                </p>
                <ul className="space-y-0.5">
                  {group.items.map((item) =>
                    item.comingSoon ? (
                      <li key={item.label}>
                        <span
                          aria-disabled="true"
                          title={item.phase ? `Arrives in ${item.phase}` : 'Coming in a later phase'}
                          className="flex cursor-not-allowed items-center justify-between rounded-lg px-3 py-2 text-sm text-muted-foreground/60"
                        >
                          {item.label}
                          <span className="text-[10px] uppercase tracking-wide">soon</span>
                        </span>
                      </li>
                    ) : (
                      <li key={item.label}>
                        <DashboardNavLink href={item.href} label={item.label} />
                      </li>
                    ),
                  )}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <footer className="mt-auto border-t border-border/70 py-4">
        <p className="text-center text-xs text-muted-foreground">
          {ROLE_DEFINITIONS[account.role as Role].label} dashboard · Dwellers — Find. Buy. Build.
        </p>
      </footer>
    </div>
  )
}

