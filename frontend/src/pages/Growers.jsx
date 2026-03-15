import { useState, useEffect } from 'react'
import {
  Plus, Pencil, Trash2, MapPin, Phone, Mail, Warehouse,
  ChevronDown, ChevronRight, Bird
} from 'lucide-react'
import { getGrowers, createGrower, updateGrower, deleteGrower } from '../api/growers'
import { createBarn, updateBarn, deleteBarn } from '../api/barns'
import Modal from '../components/common/Modal'
import ConfirmDialog from '../components/common/ConfirmDialog'
import Toast from '../components/common/Toast'
import useToast from '../hooks/useToast'

const emptyGrowerForm = { name: '', location: '', contact_name: '', contact_phone: '', contact_email: '', notes: '', barns: [] }
const emptyBarnForm = { name: '', barn_type: 'layer', bird_capacity: '', notes: '' }

export default function Growers() {
  const [growers, setGrowers] = useState([])
  const [growerModalOpen, setGrowerModalOpen] = useState(false)
  const [barnModalOpen, setBarnModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteType, setDeleteType] = useState('grower')
  const [editing, setEditing] = useState(null)
  const [editingBarn, setEditingBarn] = useState(null)
  const [barnGrowerId, setBarnGrowerId] = useState(null)
  const [growerForm, setGrowerForm] = useState(emptyGrowerForm)
  const [barnForm, setBarnForm] = useState(emptyBarnForm)
  const [expandedGrowers, setExpandedGrowers] = useState({})
  const [search, setSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  const load = async () => {
    const res = await getGrowers()
    setGrowers(res.data)
  }

  useEffect(() => { load() }, [])

  const filtered = growers.filter(g =>
    g.name.toLowerCase().includes(search.toLowerCase()) ||
    g.location.toLowerCase().includes(search.toLowerCase()) ||
    (g.contact_name || '').toLowerCase().includes(search.toLowerCase())
  )

  const toggleExpand = (id) => {
    setExpandedGrowers(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const expandAll = () => {
    const all = {}
    growers.forEach(g => { all[g.id] = true })
    setExpandedGrowers(all)
  }

  const collapseAll = () => setExpandedGrowers({})

  // ── Grower CRUD ──
  const openCreateGrower = () => {
    setEditing(null)
    setGrowerForm({ ...emptyGrowerForm, barns: [{ ...emptyBarnForm }] })
    setGrowerModalOpen(true)
  }

  const openEditGrower = (g) => {
    setEditing(g)
    setGrowerForm({
      name: g.name, location: g.location,
      contact_name: g.contact_name || '', contact_phone: g.contact_phone || '',
      contact_email: g.contact_email || '', notes: g.notes || '', barns: []
    })
    setGrowerModalOpen(true)
  }

  const handleGrowerSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      if (editing) {
        const { barns, ...data } = growerForm
        await updateGrower(editing.id, data)
        showToast('Grower updated')
      } else {
        const payload = {
          ...growerForm,
          barns: growerForm.barns
            .filter(b => b.name.trim())
            .map(b => ({ ...b, bird_capacity: parseInt(b.bird_capacity) || 0 }))
        }
        await createGrower(payload)
        showToast('Grower created')
      }
      setGrowerModalOpen(false)
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    } finally { setSubmitting(false) }
  }

  // ── Barn CRUD (within grower context) ──
  const openAddBarn = (growerId) => {
    setBarnGrowerId(growerId)
    setEditingBarn(null)
    setBarnForm(emptyBarnForm)
    setBarnModalOpen(true)
  }

  const openEditBarn = (barn, growerId) => {
    setBarnGrowerId(growerId)
    setEditingBarn(barn)
    setBarnForm({ name: barn.name, barn_type: barn.barn_type, bird_capacity: barn.bird_capacity, notes: barn.notes || '' })
    setBarnModalOpen(true)
  }

  const handleBarnSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    const cap = parseInt(barnForm.bird_capacity)
    if (isNaN(cap) || cap <= 0) return showToast('Capacity must be positive', 'error')
    setSubmitting(true)
    try {
      if (editingBarn) {
        await updateBarn(editingBarn.id, { ...barnForm, bird_capacity: cap, grower_id: barnGrowerId })
        showToast('Barn updated')
      } else {
        await createBarn({ ...barnForm, bird_capacity: cap, grower_id: barnGrowerId })
        showToast('Barn added')
      }
      setBarnModalOpen(false)
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    } finally { setSubmitting(false) }
  }

  // ── Delete ──
  const confirmDeleteGrower = (g) => { setDeleteTarget(g); setDeleteType('grower') }
  const confirmDeleteBarn = (b) => { setDeleteTarget(b); setDeleteType('barn') }

  const handleDelete = async () => {
    try {
      if (deleteType === 'grower') {
        await deleteGrower(deleteTarget.id)
        showToast('Grower deactivated')
      } else {
        await deleteBarn(deleteTarget.id)
        showToast('Barn deleted')
      }
      setDeleteTarget(null)
      load()
    } catch (err) {
      showToast('Error deleting', 'error')
    }
  }

  // ── Inline barn form helpers ──
  const addInlineBarn = () => {
    setGrowerForm({ ...growerForm, barns: [...growerForm.barns, { ...emptyBarnForm }] })
  }
  const removeInlineBarn = (idx) => {
    setGrowerForm({ ...growerForm, barns: growerForm.barns.filter((_, i) => i !== idx) })
  }
  const updateInlineBarn = (idx, field, value) => {
    const barns = [...growerForm.barns]
    barns[idx] = { ...barns[idx], [field]: value }
    setGrowerForm({ ...growerForm, barns })
  }

  const capacityPct = (b) => b.bird_capacity > 0 ? Math.round((b.current_bird_count / b.bird_capacity) * 100) : 0

  const typeColors = {
    pullet: 'bg-purple-500/20 text-purple-400',
    layer: 'bg-amber-500/20 text-amber-400',
  }

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Farm Management</h2>
        <button onClick={openCreateGrower} className="glass-button-primary flex items-center gap-2">
          <Plus size={16} /> Add Grower
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <input type="text" placeholder="Search growers..." value={search}
          onChange={(e) => setSearch(e.target.value)} className="glass-input w-64" />
        <button onClick={expandAll} className="text-xs text-lvf-muted hover:text-lvf-text px-2 py-1">Expand All</button>
        <button onClick={collapseAll} className="text-xs text-lvf-muted hover:text-lvf-text px-2 py-1">Collapse All</button>
      </div>

      <div className="space-y-4">
        {filtered.map(g => (
          <div key={g.id} className="glass-card overflow-hidden">
            {/* Grower Header */}
            <div className="p-5 cursor-pointer" onClick={() => toggleExpand(g.id)}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <button className="text-lvf-muted">
                    {expandedGrowers[g.id] ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </button>
                  <div>
                    <h3 className="text-lg font-semibold">{g.name}</h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-sm text-lvf-muted">
                      <span className="flex items-center gap-1.5"><MapPin size={13} /> {g.location}</span>
                      {g.contact_name && <span>{g.contact_name}</span>}
                      {g.contact_phone && <span className="flex items-center gap-1.5"><Phone size={13} /> {g.contact_phone}</span>}
                      {g.contact_email && <span className="flex items-center gap-1.5"><Mail size={13} /> {g.contact_email}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4" onClick={e => e.stopPropagation()}>
                  <div className="flex gap-4 text-xs text-lvf-muted mr-2">
                    <span><strong className="text-lvf-text">{g.barn_count}</strong> barns</span>
                    <span><strong className="text-lvf-text">{g.total_current_birds?.toLocaleString()}</strong> birds</span>
                    <span>cap: <strong className="text-lvf-text">{g.total_bird_capacity?.toLocaleString()}</strong></span>
                  </div>
                  <button onClick={() => openEditGrower(g)} className="p-1.5 rounded-lg hover:bg-white/10">
                    <Pencil size={14} className="text-lvf-muted" />
                  </button>
                  <button onClick={() => confirmDeleteGrower(g)} className="p-1.5 rounded-lg hover:bg-white/10">
                    <Trash2 size={14} className="text-lvf-danger" />
                  </button>
                </div>
              </div>
            </div>

            {/* Expanded Barns Section */}
            {expandedGrowers[g.id] && (
              <div className="border-t border-lvf-border/50 bg-white/[0.02]">
                <div className="px-5 pt-3 pb-2 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-lvf-muted flex items-center gap-2">
                    <Warehouse size={14} /> Barns
                  </h4>
                  <button onClick={() => openAddBarn(g.id)} className="text-xs text-lvf-accent hover:text-lvf-accent/80 flex items-center gap-1">
                    <Plus size={12} /> Add Barn
                  </button>
                </div>

                {g.barns && g.barns.length > 0 ? (
                  <table className="w-full glass-table">
                    <thead>
                      <tr>
                        <th className="pl-10">Barn Name</th>
                        <th>Type</th>
                        <th>Capacity</th>
                        <th>Current Birds</th>
                        <th>Utilization</th>
                        <th>Current Flock</th>
                        <th className="w-20"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.barns.map(b => (
                        <tr key={b.id}>
                          <td className="pl-10 font-medium">{b.name}</td>
                          <td>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeColors[b.barn_type] || ''}`}>
                              {b.barn_type}
                            </span>
                          </td>
                          <td>{b.bird_capacity.toLocaleString()}</td>
                          <td>{b.current_bird_count.toLocaleString()}</td>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-2 bg-lvf-dark rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    capacityPct(b) > 90 ? 'bg-lvf-danger' : capacityPct(b) > 70 ? 'bg-lvf-warning' : 'bg-lvf-success'
                                  }`}
                                  style={{ width: `${Math.min(capacityPct(b), 100)}%` }}
                                />
                              </div>
                              <span className="text-xs text-lvf-muted">{capacityPct(b)}%</span>
                            </div>
                          </td>
                          <td>
                            {b.current_flock_number ? (
                              <span className="flex items-center gap-1.5 text-sm">
                                <Bird size={12} className="text-lvf-accent" />
                                <span className="text-lvf-accent font-medium">{b.current_flock_number}</span>
                              </span>
                            ) : (
                              <span className="text-lvf-muted text-xs">Empty</span>
                            )}
                          </td>
                          <td>
                            <div className="flex gap-1">
                              <button onClick={() => openEditBarn(b, g.id)} className="p-1.5 rounded-lg hover:bg-white/10">
                                <Pencil size={12} className="text-lvf-muted" />
                              </button>
                              <button onClick={() => confirmDeleteBarn(b)} className="p-1.5 rounded-lg hover:bg-white/10">
                                <Trash2 size={12} className="text-lvf-danger" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="px-10 pb-4 text-sm text-lvf-muted">No barns yet. Click "Add Barn" to get started.</div>
                )}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-lvf-muted">
            No growers found. Add your first grower to get started.
          </div>
        )}
      </div>

      {/* Create/Edit Grower Modal */}
      <Modal isOpen={growerModalOpen} onClose={() => setGrowerModalOpen(false)}
        title={editing ? 'Edit Grower' : 'Add Grower'} size="lg">
        <form onSubmit={handleGrowerSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Farm Name *</label>
              <input className="glass-input w-full" required value={growerForm.name}
                onChange={e => setGrowerForm({ ...growerForm, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Location *</label>
              <input className="glass-input w-full" required value={growerForm.location}
                onChange={e => setGrowerForm({ ...growerForm, location: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Contact Name</label>
              <input className="glass-input w-full" value={growerForm.contact_name}
                onChange={e => setGrowerForm({ ...growerForm, contact_name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Phone</label>
              <input className="glass-input w-full" value={growerForm.contact_phone}
                onChange={e => setGrowerForm({ ...growerForm, contact_phone: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Email</label>
              <input className="glass-input w-full" type="email" value={growerForm.contact_email}
                onChange={e => setGrowerForm({ ...growerForm, contact_email: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Notes</label>
            <textarea className="glass-input w-full" rows={2} value={growerForm.notes}
              onChange={e => setGrowerForm({ ...growerForm, notes: e.target.value })} />
          </div>

          {/* Inline Barns (only for new grower) */}
          {!editing && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold">Barns</label>
                <button type="button" onClick={addInlineBarn} className="text-xs text-lvf-accent hover:text-lvf-accent/80 flex items-center gap-1">
                  <Plus size={12} /> Add Barn
                </button>
              </div>
              <div className="space-y-3">
                {growerForm.barns.map((b, i) => (
                  <div key={i} className="glass-card p-3 flex gap-3 items-end">
                    <div className="flex-1">
                      <label className="block text-xs text-lvf-muted mb-1">Name</label>
                      <input className="glass-input w-full" placeholder="Barn name"
                        value={b.name} onChange={e => updateInlineBarn(i, 'name', e.target.value)} />
                    </div>
                    <div className="w-28">
                      <label className="block text-xs text-lvf-muted mb-1">Type</label>
                      <select className="glass-input w-full" value={b.barn_type}
                        onChange={e => updateInlineBarn(i, 'barn_type', e.target.value)}>
                        <option value="pullet">Pullet</option>
                        <option value="layer">Layer</option>
                      </select>
                    </div>
                    <div className="w-32">
                      <label className="block text-xs text-lvf-muted mb-1">Capacity</label>
                      <input className="glass-input w-full" type="number" min="1" placeholder="Birds"
                        value={b.bird_capacity} onChange={e => updateInlineBarn(i, 'bird_capacity', e.target.value)} />
                    </div>
                    <button type="button" onClick={() => removeInlineBarn(i)}
                      className="p-2 text-lvf-danger hover:bg-lvf-danger/10 rounded-lg">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setGrowerModalOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">
              {submitting ? 'Saving...' : editing ? 'Update' : 'Create Grower'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Add/Edit Barn Modal */}
      <Modal isOpen={barnModalOpen} onClose={() => setBarnModalOpen(false)}
        title={editingBarn ? 'Edit Barn' : 'Add Barn'}>
        <form onSubmit={handleBarnSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Barn Name *</label>
            <input className="glass-input w-full" required value={barnForm.name}
              onChange={e => setBarnForm({ ...barnForm, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Barn Type *</label>
              <select className="glass-input w-full" value={barnForm.barn_type}
                onChange={e => setBarnForm({ ...barnForm, barn_type: e.target.value })}>
                <option value="pullet">Pullet</option>
                <option value="layer">Layer</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Bird Capacity *</label>
              <input className="glass-input w-full" type="number" required min="1"
                value={barnForm.bird_capacity}
                onChange={e => setBarnForm({ ...barnForm, bird_capacity: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Notes</label>
            <textarea className="glass-input w-full" rows={2} value={barnForm.notes}
              onChange={e => setBarnForm({ ...barnForm, notes: e.target.value })} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setBarnModalOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">
              {submitting ? 'Saving...' : editingBarn ? 'Update' : 'Add Barn'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={deleteType === 'grower' ? 'Delete Grower' : 'Delete Barn'}
        message={deleteType === 'grower'
          ? `Are you sure you want to deactivate "${deleteTarget?.name}"? This will deactivate the grower and all associated barns.`
          : `Are you sure you want to delete barn "${deleteTarget?.name}"?`}
      />
    </div>
  )
}
