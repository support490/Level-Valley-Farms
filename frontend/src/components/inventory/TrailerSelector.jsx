import { useState, useEffect } from 'react'
import { Truck, AlertTriangle } from 'lucide-react'
import { getTrucksWithTrailers } from '../../api/equipment'
import SearchSelect from '../common/SearchSelect'
import CapacityBar from './CapacityBar'

export default function TrailerSelector({ currentSkids = 0, onSelect }) {
  const [trucksData, setTrucksData] = useState([])
  const [selectedTruckId, setSelectedTruckId] = useState('')

  useEffect(() => {
    getTrucksWithTrailers().then(res => setTrucksData(res.data)).catch(() => {})
  }, [])

  const truckOptions = trucksData.map(t => ({
    value: t.id,
    label: `${t.name} (${t.equipment_number})${t.trailer ? ` — ${t.trailer.name}` : ' — No trailer'}`,
  }))

  const selectedTruck = trucksData.find(t => t.id === selectedTruckId)
  const trailer = selectedTruck?.trailer

  const handleChange = (opt) => {
    const id = opt?.value || ''
    setSelectedTruckId(id)
    const truck = trucksData.find(t => t.id === id)
    onSelect?.(truck || null)
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
      {selectedTruckId && !trailer && (
        <div className="flex items-center gap-2 text-lvf-warning text-xs p-2 rounded-lg bg-lvf-warning/10 border border-lvf-warning/20">
          <AlertTriangle size={14} />
          <span>No trailer hooked to this truck. Hook a trailer on the Equipment page first.</span>
        </div>
      )}
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
        </div>
      )}
    </div>
  )
}
