import { useState, useEffect, useCallback } from 'react'
import { GoogleMap, Marker, InfoWindow } from '@react-google-maps/api'
import { useGoogleMaps } from '../components/common/GoogleMapsProvider'
import { MapPin, Bird, Egg, Warehouse } from 'lucide-react'
import api from '../api/client'
import { getSettings } from '../api/settings'

const mapContainerStyle = { width: '100%', height: 'calc(100vh - 120px)', borderRadius: '16px' }
const defaultCenter = { lat: 40.75, lng: -77.40 } // Central PA

export default function Maps() {
  const { isLoaded } = useGoogleMaps()
  const [barns, setBarns] = useState([])
  const [warehouse, setWarehouse] = useState(null)
  const [selectedBarn, setSelectedBarn] = useState(null)
  const [selectedWarehouse, setSelectedWarehouse] = useState(false)
  const [map, setMap] = useState(null)

  useEffect(() => {
    const load = async () => {
      const [barnRes, settingsRes] = await Promise.all([
        api.get('/inventory/map-data'),
        getSettings(),
      ])
      setBarns(barnRes.data)

      const s = settingsRes.data
      const wLat = parseFloat(s.warehouse_latitude?.value)
      const wLng = parseFloat(s.warehouse_longitude?.value)
      if (wLat && wLng) {
        setWarehouse({
          address: s.warehouse_address?.value || 'Warehouse',
          lat: wLat,
          lng: wLng,
        })
      }
    }
    load()
  }, [])

  const onMapLoad = useCallback((mapInstance) => {
    setMap(mapInstance)
  }, [])

  // Fit bounds when data loads
  useEffect(() => {
    if (!map || barns.length === 0) return
    const bounds = new window.google.maps.LatLngBounds()
    barns.forEach(b => bounds.extend({ lat: b.latitude, lng: b.longitude }))
    if (warehouse) bounds.extend({ lat: warehouse.lat, lng: warehouse.lng })
    map.fitBounds(bounds, 60)
  }, [map, barns, warehouse])

  const typeColors = {
    layer: '#f59e0b',   // amber
    pullet: '#a855f7',  // purple
  }

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
          <MapPin size={22} /> Maps
        </h2>
        <div className="flex items-center gap-4 text-xs text-lvf-muted">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-amber-500" /> Layer
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-purple-500" /> Pullet
          </span>
          {warehouse && (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-blue-500" /> Warehouse
            </span>
          )}
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={defaultCenter}
          zoom={10}
          mapTypeId="satellite"
          onLoad={onMapLoad}
          options={{
            mapTypeControl: true,
            streetViewControl: false,
            fullscreenControl: true,
          }}
        >
          {barns.map(barn => (
            <Marker
              key={barn.barn_id}
              position={{ lat: barn.latitude, lng: barn.longitude }}
              label={{
                text: barn.barn_name,
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 'bold',
                className: 'map-marker-label',
              }}
              icon={{
                path: window.google.maps.SymbolPath.CIRCLE,
                fillColor: typeColors[barn.barn_type] || '#f59e0b',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2,
                scale: 10,
              }}
              onClick={() => { setSelectedBarn(barn); setSelectedWarehouse(false) }}
            />
          ))}

          {warehouse && (
            <Marker
              position={{ lat: warehouse.lat, lng: warehouse.lng }}
              icon={{
                path: window.google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
                fillColor: '#3b82f6',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2,
                scale: 8,
              }}
              label={{
                text: 'Warehouse',
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 'bold',
                className: 'map-marker-label',
              }}
              onClick={() => { setSelectedWarehouse(true); setSelectedBarn(null) }}
            />
          )}

          {selectedBarn && (
            <InfoWindow
              position={{ lat: selectedBarn.latitude, lng: selectedBarn.longitude }}
              onCloseClick={() => setSelectedBarn(null)}
            >
              <div className="p-1 min-w-[200px] text-gray-900">
                <h3 className="font-bold text-sm mb-1">{selectedBarn.barn_name}</h3>
                <p className="text-xs text-gray-600 mb-2">{selectedBarn.grower_name}</p>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                      selectedBarn.barn_type === 'layer'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-purple-100 text-purple-700'
                    }`}>
                      {selectedBarn.barn_type}
                    </span>
                  </div>
                  {selectedBarn.current_flock_number && (
                    <p className="flex items-center gap-1">
                      <Bird size={12} className="text-blue-500" />
                      Flock: <strong>{selectedBarn.current_flock_number}</strong>
                    </p>
                  )}
                  <p className="flex items-center gap-1">
                    <Bird size={12} className="text-gray-400" />
                    Birds: <strong>{selectedBarn.current_bird_count?.toLocaleString()}</strong>
                    <span className="text-gray-400">/ {selectedBarn.bird_capacity?.toLocaleString()}</span>
                  </p>
                  {selectedBarn.barn_type === 'layer' && (
                    <p className="flex items-center gap-1">
                      <Egg size={12} className="text-amber-500" />
                      Estimated: <strong>{selectedBarn.estimated_skids}</strong> skids
                    </p>
                  )}
                </div>
              </div>
            </InfoWindow>
          )}

          {selectedWarehouse && warehouse && (
            <InfoWindow
              position={{ lat: warehouse.lat, lng: warehouse.lng }}
              onCloseClick={() => setSelectedWarehouse(false)}
            >
              <div className="p-1 min-w-[180px] text-gray-900">
                <h3 className="font-bold text-sm flex items-center gap-1 mb-1">
                  <Warehouse size={14} className="text-blue-500" /> Warehouse
                </h3>
                <p className="text-xs text-gray-600">{warehouse.address}</p>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      </div>
    </div>
  )
}
