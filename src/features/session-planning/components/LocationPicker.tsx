import { useState, useCallback } from 'react'
import { MapPin, Locate, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { Slider } from '../../../components/ui/slider'
import { useSession } from '../../../hooks'
import { useSessionStore } from '../../../stores/sessionStore'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const IANA_TIMEZONES: string[] = (Intl as any).supportedValuesOf('timeZone')

export function LocationPicker() {
  const { getLocationFromBrowser } = useSession()
  const location = useSessionStore((s) => s.location)
  const setLocation = useSessionStore((s) => s.setLocation)
  const [open, setOpen] = useState(false)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lat = location?.latitude ?? 0
  const lon = location?.longitude ?? 0
  const elevation = location?.elevation ?? 0
  const tz = location?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const minAlt = location?.minAltitudeDeg ?? 30

  const handleGeolocate = useCallback(async () => {
    setLocating(true)
    setError(null)
    try {
      await getLocationFromBrowser()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not determine location')
    } finally {
      setLocating(false)
    }
  }, [getLocationFromBrowser])

  const update = useCallback(
    (patch: { lat?: number; lon?: number; elevation?: number; timezone?: string; minAlt?: number }) => {
      const current = useSessionStore.getState().location
      const defaultTz = Intl.DateTimeFormat().resolvedOptions().timeZone
      setLocation({
        latitude: patch.lat ?? current?.latitude ?? 0,
        longitude: patch.lon ?? current?.longitude ?? 0,
        elevation: patch.elevation ?? current?.elevation ?? 0,
        name: current?.name,
        timezone: patch.timezone ?? current?.timezone ?? defaultTz,
        minAltitudeDeg: patch.minAlt ?? current?.minAltitudeDeg ?? 30,
      })
    },
    [setLocation]
  )

  const summary = location
    ? `${lat.toFixed(4)}°, ${lon.toFixed(4)}° · ${tz} · ≥${minAlt}°`
    : 'Location not set'

  return (
    <div className="border rounded-lg bg-muted/20">
      <button
        className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium hover:bg-muted/40 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Observer location:</span>
          <span>{summary}</span>
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t pt-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="loc-lat">Latitude (°)</Label>
              <Input
                id="loc-lat"
                type="number"
                step="0.0001"
                min="-90"
                max="90"
                value={lat}
                onChange={(e) => update({ lat: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label htmlFor="loc-lon">Longitude (°)</Label>
              <Input
                id="loc-lon"
                type="number"
                step="0.0001"
                min="-180"
                max="180"
                value={lon}
                onChange={(e) => update({ lon: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label htmlFor="loc-elev">Elevation (m)</Label>
              <Input
                id="loc-elev"
                type="number"
                step="1"
                min="0"
                value={elevation}
                onChange={(e) => update({ elevation: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="loc-tz">Timezone</Label>
            <select
              id="loc-tz"
              value={tz}
              onChange={(e) => update({ timezone: e.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {IANA_TIMEZONES.map((zone: string) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label>Min visibility altitude: {minAlt}°</Label>
            <Slider
              min={0}
              max={60}
              step={5}
              value={[minAlt]}
              onValueChange={([v]) => update({ minAlt: v })}
              className="mt-2"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleGeolocate}
              disabled={locating}
            >
              <Locate className="h-4 w-4 mr-1" />
              {locating ? 'Locating…' : 'Use my location'}
            </Button>
            {error && <span className="text-xs text-destructive">{error}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
