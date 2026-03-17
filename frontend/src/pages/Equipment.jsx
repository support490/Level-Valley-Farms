import { useState, useEffect } from 'react'
import { Plus, Truck, Link, Unlink, MapPin, Edit2 } from 'lucide-react'
import { getEquipment, createEquipment, updateEquipment, hookTrailer, unhookTrailer, parkTrailer } from '../api/equipment'
import { getBarns } from '../api/barns'
import SearchSelect from '../components/common/SearchSelect'
import Modal from '../components/common/Modal'
import Toast from '../components/common/Toast'
import useToast from '../hooks/useToast'

export default function Equipment() {
  const [tab, setTab] = useState('trucks')
  const [equipment, setEquipment] = useState([])
  const [barns, setBarns] = useState([])
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [hookOpen, setHookOpen] = useState(null)
  const [unhookOpen, setUnhookOpen] = useState(null)
  const [parkOpen, setParkOpen] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  const [form, setForm] = useState({
    name: '', equipment_type: 'truck', capacity_skids: '', weight_limit_lbs: '', license_plate: '', notes: ''
  })
  const [hookTrailerId, setHookTrailerId] = useState('')
  const [parkBarnId, setParkBarnId] = useState('')
  const [unhookBarnId, setUnhookBarnId] = useState('')

  const load = async () => {
    try {
      const [eqRes, barnsRes] = await Promise.all([getEquipment(), getBarns()])
      setEquipment(eqRes.data)
      setBarns(barnsRes.data)
    } catch {
      showToast('Error loading equipment', 'error')
    }
  }

  useEffect(() => { load() }, [])

  const trucks = equipment.filter(e => e.equipment_type === 'truck')
  const trailers = equipment.filter(e => e.equipment_type === 'trailer')
  const availableTrailers = trailers.filter(t => !t.hooked_to_id && t.is_active)

  const barnOptions = barns.map(b => ({ value: b.id, label: b.name }))
  const trailerOptions = availableTrailers.map(t => ({ value: t.id, label: `${t.name} (${t.equipment_number})` }))

  const openCreate = (type) => {
    setForm({ name: '', equipment_type: type, capacity_skids: type === 'trailer' ? '26' : '0', weight_limit_lbs: '', license_plate: '', notes: '' })
    setCreateOpen(true)
  }

  const openEdit = (eq) => {
    setForm({
      name: eq.name, equipment_type: eq.equipment_type,
      capacity_skids: String(eq.capacity_skids), weight_limit_lbs: eq.weight_limit_lbs ? String(eq.weight_limit_lbs) : '',
      license_plate: eq.license_plate || '', notes: eq.notes || '',
    })
    setEditTarget(eq)
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      await createEquipment({
        ...form,
        capacity_skids: parseInt(form.capacity_skids) || 0,
        weight_limit_lbs: form.weight_limit_lbs ? parseFloat(form.weight_limit_lbs) : null,
      })
      showToast(`${form.equipment_type === 'truck' ? 'Truck' : 'Trailer'} created`)
      setCreateOpen(false)
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = async (e) => {
    e.preventDefault()
    if (submitting || !editTarget) return
    setSubmitting(true)
    try {
      await updateEquipment(editTarget.id, {
        name: form.name,
        capacity_skids: parseInt(form.capacity_skids) || 0,
        weight_limit_lbs: form.weight_limit_lbs ? parseFloat(form.weight_limit_lbs) : null,
        license_plate: form.license_plate || null,
        notes: form.notes || null,
      })
      showToast('Equipment updated')
      setEditTarget(null)
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleHook = async () => {
    if (!hookOpen || !hookTrailerId || submitting) return
    setSubmitting(true)
    try {
      await hookTrailer(hookOpen.id, hookTrailerId)
      showToast('Trailer hooked')
      setHookOpen(null)
      setHookTrailerId('')
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUnhook = async () => {
    if (!unhookOpen || submitting) return
    setSubmitting(true)
    try {
      await unhookTrailer(unhookOpen.id, unhookBarnId || null)
      showToast('Trailer unhooked')
      setUnhookOpen(null)
      setUnhookBarnId('')
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handlePark = async () => {
    if (!parkOpen || submitting) return
    setSubmitting(true)
    try {
      await parkTrailer(parkOpen.id, parkBarnId || null)
      showToast(parkBarnId ? 'Trailer parked at barn' : 'Trailer returned to warehouse')
      setParkOpen(null)
      setParkBarnId('')
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleActive = async (eq) => {
    try {
      await updateEquipment(eq.id, { is_active: !eq.is_active })
      showToast(eq.is_active ? 'Equipment deactivated' : 'Equipment activated')
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    }
  }

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Equipment</h2>
        <button onClick={() => openCreate(tab === 'trucks' ? 'truck' : 'trailer')} className="glass-button-primary flex items-center gap-2">
          <Plus size={16} /> Add {tab === 'trucks' ? 'Truck' : 'Trailer'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 glass-card w-fit">
        {[
          { id: 'trucks', label: 'Trucks' },
          { id: 'trailers', label: 'Trailers' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              tab === t.id ? 'bg-lvf-accent/20 text-lvf-accent' : 'text-lvf-muted hover:text-lvf-text hover:bg-white/5'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Trucks Tab */}
      {tab === 'trucks' && (
        <div className="glass-card overflow-hidden">
          <table className="w-full glass-table">
            <thead>
              <tr><th>Name</th><th>#</th><th>Plate</th><th>Hooked Trailer</th><th>Status</th><th className="w-36">Actions</th></tr>
            </thead>
            <tbody>
              {trucks.map(t => (
                <tr key={t.id}>
                  <td className="font-medium">{t.name}</td>
                  <td className="text-lvf-muted font-mono text-xs">{t.equipment_number}</td>
                  <td className="text-lvf-muted">{t.license_plate || '—'}</td>
                  <td>
                    {t.hooked_trailer_name ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-lvf-accent/10 text-lvf-accent">
                        {t.hooked_trailer_name} ({t.hooked_trailer_capacity} skids)
                      </span>
                    ) : (
                      <span className="text-lvf-muted text-xs">None</span>
                    )}
                  </td>
                  <td>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      t.is_active ? 'bg-lvf-success/20 text-lvf-success' : 'bg-lvf-muted/20 text-lvf-muted'
                    }`}>{t.is_active ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-white/10" title="Edit">
                        <Edit2 size={13} className="text-lvf-muted" />
                      </button>
                      {t.hooked_trailer_id ? (
                        <button onClick={() => { setUnhookOpen(t); setUnhookBarnId('') }} className="p-1.5 rounded-lg hover:bg-white/10" title="Unhook trailer">
                          <Unlink size={13} className="text-lvf-warning" />
                        </button>
                      ) : (
                        <button onClick={() => { setHookOpen(t); setHookTrailerId('') }} className="p-1.5 rounded-lg hover:bg-white/10" title="Hook trailer">
                          <Link size={13} className="text-lvf-accent" />
                        </button>
                      )}
                      <button onClick={() => toggleActive(t)} className="p-1.5 rounded-lg hover:bg-white/10 text-xs text-lvf-muted">
                        {t.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {trucks.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-lvf-muted">No trucks. Add one to get started.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Trailers Tab */}
      {tab === 'trailers' && (
        <div className="glass-card overflow-hidden">
          <table className="w-full glass-table">
            <thead>
              <tr><th>Name</th><th>#</th><th>Plate</th><th>Capacity</th><th>Weight Limit</th><th>Location</th><th>Hooked To</th><th>Status</th><th className="w-36">Actions</th></tr>
            </thead>
            <tbody>
              {trailers.map(t => (
                <tr key={t.id}>
                  <td className="font-medium">{t.name}</td>
                  <td className="text-lvf-muted font-mono text-xs">{t.equipment_number}</td>
                  <td className="text-lvf-muted">{t.license_plate || '—'}</td>
                  <td className="font-mono">{t.capacity_skids} skids</td>
                  <td className="text-lvf-muted font-mono text-xs">{t.weight_limit_lbs ? `${t.weight_limit_lbs.toLocaleString()} lbs` : '—'}</td>
                  <td>
                    {t.hooked_to_id ? (
                      <span className="text-xs text-lvf-accent">On truck</span>
                    ) : t.current_barn_name ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-lvf-warning/10 text-lvf-warning">{t.current_barn_name}</span>
                    ) : (
                      <span className="text-xs text-lvf-muted">Warehouse</span>
                    )}
                  </td>
                  <td>
                    {t.hooked_to_name ? (
                      <span className="text-xs text-lvf-accent">{t.hooked_to_name}</span>
                    ) : (
                      <span className="text-lvf-muted text-xs">—</span>
                    )}
                  </td>
                  <td>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      t.is_active ? 'bg-lvf-success/20 text-lvf-success' : 'bg-lvf-muted/20 text-lvf-muted'
                    }`}>{t.is_active ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg hover:bg-white/10" title="Edit">
                        <Edit2 size={13} className="text-lvf-muted" />
                      </button>
                      {!t.hooked_to_id && (
                        <button onClick={() => { setParkOpen(t); setParkBarnId(t.current_barn_id || '') }} className="p-1.5 rounded-lg hover:bg-white/10" title="Park trailer">
                          <MapPin size={13} className="text-lvf-warning" />
                        </button>
                      )}
                      <button onClick={() => toggleActive(t)} className="p-1.5 rounded-lg hover:bg-white/10 text-xs text-lvf-muted">
                        {t.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {trailers.length === 0 && (
                <tr><td colSpan={9} className="text-center py-8 text-lvf-muted">No trailers. Add one to get started.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title={`Add ${form.equipment_type === 'truck' ? 'Truck' : 'Trailer'}`}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Name *</label>
            <input className="glass-input w-full" required value={form.name} placeholder="e.g. Blue Freightliner"
              onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">License Plate</label>
              <input className="glass-input w-full" value={form.license_plate}
                onChange={e => setForm({ ...form, license_plate: e.target.value })} />
            </div>
            {form.equipment_type === 'trailer' && (
              <>
                <div>
                  <label className="block text-sm text-lvf-muted mb-1">Capacity (skids)</label>
                  <input className="glass-input w-full" type="number" min="0" value={form.capacity_skids}
                    onChange={e => setForm({ ...form, capacity_skids: e.target.value })} />
                </div>
              </>
            )}
          </div>
          {form.equipment_type === 'trailer' && (
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Weight Limit (lbs)</label>
              <input className="glass-input w-full" type="number" min="0" step="0.01" value={form.weight_limit_lbs}
                onChange={e => setForm({ ...form, weight_limit_lbs: e.target.value })} />
            </div>
          )}
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Notes</label>
            <textarea className="glass-input w-full" rows={2} value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">{submitting ? 'Creating...' : 'Create'}</button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={!!editTarget} onClose={() => setEditTarget(null)} title={`Edit ${editTarget?.equipment_type === 'truck' ? 'Truck' : 'Trailer'}`}>
        <form onSubmit={handleEdit} className="space-y-4">
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Name *</label>
            <input className="glass-input w-full" required value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">License Plate</label>
              <input className="glass-input w-full" value={form.license_plate}
                onChange={e => setForm({ ...form, license_plate: e.target.value })} />
            </div>
            {editTarget?.equipment_type === 'trailer' && (
              <div>
                <label className="block text-sm text-lvf-muted mb-1">Capacity (skids)</label>
                <input className="glass-input w-full" type="number" min="0" value={form.capacity_skids}
                  onChange={e => setForm({ ...form, capacity_skids: e.target.value })} />
              </div>
            )}
          </div>
          {editTarget?.equipment_type === 'trailer' && (
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Weight Limit (lbs)</label>
              <input className="glass-input w-full" type="number" min="0" step="0.01" value={form.weight_limit_lbs}
                onChange={e => setForm({ ...form, weight_limit_lbs: e.target.value })} />
            </div>
          )}
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Notes</label>
            <textarea className="glass-input w-full" rows={2} value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setEditTarget(null)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">{submitting ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      {/* Hook Trailer Modal */}
      <Modal isOpen={!!hookOpen} onClose={() => setHookOpen(null)} title="Hook Trailer" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-lvf-muted">Select a trailer to hook to <span className="text-lvf-accent font-medium">{hookOpen?.name}</span></p>
          <SearchSelect options={trailerOptions}
            value={trailerOptions.find(o => o.value === hookTrailerId) || null}
            onChange={(opt) => setHookTrailerId(opt?.value || '')}
            placeholder="Select trailer..." />
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setHookOpen(null)} className="glass-button-secondary">Cancel</button>
            <button onClick={handleHook} disabled={!hookTrailerId || submitting} className="glass-button-primary">
              {submitting ? 'Hooking...' : 'Hook'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Unhook Trailer Modal */}
      <Modal isOpen={!!unhookOpen} onClose={() => setUnhookOpen(null)} title="Unhook Trailer" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-lvf-muted">
            Unhook <span className="text-lvf-accent font-medium">{unhookOpen?.hooked_trailer_name}</span> from <span className="font-medium">{unhookOpen?.name}</span>
          </p>
          <div>
            <label className="block text-xs text-lvf-muted mb-1">Park at barn (optional)</label>
            <SearchSelect options={[{ value: '', label: 'Warehouse (default)' }, ...barnOptions]}
              value={barnOptions.find(o => o.value === unhookBarnId) || { value: '', label: 'Warehouse (default)' }}
              onChange={(opt) => setUnhookBarnId(opt?.value || '')}
              placeholder="Warehouse" />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setUnhookOpen(null)} className="glass-button-secondary">Cancel</button>
            <button onClick={handleUnhook} disabled={submitting} className="glass-button-primary">
              {submitting ? 'Unhooking...' : 'Unhook'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Park Trailer Modal */}
      <Modal isOpen={!!parkOpen} onClose={() => setParkOpen(null)} title="Park Trailer" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-lvf-muted">Move <span className="text-lvf-accent font-medium">{parkOpen?.name}</span> to a barn or warehouse</p>
          <SearchSelect options={[{ value: '', label: 'Warehouse' }, ...barnOptions]}
            value={barnOptions.find(o => o.value === parkBarnId) || { value: '', label: 'Warehouse' }}
            onChange={(opt) => setParkBarnId(opt?.value || '')}
            placeholder="Select location..." />
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setParkOpen(null)} className="glass-button-secondary">Cancel</button>
            <button onClick={handlePark} disabled={submitting} className="glass-button-primary">
              {submitting ? 'Moving...' : 'Move'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
