'use client'

/**
 * Dwellers — Registration wizard (PARTS 4-9).
 *
 * One parameterised wizard drives all six registration journeys. The
 * submission "path" is fixed per journey — the client can never nominate a
 * role. On success the account is created server-side and the user is
 * signed in immediately, then routed to /dashboard where the SERVER chooses
 * the role dashboard (PART 31).
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { LocationCascade, type LocationValue } from '@/components/auth/location-cascade'
import { ServiceAreasPicker } from '@/components/auth/service-areas-picker'
import { apiFetch, ApiError } from '@/lib/client/api'
import { Loader2, TriangleAlert } from 'lucide-react'

export type WizardType = 'customer' | 'artisan' | 'contractor' | 'company' | 'supplier' | 'equipment'

const STEP_LABELS: Record<WizardType, string[]> = {
  customer: ['Your account', 'Your location'],
  artisan: ['Your account', 'Your profession', 'Location & service areas'],
  contractor: ['Your account', 'Your profession', 'Location & service areas'],
  company: ['Owner account', 'Company details', 'Location & service areas'],
  supplier: ['Owner account', 'Business details', 'Location & service areas'],
  equipment: ['Owner account', 'Business details', 'Location & service areas'],
}

interface CategoryNode {
  id: string
  name: string
  slug: string
  level: number
  children?: { id: string; name: string; slug: string; level: number }[]
}

interface CategoryTreePayload {
  items: (CategoryNode & { children?: CategoryNode['children'] })[]
}

const PROFESSION_ROOT_SLUGS = ['construction-services', 'professional-services']

export function RegistrationWizard({ type }: { type: WizardType }) {
  const router = useRouter()
  const steps = STEP_LABELS[type]
  const isProvider = type === 'artisan' || type === 'contractor'
  const isBusiness = type === 'company' || type === 'supplier' || type === 'equipment'
  const businessRequired = type === 'company' || type === 'supplier'
  const businessLabel = type === 'company' ? 'Company name' : 'Business name'

  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  const [account, setAccount] = useState({ name: '', email: '', phone: '', password: '', confirmPassword: '' })
  const [professional, setProfessional] = useState({ profession: '', yearsExperience: '0', headline: '', biography: '' })
  const [business, setBusiness] = useState({ name: '', description: '', phone: '', email: '', offersDelivery: false })
  const [location, setLocation] = useState<LocationValue>({ regionId: null, districtId: null, townId: null })
  const [areas, setAreas] = useState<string[]>([])
  const [areaLabels, setAreaLabels] = useState<Record<string, string>>({})
  const [professions, setProfessions] = useState<{ slug: string; name: string }[]>([])

  // Trades come from the live category tree — never hard-coded (PART 5).
  useEffect(() => {
    if (!isProvider) return
    let cancelled = false
    apiFetch<CategoryTreePayload>('/api/categories?tree=true')
      .then((payload) => {
        if (cancelled) return
        const roots = payload.items.filter((root) => PROFESSION_ROOT_SLUGS.includes(root.slug))
        const trades = roots.flatMap((root) => (root.children ?? []).map((child) => ({ slug: child.slug, name: child.name })))
        setProfessions(trades)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [isProvider])

  const passwordMismatch = account.confirmPassword.length > 0 && account.password !== account.confirmPassword

  const stepValid = useMemo(() => {
    if (step === 1) {
      return (
        account.name.trim().length > 0 &&
        account.email.includes('@') &&
        account.phone.trim().length >= 9 &&
        account.password.length >= 8 &&
        account.password === account.confirmPassword
      )
    }
    if (step === 2) {
      if (isProvider) return professional.profession !== ''
      if (isBusiness) return !businessRequired || business.name.trim().length > 0
      return true
    }
    return location.townId !== null && (type === 'customer' || areas.length > 0)
  }, [step, account, professional, business, location, areas, isProvider, isBusiness, businessRequired, type])

  const goToStep = (next: number) => {
    setFormError(null)
    setFieldErrors({})
    setStep(next)
  }

  const addArea = (townId: string, townName: string) => {
    setAreas((current) => (current.includes(townId) ? current : [...current, townId]))
    setAreaLabels((current) => ({ ...current, [townId]: townName }))
  }

  const removeArea = (townId: string) => {
    setAreas((current) => current.filter((id) => id !== townId))
  }

  const buildPayload = () => {
    const base = {
      name: account.name.trim(),
      email: account.email.trim().toLowerCase(),
      phone: account.phone.replace(/[\s-]/g, ''),
      password: account.password,
      locationId: location.townId!,
    }
    switch (type) {
      case 'customer':
        return { path: 'customer', ...base }
      case 'artisan':
      case 'contractor':
        return {
          path: type,
          ...base,
          profession: professional.profession,
          yearsExperience: Number(professional.yearsExperience) || 0,
          headline: professional.headline.trim() || undefined,
          biography: professional.biography.trim() || undefined,
          serviceAreaIds: areas,
        }
      case 'company':
      case 'supplier':
        return {
          path: type,
          ...base,
          business: {
            name: business.name.trim(),
            description: business.description.trim() || undefined,
            phone: business.phone.trim() || undefined,
            email: business.email.trim() || undefined,
            offersDelivery: business.offersDelivery,
          },
          serviceAreaIds: areas,
        }
      case 'equipment':
        return {
          path: type,
          ...base,
          business: business.name.trim()
            ? {
                name: business.name.trim(),
                description: business.description.trim() || undefined,
                phone: business.phone.trim() || undefined,
                email: business.email.trim() || undefined,
                offersDelivery: business.offersDelivery,
              }
            : undefined,
          serviceAreaIds: areas,
        }
    }
  }

  const submit = async () => {
    setFormError(null)
    setFieldErrors({})
    setSubmitting(true)
    try {
      await apiFetch('/api/auth/register', { method: 'POST', json: buildPayload() })
      // Auto sign-in with the fresh credentials, then the server routes by role.
      const result = await signIn('credentials', {
        identifier: account.email.trim().toLowerCase(),
        password: account.password,
        redirect: false,
      })
      if (!result || result.error) {
        router.push('/auth/sign-in')
        return
      }
      router.push('/dashboard')
      router.refresh()
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        setFormError(submitError.message)
        setFieldErrors(submitError.fieldErrors)
      } else {
        setFormError('Registration failed. Please try again.')
      }
      setSubmitting(false)
    }
  }

  const fieldError = (name: string) => fieldErrors[name]?.[0]

  return (
    <div className="w-full max-w-2xl" data-testid="registration-wizard" data-wizard-type={type}>
      <div className="mb-6">
        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>
            Step {step} of {steps.length}
          </span>
          <span>{steps[step - 1]}</span>
        </div>
        <Progress value={(step / steps.length) * 100} className="mt-2 h-1.5" aria-label={`Registration step ${step}`} />
      </div>

      {formError ? (
        <Alert variant="destructive" className="mb-5" role="alert" data-testid="registration-error">
          <TriangleAlert className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      {step === 1 ? (
        <section className="space-y-4" aria-label="Account details">
          <div className="space-y-1.5">
            <Label htmlFor="reg-name">Full name</Label>
            <Input
              id="reg-name"
              autoComplete="name"
              required
              placeholder="e.g. Kwame Mensah"
              value={account.name}
              onChange={(event) => setAccount({ ...account, name: event.target.value })}
              aria-invalid={Boolean(fieldError('name'))}
            />
            {fieldError('name') ? <p className="text-xs text-destructive">{fieldError('name')}</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reg-email">Email</Label>
            <Input
              id="reg-email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={account.email}
              onChange={(event) => setAccount({ ...account, email: event.target.value })}
              aria-invalid={Boolean(fieldError('email'))}
            />
            {fieldError('email') ? <p className="text-xs text-destructive">{fieldError('email')}</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reg-phone">Phone (Ghana)</Label>
            <Input
              id="reg-phone"
              type="tel"
              autoComplete="tel"
              required
              inputMode="tel"
              placeholder="024 123 4567"
              value={account.phone}
              onChange={(event) => setAccount({ ...account, phone: event.target.value })}
              aria-invalid={Boolean(fieldError('phone'))}
            />
            <p className="text-xs text-muted-foreground">MTN, Telecel or AirtelTigo number, e.g. 0241234567.</p>
            {fieldError('phone') ? <p className="text-xs text-destructive">{fieldError('phone')}</p> : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="reg-password">Password</Label>
              <Input
                id="reg-password"
                type="password"
                autoComplete="new-password"
                required
                value={account.password}
                onChange={(event) => setAccount({ ...account, password: event.target.value })}
                aria-invalid={Boolean(fieldError('password'))}
              />
              <p className="text-xs text-muted-foreground">At least 8 characters with upper, lower and a number.</p>
              {fieldError('password') ? <p className="text-xs text-destructive">{fieldError('password')}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-confirm">Confirm password</Label>
              <Input
                id="reg-confirm"
                type="password"
                autoComplete="new-password"
                required
                value={account.confirmPassword}
                onChange={(event) => setAccount({ ...account, confirmPassword: event.target.value })}
                aria-invalid={passwordMismatch}
              />
              {passwordMismatch ? <p className="text-xs text-destructive">Passwords do not match.</p> : null}
            </div>
          </div>
        </section>
      ) : null}

      {step === 2 && isProvider ? (
        <section className="space-y-4" aria-label="Professional details">
          <div className="space-y-1.5">
            <Label htmlFor="reg-profession">Profession / trade</Label>
            <Select value={professional.profession} onValueChange={(slug) => setProfessional({ ...professional, profession: slug })}>
              <SelectTrigger id="reg-profession" aria-label="Profession">
                <SelectValue placeholder="Select your trade" />
              </SelectTrigger>
              <SelectContent className="max-h-72 overflow-y-auto">
                {professions.map((trade) => (
                  <SelectItem key={trade.slug} value={trade.slug}>
                    {trade.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Loaded live from the Dwellers category system.</p>
            {fieldError('profession') ? <p className="text-xs text-destructive">{fieldError('profession')}</p> : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="reg-years">Years of experience</Label>
              <Input
                id="reg-years"
                type="number"
                min={0}
                max={60}
                value={professional.yearsExperience}
                onChange={(event) => setProfessional({ ...professional, yearsExperience: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-headline">Headline (optional)</Label>
              <Input
                id="reg-headline"
                maxLength={120}
                placeholder="e.g. Certified plumber serving the Eastern Region"
                value={professional.headline}
                onChange={(event) => setProfessional({ ...professional, headline: event.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reg-bio">About you (optional)</Label>
            <Textarea
              id="reg-bio"
              rows={4}
              maxLength={2000}
              placeholder="Describe your experience, certifications and the kind of work you do…"
              value={professional.biography}
              onChange={(event) => setProfessional({ ...professional, biography: event.target.value })}
            />
          </div>
        </section>
      ) : null}

      {step === 2 && isBusiness ? (
        <section className="space-y-4" aria-label="Business details">
          <div className="space-y-1.5">
            <Label htmlFor="reg-business-name">
              {businessLabel}
              {businessRequired ? '' : ' (optional)'}
            </Label>
            <Input
              id="reg-business-name"
              required={businessRequired}
              placeholder={type === 'company' ? 'e.g. Adom Construction Ltd' : 'e.g. Nsawam Building Materials'}
              value={business.name}
              onChange={(event) => setBusiness({ ...business, name: event.target.value })}
              aria-invalid={Boolean(fieldError('business'))}
            />
            {fieldError('business') ? <p className="text-xs text-destructive">{fieldError('business')}</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reg-business-desc">Description (optional)</Label>
            <Textarea
              id="reg-business-desc"
              rows={4}
              maxLength={2000}
              placeholder={
                type === 'supplier'
                  ? 'What materials do you stock? Delivery coverage, opening hours…'
                  : type === 'equipment'
                    ? 'What equipment do you own or rent out? Operator availability…'
                    : 'Company profile, specialisations and notable projects…'
              }
              value={business.description}
              onChange={(event) => setBusiness({ ...business, description: event.target.value })}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="reg-business-phone">Business phone (optional)</Label>
              <Input
                id="reg-business-phone"
                type="tel"
                placeholder="030 123 4567"
                value={business.phone}
                onChange={(event) => setBusiness({ ...business, phone: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-business-email">Business email (optional)</Label>
              <Input
                id="reg-business-email"
                type="email"
                placeholder="info@company.com"
                value={business.email}
                onChange={(event) => setBusiness({ ...business, email: event.target.value })}
              />
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-border bg-secondary/30 p-3">
            <Checkbox
              id="reg-delivery"
              checked={business.offersDelivery}
              onCheckedChange={(checked) => setBusiness({ ...business, offersDelivery: checked === true })}
            />
            <div>
              <Label htmlFor="reg-delivery" className="font-normal">
                We offer delivery to customers
              </Label>
              <p className="text-xs text-muted-foreground">
                {type === 'supplier' ? 'Material delivery availability.' : 'Equipment delivery/pickup availability.'}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {step === (isProvider || isBusiness ? 3 : 2) ? (
        <section className="space-y-5" aria-label="Location">
          <div>
            <h3 className="mb-1 text-sm font-semibold text-foreground">Where are you located?</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              Your base location — nothing is preselected. Choose from anywhere in Ghana.
            </p>
            <LocationCascade value={location} onChange={setLocation} idPrefix="reg-loc" />
            {fieldError('locationId') ? <p className="mt-2 text-xs text-destructive">{fieldError('locationId')}</p> : null}
          </div>

          {type !== 'customer' ? (
            <div>
              <h3 className="mb-1 text-sm font-semibold text-foreground">Where do you provide your services?</h3>
              <p className="mb-3 text-xs text-muted-foreground">
                Select one or more areas you cover — customers in these areas will find you.
              </p>
              <ServiceAreasPicker selected={areas} labels={areaLabels} onAdd={addArea} onRemove={removeArea} />
              {fieldError('serviceAreaIds') ? (
                <p className="mt-2 text-xs text-destructive">{fieldError('serviceAreaIds')}</p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="mt-8 flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={() => goToStep(step - 1)}
          disabled={step === 1 || submitting}
        >
          Back
        </Button>

        {step < steps.length ? (
          <Button type="button" onClick={() => goToStep(step + 1)} disabled={!stepValid}>
            Continue
          </Button>
        ) : (
          <Button type="button" onClick={submit} disabled={!stepValid || submitting} data-testid="registration-submit">
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Creating account…
              </>
            ) : (
              'Create account'
            )}
          </Button>
        )}
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/auth/sign-in" className="font-semibold text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
