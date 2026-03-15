import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Warehouse } from 'lucide-react'
import { getBarns, createBarn, updateBarn, deleteBarn } from '../api/barns'
import { getGrowers } from '../api/growers'
import SearchSelect from '../components/common/SearchSelect'
import Modal from '../components/common/Modal'
import ConfirmDialog from '../components/common/ConfirmDialog'
import Toast from '../components/common/Toast'
import useToast from '../hooks/useToast'

const emptyForm = { name: '', barn_type: 'pullet', bird_capacity: '', grower_id: '', notes: '' }

export default function Barns() {
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

  const load = async () => {
    const params = {}
    if (filterType) params.barn_type = filterType
    if (filterGrower) params.grower_id = filterGrower.value
    const [barnsRes, growersRes] = await Promise.all([getBarns(params), getGrowers()])
    setBarns(barnsRes.data)
    setGrowers(growersRes.data)
  }

  useEffect(() => { load() }, [filterType, filterGrower])

  const growerOptions = growers.map(g => ({ value: g.id, label: g.name }))

  const filtered = barns.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.grower_name.toLowerCase().includes(search.toLowerCase())
  )

  const openCreate = () => { setEditing(null); setForm(emptyForm); setModalOpen(true) }
  const openEdit = (b) => {
    setEditing(b)
    setForm({ name: b.name, barn_type: b.barn_type, bird_capacity: b.bird_capacity, grower_id: b.grower_id, notes: b.notes || '' })
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
      const payload = { ...form, bird_capacity: cap }
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
                <td className="font-medium">{b.name}</td>
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

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Barn' : 'Add Barn'}>
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
              onChange={(opt) => setForm({ ...form, grower_id: opt?.value || '' })}
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
            <textarea className="glass-input w-full" rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
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
