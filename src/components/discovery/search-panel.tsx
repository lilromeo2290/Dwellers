'use client'

/**
 * Dwellers — Discovery search panel (PART 1/29).
 *
 * The primary discovery experience: WHAT do you need? + WHERE? + FIND.
 * Both dimensions are entirely database-driven — categories come from the
 * live taxonomy API, locations from the live Ghana location API. Nothing is
 * hard-coded (PART 4/5). The panel never searches itself: it composes a
 * shareable /find URL (PART 28) and hands off to the results page, which
 * uses the same backend discovery service as every other entry point.
 */
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, Search, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/client/api'
import type { LocationValue } from '@/components/auth/location-cascade'
import { LocationCascade } from '@/components/auth/location-cascade'

interface CategoryOption {
  id: string
  name: string
  slug: string
  children?: { id: string; name: string; slug: string }[]
}

interface CommunityOption {
  id: string
  name: string
}

export interface SearchPanelValue {
  categorySlug: string | null
  location: LocationValue
  communityId: string | null
}

export function SearchPanel({
  initial,
  idPrefix = 'find',
  className,
}: {
  initial?: Partial<SearchPanelValue>
  idPrefix?: string
  className?: string
}) {
  const router = useRouter()
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [whatOpen, setWhatOpen] = useState(false)
  const [categorySlug, setCategorySlug] = useState(initial?.categorySlug ?? null)
  const [location, setLocation] = useState<LocationValue>(
    initial?.location ?? { regionId: null, districtId: null, townId: null },
  )
  const [communityId, setCommunityId] = useState(initial?.communityId ?? null)
  const [communities, setCommunities] = useState<CommunityOption[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    apiFetch<CategoryOption[] | { items: CategoryOption[] }>('/api/categories?tree=true')
      .then((payload) => {
        if (cancelled) return
        setCategories(Array.isArray(payload) ? payload : (payload.items ?? []))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  // Communities of the chosen town (optional refinement, PART 4).
  useEffect(() => {
    if (!location.townId) return
    let cancelled = false
    apiFetch<CommunityOption[] | { items: CommunityOption[] }>(
      `/api/locations?level=communities&townId=${location.townId}&pageSize=100`,
    )
      .then((payload) => {
        if (cancelled) return
        setCommunities(Array.isArray(payload) ? payload : (payload.items ?? []))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [location.townId])

  const selectedCategory = useMemo(() => {
    for (const root of categories) {
      if (root.slug === categorySlug) return root
      const child = root.children?.find((c) => c.slug === categorySlug)
      if (child) return child
    }
    return null
  }, [categories, categorySlug])

  const submit = () => {
    setSubmitting(true)
    const params = new URLSearchParams()
    if (categorySlug) params.set('category', categorySlug)
    if (location.regionId) params.set('region', location.regionId)
    if (location.districtId) params.set('district', location.districtId)
    if (location.townId) params.set('town', location.townId)
    if (communityId) params.set('community', communityId)
    router.push(`/find?${params.toString()}`)
  }

  return (
    <div
      className={cn(
        'rounded-2xl border border-border/80 bg-card/90 p-4 shadow-sm backdrop-blur-sm sm:p-5',
        className,
      )}
      data-testid="discovery-search-panel"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        className="grid gap-4"
      >
        <div className="grid gap-4 md:grid-cols-[1fr_1.6fr_auto] md:items-end">
          {/* WHAT */}
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-what`}>What do you need?</Label>
            <Popover open={whatOpen} onOpenChange={setWhatOpen}>
              <PopoverTrigger asChild>
                <Button
                  id={`${idPrefix}-what`}
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={whatOpen}
                  className="h-11 w-full justify-start px-3 font-normal"
                >
                  <Wrench className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className={cn('truncate', !selectedCategory && 'text-muted-foreground')}>
                    {selectedCategory?.name ?? 'Plumber, Electrician, Mason…'}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[min(22rem,90vw)] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search services…" />
                  <CommandList className="max-h-72">
                    <CommandEmpty>No matching service yet.</CommandEmpty>
                    {categories.map((root) => (
                      <CommandGroup key={root.id} heading={root.name}>
                        {(root.children ?? []).map((child) => (
                          <CommandItem
                            key={child.id}
                            value={child.name}
                            onSelect={() => {
                              setCategorySlug(child.slug)
                              setWhatOpen(false)
                            }}
                          >
                            {child.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* WHERE */}
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-where`}>Where?</Label>
            <LocationCascade
              idPrefix={idPrefix}
              value={location}
              onChange={(next) => {
                setLocation(next)
                setCommunityId(null)
                setCommunities([]) // stale list must never linger across towns
              }}
            />
          </div>

          <Button
            type="submit"
            size="lg"
            className="h-11 w-full px-8 md:w-auto"
            disabled={submitting}
            data-testid="find-submit"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            Find
          </Button>
        </div>

        {/* Optional community refinement — appears only once a town is chosen */}
        {communities.length > 0 && (
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor={`${idPrefix}-community`}>Community / area (optional)</Label>
            <Select
              value={communityId ?? ''}
              onValueChange={(value) => setCommunityId(value || null)}
            >
              <SelectTrigger id={`${idPrefix}-community`} aria-label="Community">
                <SelectValue placeholder="Whole town" />
              </SelectTrigger>
              <SelectContent className="max-h-64 overflow-y-auto">
                {communities.map((community) => (
                  <SelectItem key={community.id} value={community.id}>
                    {community.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {selectedCategory && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            Searching {selectedCategory.name}
            {location.townId ? ' in your selected area — everywhere in Ghana if left empty.' : ' across all 16 regions.'}
          </p>
        )}
      </form>
    </div>
  )
}
