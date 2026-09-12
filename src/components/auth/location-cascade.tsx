'use client'

/**
 * Dwellers — Ghana location cascade (PART 26).
 *
 * Region → District → Town selects backed ENTIRELY by the live location API
 * (/api/locations). Nothing is hard-coded: a user can register from Nsawam,
 * Ho, Kumasi, Tamale or any supported location — and no default location is
 * ever preselected.
 */
import { useEffect, useMemo, useState } from 'react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { apiFetch } from '@/lib/client/api'

export interface LocationOption {
  id: string
  name: string
}

export interface LocationValue {
  regionId: string | null
  districtId: string | null
  townId: string | null
}

interface ListPayload {
  items: LocationOption[]
  total: number
}

function useLocationList(level: string, parentId: string | null) {
  const [items, setItems] = useState<LocationOption[]>([])
  const enabled = level === 'regions' || parentId !== null

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const query = new URLSearchParams({ level, pageSize: '100' })
    if (parentId) {
      query.set(level === 'districts' ? 'regionId' : level === 'towns' ? 'districtId' : 'townId', parentId)
    }
    apiFetch<ListPayload>(`/api/locations?${query.toString()}`)
      .then((payload) => {
        if (!cancelled) setItems(payload.items)
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
    return () => {
      cancelled = true
    }
  }, [enabled, level, parentId])

  // Derived: children lists are empty until a parent is chosen — no setState needed.
  return enabled ? items : []
}

export interface LocationCascadeProps {
  value: LocationValue
  onChange: (value: LocationValue) => void
  /** Optional: receives the resolved town (id + name) whenever the town selection changes. */
  onTownChange?: (town: LocationOption | null) => void
  disabled?: boolean
  idPrefix?: string
}

export function LocationCascade({ value, onChange, onTownChange, disabled, idPrefix = 'loc' }: LocationCascadeProps) {
  const regions = useLocationList('regions', null)
  const districts = useLocationList('districts', value.regionId)
  const towns = useLocationList('towns', value.districtId)

  const regionItems = useMemo(() => regions, [regions])
  const districtItems = useMemo(() => districts, [districts])
  const townItems = useMemo(() => towns, [towns])

  return (
    <div className="grid gap-3 sm:grid-cols-3" data-testid="location-cascade">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-region`}>Region</Label>
        <Select
          disabled={disabled}
          value={value.regionId ?? ''}
          onValueChange={(regionId) => onChange({ regionId, districtId: null, townId: null })}
        >
          <SelectTrigger id={`${idPrefix}-region`} aria-label="Region">
            <SelectValue placeholder="Select region" />
          </SelectTrigger>
          <SelectContent className="max-h-72 overflow-y-auto">
            {regionItems.map((region) => (
              <SelectItem key={region.id} value={region.id}>
                {region.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-district`}>District / Municipality</Label>
        <Select
          disabled={disabled || !value.regionId}
          value={value.districtId ?? ''}
          onValueChange={(districtId) => onChange({ ...value, districtId, townId: null })}
        >
          <SelectTrigger id={`${idPrefix}-district`} aria-label="District">
            <SelectValue placeholder={value.regionId ? 'Select district' : 'Choose region first'} />
          </SelectTrigger>
          <SelectContent className="max-h-72 overflow-y-auto">
            {districtItems.map((district) => (
              <SelectItem key={district.id} value={district.id}>
                {district.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-town`}>Town / City</Label>
        <Select
          disabled={disabled || !value.districtId}
          value={value.townId ?? ''}
          onValueChange={(townId) => {
            onChange({ ...value, townId })
            const town = townItems.find((item) => item.id === townId) ?? null
            onTownChange?.(town)
          }}
        >
          <SelectTrigger id={`${idPrefix}-town`} aria-label="Town">
            <SelectValue placeholder={value.districtId ? 'Select town' : 'Choose district first'} />
          </SelectTrigger>
          <SelectContent className="max-h-72 overflow-y-auto">
            {townItems.map((town) => (
              <SelectItem key={town.id} value={town.id}>
                {town.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
