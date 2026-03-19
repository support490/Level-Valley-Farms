import { useState, useEffect, useCallback } from 'react'
import { GoogleMap, Marker, InfoWindow } from '@react-google-maps/api'
import { useGoogleMaps } from '../components/common/GoogleMapsProvider'
import { useNavigate } from 'react-router-dom'
import {
  MapPin, Bird, Egg, Warehouse, Navigation, Phone, Mail, User,
  ExternalLink, ChevronDown, ChevronUp, ShoppingBag, Building2,
} from 'lucide-react'
import api from '../api/client'
import { getSettings } from '../api/settings'

const mapContainerStyle = { width: '100%', height: '500px', borderRadius: '12px' }
const defaultCenter = { lat: 40.75, lng: -77.40 }

// SVG icon paths for different barn types
const BARN_ICONS = {
  layer: {
    // Chicken/hen icon
    path: 'M12 2C8 2 5 5 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-4-3-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z',
    fillColor: '#f59e0b',
    scale: 1.6,
  },
  pullet: {
    // Chick/pullet icon
    path: 'M12 2C8 2 5 5 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-4-3-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z',
    fillColor: '#a855f7',
    scale: 1.6,
  },
}

const WAREHOUSE_ICON = {
  path: 'M12 2L2 7v1h2v12h16V8h2V7L12 2zm0 2.26L19 8H5l7-3.74zM18 18H6V9h12v9z',
  fillColor: '#3b82f6',
  scale: 1.4,
}

const BUYER_ICON = {
  path: 'M12 2C8 2 5 5 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-4-3-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z',
  fillColor: '#10b981',
  scale: 1.4,
}

const fmtAge = (days) => {
  if (days == null) return ''
  if (days < 7) return `${days}d`
  const weeks = Math.floor(days / 7)
  return `${weeks}w ${days % 7}d`
}

export default function Maps() {
  const { isLoaded } = useGoogleMaps()
  const navigate = useNavigate()
  const [barns, setBarns] = useState([])
  const [growers, setGrowerList] = useState([])
  const [buyers, setBuyers] = useState([])
  const [warehouse, setWarehouse] = useState(null)
  const [selected, setSelected] = useState(null) // { type: 'barn'|'warehouse'|'buyer', data: ... }
  const [map, setMap] = useState(null)
  const [showLegend, setShowLegend] = useState(true)
  const [filters, setFilters] = useState({ layer: true, pullet: true, warehouse: true, buyers: true })

  // Geocode an address string → { lat, lng } using Google Maps Geocoder
  const geocodeAddress = useCallback((address) => {
    return new Promise((resolve) => {
      if (!window.google?.maps?.Geocoder) { resolve(null); return }
      new window.google.maps.Geocoder().geocode({ address }, (results, status) => {
        if (status === 'OK' && results[0]) {
          resolve({ lat: results[0].geometry.location.lat(), lng: results[0].geometry.location.lng() })
        } else { resolve(null) }
      })
    })
  }, [])

  useEffect(() => {
    if (!isLoaded) return
    const load = async () => {
      try {
        const [mapRes, settingsRes] = await Promise.all([
          api.get('/inventory/map-data'),
          getSettings(),
        ])
        const data = mapRes.data || {}
        const rawBarns = data.barns || []
        setGrowerList(data.growers || [])
        setBuyers(data.buyers || [])

        // Geocode grower addresses for barns without coordinates
        const growerGeoCache = {}
        const resolved = []
        for (const b of rawBarns) {
          if (b.latitude != null && b.longitude != null) {
            resolved.push(b)
          } else if (b.grower_location) {
            if (!growerGeoCache[b.grower_location]) {
              growerGeoCache[b.grower_location] = await geocodeAddress(b.grower_location)
            }
            const geo = growerGeoCache[b.grower_location]
            if (geo) {
              // Offset slightly so barns at same grower don't stack perfectly
              const offset = resolved.filter(r => r.grower_id === b.grower_id && !r.has_coordinates).length
              resolved.push({
                ...b,
                latitude: geo.lat + (offset * 0.0002),
                longitude: geo.lng + (offset * 0.0002),
                _geocoded: true,
              })
            }
          }
        }
        setBarns(resolved)

        const s = settingsRes.data
        const wLat = parseFloat(s.warehouse_latitude?.value)
        const wLng = parseFloat(s.warehouse_longitude?.value)
        if (wLat && wLng) {
          setWarehouse({
            name: s.warehouse_name?.value || 'Level Valley Farms Warehouse',
            address: s.warehouse_address?.value || '',
            lat: wLat,
            lng: wLng,
          })
        }
      } catch (err) {
        console.error('Map load error:', err)
      }
    }
    load()
  }, [isLoaded, geocodeAddress])

  const onMapLoad = useCallback((mapInstance) => {
    setMap(mapInstance)
  }, [])

  // Fit bounds when data loads
  useEffect(() => {
    if (!map) return
    const pts = []
    barns.forEach(b => { if (b.latitude && b.longitude) pts.push({ lat: b.latitude, lng: b.longitude }) })
    if (warehouse) pts.push({ lat: warehouse.lat, lng: warehouse.lng })
    if (pts.length === 0) return
    const bounds = new window.google.maps.LatLngBounds()
    pts.forEach(p => bounds.extend(p))
    map.fitBounds(bounds, 60)
  }, [map, barns, warehouse])

  const zoomTo = (lat, lng) => {
    if (!map) return
    map.panTo({ lat, lng })
    map.setZoom(17)
  }

  const selectBarn = (barn) => setSelected({ type: 'barn', data: barn })
  const selectWarehouse = () => setSelected({ type: 'warehouse', data: warehouse })
  const selectBuyer = (buyer) => setSelected({ type: 'buyer', data: buyer })
  const clearSelection = () => setSelected(null)

  const toggleFilter = (key) => setFilters(f => ({ ...f, [key]: !f[key] }))

  // Group barns by grower for the sidebar list
  const growerBarnMap = {}
  barns.forEach(b => {
    if (!growerBarnMap[b.grower_id]) growerBarnMap[b.grower_id] = { name: b.grower_name, barns: [] }
    growerBarnMap[b.grower_id].barns.push(b)
  })

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-2 border-lvf-border border-t-lvf-accent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <MapPin size={22} /> Farm Map
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLegend(!showLegend)}
            className="glass-button-secondary text-xs flex items-center gap-1"
          >
            Legend {showLegend ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>

      {/* Legend / Filters */}
      {showLegend && (
        <div className="flex flex-wrap items-center gap-3 mb-4 text-xs">
          {[
            { key: 'layer', label: 'Layer Barns', color: 'bg-amber-500' },
            { key: 'pullet', label: 'Pullet Houses', color: 'bg-purple-500' },
            { key: 'warehouse', label: 'Warehouse', color: 'bg-blue-500' },
            { key: 'buyers', label: 'Buyers', color: 'bg-emerald-500' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => toggleFilter(f.key)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors ${
                filters[f.key]
                  ? 'border-white/20 bg-white/5 text-lvf-text'
                  : 'border-transparent bg-white/[0.02] text-lvf-muted line-through'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${f.color} ${!filters[f.key] ? 'opacity-30' : ''}`} />
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Map */}
      <div className="glass-card overflow-hidden mb-6">
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={defaultCenter}
          zoom={10}
          onLoad={onMapLoad}
          options={{
            mapTypeId: 'satellite',
            mapTypeControl: true,
            streetViewControl: false,
            fullscreenControl: true,
          }}
        >
          {/* Barn markers */}
          {barns.filter(b => filters[b.barn_type] && b.latitude && b.longitude).map(barn => (
            <Marker
              key={barn.barn_id}
              position={{ lat: barn.latitude, lng: barn.longitude }}
              label={{
                text: barn.barn_name,
                color: '#ffffff',
                fontSize: '10px',
                fontWeight: 'bold',
                className: 'map-marker-label',
              }}
              icon={{
                path: (BARN_ICONS[barn.barn_type] || BARN_ICONS.layer).path,
                fillColor: (BARN_ICONS[barn.barn_type] || BARN_ICONS.layer).fillColor,
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2,
                scale: (BARN_ICONS[barn.barn_type] || BARN_ICONS.layer).scale,
                anchor: new window.google.maps.Point(12, 22),
                labelOrigin: new window.google.maps.Point(12, -4),
              }}
              onClick={() => { selectBarn(barn); }}
            />
          ))}

          {/* Warehouse marker */}
          {warehouse && filters.warehouse && (
            <Marker
              position={{ lat: warehouse.lat, lng: warehouse.lng }}
              icon={{
                path: WAREHOUSE_ICON.path,
                fillColor: WAREHOUSE_ICON.fillColor,
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2,
                scale: WAREHOUSE_ICON.scale,
                anchor: new window.google.maps.Point(12, 12),
                labelOrigin: new window.google.maps.Point(12, -4),
              }}
              label={{
                text: 'Warehouse',
                color: '#ffffff',
                fontSize: '10px',
                fontWeight: 'bold',
                className: 'map-marker-label',
              }}
              onClick={selectWarehouse}
            />
          )}

          {/* Info windows */}
          {selected?.type === 'barn' && (
            <InfoWindow
              position={{ lat: selected.data.latitude, lng: selected.data.longitude }}
              onCloseClick={clearSelection}
            >
              <div className="p-1 min-w-[220px] max-w-[280px] text-gray-900">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-bold text-sm">{selected.data.barn_name}</h3>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                    selected.data.barn_type === 'layer'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-purple-100 text-purple-700'
                  }`}>
                    {selected.data.barn_type}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-1">{selected.data.grower_name}</p>
                {selected.data._geocoded && (
                  <p className="text-[10px] text-orange-500 mb-1">Approximate location (from grower address). Edit barn to set exact pin.</p>
                )}
                <div className="space-y-1.5 text-xs">
                  {selected.data.current_flock_number && (
                    <p className="flex items-center gap-1">
                      <Bird size={12} className="text-blue-500" />
                      Flock: <strong>{selected.data.current_flock_number}</strong>
                      {selected.data.current_flock_id && (
                        <span className="text-gray-400 text-[10px]">({selected.data.current_flock_id.slice(0, 8)})</span>
                      )}
                    </p>
                  )}
                  {selected.data.flock_age_days != null && (
                    <p className="flex items-center gap-1">
                      <span className="text-gray-400">Age:</span>
                      <strong>{fmtAge(selected.data.flock_age_days)}</strong>
                      <span className="text-gray-400">({selected.data.flock_age_days} days)</span>
                    </p>
                  )}
                  <p className="flex items-center gap-1">
                    <Bird size={12} className="text-gray-400" />
                    <strong>{selected.data.current_bird_count?.toLocaleString()}</strong>
                    <span className="text-gray-400">/ {selected.data.bird_capacity?.toLocaleString()}</span>
                  </p>
                  {selected.data.barn_type === 'layer' && selected.data.estimated_skids > 0 && (
                    <p className="flex items-center gap-1">
                      <Egg size={12} className="text-amber-500" />
                      <strong>{selected.data.estimated_skids}</strong> skids estimated
                    </p>
                  )}
                </div>
                <div className="flex gap-2 mt-3 pt-2 border-t border-gray-200">
                  <button
                    onClick={() => navigate(`/growers`)}
                    className="flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
                  >
                    <User size={10} /> Grower Profile
                  </button>
                  {selected.data.current_flock_id && (
                    <button
                      onClick={() => navigate(`/flocks/${selected.data.current_flock_id}`)}
                      className="flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
                    >
                      <Bird size={10} /> Flock Detail
                    </button>
                  )}
                  <button
                    onClick={() => zoomTo(selected.data.latitude, selected.data.longitude)}
                    className="flex items-center gap-1 text-[11px] text-blue-600 hover:underline ml-auto"
                  >
                    <Navigation size={10} /> Zoom
                  </button>
                </div>
              </div>
            </InfoWindow>
          )}

          {selected?.type === 'warehouse' && warehouse && (
            <InfoWindow
              position={{ lat: warehouse.lat, lng: warehouse.lng }}
              onCloseClick={clearSelection}
            >
              <div className="p-1 min-w-[200px] text-gray-900">
                <h3 className="font-bold text-sm flex items-center gap-1 mb-1">
                  <Warehouse size={14} className="text-blue-500" /> {warehouse.name}
                </h3>
                {warehouse.address && <p className="text-xs text-gray-500 mb-2">{warehouse.address}</p>}
                <div className="flex gap-2 mt-2 pt-2 border-t border-gray-200">
                  <button
                    onClick={() => navigate('/inventory')}
                    className="flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
                  >
                    <ExternalLink size={10} /> Inventory
                  </button>
                  <button
                    onClick={() => zoomTo(warehouse.lat, warehouse.lng)}
                    className="flex items-center gap-1 text-[11px] text-blue-600 hover:underline ml-auto"
                  >
                    <Navigation size={10} /> Zoom
                  </button>
                </div>
              </div>
            </InfoWindow>
          )}

          {selected?.type === 'buyer' && selected.data._lat && (
            <InfoWindow
              position={{ lat: selected.data._lat, lng: selected.data._lng }}
              onCloseClick={clearSelection}
            >
              <div className="p-1 min-w-[200px] text-gray-900">
                <div className="flex items-center gap-1.5 mb-1">
                  <ShoppingBag size={14} className="text-emerald-500" />
                  <h3 className="font-bold text-sm">{selected.data.buyer_name}</h3>
                </div>
                {selected.data.customer_type && (
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium uppercase">
                    {selected.data.customer_type}
                  </span>
                )}
                {selected.data.address && <p className="text-xs text-gray-500 mt-1">{selected.data.address}</p>}
                <div className="space-y-1 text-xs mt-2">
                  {selected.data.contact_name && (
                    <p className="flex items-center gap-1"><User size={10} /> {selected.data.contact_name}</p>
                  )}
                  {selected.data.phone && (
                    <p className="flex items-center gap-1"><Phone size={10} /> {selected.data.phone}</p>
                  )}
                  {selected.data.email && (
                    <p className="flex items-center gap-1"><Mail size={10} /> {selected.data.email}</p>
                  )}
                </div>
                <div className="flex gap-2 mt-2 pt-2 border-t border-gray-200">
                  <button
                    onClick={() => navigate('/contracts')}
                    className="flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
                  >
                    <ExternalLink size={10} /> Contracts
                  </button>
                </div>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      </div>

      {/* Location directory below map */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Grower barn cards */}
        {Object.entries(growerBarnMap).map(([growerId, group]) => (
          <div key={growerId} className="glass-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-sm">{group.name}</h4>
              <button
                onClick={() => navigate('/growers')}
                className="text-[10px] text-lvf-accent hover:underline flex items-center gap-0.5"
              >
                <ExternalLink size={9} /> Profile
              </button>
            </div>
            <div className="space-y-2">
              {group.barns.map(b => (
                <div
                  key={b.barn_id}
                  className="flex items-center justify-between text-xs p-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] cursor-pointer transition-colors"
                  onClick={() => { selectBarn(b); zoomTo(b.latitude, b.longitude); }}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${b.barn_type === 'layer' ? 'bg-amber-500' : 'bg-purple-500'}`} />
                    <span className="font-medium">{b.barn_name}</span>
                    {b.current_flock_number && (
                      <span className="text-lvf-muted">({b.current_flock_number})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {b.flock_age_days != null && (
                      <span className="text-lvf-muted">{fmtAge(b.flock_age_days)}</span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); zoomTo(b.latitude, b.longitude); }}
                      className="p-1 rounded hover:bg-white/10"
                      title="Zoom to location"
                    >
                      <Navigation size={11} className="text-lvf-accent" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Warehouse card */}
        {warehouse && (
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-sm flex items-center gap-1.5">
                <Warehouse size={14} className="text-blue-400" /> Warehouse
              </h4>
              <button
                onClick={() => { selectWarehouse(); zoomTo(warehouse.lat, warehouse.lng); }}
                className="p-1 rounded hover:bg-white/10"
                title="Zoom to location"
              >
                <Navigation size={11} className="text-lvf-accent" />
              </button>
            </div>
            <p className="text-xs text-lvf-muted">{warehouse.address || warehouse.name}</p>
            <button
              onClick={() => navigate('/inventory')}
              className="text-[10px] text-lvf-accent hover:underline flex items-center gap-0.5 mt-2"
            >
              <ExternalLink size={9} /> Go to Inventory
            </button>
          </div>
        )}

        {/* Buyers card */}
        {buyers.length > 0 && (
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-sm flex items-center gap-1.5">
                <ShoppingBag size={14} className="text-emerald-400" /> Egg Buyers
              </h4>
              <button
                onClick={() => navigate('/contracts')}
                className="text-[10px] text-lvf-accent hover:underline flex items-center gap-0.5"
              >
                <ExternalLink size={9} /> Contracts
              </button>
            </div>
            <div className="space-y-2">
              {buyers.map(buyer => (
                <div
                  key={buyer.buyer_id}
                  className="flex items-center justify-between text-xs p-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] cursor-pointer transition-colors"
                  onClick={() => navigate('/contracts')}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="font-medium">{buyer.buyer_name}</span>
                    {buyer.customer_type && (
                      <span className="text-lvf-muted capitalize">({buyer.customer_type})</span>
                    )}
                  </div>
                  {buyer.address && (
                    <span className="text-lvf-muted truncate max-w-[150px]">{buyer.address}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
