import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Polygon, Tooltip } from 'react-leaflet'
import type { LatLngExpression, LatLngBoundsExpression, LatLngTuple } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getBlocks, getStatus, type BlocksResponse, type StatusResponse } from '../api'
import { useRoutePrefix } from '../hooks/useRoutePrefix'
import './VineyardMap.css'

type MapLayer = 'water' | 'ndvi' | 'eto' | 'eta'

const LAYER_OPTIONS: { key: MapLayer; label: string }[] = [
  { key: 'ndvi', label: 'NDVI' },
  { key: 'eto', label: 'ETo' },
  { key: 'eta', label: 'ETa' },
  { key: 'water', label: 'Water Status' },
]

// Mirrors the swatches in theme.css — SVG fill attributes can't reliably
// resolve CSS custom properties, so ramp colors are duplicated here as
// plain hex values.
const STATUS_COLORS = {
  irrigate: '#b83232',
  review: '#b8781a',
  hold: '#3d5a3e',
}

const RAMPS: Record<Exclude<MapLayer, 'water'>, { low: string; high: string }> = {
  ndvi: { low: '#d9e6c3', high: '#2d4430' },
  eto: { low: '#fdf3e2', high: '#b8781a' },
  eta: { low: '#d7e6ee', high: '#2f5770' },
}

const NO_DATA_COLOR = '#c8c0aa'
const OUTLINE_COLOR = '#f5f0e8'
const HIGHLIGHT_COLOR = '#c17f2a'

interface VineyardMapProps {
  date: string
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function rgbToHex(r: number, g: number, b: number) {
  const toHex = (v: number) => Math.round(v).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function rampColor(value: number, min: number, max: number, low: string, high: string): string {
  const t = max === min ? 1 : (value - min) / (max - min)
  const clamped = Math.min(1, Math.max(0, t))
  const a = hexToRgb(low)
  const b = hexToRgb(high)
  return rgbToHex(
    a.r + (b.r - a.r) * clamped,
    a.g + (b.g - a.g) * clamped,
    a.b + (b.b - a.b) * clamped,
  )
}

function extent(values: number[]): [number, number] | null {
  if (values.length === 0) return null
  return [Math.min(...values), Math.max(...values)]
}

function VineyardMap({ date }: VineyardMapProps) {
  const navigate = useNavigate()
  const prefix = useRoutePrefix()
  const [blocksGeo, setBlocksGeo] = useState<BlocksResponse | null>(null)
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [layer, setLayer] = useState<MapLayer>('water')
  const [searchQuery, setSearchQuery] = useState('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  useEffect(() => {
    Promise.all([getBlocks(), getStatus(date)])
      .then(([geo, statusData]) => {
        setBlocksGeo(geo)
        setStatus(statusData)
      })
      .catch((err: Error) => setError(err.message))
  }, [date])

  const statusByBlockId = useMemo(() => {
    const map = new Map<string, StatusResponse[number]>()
    status?.forEach((entry) => map.set(entry.block_id, entry))
    return map
  }, [status])

  const ranges = useMemo(() => {
    if (!status || status.length === 0) return null
    const ndviValues = status.map((s) => s.ndvi).filter((v): v is number => v !== null)
    return {
      ndvi: extent(ndviValues),
      eto: extent(status.map((s) => s.eto_mm)),
      eta: extent(status.map((s) => s.eta_mm)),
    }
  }, [status])

  const bounds: LatLngBoundsExpression | null = useMemo(() => {
    if (!blocksGeo) return null
    const points: LatLngTuple[] = []
    blocksGeo.features.forEach((feature) => {
      feature.geometry.coordinates.forEach((ring) => {
        ring.forEach(([lon, lat]) => points.push([lat, lon]))
      })
    })
    return points.length > 0 ? points : null
  }, [blocksGeo])

  const matchedBlockIds = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query || !blocksGeo) return new Set<string>()
    return new Set(
      blocksGeo.features
        .filter((feature) => feature.properties.CULTIVAR.toLowerCase().includes(query))
        .map((feature) => feature.properties.BLOCK),
    )
  }, [searchQuery, blocksGeo])

  const allCultivars = useMemo(() => {
    if (!blocksGeo) return []
    return [...new Set(blocksGeo.features.map((feature) => feature.properties.CULTIVAR))]
  }, [blocksGeo])

  const suggestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return []
    return allCultivars.filter((cultivar) => cultivar.toLowerCase().includes(query))
  }, [searchQuery, allCultivars])

  function selectCultivar(cultivar: string) {
    setSearchQuery(cultivar)
    setIsDropdownOpen(false)
    setActiveIndex(-1)
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!isDropdownOpen || suggestions.length === 0) return
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActiveIndex((prev) => Math.min(prev + 1, suggestions.length - 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setActiveIndex((prev) => Math.max(prev - 1, 0))
        break
      case 'Enter':
        if (activeIndex >= 0 && activeIndex < suggestions.length) {
          event.preventDefault()
          selectCultivar(suggestions[activeIndex])
        }
        break
      case 'Escape':
        event.preventDefault()
        setIsDropdownOpen(false)
        setActiveIndex(-1)
        break
      default:
        break
    }
  }

  function colorForBlock(blockId: string): string {
    const entry = statusByBlockId.get(blockId)
    if (!entry || !ranges) return NO_DATA_COLOR
    if (layer === 'water') return STATUS_COLORS[entry.status]
    const value = layer === 'ndvi' ? entry.ndvi : layer === 'eto' ? entry.eto_mm : entry.eta_mm
    const range = ranges[layer]
    // No satellite pass for this block/date (ndvi) or no valid range at all — show as no-data.
    if (value === null || !range) return NO_DATA_COLOR
    const [min, max] = range
    const { low, high } = RAMPS[layer]
    return rampColor(value, min, max, low, high)
  }

  return (
    <div className="vineyard-map">
      <h2 className="section-title">Vineyard Map</h2>

      {error && <p className="status-text">Failed to load map: {error}</p>}
      {!error && !blocksGeo && <p className="status-text">Loading map…</p>}

      {!error && blocksGeo && bounds && (
        <>
          <div className="vineyard-map__search">
            <h2 className="section-title">Looking for something?</h2>
            <div
              className="vineyard-map__search-box"
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setIsDropdownOpen(false)
                }
              }}
            >
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  const value = e.target.value
                  setSearchQuery(value)
                  setIsDropdownOpen(value.trim().length > 0)
                  setActiveIndex(-1)
                }}
                onFocus={() => {
                  if (searchQuery.trim().length > 0) setIsDropdownOpen(true)
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search by grape variety…"
                className="vineyard-map__search-input"
                role="combobox"
                aria-expanded={isDropdownOpen}
                aria-autocomplete="list"
                aria-controls="cultivar-listbox"
                aria-activedescendant={activeIndex >= 0 ? `cultivar-option-${activeIndex}` : undefined}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="vineyard-map__search-clear"
                  onClick={() => {
                    setSearchQuery('')
                    setIsDropdownOpen(false)
                    setActiveIndex(-1)
                  }}
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}

              {isDropdownOpen && suggestions.length > 0 && (
                <ul className="vineyard-map__search-dropdown" role="listbox" id="cultivar-listbox">
                  {suggestions.map((cultivar, index) => (
                    <li
                      key={cultivar}
                      id={`cultivar-option-${index}`}
                      role="option"
                      aria-selected={index === activeIndex}
                      className={`vineyard-map__search-option ${
                        index === activeIndex ? 'vineyard-map__search-option--active' : ''
                      }`}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectCultivar(cultivar)}
                    >
                      {cultivar}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {searchQuery && (
              <p className="vineyard-map__search-hint">
                {matchedBlockIds.size > 0
                  ? `Highlighting ${matchedBlockIds.size} block${matchedBlockIds.size !== 1 ? 's' : ''} matching "${searchQuery}" on the map — click one to view details`
                  : `No blocks match "${searchQuery}"`}
              </p>
            )}
          </div>

          <div className="vineyard-map__row">
            <div className="vineyard-map__container">
              <MapContainer
                bounds={bounds}
                boundsOptions={{ padding: [20, 20] }}
                scrollWheelZoom={false}
                className="vineyard-map__leaflet"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {blocksGeo.features.map((feature, index) => {
                  const outerRing = feature.geometry.coordinates[0]
                  const positions: LatLngExpression[] = outerRing.map(([lon, lat]) => [lat, lon])
                  const blockId = feature.properties.BLOCK
                  // Highlight only the polygon(s) whose OWN cultivar matches — a
                  // block with mixed sub-parcel plantings shouldn't have its
                  // non-matching parcel highlighted just because it shares a
                  // BLOCK code with a matching one.
                  const isHighlighted =
                    searchQuery.trim().length > 0 &&
                    feature.properties.CULTIVAR.toLowerCase().includes(searchQuery.trim().toLowerCase())
                  return (
                    <Polygon
                      key={`${blockId}-${index}`}
                      positions={positions}
                      pathOptions={{
                        color: isHighlighted ? HIGHLIGHT_COLOR : OUTLINE_COLOR,
                        weight: isHighlighted ? 3 : 1,
                        fillColor: colorForBlock(blockId),
                        fillOpacity: 0.85,
                      }}
                      eventHandlers={{
                        click: () => navigate(`${prefix}/block/${blockId}`),
                      }}
                    >
                      <Tooltip direction="center" opacity={0.9}>
                        {blockId} · {feature.properties.CULTIVAR}
                      </Tooltip>
                    </Polygon>
                  )
                })}
              </MapContainer>
            </div>

            <div className="vineyard-map__toggles">
              {LAYER_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={`map-toggle ${layer === option.key ? 'map-toggle--active' : ''}`}
                  onClick={() => setLayer(option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="vineyard-map__legend">
            {layer === 'water' ? (
              (['irrigate', 'review', 'hold'] as const).map((s) => (
                <div key={s} className="vineyard-map__legend-item">
                  <span
                    className="vineyard-map__legend-swatch"
                    style={{ backgroundColor: STATUS_COLORS[s] }}
                  />
                  <span>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
                </div>
              ))
            ) : (
              <p className="vineyard-map__legend-caption">
                {layer === 'ndvi' && 'Dark green = high canopy · Light = sparse'}
                {layer === 'eto' && 'Dark amber = high reference demand · Light = low'}
                {layer === 'eta' && 'Dark blue = high actual uptake · Light = low'}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default VineyardMap
