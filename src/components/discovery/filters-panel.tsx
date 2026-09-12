'use client'

/**
 * Dwellers — Discovery filters (PART 14) + sorting (PART 15).
 *
 * All filters are SERVER-SIDE: changing a control rewrites the shareable
 * /find URL and re-renders the results page, which re-runs the discovery
 * service. Nothing is filtered in the browser. Filter usage is recorded as
 * an anonymous analytics event (PART 32) — best-effort, no PII.
 */
import { useCallback, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

export const SORT_OPTIONS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'nearest', label: 'Nearest' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'experience', label: 'Most experienced' },
  { value: 'price', label: 'Lowest starting price' },
  { value: 'response', label: 'Fastest response' },
] as const

const VERIFICATION_OPTIONS = [
  { value: 'any', label: 'Any verification' },
  { value: 'VERIFIED', label: 'Verified only' },
  { value: 'PENDING', label: 'Verification pending' },
  { value: 'UNVERIFIED', label: 'Unverified' },
]

const AVAILABILITY_OPTIONS = [
  { value: 'any', label: 'Any availability' },
  { value: 'AVAILABLE', label: 'Available now' },
  { value: 'BUSY', label: 'Busy' },
  { value: 'UNAVAILABLE', label: 'Unavailable' },
]

const TYPE_OPTIONS = [
  { value: 'any', label: 'Everyone' },
  { value: 'INDIVIDUAL', label: 'Individual artisans' },
  { value: 'BUSINESS', label: 'Businesses & companies' },
]

const DISTANCE_OPTIONS = [
  { value: 'any', label: 'Any distance' },
  { value: '5', label: 'Within 5 km' },
  { value: '15', label: 'Within 15 km' },
  { value: '30', label: 'Within 30 km' },
  { value: '50', label: 'Within 50 km' },
]

const RATING_OPTIONS = [
  { value: 'any', label: 'Any rating' },
  { value: '4.5', label: '4.5+ stars' },
  { value: '4', label: '4+ stars' },
  { value: '3', label: '3+ stars' },
]

function trackFilterUsed(filter: string) {
  try {
    void fetch('/api/discovery/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'filter_used', providerId: undefined }),
      keepalive: true,
    })
  } catch {
    // Analytics is best-effort.
  }
  void filter
}

export function SortSelect({ value }: { value: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const onSort = (sort: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (sort === 'recommended') params.delete('sort')
    else params.set('sort', sort)
    params.delete('page') // sorting restarts the list
    router.replace(`/find?${params.toString()}`, { scroll: true })
  }

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="find-sort" className="shrink-0 text-sm text-muted-foreground">
        Sort
      </Label>
      <Select value={value || 'recommended'} onValueChange={onSort}>
        <SelectTrigger id="find-sort" aria-label="Sort results" className="h-9 w-[13.5rem]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function FilterFields({ onDone }: { onDone?: () => void }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const apply = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString())
      mutate(params)
      params.delete('page')
      trackFilterUsed('any')
      startTransition(() => {
        router.replace(`/find?${params.toString()}`, { scroll: false })
      })
      onDone?.()
    },
    [router, searchParams, onDone],
  )

  const activeCount = ['verification', 'availability', 'minRating', 'type', 'maxPrice', 'distance'].filter(
    (key) => searchParams.get(key),
  ).length

  return (
    <div className="space-y-5" data-testid="filters-panel">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">
          Filters{activeCount > 0 ? ` (${activeCount})` : ''}
        </p>
        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-muted-foreground"
            onClick={() =>
              apply((params) => {
                for (const key of ['verification', 'availability', 'minRating', 'type', 'maxPrice', 'distance']) {
                  params.delete(key)
                }
              })
            }
          >
            Clear all
          </Button>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-verification">Verification</Label>
        <Select
          value={searchParams.get('verification') ?? 'any'}
          onValueChange={(value) => apply((p) => (value === 'any' ? p.delete('verification') : p.set('verification', value)))}
        >
          <SelectTrigger id="filter-verification" aria-label="Verification filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VERIFICATION_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-availability">Availability</Label>
        <Select
          value={searchParams.get('availability') ?? 'any'}
          onValueChange={(value) => apply((p) => (value === 'any' ? p.delete('availability') : p.set('availability', value)))}
        >
          <SelectTrigger id="filter-availability" aria-label="Availability filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AVAILABILITY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-rating">Minimum rating</Label>
        <Select
          value={searchParams.get('minRating') ?? 'any'}
          onValueChange={(value) => apply((p) => (value === 'any' ? p.delete('minRating') : p.set('minRating', value)))}
        >
          <SelectTrigger id="filter-rating" aria-label="Minimum rating filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RATING_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-type">Provider type</Label>
        <Select
          value={searchParams.get('type') ?? 'any'}
          onValueChange={(value) => apply((p) => (value === 'any' ? p.delete('type') : p.set('type', value)))}
        >
          <SelectTrigger id="filter-type" aria-label="Provider type filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-distance">Distance</Label>
        <Select
          value={searchParams.get('distance') ?? 'any'}
          onValueChange={(value) => apply((p) => (value === 'any' ? p.delete('distance') : p.set('distance', value)))}
        >
          <SelectTrigger id="filter-distance" aria-label="Distance filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DISTANCE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-price">Max starting price (GH₵)</Label>
        <Input
          id="filter-price"
          type="number"
          min={0}
          inputMode="numeric"
          placeholder="Any price"
          defaultValue={searchParams.get('maxPrice') ? String(Number(searchParams.get('maxPrice')) / 100) : ''}
          onBlur={(event) => {
            const cedis = event.target.value.trim()
            const amount = cedis === '' ? null : Math.max(0, Math.round(Number(cedis) * 100))
            apply((p) => (amount !== null && Number.isFinite(amount) ? p.set('maxPrice', String(amount)) : p.delete('maxPrice')))
          }}
        />
        <p className="text-xs text-muted-foreground">Applies to providers who published a starting price.</p>
      </div>
    </div>
  )
}

/** Desktop inline filters (aside) and mobile sheet share one field set. */
export function FiltersPanel() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Mobile trigger + sheet */}
      <div className="lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="h-9 w-full sm:w-auto" data-testid="open-filters">
              <SlidersHorizontal className="mr-2 h-4 w-4" aria-hidden="true" />
              Filters
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl p-5">
            <SheetHeader className="sr-only">
              <SheetTitle>Search filters</SheetTitle>
            </SheetHeader>
            <FilterFields onDone={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop aside */}
      <aside
        className={cn('hidden lg:block')}
        aria-label="Search filters"
      >
        <div className="rounded-xl border border-border/80 bg-card p-5">
          <FilterFields />
        </div>
      </aside>
    </>
  )
}
