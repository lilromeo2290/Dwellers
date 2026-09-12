'use client'

/**
 * Dwellers — Request wizard (Phase 5, PART 3–21, 56).
 *
 * A focused multi-step form — never one endless page:
 *   1 Service → 2 Details → 3 Location → 4 Schedule → 5 Photos → 6 Review
 *
 * Honest by construction:
 *  - A DRAFT is created up-front (idempotent clientToken) so photos can be
 *    uploaded to the EXISTING storage pipeline before submission; the draft
 *    is a real JobRequest row the customer can see and discard.
 *  - Submission happens only when the server confirms — a failed submit
 *    never shows "Request submitted" (PART 59).
 *  - The service list is limited to services the provider GENUINELY offers;
 *    the server re-validates every field (PART 4/20).
 *  - Job location is chosen independently of the customer's own location
 *    (PART 8), with an honest notice when it is outside the provider's
 *    listed service areas (PART 41).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Check, ChevronLeft, ChevronRight, ImagePlus, Loader2, MapPin, Star, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LocationCascade, type LocationValue } from '@/components/auth/location-cascade'
import { apiFetch, ApiError } from '@/lib/client/api'
import { formatCedi } from '@/lib/finance'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface WizardService {
  id: string
  name: string
  description: string | null
  pricingModel: string
  startingPriceAmount: number | null
  currency: string
}

interface WizardProvider {
  id: string
  displayName: string
  verificationStatus: string
  serviceAreas: string[]
  services: WizardService[]
}

interface WizardPhoto {
  id: string
  originalName: string | null
}

type WhenChoice = 'ASAP' | 'DATE' | 'FLEXIBLE'

const STEPS = ['Service', 'Details', 'Location', 'Schedule', 'Photos', 'Review'] as const

const TIME_SLOTS = ['MORNING', 'AFTERNOON', 'EVENING'] as const
const TIME_SLOT_LABELS: Record<string, string> = {
  MORNING: 'Morning',
  AFTERNOON: 'Afternoon',
  EVENING: 'Evening',
  FLEXIBLE: 'Flexible',
}
const URGENCY_OPTIONS = [
  { value: 'NORMAL', label: 'Normal', hint: 'Within the next days' },
  { value: 'URGENT', label: 'Urgent', hint: 'Within 24–48 hours' },
  { value: 'EMERGENCY', label: 'Emergency', hint: 'Right now — use sparingly' },
] as const

const MAX_PHOTOS = 10

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function RequestWizard({
  provider,
  preselectedServiceId,
}: {
  provider: WizardProvider
  preselectedServiceId: string | null
}) {
  const router = useRouter()

  const [step, setStep] = useState(0)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)

  // Form fields -------------------------------------------------------------
  const [serviceId, setServiceId] = useState<string | null>(
    preselectedServiceId && provider.services.some((s) => s.id === preselectedServiceId)
      ? preselectedServiceId
      : null,
  )
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState<LocationValue>({ regionId: null, districtId: null, townId: null })
  const [townName, setTownName] = useState<string | null>(null)
  const [communityId, setCommunityId] = useState<string | null>(null)
  const [communityName, setCommunityName] = useState<string | null>(null)
  const [areaText, setAreaText] = useState('')
  const [when, setWhen] = useState<WhenChoice>('ASAP')
  const [preferredDate, setPreferredDate] = useState('')
  const [timeSlot, setTimeSlot] = useState<string>('MORNING')
  const [urgency, setUrgency] = useState<'NORMAL' | 'URGENT' | 'EMERGENCY'>('NORMAL')
  const [photos, setPhotos] = useState<WizardPhoto[]>([])

  // Per-step + submit errors ------------------------------------------------
  const [stepError, setStepError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)

  const tokenRef = useRef<string | null>(null)
  const startedRef = useRef(false)

  // Idempotent draft creation (PART 43) — a refresh or retry reuses the SAME
  // draft instead of piling up duplicates.
  const ensureDraft = useCallback(async () => {
    const storageKey = `dwellers:job-token:${provider.id}`
    let token = sessionStorage.getItem(storageKey)
    if (!token) {
      token = crypto.randomUUID()
      sessionStorage.setItem(storageKey, token)
    }
    tokenRef.current = token
    try {
      const detail = await apiFetch<{ id: string }>('/api/job-requests', {
        method: 'POST',
        json: { providerId: provider.id, clientToken: token },
      })
      setDraftId(detail.id)
    } catch (error) {
      setDraftError(
        error instanceof ApiError ? error.message : 'Could not start the request. Please refresh and try again.',
      )
    }
  }, [provider.id])

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void trackEvent('request_started', { providerId: provider.id })
    void ensureDraft()
  }, [ensureDraft, provider.id])

  const selectedService = useMemo(
    () => provider.services.find((service) => service.id === serviceId) ?? null,
    [provider.services, serviceId],
  )

  const servesTown = location.townId ? provider.serviceAreas.includes(location.townId) : true

  // --------------------------------------------------------------------------
  // Step validation — mirrors the server rules (which re-validate everything)
  // --------------------------------------------------------------------------

  function validateStep(index: number): string | null {
    if (index === 0 && !serviceId) return 'Please select the service you need.'
    if (index === 1) {
      const trimmedTitle = title.trim()
      if (trimmedTitle.length < 10 || trimmedTitle.length > 120) {
        return 'Give the job a short, clear title (10–120 characters).'
      }
      if (description.trim().length < 10) return 'Please describe the job (at least 10 characters).'
    }
    if (index === 2 && !location.townId) return 'Please select where the job is.'
    if (index === 3 && when === 'DATE') {
      if (!preferredDate) return 'Pick the date you need the service, or choose another option.'
      const chosen = new Date(`${preferredDate}T00:00:00`)
      const startOfToday = new Date()
      startOfToday.setHours(0, 0, 0, 0)
      if (Number.isNaN(chosen.getTime()) || chosen < startOfToday) {
        return 'Preferred date cannot be in the past.'
      }
    }
    return null
  }

  function goNext() {
    const error = validateStep(step)
    if (error) {
      setStepError(error)
      return
    }
    setStepError(null)
    void trackEvent('request_step_completed', { providerId: provider.id, step: step + 1 })
    setStep((current) => Math.min(current + 1, STEPS.length - 1))
  }

  function goBack() {
    setStepError(null)
    setStep((current) => Math.max(current - 1, 0))
  }

  // --------------------------------------------------------------------------
  // Photos — through the authenticated upload endpoint (existing policies)
  // --------------------------------------------------------------------------

  async function onFilesChosen(files: FileList | null) {
    if (!files || !draftId) return
    const room = MAX_PHOTOS - photos.length
    if (room <= 0) {
      setStepError(`A request can hold at most ${MAX_PHOTOS} photos.`)
      return
    }
    setUploading(true)
    setStepError(null)
    try {
      for (const file of Array.from(files).slice(0, room)) {
        const form = new FormData()
        form.set('file', file)
        const created = await apiFetch<WizardPhoto>(`/api/job-requests/${draftId}/attachments`, {
          method: 'POST',
          body: form,
        })
        setPhotos((current) => [...current, created])
      }
    } catch (error) {
      setStepError(
        error instanceof ApiError ? error.message : 'That photo could not be uploaded. Please try again.',
      )
    } finally {
      setUploading(false)
    }
  }

  async function removePhoto(photo: WizardPhoto) {
    if (!draftId) return
    try {
      await apiFetch(`/api/job-requests/${draftId}/attachments/${photo.id}`, { method: 'DELETE' })
      setPhotos((current) => current.filter((item) => item.id !== photo.id))
    } catch (error) {
      setStepError(
        error instanceof ApiError ? error.message : 'The photo could not be removed. Please try again.',
      )
    }
  }

  // --------------------------------------------------------------------------
  // Submit — the server decides; only a confirmed response navigates
  // --------------------------------------------------------------------------

  async function submit() {
    if (!draftId || submitting) return
    setSubmitting(true)
    setStepError(null)
    setFieldErrors({})
    try {
      await apiFetch(`/api/job-requests/${draftId}`, {
        method: 'PATCH',
        json: {
          action: 'submit',
          serviceId,
          title: title.trim(),
          description: description.trim(),
          locationId: location.townId,
          communityId,
          areaText: areaText.trim() || null,
          preferredDate: when === 'DATE' ? new Date(`${preferredDate}T00:00:00`).toISOString() : null,
          preferredTimeSlot: when === 'ASAP' ? 'FLEXIBLE' : timeSlot,
          urgency,
        },
      })
      sessionStorage.removeItem(`dwellers:job-token:${provider.id}`)
      router.push(`/customer/requests/${draftId}?submitted=1`)
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        setStepError(error.message)
      } else {
        setStepError('Your request could not be submitted. Please try again.')
      }
      setSubmitting(false)
    }
  }

  const whenLabel =
    when === 'ASAP' ? 'As soon as possible' : when === 'DATE' ? preferredDate || 'A specific date' : 'Flexible'

  return (
    <div className="mt-6">
      {/* Progress indicator (PART 3/57) */}
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1.5 text-xs" aria-label="Request steps">
        {STEPS.map((label, index) => (
          <li key={label} className="flex items-center gap-1" aria-current={index === step ? 'step' : undefined}>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ${
                index === step
                  ? 'bg-primary text-primary-foreground'
                  : index < step
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {index < step ? <Check className="h-3 w-3" aria-hidden="true" /> : <span>{index + 1}</span>}
              {label}
            </span>
            {index < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />}
          </li>
        ))}
      </ol>

      <Card className="mt-4" data-testid="request-wizard">
        <CardContent className="p-4 sm:p-6">
          {draftError ? (
            <ErrorNote message={draftError} />
          ) : !draftId ? (
            <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Preparing your request…
            </p>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                if (step === STEPS.length - 1) void submit()
                else goNext()
              }}
            >
              {step === 0 && (
                <ServiceStep
                  provider={provider}
                  serviceId={serviceId}
                  onSelect={setServiceId}
                />
              )}

              {step === 1 && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="jr-title">What do you need help with?</Label>
                    <Input
                      id="jr-title"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="e.g. Fix leaking bathroom pipe"
                      maxLength={120}
                      aria-describedby="jr-title-hint"
                    />
                    <p id="jr-title-hint" className="text-xs text-muted-foreground">
                      {title.trim().length}/120 — a short title the provider will recognise.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="jr-description">Describe the job</Label>
                    <Textarea
                      id="jr-description"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      rows={6}
                      maxLength={5000}
                      placeholder="What happened, what you need, the current condition — no technical knowledge needed."
                      aria-describedby="jr-description-hint"
                    />
                    <p id="jr-description-hint" className="text-xs text-muted-foreground">
                      {description.trim().length}/5000
                    </p>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Where is the job? This can be different from where you live.
                  </p>
                  <LocationCascade
                    value={location}
                    onChange={(value) => {
                      setLocation(value)
                      setCommunityId(null)
                      setCommunityName(null)
                    }}
                    onTownChange={(town) => setTownName(town?.name ?? null)}
                    idPrefix="jr"
                  />
                  {location.townId && (
                    <CommunitySelect
                      townId={location.townId}
                      value={communityId}
                      onChange={(id, name) => {
                        setCommunityId(id)
                        setCommunityName(name)
                      }}
                    />
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="jr-area">Address or landmark (optional)</Label>
                    <Input
                      id="jr-area"
                      value={areaText}
                      onChange={(event) => setAreaText(event.target.value)}
                      maxLength={200}
                      placeholder="e.g. Near Nsawam Police Station, after the MTN office"
                    />
                  </div>
                  {!servesTown && (
                    <p className="flex items-start gap-1.5 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {provider.displayName} does not currently list this area. You can still send the request —
                      the provider decides whether to take the job.
                    </p>
                  )}
                </div>
              )}

              {step === 3 && (
                <div className="space-y-5">
                  <fieldset>
                    <legend className="text-sm font-medium">When do you need it?</legend>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      {(
                        [
                          { value: 'ASAP', label: 'As soon as possible' },
                          { value: 'DATE', label: 'A specific date' },
                          { value: 'FLEXIBLE', label: 'I am flexible' },
                        ] as const
                      ).map((option) => (
                        <label
                          key={option.value}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${
                            when === option.value ? 'border-primary bg-primary/5 font-medium' : 'border-border'
                          }`}
                        >
                          <input
                            type="radio"
                            name="jr-when"
                            value={option.value}
                            checked={when === option.value}
                            onChange={() => setWhen(option.value)}
                            className="accent-[var(--primary)]"
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  {when === 'DATE' && (
                    <div className="space-y-1.5">
                      <Label htmlFor="jr-date">Preferred date</Label>
                      <Input
                        id="jr-date"
                        type="date"
                        value={preferredDate}
                        min={new Date().toISOString().slice(0, 10)}
                        onChange={(event) => setPreferredDate(event.target.value)}
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="jr-slot">Preferred time</Label>
                    <Select value={timeSlot} onValueChange={setTimeSlot}>
                      <SelectTrigger id="jr-slot" aria-label="Preferred time">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_SLOTS.map((slot) => (
                          <SelectItem key={slot} value={slot}>
                            {TIME_SLOT_LABELS[slot]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      The provider confirms the actual time in their response — this is your preference.
                    </p>
                  </div>

                  <fieldset>
                    <legend className="text-sm font-medium">How urgent is it?</legend>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      {URGENCY_OPTIONS.map((option) => (
                        <label
                          key={option.value}
                          className={`flex cursor-pointer flex-col rounded-lg border px-3 py-2.5 text-sm ${
                            urgency === option.value ? 'border-primary bg-primary/5 font-medium' : 'border-border'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="jr-urgency"
                              value={option.value}
                              checked={urgency === option.value}
                              onChange={() => setUrgency(option.value)}
                              className="accent-[var(--primary)]"
                            />
                            {option.label}
                          </span>
                          <span className="ml-5 text-xs text-muted-foreground">{option.hint}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Photos help the provider understand the job (leaking pipe, damaged roof, the site). Up to{' '}
                    {MAX_PHOTOS}, JPEG/PNG/WEBP, max 10 MB each.
                  </p>
                  <label
                    className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground ${
                      uploading ? 'pointer-events-none opacity-60' : ''
                    }`}
                  >
                    {uploading ? (
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                    ) : (
                      <ImagePlus className="h-5 w-5" aria-hidden="true" />
                    )}
                    {uploading ? 'Uploading…' : 'Tap to add photos'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      className="sr-only"
                      onChange={(event) => {
                        void onFilesChosen(event.target.files)
                        event.target.value = ''
                      }}
                    />
                  </label>
                  {photos.length > 0 && (
                    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Attached photos">
                      {photos.map((photo) => (
                        <li key={photo.id} className="group relative overflow-hidden rounded-lg border">
                          {/* Authenticated, privacy-preserving photo URL — storage keys never leak. */}
                          <img
                            src={`/api/job-requests/${draftId}/attachments/${photo.id}`}
                            alt={photo.originalName ?? 'Job photo'}
                            className="aspect-square w-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => void removePhoto(photo)}
                            aria-label={`Remove ${photo.originalName ?? 'photo'}`}
                            className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-black/80"
                          >
                            <X className="h-3 w-3" aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {step === 5 && (
                <div className="space-y-4">
                  <h2 className="text-base font-semibold">Review your request</h2>
                  <dl className="divide-y rounded-xl border">
                    <ReviewRow label="Provider" value={provider.displayName} />
                    <ReviewRow label="Service" value={selectedService?.name ?? '—'} />
                    <ReviewRow label="Job" value={title.trim() || '—'} />
                    <ReviewRow label="Description" value={description.trim()} multiline />
                    <ReviewRow
                      label="Location"
                      value={
                        <span className="flex flex-col">
                          <span>{[communityName, townName].filter(Boolean).join(', ') || '—'}</span>
                          {areaText.trim() && <span className="text-muted-foreground">{areaText.trim()}</span>}
                        </span>
                      }
                    />
                    <ReviewRow label="Preferred" value={`${whenLabel} · ${TIME_SLOT_LABELS[when === 'ASAP' ? 'FLEXIBLE' : timeSlot]}`} />
                    <ReviewRow label="Urgency" value={URGENCY_OPTIONS.find((option) => option.value === urgency)?.label ?? 'Normal'} />
                    <ReviewRow label="Photos" value={`${photos.length} attached`} />
                  </dl>
                  {!servesTown && location.townId && (
                    <p className="text-xs text-muted-foreground">
                      Note: the job location is outside {provider.displayName}&apos;s listed service areas.
                    </p>
                  )}
                </div>
              )}

              {(stepError || Object.keys(fieldErrors).length > 0) && (
                <ErrorNote
                  message={
                    stepError ??
                    Object.values(fieldErrors).flat()[0] ??
                    'Please review the highlighted fields.'
                  }
                />
              )}

              {/* Actions */}
              <div className="mt-6 flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={goBack}
                  disabled={step === 0 || submitting}
                  className="h-11"
                >
                  <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
                  Back
                </Button>
                {step < STEPS.length - 1 ? (
                  <Button type="submit" className="h-11 min-w-32" data-testid="wizard-next">
                    Continue
                    <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    className="h-11 min-w-40"
                    disabled={submitting}
                    data-testid="wizard-submit"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Submitting…
                      </>
                    ) : (
                      'Submit request'
                    )}
                  </Button>
                )}
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Steps
// -----------------------------------------------------------------------------

function ServiceStep({
  provider,
  serviceId,
  onSelect,
}: {
  provider: WizardProvider
  serviceId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Provider</p>
          <p className="font-medium" data-testid="wizard-provider-name">{provider.displayName}</p>
        </div>
        {provider.verificationStatus === 'VERIFIED' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            <Star className="h-3 w-3" aria-hidden="true" /> Verified
          </span>
        )}
      </div>
      <fieldset>
        <legend className="text-sm font-medium">What do you need?</legend>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Only services {provider.displayName} genuinely offers are listed.
        </p>
        <div className="mt-3 space-y-2" role="radiogroup" aria-label="Service">
          {provider.services.length === 0 && (
            <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              This provider has not listed individual services. Continue and describe the job — the
              provider will confirm.
            </p>
          )}
          {provider.services.map((service) => (
            <label
              key={service.id}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                serviceId === service.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
              }`}
            >
              <input
                type="radio"
                name="jr-service"
                value={service.id}
                checked={serviceId === service.id}
                onChange={() => onSelect(service.id)}
                className="mt-1 accent-[var(--primary)]"
              />
              <span className="flex-1">
                <span className="block text-sm font-medium">{service.name}</span>
                {service.description && (
                  <span className="mt-0.5 block text-xs text-muted-foreground">{service.description}</span>
                )}
              </span>
              {service.startingPriceAmount != null && (
                <span className="whitespace-nowrap text-sm font-medium text-primary">
                  from {formatCedi(service.startingPriceAmount)}
                </span>
              )}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  )
}

function CommunitySelect({
  townId,
  value,
  onChange,
}: {
  townId: string
  value: string | null
  onChange: (id: string | null, name: string | null) => void
}) {
  const [communities, setCommunities] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    let cancelled = false
    apiFetch<{ id: string; name: string }[] | { items: { id: string; name: string }[] }>(
      `/api/locations?level=communities&townId=${encodeURIComponent(townId)}&pageSize=100`,
    )
      .then((payload) => {
        if (!cancelled) setCommunities(Array.isArray(payload) ? payload : (payload.items ?? []))
      })
      .catch(() => {
        if (!cancelled) setCommunities([])
      })
    return () => {
      cancelled = true
    }
  }, [townId])

  return (
    <div className="space-y-1.5">
      <Label htmlFor="jr-community">Community / area (optional)</Label>
      <Select
        value={value ?? ''}
        onValueChange={(next) => {
          if (next === '') {
            onChange(null, null)
            return
          }
          const selected = communities.find((community) => community.id === next)
          onChange(next, selected?.name ?? null)
        }}
        disabled={communities.length === 0}
      >
        <SelectTrigger id="jr-community" aria-label="Community">
          <SelectValue placeholder={communities.length === 0 ? 'No listed communities' : 'Select community'} />
        </SelectTrigger>
        <SelectContent className="max-h-72 overflow-y-auto">
          {communities.map((community) => (
            <SelectItem key={community.id} value={community.id}>
              {community.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function ReviewRow({ label, value, multiline }: { label: string; value: React.ReactNode; multiline?: boolean }) {
  return (
    <div className={`flex gap-3 px-4 py-3 text-sm ${multiline ? 'flex-col' : 'items-baseline justify-between'}`}>
      <dt className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={multiline ? '' : 'text-right font-medium'}>{value}</dd>
    </div>
  )
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
      data-testid="wizard-error"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      {message}
    </p>
  )
}

/** Fire-and-forget analytics (PART 60) — never blocks the wizard. */
async function trackEvent(
  type: 'request_started' | 'request_step_completed',
  payload: { providerId: string; step?: number },
) {
  try {
    void fetch('/api/discovery/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, ...payload }),
      keepalive: true,
    })
  } catch {
    // Best-effort analytics.
  }
}
