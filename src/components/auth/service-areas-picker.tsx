'use client'

/**
 * Dwellers — Service-area multi-picker (PART 27).
 *
 * Lets a provider pick one or more service areas from the live Ghana
 * location hierarchy. Selections are chips with remove buttons; a compact
 * cascade adds towns. Values are Town ids — they map onto the Phase 2
 * ProviderServiceArea/BusinessServiceArea relations, never free text.
 */
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MapPin, Plus, X } from 'lucide-react'
import { LocationCascade, type LocationOption, type LocationValue } from '@/components/auth/location-cascade'

export interface ServiceAreasPickerProps {
  selected: string[]
  /** Resolved town names by id for chip labels (managed by the parent). */
  labels: Record<string, string>
  onAdd: (townId: string, townName: string) => void
  onRemove: (townId: string) => void
  max?: number
  disabled?: boolean
}

export function ServiceAreasPicker({
  selected,
  labels,
  onAdd,
  onRemove,
  max = 10,
  disabled,
}: ServiceAreasPickerProps) {
  const [cascade, setCascade] = useState<LocationValue>({ regionId: null, districtId: null, townId: null })
  const [pendingTown, setPendingTown] = useState<LocationOption | null>(null)
  const [showPicker, setShowPicker] = useState(false)

  const add = () => {
    if (!pendingTown) return
    if (selected.includes(pendingTown.id)) return
    if (selected.length >= max) return
    onAdd(pendingTown.id, pendingTown.name)
    setCascade({ regionId: null, districtId: null, townId: null })
    setPendingTown(null)
  }

  return (
    <div className="space-y-3" data-testid="service-areas-picker">
      <div className="flex flex-wrap items-center gap-2" data-testid="service-area-chips">
        {selected.length === 0 ? (
          <p className="text-sm text-muted-foreground">No service areas selected yet.</p>
        ) : (
          selected.map((townId) => (
            <Badge key={townId} variant="secondary" className="gap-1 py-1 pl-2 pr-1">
              <MapPin className="h-3 w-3 text-primary" aria-hidden="true" />
              {labels[townId] ?? townId}
              <button
                type="button"
                aria-label={`Remove ${labels[townId] ?? townId}`}
                className="ml-1 rounded-full p-0.5 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                onClick={() => onRemove(townId)}
                disabled={disabled}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </Badge>
          ))
        )}
      </div>

      {showPicker ? (
        <div className="space-y-3 rounded-lg border border-border bg-card p-3">
          <LocationCascade
            value={cascade}
            onChange={setCascade}
            onTownChange={setPendingTown}
            idPrefix="area"
            disabled={disabled}
          />
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={add} disabled={!pendingTown || selected.length >= max}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
              Add area
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowPicker(false)}>
              Done
            </Button>
            <span className="text-xs text-muted-foreground">
              {selected.length}/{max} areas
            </span>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setShowPicker(true)}
          disabled={disabled || selected.length >= max}
        >
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
          {selected.length === 0 ? 'Where do you provide services?' : 'Add another area'}
        </Button>
      )}
    </div>
  )
}
