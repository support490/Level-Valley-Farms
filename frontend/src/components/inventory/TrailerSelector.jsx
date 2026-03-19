import { useState, useEffect } from 'react'
import { Truck, AlertTriangle, Link } from 'lucide-react'
import { getTrucksWithTrailers, getEquipment, hookTrailer, unhookTrailer } from '../../api/equipment'
import SearchSelect from '../common/SearchSelect'
import CapacityBar from './CapacityBar'

export default function TrailerSelector({ currentSkids = 0, onSelect }) {
  const [trucksData, setTrucksData] = useState([])
  const [allTrailers, setAllTrailers] = useState([])
  const [selectedTruckId, setSelectedTruckId] = useState('')
  const [hookingTrailerId, setHookingTrailerId] = useState('')
  const [hooking, setHooking] = useState(false)

  const loadData = () => {
    getTrucksWithTrailers().then(res => setTrucksData(res.data || [])).catch(() => {})
    getEquipment({ equipment_type: 'trailer', active_only: true }).then(res => setAllTrailers(res.data || [])).catch(() => {})
  }

  useEffect(() => { loadData() }, [])

  const truckOptions = trucksData.map(t => ({
    value: t.id,
    label: `${t.name} (${t.equipment_number})${t.trailer ? ` — ${t.trailer.name}` : ' — No trailer'}`,
  }))

  const selectedTruck = trucksData.find(t => t.id === selectedTruckId)
  const trailer = selectedTruck?.trailer

  // Available trailers = not hooked to any truck (or hooked to THIS truck for swap)
  const availableTrailers = allTrailers.filter(t => !t.hooked_to_id || t.hooked_to_id === selectedTruckId)
  const trailerOptions = availableTrailers.map(t => ({
    value: t.id,
    label: `${t.name} (${t.equipment_number}) — ${t.capacity_skids} skids`,
  }))

  const handleChange = (opt) => {
    const id = opt?.value || ''
    setSelectedTruckId(id)
    setHookingTrailerId('')
    const truck = trucksData.find(t => t.id === id)
    onSelect?.(truck || null)
  }

  const handleHookTrailer = async () => {
    if (!selectedTruckId || !hookingTrailerId || hooking) return
    setHooking(true)
    try {
      // If truck already has a trailer, unhook first
      if (trailer) {
        await unhookTrailer(selectedTruckId)
      }
      await hookTrailer(selectedTruckId, hookingTrailerId)
      // Reload data and re-select
      const res = await getTrucksWithTrailers()
      setTrucksData(res.data || [])
      const eqRes = await getEquipment({ equipment_type: 'trailer', active_only: true })
      setAllTrailers(eqRes.data)
      const updatedTruck = res.data.find(t => t.id === selectedTruckId)
      onSelect?.(updatedTruck || null)
      setHookingTrailerId('')
    } catch {
      // silently fail — user will see no change
    } finally {
      setHooking(false)
    }
  }

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Truck size={16} className="text-lvf-accent" />
        <span className="text-sm font-semibold">Select Truck</span>
      </div>
      <SearchSelect
        options={truckOptions}
        value={truckOptions.find(o => o.value === selectedTruckId) || null}
        onChange={handleChange}
        placeholder="Choose a truck..."
      />

      {/* No trailer — hook one */}
      {selectedTruckId && !trailer && (
        <div className="p-3 rounded-xl bg-lvf-warning/5 border border-lvf-warning/20 space-y-2">
          <div className="flex items-center gap-2 text-lvf-warning text-xs">
            <AlertTriangle size={14} />
            <span>No trailer hooked. Select one to hook:</span>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <SearchSelect
                options={trailerOptions}
                value={trailerOptions.find(o => o.value === hookingTrailerId) || null}
                onChange={(opt) => setHookingTrailerId(opt?.value || '')}
                placeholder="Select trailer..."
              />
            </div>
            <button onClick={handleHookTrailer} disabled={!hookingTrailerId || hooking}
              className="glass-button-primary flex items-center gap-1.5 text-sm px-3 whitespace-nowrap">
              <Link size={13} /> {hooking ? 'Hooking...' : 'Hook'}
            </button>
          </div>
        </div>
      )}

      {/* Has trailer — show info + option to change */}
      {trailer && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-lvf-muted">Trailer: <span className="text-lvf-accent font-medium">{trailer.name}</span></span>
            <span className="text-lvf-muted font-mono">{trailer.capacity_skids} skid capacity</span>
          </div>
          <CapacityBar
            current={currentSkids}
            max={trailer.capacity_skids}
            weightMax={trailer.weight_limit_lbs}
          />
          {/* Change trailer */}
          <details className="text-xs">
            <summary className="text-lvf-muted cursor-pointer hover:text-lvf-text select-none">Change trailer</summary>
            <div className="flex gap-2 mt-2">
              <div className="flex-1">
                <SearchSelect
                  options={trailerOptions.filter(o => o.value !== trailer.id)}
                  value={trailerOptions.find(o => o.value === hookingTrailerId) || null}
                  onChange={(opt) => setHookingTrailerId(opt?.value || '')}
                  placeholder="Select different trailer..."
                />
              </div>
              <button onClick={handleHookTrailer} disabled={!hookingTrailerId || hooking}
                className="glass-button-primary flex items-center gap-1.5 text-sm px-3 whitespace-nowrap">
                <Link size={13} /> {hooking ? 'Swapping...' : 'Swap'}
              </button>
            </div>
          </details>
        </div>
      )}
    </div>
  )
}
