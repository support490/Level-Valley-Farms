import { useState, useEffect } from 'react'
import { Plus, Truck, Package, CheckCircle, XCircle, FileText, Eye } from 'lucide-react'
import { getPickups, createPickup, completePickup, cancelPickup, getShipments, createShipment, updateShipmentStatus } from '../api/logistics'
import { getFlocks } from '../api/flocks'
import { getBarns } from '../api/barns'
import { getEggGrades, getInventorySummary } from '../api/inventory'
import { getContracts } from '../api/contracts'
import SearchSelect from '../components/common/SearchSelect'
import Modal from '../components/common/Modal'
import Toast from '../components/common/Toast'
import useToast from '../hooks/useToast'

export default function Logistics() {
  const [tab, setTab] = useState('pickups')
  const [pickups, setPickups] = useState([])
  const [shipments, setShipments] = useState([])
  const [flocks, setFlocks] = useState([])
  const [barns, setBarns] = useState([])
  const [grades, setGrades] = useState([])
  const [contracts, setContracts] = useState([])
  const [summary, setSummary] = useState([])
  const [createPickupOpen, setCreatePickupOpen] = useState(false)
  const [completePickupOpen, setCompletePickupOpen] = useState(false)
  const [completeTarget, setCompleteTarget] = useState(null)
  const [createShipmentOpen, setCreateShipmentOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailTarget, setDetailTarget] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  const [pickupForm, setPickupForm] = useState({
    scheduled_date: new Date().toISOString().split('T')[0],
    driver_name: '',
    notes: '',
    items: [{ barn_id: '', flock_id: '', skids_estimated: '' }],
  })

  const [completeItems, setCompleteItems] = useState([])

  const [shipmentForm, setShipmentForm] = useState({
    bol_number: '', contract_id: '', ship_date: new Date().toISOString().split('T')[0],
    buyer: '', carrier: '', destination: '', notes: '',
    lines: [{ flock_id: '', grade: '', skids: '', price_per_dozen: '' }],
  })

  const load = async () => {
    try {
      const [pickupsRes, shipmentsRes, flocksRes, barnsRes, gradesRes, contractsRes, summaryRes] = await Promise.all([
        getPickups(), getShipments(), getFlocks({ status: 'active' }), getBarns(),
        getEggGrades(), getContracts({ active_only: true }), getInventorySummary()
      ])
      setPickups(pickupsRes.data)
      setShipments(shipmentsRes.data)
      setFlocks(flocksRes.data)
      setBarns(barnsRes.data)
      setGrades(gradesRes.data)
      setContracts(contractsRes.data)
      setSummary(summaryRes.data)
    } catch (err) {
      showToast('Error loading data', 'error')
    }
  }

  useEffect(() => { load() }, [])

  const barnOptions = barns.map(b => ({ value: b.id, label: b.name }))
  const flockOptions = flocks.map(f => ({ value: f.id, label: `${f.flock_number} — ${f.current_bird_count} birds` }))
  const gradeOptions = grades.map(g => ({ value: g.value, label: g.label }))
  const contractOptions = contracts.map(c => ({ value: c.id, label: `${c.contract_number} — ${c.buyer}` }))

  // ── Pickup Handlers ──
  const addPickupItem = () => {
    setPickupForm(prev => ({
      ...prev,
      items: [...prev.items, { barn_id: '', flock_id: '', skids_estimated: '' }]
    }))
  }

  const updatePickupItem = (idx, field, value) => {
    setPickupForm(prev => ({
      ...prev,
      items: prev.items.map((item, i) => i === idx ? { ...item, [field]: value } : item)
    }))
  }

  const removePickupItem = (idx) => {
    if (pickupForm.items.length <= 1) return
    setPickupForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx)
    }))
  }

  const handleCreatePickup = async (e) => {
    e.preventDefault()
    if (submitting) return
    const validItems = pickupForm.items.filter(i => i.barn_id && i.flock_id && parseInt(i.skids_estimated) > 0)
    if (validItems.length === 0) {
      showToast('Add at least one barn with estimated skids', 'error')
      return
    }
    setSubmitting(true)
    try {
      await createPickup({
        scheduled_date: pickupForm.scheduled_date,
        driver_name: pickupForm.driver_name || null,
        notes: pickupForm.notes || null,
        items: validItems.map(i => ({
          barn_id: i.barn_id,
          flock_id: i.flock_id,
          skids_estimated: parseInt(i.skids_estimated),
          notes: null,
        }))
      })
      showToast('Pickup job created')
      setCreatePickupOpen(false)
      setPickupForm({
        scheduled_date: new Date().toISOString().split('T')[0],
        driver_name: '', notes: '',
        items: [{ barn_id: '', flock_id: '', skids_estimated: '' }],
      })
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const openComplete = (job) => {
    setCompleteTarget(job)
    setCompleteItems(job.items.map(item => ({
      item_id: item.id,
      skids_actual: item.skids_estimated,
      grade: grades.length > 0 ? grades[0].value : '',
      barn_name: item.barn_name,
      flock_number: item.flock_number,
      skids_estimated: item.skids_estimated,
    })))
    setCompletePickupOpen(true)
  }

  const handleCompletePickup = async () => {
    if (submitting) return
    const items = completeItems.filter(i => parseInt(i.skids_actual) > 0)
    if (items.length === 0) {
      showToast('Set actual skids and grade for at least one item', 'error')
      return
    }
    for (const item of items) {
      if (!item.grade) {
        showToast('Please select a grade for all items', 'error')
        return
      }
    }
    setSubmitting(true)
    try {
      await completePickup(completeTarget.id, items.map(i => ({
        item_id: i.item_id,
        skids_actual: parseInt(i.skids_actual),
        grade: i.grade,
      })))
      showToast('Pickup completed — skids received into warehouse')
      setCompletePickupOpen(false)
      setCompleteTarget(null)
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancelPickup = async (jobId) => {
    try {
      await cancelPickup(jobId)
      showToast('Pickup cancelled')
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    }
  }

  // ── Shipment Handlers ──
  const addShipmentLine = () => {
    setShipmentForm(prev => ({
      ...prev,
      lines: [...prev.lines, { flock_id: '', grade: '', skids: '', price_per_dozen: '' }]
    }))
  }

  const updateShipmentLine = (idx, field, value) => {
    setShipmentForm(prev => ({
      ...prev,
      lines: prev.lines.map((line, i) => i === idx ? { ...line, [field]: value } : line)
    }))
  }

  const removeShipmentLine = (idx) => {
    if (shipmentForm.lines.length <= 1) return
    setShipmentForm(prev => ({
      ...prev,
      lines: prev.lines.filter((_, i) => i !== idx)
    }))
  }

  // Auto-fill buyer and price from contract
  const handleContractSelect = (opt) => {
    const contract = contracts.find(c => c.id === opt?.value)
    setShipmentForm(prev => ({
      ...prev,
      contract_id: opt?.value || '',
      buyer: contract?.buyer || prev.buyer,
      lines: prev.lines.map(line => ({
        ...line,
        grade: contract?.grade || line.grade,
        price_per_dozen: contract?.price_per_dozen || line.price_per_dozen,
      }))
    }))
  }

  const handleCreateShipment = async (e) => {
    e.preventDefault()
    if (submitting) return
    const validLines = shipmentForm.lines.filter(l => l.grade && parseInt(l.skids) > 0)
    if (validLines.length === 0) {
      showToast('Add at least one line with grade and skids', 'error')
      return
    }
    if (!shipmentForm.bol_number.trim()) {
      showToast('BOL number is required', 'error')
      return
    }
    if (!shipmentForm.buyer.trim()) {
      showToast('Buyer is required', 'error')
      return
    }
    setSubmitting(true)
    try {
      await createShipment({
        bol_number: shipmentForm.bol_number,
        contract_id: shipmentForm.contract_id || null,
        ship_date: shipmentForm.ship_date,
        buyer: shipmentForm.buyer,
        carrier: shipmentForm.carrier || null,
        destination: shipmentForm.destination || null,
        notes: shipmentForm.notes || null,
        lines: validLines.map(l => ({
          flock_id: l.flock_id || null,
          grade: l.grade,
          skids: parseInt(l.skids),
          dozens_per_skid: 900,
          price_per_dozen: l.price_per_dozen ? parseFloat(l.price_per_dozen) : null,
        }))
      })
      showToast('Shipment created — inventory deducted')
      setCreateShipmentOpen(false)
      setShipmentForm({
        bol_number: '', contract_id: '', ship_date: new Date().toISOString().split('T')[0],
        buyer: '', carrier: '', destination: '', notes: '',
        lines: [{ flock_id: '', grade: '', skids: '', price_per_dozen: '' }],
      })
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleStatusChange = async (shipmentId, newStatus) => {
    try {
      await updateShipmentStatus(shipmentId, newStatus)
      showToast(`Shipment marked as ${newStatus}`)
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    }
  }

  const statusColors = {
    pending: 'bg-lvf-warning/20 text-lvf-warning',
    completed: 'bg-lvf-success/20 text-lvf-success',
    shipped: 'bg-lvf-accent/20 text-lvf-accent',
    delivered: 'bg-lvf-success/20 text-lvf-success',
    cancelled: 'bg-lvf-danger/20 text-lvf-danger',
  }

  const calcShipmentTotal = () => {
    return shipmentForm.lines.reduce((sum, l) => {
      const skids = parseInt(l.skids) || 0
      const price = parseFloat(l.price_per_dozen) || 0
      return sum + skids * 900 * price
    }, 0)
  }

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Logistics</h2>
        <div className="flex gap-2">
          {tab === 'pickups' && (
            <button onClick={() => setCreatePickupOpen(true)} className="glass-button-primary flex items-center gap-2">
              <Plus size={16} /> Create Pickup Job
            </button>
          )}
          {tab === 'shipments' && (
            <button onClick={() => setCreateShipmentOpen(true)} className="glass-button-primary flex items-center gap-2">
              <Plus size={16} /> Create Shipment
            </button>
          )}
        </div>
      </div>

      {/* Warehouse Summary */}
      {summary.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="glass-card stat-glow p-4">
            <div className="flex items-center gap-2 mb-1">
              <Package size={14} className="text-lvf-accent" />
              <p className="text-xs text-lvf-muted">Warehouse Total</p>
            </div>
            <p className="text-2xl font-bold text-lvf-accent">
              {summary.reduce((s, i) => s + i.total_skids_on_hand, 0).toLocaleString()}
            </p>
            <p className="text-[10px] text-lvf-muted">skids ({summary.reduce((s, i) => s + i.total_dozens, 0).toLocaleString()} doz)</p>
          </div>
          {summary.slice(0, 3).map(s => (
            <div key={s.grade} className="glass-card p-4">
              <p className="text-xs text-lvf-muted">{s.grade_label}</p>
              <p className="text-xl font-bold">{s.total_skids_on_hand}</p>
              <p className="text-[10px] text-lvf-muted">{s.total_dozens.toLocaleString()} doz</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 glass-card w-fit">
        {[
          { id: 'pickups', label: 'Pickup Jobs', icon: Truck },
          { id: 'shipments', label: 'Shipments & BOL', icon: FileText },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              tab === t.id ? 'bg-lvf-accent/20 text-lvf-accent' : 'text-lvf-muted hover:text-lvf-text hover:bg-white/5'
            }`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* Pickup Jobs Tab */}
      {tab === 'pickups' && (
        <div className="glass-card overflow-hidden">
          <table className="w-full glass-table">
            <thead>
              <tr>
                <th>Pickup #</th>
                <th>Date</th>
                <th>Driver</th>
                <th>Barns</th>
                <th className="text-right">Est. Skids</th>
                <th className="text-right">Actual</th>
                <th>Status</th>
                <th className="w-28"></th>
              </tr>
            </thead>
            <tbody>
              {pickups.map(p => (
                <tr key={p.id}>
                  <td className="font-semibold text-lvf-accent">{p.pickup_number}</td>
                  <td className="text-lvf-muted">{p.scheduled_date}</td>
                  <td>{p.driver_name || '—'}</td>
                  <td className="text-xs">{p.items.map(i => i.barn_name).join(', ')}</td>
                  <td className="text-right font-mono">{p.total_estimated_skids}</td>
                  <td className="text-right font-mono font-medium">{p.status === 'completed' ? p.total_actual_skids : '—'}</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[p.status] || ''}`}>
                      {p.status}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      {p.status === 'pending' && (
                        <>
                          <button onClick={() => openComplete(p)} title="Complete Pickup"
                            className="p-1.5 rounded-lg hover:bg-white/10">
                            <CheckCircle size={13} className="text-lvf-success" />
                          </button>
                          <button onClick={() => handleCancelPickup(p.id)} title="Cancel"
                            className="p-1.5 rounded-lg hover:bg-white/10">
                            <XCircle size={13} className="text-lvf-danger" />
                          </button>
                        </>
                      )}
                      <button onClick={() => { setDetailTarget(p); setDetailOpen(true) }} title="View Details"
                        className="p-1.5 rounded-lg hover:bg-white/10">
                        <Eye size={13} className="text-lvf-muted" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {pickups.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-lvf-muted">No pickup jobs yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Shipments Tab */}
      {tab === 'shipments' && (
        <div className="glass-card overflow-hidden">
          <table className="w-full glass-table">
            <thead>
              <tr>
                <th>Shipment #</th>
                <th>BOL</th>
                <th>Date</th>
                <th>Buyer</th>
                <th>Contract</th>
                <th>Carrier</th>
                <th className="text-right">Skids</th>
                <th className="text-right">Dozens</th>
                <th className="text-right">Amount</th>
                <th>Status</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              {shipments.map(s => (
                <tr key={s.id}>
                  <td className="font-semibold text-lvf-accent">{s.shipment_number}</td>
                  <td className="font-mono text-xs">{s.bol_number}</td>
                  <td className="text-lvf-muted">{s.ship_date}</td>
                  <td>{s.buyer}</td>
                  <td className="text-xs text-lvf-muted">{s.contract_number || '—'}</td>
                  <td className="text-xs">{s.carrier || '—'}</td>
                  <td className="text-right font-mono">{s.total_skids}</td>
                  <td className="text-right font-mono text-lvf-muted">{s.total_dozens.toLocaleString()}</td>
                  <td className="text-right font-mono font-medium text-lvf-success">
                    {s.total_amount > 0 ? `$${s.total_amount.toFixed(2)}` : '—'}
                  </td>
                  <td>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[s.status] || ''}`}>
                      {s.status}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      {s.status === 'pending' && (
                        <button onClick={() => handleStatusChange(s.id, 'shipped')} title="Mark Shipped"
                          className="p-1.5 rounded-lg hover:bg-white/10">
                          <Truck size={13} className="text-lvf-accent" />
                        </button>
                      )}
                      {s.status === 'shipped' && (
                        <button onClick={() => handleStatusChange(s.id, 'delivered')} title="Mark Delivered"
                          className="p-1.5 rounded-lg hover:bg-white/10">
                          <CheckCircle size={13} className="text-lvf-success" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {shipments.length === 0 && (
                <tr><td colSpan={11} className="text-center py-8 text-lvf-muted">No shipments yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Pickup Modal */}
      <Modal isOpen={createPickupOpen} onClose={() => setCreatePickupOpen(false)} title="Create Pickup Job" size="lg">
        <form onSubmit={handleCreatePickup} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Scheduled Date *</label>
              <input className="glass-input w-full" type="date" required value={pickupForm.scheduled_date}
                onChange={e => setPickupForm({ ...pickupForm, scheduled_date: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Driver Name</label>
              <input className="glass-input w-full" value={pickupForm.driver_name} placeholder="Driver name"
                onChange={e => setPickupForm({ ...pickupForm, driver_name: e.target.value })} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-lvf-muted">Barn Pickups</label>
              <button type="button" onClick={addPickupItem} className="text-xs text-lvf-accent hover:underline">+ Add Barn</button>
            </div>
            <div className="space-y-2">
              {pickupForm.items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4">
                    <SearchSelect options={barnOptions}
                      value={barnOptions.find(o => o.value === item.barn_id) || null}
                      onChange={(opt) => updatePickupItem(idx, 'barn_id', opt?.value || '')}
                      placeholder="Barn..." />
                  </div>
                  <div className="col-span-4">
                    <SearchSelect options={flockOptions}
                      value={flockOptions.find(o => o.value === item.flock_id) || null}
                      onChange={(opt) => updatePickupItem(idx, 'flock_id', opt?.value || '')}
                      placeholder="Flock..." />
                  </div>
                  <div className="col-span-3">
                    <input className="glass-input w-full" type="number" min="0" value={item.skids_estimated}
                      placeholder="Skids" onChange={e => updatePickupItem(idx, 'skids_estimated', e.target.value)} />
                  </div>
                  <div className="col-span-1">
                    {pickupForm.items.length > 1 && (
                      <button type="button" onClick={() => removePickupItem(idx)}
                        className="p-2 text-lvf-danger hover:bg-white/10 rounded-lg">
                        <XCircle size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-lvf-muted mb-1">Notes</label>
            <textarea className="glass-input w-full" rows={2} value={pickupForm.notes}
              onChange={e => setPickupForm({ ...pickupForm, notes: e.target.value })} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setCreatePickupOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">
              {submitting ? 'Creating...' : 'Create Pickup Job'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Complete Pickup Modal (grade popup) */}
      <Modal isOpen={completePickupOpen} onClose={() => { setCompletePickupOpen(false); setCompleteTarget(null) }}
        title={`Complete Pickup ${completeTarget?.pickup_number || ''}`} size="lg">
        <div className="space-y-4">
          <p className="text-sm text-lvf-muted">Set actual skids picked up and egg grade for each barn. Eggs will be auto-received into the warehouse.</p>
          <div className="space-y-3">
            {completeItems.map((item, idx) => (
              <div key={item.item_id} className="glass-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-medium">{item.barn_name}</p>
                    <p className="text-xs text-lvf-muted">Flock: {item.flock_number} — Est: {item.skids_estimated} skids</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-lvf-muted mb-1">Actual Skids *</label>
                    <input className="glass-input w-full" type="number" min="0" value={item.skids_actual}
                      onChange={e => {
                        const updated = [...completeItems]
                        updated[idx] = { ...updated[idx], skids_actual: e.target.value }
                        setCompleteItems(updated)
                      }} />
                  </div>
                  <div>
                    <label className="block text-xs text-lvf-muted mb-1">Egg Grade *</label>
                    <SearchSelect options={gradeOptions}
                      value={gradeOptions.find(o => o.value === item.grade) || null}
                      onChange={(opt) => {
                        const updated = [...completeItems]
                        updated[idx] = { ...updated[idx], grade: opt?.value || '' }
                        setCompleteItems(updated)
                      }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => { setCompletePickupOpen(false); setCompleteTarget(null) }} className="glass-button-secondary">Cancel</button>
            <button onClick={handleCompletePickup} disabled={submitting} className="glass-button-primary">
              {submitting ? 'Processing...' : 'Complete & Receive'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Create Shipment Modal */}
      <Modal isOpen={createShipmentOpen} onClose={() => setCreateShipmentOpen(false)} title="Create Shipment" size="xl">
        <form onSubmit={handleCreateShipment} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">BOL Number *</label>
              <input className="glass-input w-full" required value={shipmentForm.bol_number} placeholder="e.g. BOL-12345"
                onChange={e => setShipmentForm({ ...shipmentForm, bol_number: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Ship Date *</label>
              <input className="glass-input w-full" type="date" required value={shipmentForm.ship_date}
                onChange={e => setShipmentForm({ ...shipmentForm, ship_date: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Contract</label>
              <SearchSelect options={contractOptions}
                value={contractOptions.find(o => o.value === shipmentForm.contract_id) || null}
                onChange={handleContractSelect}
                placeholder="Optional..." isClearable />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Buyer *</label>
              <input className="glass-input w-full" required value={shipmentForm.buyer}
                onChange={e => setShipmentForm({ ...shipmentForm, buyer: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Carrier</label>
              <input className="glass-input w-full" value={shipmentForm.carrier} placeholder="Trucking company"
                onChange={e => setShipmentForm({ ...shipmentForm, carrier: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Destination</label>
              <input className="glass-input w-full" value={shipmentForm.destination} placeholder="Delivery address"
                onChange={e => setShipmentForm({ ...shipmentForm, destination: e.target.value })} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-lvf-muted">Shipment Lines</label>
              <button type="button" onClick={addShipmentLine} className="text-xs text-lvf-accent hover:underline">+ Add Line</button>
            </div>
            <div className="space-y-2">
              {shipmentForm.lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-3">
                    <SearchSelect options={flockOptions}
                      value={flockOptions.find(o => o.value === line.flock_id) || null}
                      onChange={(opt) => updateShipmentLine(idx, 'flock_id', opt?.value || '')}
                      placeholder="Flock..." isClearable />
                  </div>
                  <div className="col-span-3">
                    <SearchSelect options={gradeOptions}
                      value={gradeOptions.find(o => o.value === line.grade) || null}
                      onChange={(opt) => updateShipmentLine(idx, 'grade', opt?.value || '')}
                      placeholder="Grade..." />
                  </div>
                  <div className="col-span-2">
                    <input className="glass-input w-full" type="number" min="1" value={line.skids}
                      placeholder="Skids" onChange={e => updateShipmentLine(idx, 'skids', e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <input className="glass-input w-full" type="number" step="0.01" min="0" value={line.price_per_dozen}
                      placeholder="$/Doz" onChange={e => updateShipmentLine(idx, 'price_per_dozen', e.target.value)} />
                  </div>
                  <div className="col-span-1 text-right text-xs text-lvf-muted pt-2">
                    {(parseInt(line.skids) || 0) * 900} doz
                  </div>
                  <div className="col-span-1">
                    {shipmentForm.lines.length > 1 && (
                      <button type="button" onClick={() => removeShipmentLine(idx)}
                        className="p-2 text-lvf-danger hover:bg-white/10 rounded-lg">
                        <XCircle size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {calcShipmentTotal() > 0 && (
            <div className="text-right text-sm">
              Total: <span className="text-lg font-bold text-lvf-success">${calcShipmentTotal().toFixed(2)}</span>
            </div>
          )}

          <div>
            <label className="block text-sm text-lvf-muted mb-1">Notes</label>
            <textarea className="glass-input w-full" rows={2} value={shipmentForm.notes}
              onChange={e => setShipmentForm({ ...shipmentForm, notes: e.target.value })} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setCreateShipmentOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">
              {submitting ? 'Creating...' : 'Create Shipment'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Pickup Detail Modal */}
      <Modal isOpen={detailOpen} onClose={() => { setDetailOpen(false); setDetailTarget(null) }}
        title={`Pickup ${detailTarget?.pickup_number || ''}`} size="lg">
        {detailTarget && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-lvf-muted">Date</p>
                <p className="font-medium">{detailTarget.scheduled_date}</p>
              </div>
              <div>
                <p className="text-xs text-lvf-muted">Driver</p>
                <p className="font-medium">{detailTarget.driver_name || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-lvf-muted">Status</p>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[detailTarget.status]}`}>
                  {detailTarget.status}
                </span>
              </div>
            </div>
            <table className="w-full glass-table">
              <thead>
                <tr><th>Barn</th><th>Flock</th><th className="text-right">Estimated</th><th className="text-right">Actual</th><th>Grade</th></tr>
              </thead>
              <tbody>
                {detailTarget.items.map(item => (
                  <tr key={item.id}>
                    <td className="font-medium">{item.barn_name}</td>
                    <td className="text-lvf-accent">{item.flock_number}</td>
                    <td className="text-right font-mono">{item.skids_estimated}</td>
                    <td className="text-right font-mono font-medium">{item.skids_actual ?? '—'}</td>
                    <td>{item.grade_label || item.grade || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {detailTarget.notes && <p className="text-xs text-lvf-muted">{detailTarget.notes}</p>}
          </div>
        )}
      </Modal>
    </div>
  )
}
