import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, MapPin, Phone, Mail } from 'lucide-react'
import { getGrowers, createGrower, updateGrower, deleteGrower } from '../api/growers'
import Modal from '../components/common/Modal'
import ConfirmDialog from '../components/common/ConfirmDialog'
import Toast from '../components/common/Toast'
import useToast from '../hooks/useToast'

const emptyForm = { name: '', location: '', contact_name: '', contact_phone: '', contact_email: '', notes: '' }

export default function Growers() {
  const [growers, setGrowers] = useState([])
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
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
    g.location.toLowerCase().includes(search.toLowerCase())
  )

  const openCreate = () => { setEditing(null); setForm(emptyForm); setModalOpen(true) }
  const openEdit = (g) => {
    setEditing(g)
    setForm({ name: g.name, location: g.location, contact_name: g.contact_name || '', contact_phone: g.contact_phone || '', contact_email: g.contact_email || '', notes: g.notes || '' })
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      if (editing) {
        await updateGrower(editing.id, form)
        showToast('Grower updated')
      } else {
        await createGrower(form)
        showToast('Grower created')
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
      await deleteGrower(deleteTarget.id)
      showToast('Grower deleted')
      setDeleteTarget(null)
      load()
    } catch (err) {
      showToast('Error deleting grower', 'error')
    }
  }

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Growers</h2>
        <button onClick={openCreate} className="glass-button-primary flex items-center gap-2">
          <Plus size={16} /> Add Grower
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search growers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="glass-input w-full max-w-sm"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(g => (
          <div key={g.id} className="glass-card p-5">
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-lg font-semibold">{g.name}</h3>
              <div className="flex gap-1">
                <button onClick={() => openEdit(g)} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                  <Pencil size={14} className="text-lvf-muted" />
                </button>
                <button onClick={() => setDeleteTarget(g)} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                  <Trash2 size={14} className="text-lvf-danger" />
                </button>
              </div>
            </div>
            <div className="space-y-1.5 text-sm text-lvf-muted">
              <p className="flex items-center gap-2"><MapPin size={13} /> {g.location}</p>
              {g.contact_name && <p className="flex items-center gap-2"><span className="w-[13px]" />{g.contact_name}</p>}
              {g.contact_phone && <p className="flex items-center gap-2"><Phone size={13} /> {g.contact_phone}</p>}
              {g.contact_email && <p className="flex items-center gap-2"><Mail size={13} /> {g.contact_email}</p>}
            </div>
            <div className="flex gap-4 mt-4 pt-3 border-t border-lvf-border/50 text-xs text-lvf-muted">
              <span><strong className="text-lvf-text">{g.barn_count}</strong> barns</span>
              <span><strong className="text-lvf-text">{g.total_current_birds?.toLocaleString()}</strong> birds</span>
              <span>cap: <strong className="text-lvf-text">{g.total_bird_capacity?.toLocaleString()}</strong></span>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-12 text-lvf-muted">
            No growers found. Add your first grower to get started.
          </div>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Grower' : 'Add Grower'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Farm Name *</label>
            <input className="glass-input w-full" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Location *</label>
            <input className="glass-input w-full" required value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Contact Name</label>
              <input className="glass-input w-full" value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Phone</label>
              <input className="glass-input w-full" value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Email</label>
            <input className="glass-input w-full" type="email" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} />
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
        title="Delete Grower"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This will deactivate the grower and all associated barns.`}
      />
    </div>
  )
}
