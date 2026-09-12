/**
 * Dwellers — Registration entry (PART 3).
 *
 * The first question every visitor answers: "How will you use Dwellers?"
 * The chosen path determines the onboarding flow. Administrative roles are
 * NOT offered — they can never be created through public registration.
 */
import Link from 'next/link'
import { BrandMark } from '@/components/layout/brand-mark'
import { Card, CardContent } from '@/components/ui/card'
import { BRAND } from '@/config/brand'
import {
  ArrowRight,
  Building2,
  Hammer,
  HardHat,
  Package,
  Search,
  Tractor,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface EntryOption {
  href: string
  headline: string
  description: string
  icon: LucideIcon
}

const OPTIONS: EntryOption[] = [
  {
    href: '/auth/register/customer',
    headline: 'I need a service',
    description: 'For customers looking for artisans, contractors, construction companies and other services.',
    icon: Search,
  },
  {
    href: '/auth/register/artisan',
    headline: 'I provide services — as an artisan',
    description: 'For skilled trades professionals: plumbers, electricians, masons, carpenters, welders and more.',
    icon: Hammer,
  },
  {
    href: '/auth/register/contractor',
    headline: 'I provide services — as a contractor',
    description: 'For independent building and civil-works contractors managing larger engagements.',
    icon: HardHat,
  },
  {
    href: '/auth/register/supplier',
    headline: 'I sell building materials',
    description: 'For material suppliers and merchants — cement, steel, roofing, tiles and finishes.',
    icon: Package,
  },
  {
    href: '/auth/register/equipment',
    headline: 'I provide construction equipment',
    description: 'For equipment owners and rental providers — machinery and tooling for hire.',
    icon: Tractor,
  },
  {
    href: '/auth/register/company',
    headline: 'I represent a construction company',
    description: 'For registered construction companies and teams creating a business account.',
    icon: Building2,
  },
]

export const metadata = { title: 'Create your account' }

export default function RegisterEntryPage() {
  return (
    <main className="dw-hero-surface flex min-h-[calc(100vh-4rem)] flex-1 flex-col items-center px-4 py-12 sm:px-6">
      <div className="w-full max-w-3xl" data-testid="register-entry">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Link href="/" className="rounded-lg focus-visible:outline-2 focus-visible:outline-ring" aria-label={`${BRAND.name} home`}>
            <BrandMark />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            How will you use Dwellers?
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            Choose the option that fits you best — it decides the registration steps we&apos;ll ask
            for. You can always update your profile later.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {OPTIONS.map((option) => (
            <Link key={option.href} href={option.href} className="group focus-visible:outline-2 focus-visible:outline-ring">
              <Card className="h-full border-border/80 transition-colors group-hover:border-primary/50 group-hover:bg-secondary/40">
                <CardContent className="flex h-full items-start gap-3 p-4 sm:p-5">
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <option.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold leading-snug text-foreground sm:text-base">
                        {option.headline}
                      </span>
                      <ArrowRight
                        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                        aria-hidden="true"
                      />
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground sm:text-sm">
                      {option.description}
                    </span>
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/auth/sign-in" className="font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  )
}
