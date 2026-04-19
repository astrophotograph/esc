import { useState, useCallback } from 'react'
import { Search, Plus, ChevronDown, ChevronUp, Star, Crosshair } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Badge } from '../../../components/ui/badge'
import { invoke } from '../../../services/api'
import { useSchedulerStore } from '../../../stores/schedulerStore'
import { useSession } from '../../../hooks'
import { VisibilityChart } from './VisibilityChart'
import type { VisibilityCurveData } from '../utils/visibilityHelpers'

interface SearchResult {
  id: string
  name: string
  object_type: string
  ra_decimal: number
  dec_decimal: number
  magnitude?: number
  constellation?: string
  above_horizon?: boolean
  altitude?: number
}

export function ObjectSearch() {
  const { location } = useSession()
  const addTarget = useSchedulerStore((s) => s.addTarget)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [curveData, setCurveData] = useState<Record<string, VisibilityCurveData>>({})
  const [loadingCurve, setLoadingCurve] = useState<string | null>(null)

  const minAlt = location?.minAltitudeDeg ?? 30
  const tz = location?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return
    setSearching(true)
    setSearchError(null)
    try {
      const resp = await invoke<unknown>('catalog_search', {
        params: {
          query: query.trim(),
          latitude: location?.latitude ?? null,
          longitude: location?.longitude ?? null,
          limit: 30,
          max_magnitude: 15,
          above_horizon_only: false,
        },
      })
      const data = typeof resp === 'string' ? JSON.parse(resp) : resp
      const objects: SearchResult[] = (data as { objects?: SearchResult[] }).objects ?? []
      setResults(objects)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setSearchError(msg)
      setResults([])
    } finally {
      setSearching(false)
    }
  }, [query, location])

  const fetchCurve = useCallback(
    async (obj: SearchResult) => {
      if (curveData[obj.id] || loadingCurve === obj.id) return
      if (!location) return
      setLoadingCurve(obj.id)
      try {
        const resp = await invoke<string>('planning_get_visibility_curve', {
          ra: obj.ra_decimal,
          dec: obj.dec_decimal,
          lat: location.latitude,
          lon: location.longitude,
          elevation: location.elevation ?? 0,
          tz,
          min_altitude: minAlt,
        })
        const data = typeof resp === 'string' ? JSON.parse(resp) : resp
        setCurveData((prev) => ({ ...prev, [obj.id]: data }))
      } catch (e) {
        console.error('visibility curve failed', e)
      } finally {
        setLoadingCurve(null)
      }
    },
    [location, tz, minAlt, curveData, loadingCurve]
  )

  const toggleExpand = useCallback(
    (obj: SearchResult) => {
      const next = expandedId === obj.id ? null : obj.id
      setExpandedId(next)
      if (next) fetchCurve(obj)
    },
    [expandedId, fetchCurve]
  )

  const handleAdd = useCallback(
    (obj: SearchResult) => {
      addTarget({
        targetName: obj.name,
        aliasName: obj.name,
        raDec: [obj.ra_decimal, obj.dec_decimal],
        startMin: 0,
        durationMin: 60,
        lpFilter: false,
        mosaic: null,
      })
    },
    [addTarget]
  )

  const getIcon = (type: string) => {
    const t = type.toLowerCase()
    if (t.includes('galaxy')) return <Star className="h-3 w-3 text-purple-400" />
    if (t.includes('nebula')) return <Star className="h-3 w-3 text-pink-400" />
    if (t.includes('cluster')) return <Star className="h-3 w-3 text-blue-400" />
    return <Star className="h-3 w-3 text-muted-foreground" />
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search objects (M31, NGC 7000, Orion…)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="pl-9"
          />
        </div>
        <Button onClick={handleSearch} disabled={searching || !query.trim()}>
          {searching ? 'Searching…' : 'Search'}
        </Button>
      </div>

      {!location && (
        <p className="text-xs text-amber-500 flex items-center gap-1">
          <Crosshair className="h-3 w-3" /> Set your observer location above for visibility charts.
        </p>
      )}

      {searchError && (
        <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">
          Search error: {searchError}
        </p>
      )}

      <div className="flex-1 overflow-auto space-y-2">
        {results.length === 0 && !searching && query && !searchError && (
          <p className="text-center text-muted-foreground py-8 text-sm">No results for "{query}"</p>
        )}

        {results.map((obj) => (
          <div key={obj.id} className="border rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2">
              {getIcon(obj.object_type)}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{obj.name}</p>
                <p className="text-xs text-muted-foreground">
                  {obj.object_type}
                  {obj.constellation ? ` · ${obj.constellation}` : ''}
                  {typeof obj.magnitude === 'number' ? ` · Mag ${obj.magnitude.toFixed(1)}` : ''}
                </p>
              </div>
              {typeof obj.altitude === 'number' && (
                <Badge
                  variant={obj.above_horizon ? 'default' : 'secondary'}
                  className="text-xs shrink-0"
                >
                  {obj.altitude.toFixed(0)}°
                </Badge>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => toggleExpand(obj)}
                className="shrink-0"
                aria-label={expandedId === obj.id ? 'Collapse visibility chart' : 'Expand visibility chart'}
              >
                {expandedId === obj.id ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
              <Button
                size="sm"
                onClick={() => handleAdd(obj)}
                className="shrink-0"
                aria-label={`Add ${obj.name} to schedule`}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>

            {expandedId === obj.id && (
              <div className="px-3 pb-3 border-t pt-2">
                {loadingCurve === obj.id && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    Loading visibility…
                  </p>
                )}
                {curveData[obj.id] && (
                  <VisibilityChart data={curveData[obj.id]} minAltDeg={minAlt} height={160} />
                )}
                {!curveData[obj.id] && !loadingCurve && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    Set observer location to see visibility chart.
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
