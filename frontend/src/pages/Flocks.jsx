import { useState, useEffect } from 'react'
import { Plus, ArrowRightLeft, Skull, Eye, ChevronDown } from 'lucide-react'
import { getFlocks, createFlock, updateFlock, transferFlock, getFlockPlacements, recordMortality } from '../api/flocks'
import { getBarns } from '../api/barns'
import { getGrowers } from '../api/growers'
import { getContracts, assignFlockToContract } from '../api/contracts'
import SearchSelect from '../components/common/SearchSelect'
import Modal from '../components/common/Modal'
import Toast from '../components/common/Toast'
import useToast from '../hooks/useToast'

export default function Flocks() {
  const [flocks, setFlocks] = useState([])
  const [barns, setBarns] = useState([])
  const [contracts, setContracts] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [mortalityOpen, setMortalityOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedFlock, setSelectedFlock] = useState(null)
  const [placements, setPlacements] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  const [createForm, setCreateForm] = useState({
    flock_number: '', breed: '', hatch_date: '', arrival_date: '', initial_bird_count: '', barn_id: '', contract_id: '', notes: ''
  })
  const [transferForm, setTransferForm] = useState({
    source_barn_id: '', destination_barn_id: '', bird_count: '', transfer_date: '', notes: ''
  })
  const [mortalityForm, setMortalityForm] = useState({
    flock_id: '', record_date: '', deaths: 0, culls: 0, cause: '', notes: ''
  })

  const load = async () => {
    const params = statusFilter ? { status: statusFilter } : {}
    const [flocksRes, barnsRes, contractsRes] = await Promise.all([
      getFlocks(params), getBarns(), getContracts({ active_only: true })
    ])
    setFlocks(flocksRes.data)
    setBarns(barnsRes.data)
    setContracts(contractsRes.data)
  }

  useEffect(() => { load() }, [statusFilter])

  const flockOptions = flocks.map(f => ({ value: f.id, label: `${f.flock_number} — ${f.current_bird_count} birds` }))
  const barnOptions = barns.map(b => ({ value: b.id, label: `${b.name} (${b.grower_name}) — ${b.barn_type}` }))

  const filtered = flocks.filter(f =>
    f.flock_number.toLowerCase().includes(search.toLowerCase()) ||
    (f.current_barn || '').toLowerCase().includes(search.toLowerCase()) ||
    (f.current_grower || '').toLowerCase().includes(search.toLowerCase())
  )

  const handleCreate = async (e) => {
    e.preventDefault()
    if (submitting) return
    const birdCount = parseInt(createForm.initial_bird_count)
    if (isNaN(birdCount) || birdCount <= 0) {
      showToast('Initial bird count must be a positive number', 'error')
      return
    }
    if (!createForm.barn_id) {
      showToast('Please select a barn', 'error')
      return
    }
    setSubmitting(true)
    try {
      const contractId = createForm.contract_id
      const res = await createFlock({ ...createForm, initial_bird_count: birdCount })
      // Assign to contract if selected
      if (contractId && res.data?.id) {
        try {
          await assignFlockToContract({ contract_id: contractId, flock_id: res.data.id })
        } catch {}
      }
      showToast('Flock created')
      setCreateOpen(false)
      setCreateForm({ flock_number: '', breed: '', hatch_date: '', arrival_date: '', initial_bird_count: '', barn_id: '', contract_id: '', notes: '' })
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error creating flock', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleTransfer = async (e) => {
    e.preventDefault()
    if (submitting) return
    const birdCount = parseInt(transferForm.bird_count)
    if (isNaN(birdCount) || birdCount <= 0) {
      showToast('Bird count must be a positive number', 'error')
      return
    }
    if (!transferForm.destination_barn_id) {
      showToast('Please select a destination barn', 'error')
      return
    }
    setSubmitting(true)
    try {
      await transferFlock(selectedFlock.id, {
        ...transferForm,
        bird_count: birdCount,
      })
      showToast('Transfer complete')
      setTransferOpen(false)
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Transfer failed', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleMortality = async (e) => {
    e.preventDefault()
    if (submitting) return
    const deaths = parseInt(mortalityForm.deaths) || 0
    const culls = parseInt(mortalityForm.culls) || 0
    if (deaths === 0 && culls === 0) {
      showToast('Must record at least one death or cull', 'error')
      return
    }
    if (!mortalityForm.flock_id) {
      showToast('Please select a flock', 'error')
      return
    }
    setSubmitting(true)
    try {
      await recordMortality({
        ...mortalityForm,
        deaths,
        culls,
      })
      showToast('Mortality recorded')
      setMortalityOpen(false)
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const openTransfer = (flock) => {
    setSelectedFlock(flock)
    setTransferForm({ source_barn_id: flock.current_barn_id || '', destination_barn_id: '', bird_count: flock.current_bird_count, transfer_date: new Date().toISOString().split('T')[0], notes: '' })
    setTransferOpen(true)
  }

  const openDetail = async (flock) => {
    setSelectedFlock(flock)
    const res = await getFlockPlacements(flock.id)
    setPlacements(res.data)
    setDetailOpen(true)
  }

  const openMortality = (flock) => {
    setMortalityForm({ flock_id: flock.id, record_date: new Date().toISOString().split('T')[0], deaths: 0, culls: 0, cause: '', notes: '' })
    setMortalityOpen(true)
  }

  const statusColors = {
    active: 'bg-lvf-success/20 text-lvf-success',
    transferred: 'bg-lvf-accent/20 text-lvf-accent',
    sold: 'bg-lvf-muted/20 text-lvf-muted',
    culled: 'bg-lvf-danger/20 text-lvf-danger',
  }

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Flocks</h2>
        <div className="flex gap-2">
          <button onClick={() => setMortalityOpen(true)} className="glass-button-secondary flex items-center gap-2">
            <Skull size={16} /> Record Mortality
          </button>
          <button onClick={() => setCreateOpen(true)} className="glass-button-primary flex items-center gap-2">
            <Plus size={16} /> New Flock
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text" placeholder="Search flocks..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="glass-input w-64"
        />
        <div className="flex gap-1">
          {['', 'active', 'transferred', 'sold', 'culled'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                statusFilter === s ? 'bg-lvf-accent/20 text-lvf-accent border border-lvf-accent/30' : 'text-lvf-muted hover:text-lvf-text hover:bg-white/5 border border-transparent'
              }`}>
              {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <table className="w-full glass-table">
          <thead>
            <tr>
              <th>Flock #</th>
              <th>Breed</th>
              <th>Arrival</th>
              <th>Initial Birds</th>
              <th>Current Birds</th>
              <th>Barn</th>
              <th>Grower</th>
              <th>Status</th>
              <th className="w-28"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(f => (
              <tr key={f.id}>
                <td className="font-semibold text-lvf-accent">{f.flock_number}</td>
                <td className="text-lvf-muted">{f.breed || '—'}</td>
                <td className="text-lvf-muted">{f.arrival_date}</td>
                <td>{f.initial_bird_count.toLocaleString()}</td>
                <td className="font-medium">{f.current_bird_count.toLocaleString()}</td>
                <td>{f.current_barn || '—'}</td>
                <td className="text-lvf-muted">{f.current_grower || '—'}</td>
                <td>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[f.status] || ''}`}>
                    {f.status}
                  </span>
                </td>
                <td>
                  <div className="flex gap-1">
                    <button onClick={() => openDetail(f)} title="View Details" className="p-1.5 rounded-lg hover:bg-white/10">
                      <Eye size={13} className="text-lvf-muted" />
                    </button>
                    <button onClick={() => openTransfer(f)} title="Transfer" className="p-1.5 rounded-lg hover:bg-white/10">
                      <ArrowRightLeft size={13} className="text-lvf-accent" />
                    </button>
                    <button onClick={() => openMortality(f)} title="Record Mortality" className="p-1.5 rounded-lg hover:bg-white/10">
                      <Skull size={13} className="text-lvf-warning" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="text-center py-8 text-lvf-muted">No flocks found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create Flock Modal */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="New Flock" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Flock Number *</label>
              <input className="glass-input w-full" required value={createForm.flock_number}
                onChange={e => setCreateForm({ ...createForm, flock_number: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Breed</label>
              <input className="glass-input w-full" value={createForm.breed}
                onChange={e => setCreateForm({ ...createForm, breed: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Hatch Date</label>
              <input className="glass-input w-full" type="date" value={createForm.hatch_date}
                onChange={e => setCreateForm({ ...createForm, hatch_date: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Arrival Date *</label>
              <input className="glass-input w-full" type="date" required value={createForm.arrival_date}
                onChange={e => setCreateForm({ ...createForm, arrival_date: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Initial Bird Count *</label>
              <input className="glass-input w-full" type="number" required min="1" value={createForm.initial_bird_count}
                onChange={e => setCreateForm({ ...createForm, initial_bird_count: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Place in Barn *</label>
              <SearchSelect
                options={barnOptions}
                value={barnOptions.find(o => o.value === createForm.barn_id) || null}
                onChange={(opt) => setCreateForm({ ...createForm, barn_id: opt?.value || '' })}
                placeholder="Select barn..."
              />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Assign to Contract</label>
              <SearchSelect
                options={contracts.filter(c => c.is_active && (c.assigned_flocks?.length || 0) < c.num_flocks).map(c => ({
                  value: c.id, label: `${c.contract_number} — ${c.buyer} (${c.assigned_flocks?.length || 0}/${c.num_flocks})`
                }))}
                value={contracts.filter(c => c.id === createForm.contract_id).map(c => ({
                  value: c.id, label: `${c.contract_number} — ${c.buyer}`
                }))[0] || null}
                onChange={(opt) => setCreateForm({ ...createForm, contract_id: opt?.value || '' })}
                placeholder="Optional..."
                isClearable
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Notes</label>
            <textarea className="glass-input w-full" rows={2} value={createForm.notes}
              onChange={e => setCreateForm({ ...createForm, notes: e.target.value })} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">{submitting ? 'Creating...' : 'Create Flock'}</button>
          </div>
        </form>
      </Modal>

      {/* Transfer Modal */}
      <Modal isOpen={transferOpen} onClose={() => setTransferOpen(false)} title={`Transfer Flock ${selectedFlock?.flock_number || ''}`}>
        <form onSubmit={handleTransfer} className="space-y-4">
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Source Barn</label>
            <SearchSelect
              options={barnOptions}
              value={barnOptions.find(o => o.value === transferForm.source_barn_id) || null}
              onChange={(opt) => setTransferForm({ ...transferForm, source_barn_id: opt?.value || '' })}
              placeholder="Select source..."
            />
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Destination Barn</label>
            <SearchSelect
              options={barnOptions.filter(o => o.value !== transferForm.source_barn_id)}
              value={barnOptions.find(o => o.value === transferForm.destination_barn_id) || null}
              onChange={(opt) => setTransferForm({ ...transferForm, destination_barn_id: opt?.value || '' })}
              placeholder="Select destination..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Birds to Transfer</label>
              <input className="glass-input w-full" type="number" required min="1"
                value={transferForm.bird_count}
                onChange={e => setTransferForm({ ...transferForm, bird_count: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Transfer Date</label>
              <input className="glass-input w-full" type="date" required
                value={transferForm.transfer_date}
                onChange={e => setTransferForm({ ...transferForm, transfer_date: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setTransferOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">{submitting ? 'Transferring...' : 'Transfer Birds'}</button>
          </div>
        </form>
      </Modal>

      {/* Mortality Modal */}
      <Modal isOpen={mortalityOpen} onClose={() => setMortalityOpen(false)} title="Record Mortality">
        <form onSubmit={handleMortality} className="space-y-4">
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Flock</label>
            <SearchSelect
              options={flockOptions}
              value={flockOptions.find(o => o.value === mortalityForm.flock_id) || null}
              onChange={(opt) => setMortalityForm({ ...mortalityForm, flock_id: opt?.value || '' })}
              placeholder="Select flock..."
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Date</label>
              <input className="glass-input w-full" type="date" required value={mortalityForm.record_date}
                onChange={e => setMortalityForm({ ...mortalityForm, record_date: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Deaths</label>
              <input className="glass-input w-full" type="number" min="0" value={mortalityForm.deaths}
                onChange={e => setMortalityForm({ ...mortalityForm, deaths: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Culls</label>
              <input className="glass-input w-full" type="number" min="0" value={mortalityForm.culls}
                onChange={e => setMortalityForm({ ...mortalityForm, culls: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Cause</label>
            <input className="glass-input w-full" value={mortalityForm.cause}
              onChange={e => setMortalityForm({ ...mortalityForm, cause: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Notes</label>
            <textarea className="glass-input w-full" rows={2} value={mortalityForm.notes}
              onChange={e => setMortalityForm({ ...mortalityForm, notes: e.target.value })} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setMortalityOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">{submitting ? 'Recording...' : 'Record'}</button>
          </div>
        </form>
      </Modal>

      {/* Flock Detail Modal */}
      <Modal isOpen={detailOpen} onClose={() => setDetailOpen(false)} title={`Flock ${selectedFlock?.flock_number || ''}`} size="lg">
        {selectedFlock && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-lvf-muted">Status</p>
                <p className={`text-sm font-medium mt-1 ${statusColors[selectedFlock.status]?.split(' ')[1] || ''}`}>{selectedFlock.status}</p>
              </div>
              <div>
                <p className="text-xs text-lvf-muted">Current Birds</p>
                <p className="text-sm font-medium mt-1">{selectedFlock.current_bird_count.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-lvf-muted">Initial Birds</p>
                <p className="text-sm font-medium mt-1">{selectedFlock.initial_bird_count.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-lvf-muted">Mortality</p>
                <p className="text-sm font-medium mt-1 text-lvf-danger">
                  {(selectedFlock.initial_bird_count - selectedFlock.current_bird_count).toLocaleString()} ({Math.round(((selectedFlock.initial_bird_count - selectedFlock.current_bird_count) / selectedFlock.initial_bird_count) * 100)}%)
                </p>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-3">Placement History</h4>
              <div className="glass-card overflow-hidden">
                <table className="w-full glass-table">
                  <thead>
                    <tr>
                      <th>Barn</th>
                      <th>Grower</th>
                      <th>Type</th>
                      <th>Birds</th>
                      <th>Placed</th>
                      <th>Removed</th>
                      <th>Current</th>
                    </tr>
                  </thead>
                  <tbody>
                    {placements.map(p => (
                      <tr key={p.id}>
                        <td>{p.barn_name}</td>
                        <td className="text-lvf-muted">{p.grower_name}</td>
                        <td>
                          <span className={`px-2 py-0.5 rounded-full text-xs ${p.barn_type === 'pullet' ? 'bg-purple-500/20 text-purple-400' : 'bg-amber-500/20 text-amber-400'}`}>
                            {p.barn_type}
                          </span>
                        </td>
                        <td>{p.bird_count.toLocaleString()}</td>
                        <td>{p.placed_date}</td>
                        <td>{p.removed_date || '—'}</td>
                        <td>{p.is_current ? <span className="text-lvf-success">Yes</span> : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
