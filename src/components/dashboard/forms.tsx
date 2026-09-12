'use client'

/**
 * Dwellers — Dashboard forms (client islands).
 *
 * Every form talks to the Phase 3 self-service APIs and displays server
 * validation errors per field. Ownership is inherent: no user ids travel in
 * any payload — the session decides the target (PART 17).
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { LocationCascade, type LocationValue } from '@/components/auth/location-cascade'
import { ServiceAreasPicker } from '@/components/auth/service-areas-picker'
import { apiFetch, ApiError } from '@/lib/client/api'
import { Loader2, TriangleAlert, CheckCircle2, Upload } from 'lucide-react'

function useSubmit() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    setDone(false)
    setFieldErrors({})
    try {
      await work()
      setDone(true)
      router.refresh()
    } catch (failure) {
      if (failure instanceof ApiError) {
        setError(failure.message)
        setFieldErrors(failure.fieldErrors)
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return { busy, error, done, fieldErrors, run }
}

function FormShell({
  title,
  description,
  children,
  testId,
}: {
  title: string
  description: string
  children: React.ReactNode
  testId: string
}) {
  return (
    <Card data-testid={testId}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function StatusLine({ busy, error, done }: { busy: boolean; error: string | null; done: boolean }) {
  return (
    <>
      {error ? (
        <Alert variant="destructive" className="mt-4" role="alert">
          <TriangleAlert className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {done && !error ? (
        <p className="mt-4 flex items-center gap-2 text-sm font-medium text-primary" role="status">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Saved successfully.
        </p>
      ) : null}
      {busy ? <Loader2 className="mt-4 h-4 w-4 animate-spin text-muted-foreground" aria-label="Saving" /> : null}
    </>
  )
}

const err = (fieldErrors: Record<string, string[]>, name: string) => fieldErrors[name]?.[0]

// -----------------------------------------------------------------------------
// Personal profile (every role) — PART 25
// -----------------------------------------------------------------------------

export interface PersonalProfileInitial {
  name: string
  phone: string
  bio: string
  addressLine: string
  website: string
  locationId: string | null
}

export function PersonalProfileForm({ initial }: { initial: PersonalProfileInitial }) {
  const [values, setValues] = useState(initial)
  const [location, setLocation] = useState<LocationValue>({
    regionId: null,
    districtId: null,
    townId: initial.locationId,
  })
  const { busy, error, done, fieldErrors, run } = useSubmit()

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    void run(async () => {
      await apiFetch('/api/users/me', {
        method: 'PATCH',
        json: {
          name: values.name.trim() || undefined,
          phone: values.phone.trim() || undefined,
          bio: values.bio.trim() || null,
          addressLine: values.addressLine.trim() || null,
          website: values.website.trim() || null,
          locationId: location.townId,
        },
      })
    })
  }

  return (
    <FormShell title="Personal profile" description="Your name and contact details as customers will see them." testId="personal-profile-form">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pf-name">Full name</Label>
            <Input id="pf-name" value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} aria-invalid={Boolean(err(fieldErrors, 'name'))} />
            {err(fieldErrors, 'name') ? <p className="text-xs text-destructive">{err(fieldErrors, 'name')}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pf-phone">Phone (Ghana)</Label>
            <Input id="pf-phone" type="tel" value={values.phone} onChange={(e) => setValues({ ...values, phone: e.target.value })} aria-invalid={Boolean(err(fieldErrors, 'phone'))} />
            {err(fieldErrors, 'phone') ? <p className="text-xs text-destructive">{err(fieldErrors, 'phone')}</p> : null}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pf-bio">About</Label>
          <Textarea id="pf-bio" rows={3} value={values.bio} onChange={(e) => setValues({ ...values, bio: e.target.value })} placeholder="A short introduction…" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pf-address">Address line (optional)</Label>
            <Input id="pf-address" value={values.addressLine} onChange={(e) => setValues({ ...values, addressLine: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pf-website">Website (optional)</Label>
            <Input id="pf-website" type="url" placeholder="https://…" value={values.website} onChange={(e) => setValues({ ...values, website: e.target.value })} aria-invalid={Boolean(err(fieldErrors, 'website'))} />
            {err(fieldErrors, 'website') ? <p className="text-xs text-destructive">{err(fieldErrors, 'website')}</p> : null}
          </div>
        </div>

        <div>
          <Label className="mb-2 block">Location</Label>
          <LocationCascade value={location} onChange={setLocation} idPrefix="pf-loc" />
        </div>

        <Button type="submit" disabled={busy}>Save profile</Button>
        <StatusLine busy={busy} error={error} done={done} />
      </form>
    </FormShell>
  )
}

// -----------------------------------------------------------------------------
// Password change — PART 41
// -----------------------------------------------------------------------------

export function PasswordForm() {
  const [values, setValues] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const { busy, error, done, fieldErrors, run } = useSubmit()

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    void run(async () => {
      await apiFetch('/api/users/me/password', { method: 'PATCH', json: values })
      setValues({ currentPassword: '', newPassword: '', confirmPassword: '' })
    })
  }

  return (
    <FormShell title="Change password" description="Verify your current password, then choose a new one." testId="password-form">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="pw-current">Current password</Label>
          <Input id="pw-current" type="password" autoComplete="current-password" required value={values.currentPassword} onChange={(e) => setValues({ ...values, currentPassword: e.target.value })} aria-invalid={Boolean(err(fieldErrors, 'currentPassword'))} />
          {err(fieldErrors, 'currentPassword') ? <p className="text-xs text-destructive">{err(fieldErrors, 'currentPassword')}</p> : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pw-new">New password</Label>
            <Input id="pw-new" type="password" autoComplete="new-password" required value={values.newPassword} onChange={(e) => setValues({ ...values, newPassword: e.target.value })} aria-invalid={Boolean(err(fieldErrors, 'newPassword'))} />
            <p className="text-xs text-muted-foreground">At least 8 characters with upper, lower and a number.</p>
            {err(fieldErrors, 'newPassword') ? <p className="text-xs text-destructive">{err(fieldErrors, 'newPassword')}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw-confirm">Confirm new password</Label>
            <Input id="pw-confirm" type="password" autoComplete="new-password" required value={values.confirmPassword} onChange={(e) => setValues({ ...values, confirmPassword: e.target.value })} aria-invalid={Boolean(err(fieldErrors, 'confirmPassword'))} />
            {err(fieldErrors, 'confirmPassword') ? <p className="text-xs text-destructive">{err(fieldErrors, 'confirmPassword')}</p> : null}
          </div>
        </div>
        <Button type="submit" disabled={busy}>Update password</Button>
        <StatusLine busy={busy} error={error} done={done} />
      </form>
    </FormShell>
  )
}

// -----------------------------------------------------------------------------
// Provider professional profile — PART 25
// -----------------------------------------------------------------------------

export interface ProviderProfileInitial {
  profession: string
  headline: string
  biography: string
  yearsExperience: number
  availabilityStatus: string
  primaryLocationId: string | null
  professions: { slug: string; name: string }[]
}

export function ProviderProfileForm({ initial }: { initial: ProviderProfileInitial }) {
  const [values, setValues] = useState({
    profession: initial.profession,
    headline: initial.headline,
    biography: initial.biography,
    yearsExperience: String(initial.yearsExperience),
    availabilityStatus: initial.availabilityStatus,
  })
  const [base, setBase] = useState<LocationValue>({ regionId: null, districtId: null, townId: initial.primaryLocationId })
  const { busy, error, done, fieldErrors, run } = useSubmit()

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    void run(async () => {
      await apiFetch('/api/providers/me', {
        method: 'PATCH',
        json: {
          profession: values.profession,
          headline: values.headline.trim() || null,
          biography: values.biography.trim() || null,
          yearsExperience: Number(values.yearsExperience) || 0,
          availabilityStatus: values.availabilityStatus,
          primaryLocationId: base.townId,
        },
      })
    })
  }

  return (
    <FormShell title="Professional profile" description="Your trade, experience and availability — what customers see first." testId="provider-profile-form">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pr-profession">Profession</Label>
            <Select value={values.profession} onValueChange={(slug) => setValues({ ...values, profession: slug })}>
              <SelectTrigger id="pr-profession">
                <SelectValue placeholder="Select trade" />
              </SelectTrigger>
              <SelectContent className="max-h-72 overflow-y-auto">
                {initial.professions.map((trade) => (
                  <SelectItem key={trade.slug} value={trade.slug}>{trade.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {err(fieldErrors, 'profession') ? <p className="text-xs text-destructive">{err(fieldErrors, 'profession')}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-availability">Availability</Label>
            <Select value={values.availabilityStatus} onValueChange={(status) => setValues({ ...values, availabilityStatus: status })}>
              <SelectTrigger id="pr-availability">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AVAILABLE">Available for work</SelectItem>
                <SelectItem value="BUSY">Currently busy</SelectItem>
                <SelectItem value="UNAVAILABLE">Not taking work</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pr-years">Years of experience</Label>
            <Input id="pr-years" type="number" min={0} max={60} value={values.yearsExperience} onChange={(e) => setValues({ ...values, yearsExperience: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-headline">Headline</Label>
            <Input id="pr-headline" maxLength={120} value={values.headline} onChange={(e) => setValues({ ...values, headline: e.target.value })} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pr-bio">About your work</Label>
          <Textarea id="pr-bio" rows={4} maxLength={2000} value={values.biography} onChange={(e) => setValues({ ...values, biography: e.target.value })} />
        </div>

        <div>
          <Label className="mb-2 block">Base location</Label>
          <LocationCascade value={base} onChange={setBase} idPrefix="pr-loc" />
        </div>

        <Button type="submit" disabled={busy}>Save professional profile</Button>
        <StatusLine busy={busy} error={error} done={done} />
      </form>
    </FormShell>
  )
}

// -----------------------------------------------------------------------------
// Business profile — PART 25
// -----------------------------------------------------------------------------

export interface BusinessProfileInitial {
  name: string
  description: string
  phone: string
  email: string
  locationId: string | null
  offersDelivery: boolean
}

export function BusinessProfileForm({ initial }: { initial: BusinessProfileInitial }) {
  const [values, setValues] = useState(initial)
  const [location, setLocation] = useState<LocationValue>({ regionId: null, districtId: null, townId: initial.locationId })
  const { busy, error, done, fieldErrors, run } = useSubmit()

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    void run(async () => {
      await apiFetch('/api/businesses/me', {
        method: 'PATCH',
        json: {
          name: values.name.trim(),
          description: values.description.trim() || null,
          phone: values.phone.trim() || null,
          email: values.email.trim() || null,
          locationId: location.townId,
          offersDelivery: values.offersDelivery,
        },
      })
    })
  }

  return (
    <FormShell title="Business profile" description="Your business identity, contact and delivery preference." testId="business-profile-form">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="bp-name">Business name</Label>
            <Input id="bp-name" required value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} aria-invalid={Boolean(err(fieldErrors, 'name'))} />
            {err(fieldErrors, 'name') ? <p className="text-xs text-destructive">{err(fieldErrors, 'name')}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bp-phone">Business phone</Label>
            <Input id="bp-phone" type="tel" value={values.phone} onChange={(e) => setValues({ ...values, phone: e.target.value })} aria-invalid={Boolean(err(fieldErrors, 'phone'))} />
            {err(fieldErrors, 'phone') ? <p className="text-xs text-destructive">{err(fieldErrors, 'phone')}</p> : null}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bp-email">Business email</Label>
          <Input id="bp-email" type="email" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} aria-invalid={Boolean(err(fieldErrors, 'email'))} />
          {err(fieldErrors, 'email') ? <p className="text-xs text-destructive">{err(fieldErrors, 'email')}</p> : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bp-desc">Description</Label>
          <Textarea id="bp-desc" rows={4} maxLength={2000} value={values.description} onChange={(e) => setValues({ ...values, description: e.target.value })} />
        </div>

        <div>
          <Label className="mb-2 block">Business location</Label>
          <LocationCascade value={location} onChange={setLocation} idPrefix="bp-loc" />
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-border bg-secondary/30 p-3">
          <Checkbox id="bp-delivery" checked={values.offersDelivery} onCheckedChange={(checked) => setValues({ ...values, offersDelivery: checked === true })} />
          <div>
            <Label htmlFor="bp-delivery" className="font-normal">We offer delivery to customers</Label>
          </div>
        </div>

        <Button type="submit" disabled={busy}>Save business profile</Button>
        <StatusLine busy={busy} error={error} done={done} />
      </form>
    </FormShell>
  )
}

// -----------------------------------------------------------------------------
// Service areas (provider or business) — PART 27
// -----------------------------------------------------------------------------

export function ServiceAreasForm({
  scope,
  initial,
}: {
  scope: 'provider' | 'business'
  initial: string[]
}) {
  const [areas, setAreas] = useState<string[]>(initial)
  const [labels, setLabels] = useState<Record<string, string>>({})
  const { busy, error, done, run } = useSubmit()

  const add = (townId: string, townName: string) => {
    setAreas((current) => (current.includes(townId) ? current : [...current, townId]))
    setLabels((current) => ({ ...current, [townId]: townName }))
  }

  const remove = (townId: string) => {
    setAreas((current) => current.filter((id) => id !== townId))
  }

  const save = () => {
    const path = scope === 'provider' ? '/api/providers/me/service-areas' : '/api/businesses/me/service-areas'
    void run(async () => {
      await apiFetch(path, { method: 'PUT', json: { locationIds: areas } })
    })
  }

  return (
    <FormShell
      title="Service areas"
      description="Where you work — customers search these areas. Changes apply when you save."
      testId="service-areas-form"
    >
      <ServiceAreasPicker selected={areas} labels={labels} onAdd={add} onRemove={remove} disabled={busy} />
      <div className="mt-4 flex items-center gap-3">
        <Button type="button" onClick={save} disabled={busy || areas.length === 0}>Save service areas</Button>
        <span className="text-xs text-muted-foreground">{areas.length}/10 areas</span>
      </div>
      <StatusLine busy={busy} error={error} done={done} />
    </FormShell>
  )
}

// -----------------------------------------------------------------------------
// Notifications — PART 34
// -----------------------------------------------------------------------------

export interface NotificationItem {
  id: string
  type: string
  title: string
  body: string | null
  readAt: string | null
  createdAt: string
}

export function NotificationsList({ initial }: { initial: NotificationItem[] }) {
  const [items, setItems] = useState(initial)
  const { busy, error, run } = useSubmit()

  const markRead = (ids: string[]) => {
    void run(async () => {
      await apiFetch('/api/notifications/read', { method: 'POST', json: { ids } })
      setItems((current) => current.map((item) => (ids.includes(item.id) ? { ...item, readAt: new Date().toISOString() } : item)))
    })
  }

  const markAll = () => {
    void run(async () => {
      await apiFetch('/api/notifications/read', { method: 'POST', json: { all: true } })
      setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })))
    })
  }

  const unread = items.filter((item) => !item.readAt).length

  return (
    <Card data-testid="notifications-list">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Notifications</CardTitle>
          <CardDescription>{unread} unread</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={markAll} disabled={busy || unread === 0}>
          Mark all read
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {error ? (
          <Alert variant="destructive" role="alert">
            <TriangleAlert className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No notifications yet.</p>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className={`rounded-lg border p-3 ${item.readAt ? 'border-border bg-card' : 'border-primary/30 bg-primary/5'}`}
              data-testid="notification-item"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.title}</p>
                  {item.body ? <p className="mt-0.5 text-sm text-muted-foreground">{item.body}</p> : null}
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString('en-GB')}</p>
                </div>
                {!item.readAt ? (
                  <Button size="sm" variant="ghost" onClick={() => markRead([item.id])} disabled={busy}>
                    Mark read
                  </Button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

// -----------------------------------------------------------------------------
// Avatar upload — PART 25
// -----------------------------------------------------------------------------

export function AvatarUpload({ hasAvatar }: { hasAvatar: boolean }) {
  const { busy, error, done, run } = useSubmit()

  const upload = (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    void run(async () => {
      const form = new FormData()
      form.append('file', file)
      await apiFetch('/api/users/me/avatar', { method: 'POST', body: form })
    })
  }

  return (
    <FormShell title="Profile photo" description="PNG, JPEG or WEBP up to 5 MB. SVG is not accepted for security reasons." testId="avatar-upload">
      <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-secondary focus-within:outline-2 focus-within:outline-ring">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
        {hasAvatar ? 'Replace photo' : 'Upload photo'}
        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => upload(event.target.files)} aria-label="Profile photo upload" />
      </label>
      <StatusLine busy={false} error={error} done={done} />
    </FormShell>
  )
}
