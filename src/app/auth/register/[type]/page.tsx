/**
 * Dwellers — Registration journey page (PARTS 4-9).
 *
 * /auth/register/[type] where type ∈ customer | artisan | contractor |
 * company | supplier | equipment. Unknown types render notFound() — there
 * is no path that can reach an administrative role.
 */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BrandMark } from '@/components/layout/brand-mark'
import { RegistrationWizard, type WizardType } from '@/components/auth/registration-wizard'
import { BRAND } from '@/config/brand'

const VALID_TYPES: WizardType[] = ['customer', 'artisan', 'contractor', 'company', 'supplier', 'equipment']

const COPY: Record<WizardType, { title: string; blurb: string }> = {
  customer: {
    title: 'Create your customer account',
    blurb: 'Find trusted artisans, contractors, companies and suppliers for your next build, renovation or repair.',
  },
  artisan: {
    title: 'Join as an artisan',
    blurb: 'Showcase your trade, choose the areas you serve and receive job requests from customers nearby.',
  },
  contractor: {
    title: 'Join as a contractor',
    blurb: 'Publish your construction services, define your service areas and win bigger engagements.',
  },
  company: {
    title: 'Register your construction company',
    blurb: 'Create a business account with an owner profile — ready for team members, projects and quotations.',
  },
  supplier: {
    title: 'Register as a material supplier',
    blurb: 'Open your shop on Dwellers — stock, orders and delivery arrive with the marketplace phase.',
  },
  equipment: {
    title: 'Register as an equipment provider',
    blurb: 'List your machinery for hire later — for now set up your profile, location and coverage.',
  },
}

export function generateStaticParams() {
  return VALID_TYPES.map((type) => ({ type }))
}

export async function generateMetadata({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params
  if (!VALID_TYPES.includes(type as WizardType)) return { title: 'Create your account' }
  return { title: COPY[type as WizardType].title }
}

export default async function RegisterTypePage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params
  if (!VALID_TYPES.includes(type as WizardType)) notFound()
  const copy = COPY[type as WizardType]

  return (
    <main className="dw-hero-surface flex min-h-[calc(100vh-4rem)] flex-1 flex-col items-center px-4 py-12 sm:px-6">
      <div className="w-full max-w-2xl">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Link href="/" className="rounded-lg focus-visible:outline-2 focus-visible:outline-ring" aria-label={`${BRAND.name} home`}>
            <BrandMark />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{copy.title}</h1>
          <p className="max-w-lg text-sm text-muted-foreground">{copy.blurb}</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-8">
          <RegistrationWizard type={type as WizardType} />
        </div>
      </div>
    </main>
  )
}
