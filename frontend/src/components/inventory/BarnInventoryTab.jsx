import { useState, useEffect } from 'react'
import { Truck, X } from 'lucide-react'
import { getBarnInventory } from '../../api/inventory'
import { createPickup } from '../../api/logistics'
import TrailerSelector from './TrailerSelector'
import CapacityBar from './CapacityBar'

export default function BarnInventoryTab({ showToast }) {
  const [barnData, setBarnData] = useState([])
  const [selectedTruck, setSelectedTruck] = useState(null)
  const [truckLoad, setTruckLoad] = useState([])
  const [addTarget, setAddTarget] = useState(null)
  const [addSkids, setAddSkids] = useState('')
  const [addFlockId, setAddFlockId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = () => {
    getBarnInventory().then(res => setBarnData(res.data)).catch(() => {})
  }

  useEffect(() => { load() }, [])

  const trailer = selectedTruck?.trailer
  const maxSkids = trailer?.capacity_skids || 0
  const truckTotalSkids = truckLoad.reduce((sum, i) => sum + i.skids, 0)
  const remaining = maxSkids - truckTotalSkids

  // Group barns by grower
  const growerGroups = barnData.reduce((acc, b) => {
    const key = b.grower_name || 'Unknown'
    ;(acc[key] = acc[key] || []).push(b)
    return acc
  }, {})

  const openAddToTruck = (barn, e) => {
    e.stopPropagation()
    if (!trailer) {
      showToast?.('Select a truck with a trailer first', 'error')
      return
    }
    setAddTarget(barn)
    setAddFlockId(barn.flocks[0]?.flock_id || '')
    setAddSkids('')
  }

  const confirmAddToTruck = () => {
    if (!addTarget || !addSkids || !addFlockId) return
    const skids = parseInt(addSkids)
    if (isNaN(skids) || skids <= 0) return

    if (truckTotalSkids + skids > maxSkids) {
      showToast?.(`Exceeds trailer capacity (${maxSkids} skids max)`, 'error')
      return
    }

    const flock = addTarget.flocks.find(f => f.flock_id === addFlockId)
    setTruckLoad(prev => [...prev, {
      barn_id: addTarget.barn_id,
      barn_name: addTarget.barn_name,
      flock_id: addFlockId,
      flock_number: flock?.flock_number || '',
      skids,
    }])
    setAddTarget(null)
    showToast?.(`Added ${skids} skids to trailer`)
  }

  const removeFromTruck = (index) => {
    setTruckLoad(prev => prev.filter((_, i) => i !== index))
  }

  const handleCreatePickup = async () => {
    if (truckLoad.length === 0 || submitting) return
    setSubmitting(true)
    try {
      const itemMap = {}
      truckLoad.forEach(item => {
        const key = `${item.barn_id}_${item.flock_id}`
        if (itemMap[key]) {
          itemMap[key].skids_estimated += item.skids
        } else {
          itemMap[key] = { barn_id: item.barn_id, flock_id: item.flock_id, skids_estimated: item.skids }
        }
      })
      await createPickup({
        scheduled_date: new Date().toISOString().split('T')[0],
        trailer_id: trailer?.id || null,
        items: Object.values(itemMap),
      })
      showToast?.('Pickup job created!')
      setTruckLoad([])
      load()
    } catch (err) {
      showToast?.(err.response?.data?.detail || 'Error creating pickup', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={truckLoad.length > 0 ? 'pb-44' : ''}>
      {/* Trailer Selector */}
      <div className="mb-6">
        <TrailerSelector currentSkids={truckTotalSkids} onSelect={setSelectedTruck} />
      </div>

      {/* Barn Buildings */}
      <div className="space-y-8">
        {Object.entries(growerGroups).length > 0 ? Object.entries(growerGroups).map(([growerName, barns]) => (
          <div key={growerName}>
            <h3 className="text-sm font-semibold text-lvf-muted uppercase tracking-wider mb-3">{growerName}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {barns.map(barn => (
                <div key={barn.barn_id} className="barn-building" onClick={(e) => openAddToTruck(barn, e)}>
                  <div className="barn-roof">
                    <p className="barn-grower-name">{barn.barn_name}</p>
                  </div>
                  <div className="barn-body relative pb-10">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-lvf-muted font-medium">
                        Total: {barn.total_estimated_skids} skids
                      </span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {barn.flocks.map(f => (
                        <div key={f.flock_id} className="pallet-box">
                          <p className="text-lg font-bold leading-tight">{f.estimated_skids}</p>
                          <p className="text-[10px] text-lvf-muted leading-tight truncate max-w-[80px]">{f.flock_number}</p>
                        </div>
                      ))}
                    </div>
                    <div className="barn-door" />
                  </div>
                  <div className="barn-floor" />
                </div>
              ))}
            </div>
          </div>
        )) : (
          <div className="glass-card p-12 text-center text-lvf-muted">
            No barn inventory. Production records create barn inventory automatically.
          </div>
        )}
      </div>

      {/* Add to Truck Popover */}
      {addTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 fade-in" onClick={() => setAddTarget(null)}>
          <div className="barn-popover slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Truck size={14} className="text-lvf-accent" /> Add to Trailer
              </h4>
              <button onClick={() => setAddTarget(null)} className="p-1 rounded-lg hover:bg-white/10">
                <X size={14} />
              </button>
            </div>
            <p className="text-xs text-lvf-muted mb-3">{addTarget.barn_name}</p>

            <div className="space-y-3">
              {addTarget.flocks.length > 1 && (
                <div>
                  <label className="block text-xs text-lvf-muted mb-1">Flock</label>
                  <select className="glass-input w-full text-sm" value={addFlockId}
                    onChange={e => setAddFlockId(e.target.value)}>
                    {addTarget.flocks.map(f => (
                      <option key={f.flock_id} value={f.flock_id}>{f.flock_number} ({f.estimated_skids} avail)</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs text-lvf-muted mb-1">Skids to pick up</label>
                <input className="glass-input w-full text-sm" type="number" min="1"
                  max={Math.min(
                    addTarget.flocks.find(f => f.flock_id === addFlockId)?.estimated_skids || 0,
                    remaining
                  )}
                  placeholder={`Max: ${Math.min(
                    addTarget.flocks.find(f => f.flock_id === addFlockId)?.estimated_skids || 0,
                    remaining
                  )}`}
                  value={addSkids} onChange={e => setAddSkids(e.target.value)}
                  autoFocus />
              </div>
              {remaining < maxSkids && (
                <div className="mt-1">
                  <CapacityBar
                    current={truckTotalSkids + (parseInt(addSkids) || 0)}
                    max={maxSkids}
                    weightMax={trailer?.weight_limit_lbs}
                  />
                </div>
              )}
              <button onClick={confirmAddToTruck}
                disabled={!addSkids || parseInt(addSkids) <= 0 || (parseInt(addSkids) + truckTotalSkids > maxSkids)}
                className="glass-button-primary w-full flex items-center justify-center gap-2 text-sm">
                <Truck size={14} /> Add to Trailer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Truck Dock */}
      {truckLoad.length > 0 && (
        <div className="truck-dock p-4">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <Truck size={20} className="text-lvf-accent" />
                <span className="font-semibold">
                  {selectedTruck?.name || 'Truck'} — {trailer?.name || 'Trailer'}
                </span>
                <span className="text-sm text-lvf-muted">
                  {truckTotalSkids} / {maxSkids} skids
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setTruckLoad([])} className="glass-button-secondary text-sm">Clear</button>
                <button onClick={handleCreatePickup} disabled={submitting}
                  className="glass-button-primary text-sm flex items-center gap-2">
                  {submitting ? 'Creating...' : 'Create Pickup Job'}
                </button>
              </div>
            </div>
            <div className="mb-2">
              <CapacityBar current={truckTotalSkids} max={maxSkids} weightMax={trailer?.weight_limit_lbs} />
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {truckLoad.map((item, i) => (
                <div key={i} className="truck-item flex-shrink-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-lvf-muted">{item.barn_name}</p>
                      <p className="text-sm font-medium text-lvf-accent">{item.flock_number}</p>
                      <p className="text-sm">{item.skids} skids</p>
                    </div>
                    <button onClick={() => removeFromTruck(i)} className="p-1 rounded hover:bg-white/10 mt-0.5">
                      <X size={12} className="text-lvf-danger" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
