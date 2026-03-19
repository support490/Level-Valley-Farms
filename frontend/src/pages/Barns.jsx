import { useState, useEffect, useRef } from 'react'
import { Plus, Pencil, Trash2, MapPin } from 'lucide-react'
import { GoogleMap, Marker, InfoWindow } from '@react-google-maps/api'
import { useGoogleMaps } from '../components/common/GoogleMapsProvider'
import { getBarns, createBarn, updateBarn, deleteBarn } from '../api/barns'
import { getGrowers, updateGrower } from '../api/growers'
import { getSettings } from '../api/settings'
import api from '../api/client'
import SearchSelect from '../components/common/SearchSelect'
import Modal from '../components/common/Modal'
import ConfirmDialog from '../components/common/ConfirmDialog'
import Toast from '../components/common/Toast'
import useToast from '../hooks/useToast'

const emptyForm = { name: '', barn_type: 'pullet', bird_capacity: '', grower_id: '', notes: '', latitude: '', longitude: '' }
const pinMapStyle = { width: '100%', height: '300px', borderRadius: '8px' }
const BARNS_BUILD_CHECK = 'BARNS_V2_2026_0319'
const defaultPinCenter = { lat: 40.75, lng: -77.40 }

export default function Barns() {
  const { isLoaded } = useGoogleMaps()
  const [barns, setBarns] = useState([])
  const [growers, setGrowers] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [filterType, setFilterType] = useState('')
  const [filterGrower, setFilterGrower] = useState(null)
  const [search, setSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  // Map context pins (all barns + warehouse) for showing on the edit map
  const [allMapBarns, setAllMapBarns] = useState([])
  const [warehouse, setWarehouse] = useState(null)
  const [mapReady, setMapReady] = useState(false)
  const [needsPan, setNeedsPan] = useState(null) // grower_id to pan to
  const mapRef = useRef(null)

  const load = async () => {
    try {
      const params = {}
      if (filterType) params.barn_type = filterType
      if (filterGrower) params.grower_id = filterGrower.value
      const [barnsRes, growersRes] = await Promise.all([getBarns(params), getGrowers()])
      setBarns(barnsRes.data || [])
      setGrowers(growersRes.data || [])
    } catch (err) {
      showToast('Error loading data', 'error')
    }
  }

  // Load map context data (all barn pins + warehouse)
  useEffect(() => {
    const loadMapContext = async () => {
      try {
        const [mapRes, settingsRes] = await Promise.all([
          api.get('/inventory/map-data'),
          getSettings(),
        ])
        const data = mapRes.data || {}
        setAllMapBarns(data.barns || [])
        const s = settingsRes.data
        const wLat = parseFloat(s.warehouse_latitude?.value)
        const wLng = parseFloat(s.warehouse_longitude?.value)
        if (wLat && wLng) {
          setWarehouse({ lat: wLat, lng: wLng, address: s.warehouse_address?.value || 'Warehouse' })
        }
      } catch {}
    }
    loadMapContext()
  }, [])

  useEffect(() => { load() }, [filterType, filterGrower])

  const growerOptions = growers.map(g => ({ value: g.id, label: g.name }))

  const filtered = barns.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.grower_name.toLowerCase().includes(search.toLowerCase())
  )

  // Effect: when map is ready AND we have a grower to pan to, geocode and pan
  useEffect(() => {
    if (!mapReady || !needsPan || !isLoaded || !mapRef.current) return
    const grower = growers.find(g => g.id === needsPan)
    if (!grower?.location) return
    new window.google.maps.Geocoder().geocode({ address: grower.location }, (results, status) => {
      if (status === 'OK' && results[0] && mapRef.current) {
        mapRef.current.panTo({
          lat: results[0].geometry.location.lat(),
          lng: results[0].geometry.location.lng(),
        })
        mapRef.current.setZoom(16)
      }
      setNeedsPan(null)
    })
  }, [mapReady, needsPan, isLoaded, growers])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setMapReady(false)
    setNeedsPan(null)
    setModalOpen(true)
  }

  const openEdit = (b) => {
    setEditing(b)
    setForm({
      name: b.name, barn_type: b.barn_type, bird_capacity: b.bird_capacity,
      grower_id: b.grower_id, notes: b.notes || '',
      latitude: b.latitude || '', longitude: b.longitude || '',
    })
    setMapReady(false)
    setNeedsPan(b.grower_id)
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    const cap = parseInt(form.bird_capacity)
    if (isNaN(cap) || cap <= 0) {
      showToast('Bird capacity must be a positive number', 'error')
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        ...form,
        bird_capacity: cap,
        latitude: form.latitude ? parseFloat(form.latitude) : null,
        longitude: form.longitude ? parseFloat(form.longitude) : null,
      }
      if (editing) {
        await updateBarn(editing.id, payload)
        showToast('Barn updated')
      } else {
        await createBarn(payload)
        showToast('Barn created')
      }
      setModalOpen(false)
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    try {
      await deleteBarn(deleteTarget.id)
      showToast('Barn deleted')
      setDeleteTarget(null)
      load()
    } catch (err) {
      showToast('Error deleting barn', 'error')
    }
  }

  const capacityPct = (b) => b.bird_capacity > 0 ? Math.round((b.current_bird_count / b.bird_capacity) * 100) : 0

  // Determine which barns belong to the current grower (draggable) vs others (static context)
  const currentGrowerId = form.grower_id
  const growerBarns = allMapBarns.filter(b => b.grower_id === currentGrowerId && b.latitude && b.longitude)
  const otherBarns = allMapBarns.filter(b => b.grower_id !== currentGrowerId && b.latitude && b.longitude)

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Barns</h2>
        <button onClick={openCreate} className="glass-button-primary flex items-center gap-2">
          <Plus size={16} /> Add Barn
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text" placeholder="Search barns..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="glass-input w-64"
        />
        <div className="w-48">
          <SearchSelect
            options={growerOptions}
            value={filterGrower}
            onChange={setFilterGrower}
            placeholder="All Growers"
            isClearable
          />
        </div>
        <div className="flex gap-1">
          {['', 'pullet', 'layer'].map(t => (
            <button key={t} onClick={() => setFilterType(t)}
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                filterType === t ? 'bg-lvf-accent/20 text-lvf-accent border border-lvf-accent/30' : 'text-lvf-muted hover:text-lvf-text hover:bg-white/5 border border-transparent'
              }`}>
              {t === '' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <table className="w-full glass-table">
          <thead>
            <tr>
              <th>Barn Name</th>
              <th>Grower</th>
              <th>Type</th>
              <th>Capacity</th>
              <th>Current Birds</th>
              <th>Utilization</th>
              <th className="w-20"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(b => (
              <tr key={b.id}>
                <td className="font-medium">
                  <span className="flex items-center gap-1.5">
                    {b.name}
                    {b.latitude && b.longitude ? (
                      <MapPin size={11} className="text-lvf-success" title="Location set" />
                    ) : (
                      <MapPin size={11} className="text-lvf-muted opacity-30" title="No location" />
                    )}
                  </span>
                </td>
                <td className="text-lvf-muted">{b.grower_name}</td>
                <td>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    b.barn_type === 'pullet' ? 'bg-purple-500/20 text-purple-400' : 'bg-amber-500/20 text-amber-400'
                  }`}>
                    {b.barn_type}
                  </span>
                </td>
                <td>{b.bird_capacity.toLocaleString()}</td>
                <td>{b.current_bird_count.toLocaleString()}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-lvf-dark rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          capacityPct(b) > 90 ? 'bg-lvf-danger' : capacityPct(b) > 70 ? 'bg-lvf-warning' : 'bg-lvf-success'
                        }`}
                        style={{ width: `${Math.min(capacityPct(b), 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-lvf-muted">{capacityPct(b)}%</span>
                  </div>
                </td>
                <td>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(b)} className="p-1.5 rounded-lg hover:bg-white/10"><Pencil size={13} className="text-lvf-muted" /></button>
                    <button onClick={() => setDeleteTarget(b)} className="p-1.5 rounded-lg hover:bg-white/10"><Trash2 size={13} className="text-lvf-danger" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-lvf-muted">No barns found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Barn' : 'Add Barn'} maxWidth="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Barn Name *</label>
            <input className="glass-input w-full" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Grower *</label>
            <SearchSelect
              options={growerOptions}
              value={growerOptions.find(o => o.value === form.grower_id) || null}
              onChange={(opt) => {
                setForm({ ...form, grower_id: opt?.value || '' })
                if (opt?.value) setNeedsPan(opt.value)
              }}
              placeholder="Select grower..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Barn Type *</label>
              <select className="glass-input w-full" value={form.barn_type} onChange={e => setForm({ ...form, barn_type: e.target.value })}>
                <option value="pullet">Pullet</option>
                <option value="layer">Layer</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Bird Capacity *</label>
              <input className="glass-input w-full" type="number" required min="1" value={form.bird_capacity} onChange={e => setForm({ ...form, bird_capacity: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Notes</label>
            <textarea className="glass-input w-full" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1 flex items-center gap-1">
              <MapPin size={12} /> Barn Location
              <span className="text-lvf-muted text-[10px]">(click to place pin, drag to adjust)</span>
            </label>
            {isLoaded ? (
              <div className="relative">
                <GoogleMap
                  mapContainerStyle={pinMapStyle}
                  center={defaultPinCenter}
                  zoom={10}
                  onClick={(e) => setForm({ ...form, latitude: e.latLng.lat(), longitude: e.latLng.lng() })}
                  options={{ mapTypeId: 'satellite', streetViewControl: false, fullscreenControl: false, mapTypeControl: false }}
                  onLoad={(m) => {
                    mapRef.current = m
                    setMapReady(true)
                  }}
                >
                  {/* Current barn pin (the one being placed/edited) — draggable */}
                  {form.latitude && form.longitude && (
                    <Marker
                      position={{ lat: parseFloat(form.latitude), lng: parseFloat(form.longitude) }}
                      draggable
                      onDragEnd={(e) => setForm({ ...form, latitude: e.latLng.lat(), longitude: e.latLng.lng() })}
                      icon={{
                        path: 'M12 2C8 2 5 5 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-4-3-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z',
                        fillColor: '#ef4444',
                        fillOpacity: 1,
                        strokeColor: '#ffffff',
                        strokeWeight: 2,
                        scale: 1.8,
                        anchor: new window.google.maps.Point(12, 22),
                      }}
                    />
                  )}

                  {/* Other barns from same grower — draggable (so user can reposition all their barns) */}
                  {growerBarns
                    .filter(b => !editing || b.barn_id !== editing.id)
                    .map(b => (
                    <Marker
                      key={b.barn_id}
                      position={{ lat: b.latitude, lng: b.longitude }}
                      draggable
                      onDragEnd={async (e) => {
                        try {
                          await updateBarn(b.barn_id, { latitude: e.latLng.lat(), longitude: e.latLng.lng() })
                          // Update local state
                          setAllMapBarns(prev => prev.map(mb =>
                            mb.barn_id === b.barn_id ? { ...mb, latitude: e.latLng.lat(), longitude: e.latLng.lng() } : mb
                          ))
                        } catch {}
                      }}
                      label={{ text: b.barn_name, color: '#fff', fontSize: '9px', fontWeight: 'bold' }}
                      icon={{
                        path: 'M12 2C8 2 5 5 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-4-3-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z',
                        fillColor: b.barn_type === 'layer' ? '#f59e0b' : '#a855f7',
                        fillOpacity: 1,
                        strokeColor: '#ffffff',
                        strokeWeight: 2,
                        scale: 1.4,
                        anchor: new window.google.maps.Point(12, 22),
                        labelOrigin: new window.google.maps.Point(12, -4),
                      }}
                    />
                  ))}

                  {/* Grower entrance pin — draggable (only for current grower) */}
                  {currentGrowerId && (() => {
                    const g = (allMapBarns.find(b => b.grower_id === currentGrowerId) || {})
                    const growerObj = growers.find(gr => gr.id === currentGrowerId)
                    const gLat = growerObj?.latitude
                    const gLng = growerObj?.longitude
                    if (!gLat || !gLng) return null
                    return (
                      <Marker
                        position={{ lat: gLat, lng: gLng }}
                        draggable
                        onDragEnd={async (e) => {
                          try {
                            await updateGrower(currentGrowerId, { latitude: e.latLng.lat(), longitude: e.latLng.lng() })
                            setGrowers(prev => prev.map(gr =>
                              gr.id === currentGrowerId ? { ...gr, latitude: e.latLng.lat(), longitude: e.latLng.lng() } : gr
                            ))
                          } catch {}
                        }}
                        label={{ text: growerObj?.name || 'Grower', color: '#fff', fontSize: '9px', fontWeight: 'bold' }}
                        icon={{
                          path: 'M12 2C8 2 5 5 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-4-3-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z',
                          fillColor: '#22c55e',
                          fillOpacity: 1,
                          strokeColor: '#ffffff',
                          strokeWeight: 2,
                          scale: 1.6,
                          anchor: new window.google.maps.Point(12, 22),
                          labelOrigin: new window.google.maps.Point(12, -4),
                        }}
                      />
                    )
                  })()}

                  {/* Other growers' barns — static context (not draggable) */}
                  {otherBarns.map(b => (
                    <Marker
                      key={b.barn_id}
                      position={{ lat: b.latitude, lng: b.longitude }}
                      label={{ text: b.barn_name, color: '#fff', fontSize: '8px' }}
                      opacity={0.5}
                      icon={{
                        path: window.google.maps.SymbolPath.CIRCLE,
                        fillColor: b.barn_type === 'layer' ? '#f59e0b' : '#a855f7',
                        fillOpacity: 0.5,
                        strokeColor: '#ffffff',
                        strokeWeight: 1,
                        scale: 6,
                      }}
                    />
                  ))}

                  {/* Warehouse */}
                  {warehouse && (
                    <Marker
                      position={{ lat: warehouse.lat, lng: warehouse.lng }}
                      label={{ text: 'Warehouse', color: '#fff', fontSize: '8px' }}
                      opacity={0.6}
                      icon={{
                        path: window.google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
                        fillColor: '#3b82f6',
                        fillOpacity: 0.6,
                        strokeColor: '#ffffff',
                        strokeWeight: 1,
                        scale: 5,
                      }}
                    />
                  )}
                </GoogleMap>
                <button
                  type="button"
                  title="Zoom to my location"
                  className="absolute top-2 right-2 bg-white/90 hover:bg-white text-gray-700 p-1.5 rounded shadow text-xs"
                  onClick={() => {
                    navigator.geolocation?.getCurrentPosition((pos) => {
                      if (mapRef.current) {
                        mapRef.current.panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude })
                        mapRef.current.setZoom(16)
                      }
                    })
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>
                </button>
              </div>
            ) : (
              <div className="h-[300px] bg-lvf-dark rounded-lg flex items-center justify-center text-lvf-muted text-sm">Loading map...</div>
            )}
            {form.latitude && form.longitude && (
              <p className="text-[10px] text-lvf-muted mt-1">
                {parseFloat(form.latitude).toFixed(6)}, {parseFloat(form.longitude).toFixed(6)}
                <button type="button" onClick={() => setForm({ ...form, latitude: '', longitude: '' })} className="text-lvf-danger ml-2 hover:underline">Clear</button>
              </p>
            )}
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">{submitting ? 'Saving...' : editing ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Barn"
        message={`Are you sure you want to delete "${deleteTarget?.name}"?`}
      />
    </div>
  )
}
