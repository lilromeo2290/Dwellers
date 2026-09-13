'use client'

/**
 * Dwellers — Provider quotation form (Phase 6, PART 4/5-13/15/18-20/26/53).
 *
 * Two steps: COMPOSE → PREVIEW. The provider never re-enters the customer,
 * service, job or location — those come from the request (PART 3). Items are
 * dynamic (add/remove/edit, PART 10); amounts are displayed for convenience
 * but ALWAYS recalculated server-side from the item data (PART 13) — the
 * browser has no vote on the stored totals.
 *
 * Mobile: stacked cards; desktop: a professional table (PART 53).
 */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { apiFetch, ApiError } from '@/lib/client/api'
import { formatCedi } from '@/lib/finance'
import { QUOTE_ITEM_KINDS, type QuoteItemKind } from '@/modules/quotes/quote-state'
import { QuoteStatusBadge } from '@/components/quotes/quote-badge'

const KIND_LABELS: Record<QuoteItemKind, string> = {
  LABOUR: 'Labour',
  MATERIAL: 'Material',
  EQUIPMENT: 'Equipment',
  TRANSPORT: 'Transport',
  OTHER: 'Other',
}

export interface QuoteFormRequestSummary {
  jobRequestId: string
  reference: string
  title: string | null
  customerDisplayName: string
  serviceLine: string
  locationLine: string
}

interface ItemRow {
  key: string
  kind: QuoteItemKind
  name: string
  quantity: string
  unit: string
  unitPrice: string
}

function emptyRow(): ItemRow {
  return { key: crypto.randomUUID(), kind: 'LABOUR', name: '', quantity: '1', unit: '', unitPrice: '' }
}

/** Client-side mirror of the server calculation — display convenience only.
 * Returns integer PESEWAS, exactly like finance.lineTotalAmount. */
function rowAmount(row: ItemRow): number | null {
  const quantity = Number.parseFloat(row.quantity)
  const unitPrice = Number.parseFloat(row.unitPrice)
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
    return null
  }
  const quantityMilli = Math.round(quantity * 1000)
  const unitPriceAmount = Math.round(unitPrice * 100)
  return Math.round((quantityMilli * unitPriceAmount) / 1000)
}

export interface QuoteFormInitial {
  quoteNumber?: string
  items: ItemRow[]
  discount: string
  validUntil: string
  notes: string
  terms: string
  estimatedDurationDays: string
}

export function QuoteForm({
  mode,
  rolePrefix,
  request,
  initial,
  backHref,
  quoteId,
}: {
  mode: 'create' | 'edit'
  rolePrefix: string
  request: QuoteFormRequestSummary
  initial: QuoteFormInitial
  backHref: string
  /** The quotation's id in edit mode — the PATCH target. */
  quoteId?: string
}) {
  const router = useRouter()
  const [rows, setRows] = useState<ItemRow[]>(initial.items.length > 0 ? initial.items : [emptyRow()])
  const [discount, setDiscount] = useState(initial.discount)
  const [validUntil, setValidUntil] = useState(initial.validUntil)
  const [notes, setNotes] = useState(initial.notes)
  const [terms, setTerms] = useState(initial.terms)
  const [duration, setDuration] = useState(initial.estimatedDurationDays)
  const [step, setStep] = useState<'compose' | 'preview'>('compose')
  const [pending, setPending] = useState<'draft' | 'send' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  const today = useMemo(() => {
    const date = new Date()
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
    return date.toISOString().slice(0, 10)
  }, [])

  const preview = useMemo(() => {
    const amounts = rows.map(rowAmount)
    const subtotal = amounts.reduce<number>((sum, amount) => sum + (amount ?? 0), 0)
    const discountValue = Number.parseFloat(discount)
    const discountAmount =
      Number.isFinite(discountValue) && discountValue > 0 ? Math.round(discountValue * 100) : 0
    return {
      amounts,
      subtotal,
      discountAmount,
      total: Math.max(0, subtotal - discountAmount),
      rowsValid: rows.length > 0 && rows.every((row, index) => amounts[index] !== null && row.name.trim().length > 0),
    }
  }, [rows, discount])

  function updateRow(key: string, patch: Partial<ItemRow>) {
    setRows((previous) => previous.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  function removeRow(key: string) {
    setRows((previous) => (previous.length > 1 ? previous.filter((row) => row.key !== key) : previous))
  }

  function validateCompose(): boolean {
    const errors: Record<string, string[]> = {}
    if (rows.some((row, index) => preview.amounts[index] === null)) {
      errors.items = ['Every item needs a name, a quantity above zero and a unit price of zero or more.']
    }
    if (!validUntil) {
      errors.validUntil = ['Choose the date this quotation is valid until.']
    }
    const discountValue = Number.parseFloat(discount)
    if (
      Number.isFinite(discountValue) &&
      discountValue > 0 &&
      Math.round(discountValue * 100) > preview.subtotal
    ) {
      errors.discount = ['Discount cannot be greater than the quotation subtotal.']
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function submit(finishWithSend: boolean) {
    if (pending) return
    if (!validateCompose() && finishWithSend) {
      setStep('compose')
      return
    }
    setPending(finishWithSend ? 'send' : 'draft')
    setError(null)
    setFieldErrors({})
    const payload = {
      items: rows.map((row) => ({
        kind: row.kind,
        name: row.name.trim(),
        description: null,
        quantity: Number.parseFloat(row.quantity),
        unit: row.unit.trim() || null,
        unitPrice: Number.parseFloat(row.unitPrice),
      })),
      discount: Number.parseFloat(discount) > 0 ? Number.parseFloat(discount) : null,
      validUntil: new Date(`${validUntil}T23:59:59`).toISOString(),
      notes: notes.trim() || null,
      terms: terms.trim() || null,
      estimatedDurationDays: Number.parseInt(duration, 10) > 0 ? Number.parseInt(duration, 10) : null,
      ...(mode === 'create' ? { jobRequestId: request.jobRequestId } : {}),
    }
    try {
      let targetQuoteId: string
      if (mode === 'create') {
        const created = await apiFetch<{ id: string }>('/api/quotes', { method: 'POST', json: payload })
        targetQuoteId = created.id
      } else {
        const updated = await apiFetch<{ id: string }>(`/api/quotes/${quoteId}`, {
          method: 'PATCH',
          json: payload,
        })
        targetQuoteId = updated.id
      }
      if (finishWithSend) {
        await apiFetch(`/api/quotes/${targetQuoteId}/send`, { method: 'POST' })
      }
      router.push(`${rolePrefix}/quotes/${targetQuoteId}?${finishWithSend ? 'sent=1' : 'saved=1'}`)
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message)
        setFieldErrors(caught.fieldErrors)
      } else {
        setError('The quotation could not be saved. Please try again.')
      }
      setPending(null)
    }
  }

  return (
    <div data-testid="quote-form">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {mode === 'create' ? 'Create quotation' : 'Edit quotation draft'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            For {request.customerDisplayName} · {request.reference}
          </p>
        </div>
      </header>

      <Card className="mt-5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">The job</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <Summary label="Customer">{request.customerDisplayName}</Summary>
          <Summary label="Service">{request.serviceLine}</Summary>
          <Summary label="Job">{request.title ?? 'Untitled request'}</Summary>
          <Summary label="Location">{request.locationLine}</Summary>
        </CardContent>
      </Card>

      {step === 'compose' ? (
        <>
          <Card className="mt-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quote items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Desktop: professional table (PART 53). */}
              <table className="hidden w-full text-sm lg:table" aria-label="Quote items">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="py-2 pr-2 font-medium">Type</th>
                    <th scope="col" className="py-2 pr-2 font-medium">Description</th>
                    <th scope="col" className="py-2 pr-2 font-medium w-24">Qty</th>
                    <th scope="col" className="py-2 pr-2 font-medium w-24">Unit</th>
                    <th scope="col" className="py-2 pr-2 font-medium w-32">Unit price</th>
                    <th scope="col" className="py-2 pr-2 font-medium w-28 text-right">Amount</th>
                    <th scope="col" className="py-2 w-10"><span className="sr-only">Remove</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.key} className="border-b last:border-0">
                      <td className="py-2 pr-2 align-middle">
                        <ItemKindSelect
                          id={`item-kind-${index}`}
                          value={row.kind}
                          onChange={(kind) => updateRow(row.key, { kind })}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <Input
                          aria-label={`Item ${index + 1} description`}
                          value={row.name}
                          onChange={(event) => updateRow(row.key, { name: event.target.value })}
                          placeholder="e.g. Bathroom pipe repair"
                          maxLength={120}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <Input
                          aria-label={`Item ${index + 1} quantity`}
                          inputMode="decimal"
                          value={row.quantity}
                          onChange={(event) => updateRow(row.key, { quantity: event.target.value })}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <Input
                          aria-label={`Item ${index + 1} unit`}
                          value={row.unit}
                          onChange={(event) => updateRow(row.key, { unit: event.target.value })}
                          placeholder="job, metres…"
                          maxLength={20}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <Input
                          aria-label={`Item ${index + 1} unit price in cedis`}
                          inputMode="decimal"
                          value={row.unitPrice}
                          onChange={(event) => updateRow(row.key, { unitPrice: event.target.value })}
                          placeholder="0.00"
                        />
                      </td>
                      <td className="py-2 pr-2 text-right font-mono tabular-nums" data-testid={`item-amount-${index}`}>
                        {preview.amounts[index] !== null ? formatCedi(preview.amounts[index]!) : '—'}
                      </td>
                      <td className="py-2 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove item ${index + 1}`}
                          disabled={rows.length === 1}
                          onClick={() => removeRow(row.key)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile: stacked cards (PART 53). */}
              <ul className="space-y-4 lg:hidden">
                {rows.map((row, index) => (
                  <li key={row.key} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between">
                      <ItemKindSelect
                        id={`item-kind-m-${index}`}
                        value={row.kind}
                        onChange={(kind) => updateRow(row.key, { kind })}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove item ${index + 1}`}
                        disabled={rows.length === 1}
                        onClick={() => removeRow(row.key)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                    <div className="mt-3 space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor={`item-name-m-${index}`}>Description</Label>
                        <Input
                          id={`item-name-m-${index}`}
                          value={row.name}
                          onChange={(event) => updateRow(row.key, { name: event.target.value })}
                          placeholder="e.g. Bathroom pipe repair"
                          maxLength={120}
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1.5">
                          <Label htmlFor={`item-qty-m-${index}`}>Qty</Label>
                          <Input
                            id={`item-qty-m-${index}`}
                            inputMode="decimal"
                            value={row.quantity}
                            onChange={(event) => updateRow(row.key, { quantity: event.target.value })}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`item-unit-m-${index}`}>Unit</Label>
                          <Input
                            id={`item-unit-m-${index}`}
                            value={row.unit}
                            onChange={(event) => updateRow(row.key, { unit: event.target.value })}
                            placeholder="bag…"
                            maxLength={20}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`item-price-m-${index}`}>Price GH₵</Label>
                          <Input
                            id={`item-price-m-${index}`}
                            inputMode="decimal"
                            value={row.unitPrice}
                            onChange={(event) => updateRow(row.key, { unitPrice: event.target.value })}
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                      <p className="text-right text-sm font-mono tabular-nums text-muted-foreground">
                        Amount: {preview.amounts[index] !== null ? formatCedi(preview.amounts[index]!) : '—'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              <Button
                type="button"
                variant="outline"
                onClick={() => setRows((previous) => [...previous, emptyRow()])}
                disabled={rows.length >= 50}
                data-testid="add-item"
              >
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Add item
              </Button>
              {fieldErrors.items && (
                <p role="alert" className="text-sm text-destructive">{fieldErrors.items[0]}</p>
              )}
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Terms of this quotation</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="quote-valid-until">Valid until *</Label>
                <Input
                  id="quote-valid-until"
                  type="date"
                  min={today}
                  value={validUntil}
                  onChange={(event) => setValidUntil(event.target.value)}
                  data-testid="quote-valid-until"
                />
                {fieldErrors.validUntil && (
                  <p role="alert" className="text-sm text-destructive">{fieldErrors.validUntil[0]}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quote-discount">Discount (GH₵, optional)</Label>
                <Input
                  id="quote-discount"
                  inputMode="decimal"
                  value={discount}
                  onChange={(event) => setDiscount(event.target.value)}
                  placeholder="0.00"
                  data-testid="quote-discount"
                />
                {fieldErrors.discount && (
                  <p role="alert" className="text-sm text-destructive">{fieldErrors.discount[0]}</p>
                )}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="quote-notes">Notes to the customer (optional)</Label>
                <Textarea
                  id="quote-notes"
                  rows={3}
                  maxLength={5000}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="e.g. Price includes labour and basic replacement materials. Additional materials discovered during inspection may require customer approval."
                />
                <p className="text-xs text-muted-foreground">{notes.trim().length}/5000</p>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="quote-terms">Terms (optional)</Label>
                <Textarea
                  id="quote-terms"
                  rows={3}
                  maxLength={5000}
                  value={terms}
                  onChange={(event) => setTerms(event.target.value)}
                  placeholder="What is included / excluded, warranty, expected duration…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quote-duration">Estimated duration (days, optional)</Label>
                <Input
                  id="quote-duration"
                  inputMode="numeric"
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                  placeholder="e.g. 2"
                />
              </div>
            </CardContent>
          </Card>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Button variant="ghost" asChild>
              <a href={backHref}>Cancel</a>
            </Button>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                onClick={() => void submit(false)}
                disabled={pending !== null}
                data-testid="save-draft"
              >
                {pending === 'draft' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
                Save draft
              </Button>
              <Button
                onClick={() => {
                  if (validateCompose()) setStep('preview')
                }}
                disabled={pending !== null}
                data-testid="preview-quote"
              >
                Preview quotation
              </Button>
            </div>
          </div>
        </>
      ) : (
        <>
          <Card className="mt-6" data-testid="quote-preview">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quote preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="divide-y text-sm">
                {rows.map((row, index) => (
                  <li key={row.key} className="flex items-baseline justify-between gap-3 py-2">
                    <span>
                      <span className="font-medium">{row.name || KIND_LABELS[row.kind]}</span>
                      <span className="ml-2 text-xs uppercase tracking-wide text-muted-foreground">
                        {KIND_LABELS[row.kind]}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {row.quantity} {row.unit || ''} × {formatCedi(Math.round((Number.parseFloat(row.unitPrice) || 0) * 100))}
                      </span>
                    </span>
                    <span className="font-mono tabular-nums">{formatCedi(preview.amounts[index] ?? 0)}</span>
                  </li>
                ))}
              </ul>
              <div className="space-y-1.5 border-t pt-3 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-mono tabular-nums">{formatCedi(preview.subtotal)}</span>
                </div>
                {preview.discountAmount > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Discount</span>
                    <span className="font-mono tabular-nums">−{formatCedi(preview.discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-semibold">
                  <span>Total</span>
                  <span className="font-mono tabular-nums" data-testid="preview-total">
                    {formatCedi(preview.total)}
                  </span>
                </div>
              </div>
              <p className="rounded-lg bg-muted px-3 py-2 text-sm">
                Valid until {new Date(`${validUntil}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.
                {notes.trim() ? ` Notes: ${notes.trim()}` : ''}
              </p>
            </CardContent>
          </Card>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-between">
            <Button variant="ghost" onClick={() => setStep('compose')} disabled={pending !== null} data-testid="back-to-edit">
              Back to edit
            </Button>
            <Button onClick={() => void submit(true)} disabled={pending !== null} data-testid="send-quote">
              {pending === 'send' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
              Send quote
            </Button>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive" data-testid="quote-form-error">
          {error}
        </p>
      )}
    </div>
  )
}

function Summary({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  )
}

function ItemKindSelect({
  id,
  value,
  onChange,
}: {
  id: string
  value: QuoteItemKind
  onChange: (kind: QuoteItemKind) => void
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as QuoteItemKind)}>
      <SelectTrigger id={id} className="w-[9.5rem]" aria-label="Item type">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {QUOTE_ITEM_KINDS.map((kind) => (
          <SelectItem key={kind} value={kind}>
            {KIND_LABELS[kind]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
