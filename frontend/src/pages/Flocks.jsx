import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ArrowRightLeft, Skull, Eye, Scissors, DollarSign, ShoppingCart, PackageX, List, LayoutGrid } from 'lucide-react'
import {
  getFlocks, createFlock, updateFlock, transferFlock, getFlockPlacements,
  recordMortality, splitFlock, sellPullets, purchaseOutside, initiateCloseout,
  getCloseoutStatus, updateCloseoutInventory
} from '../api/flocks'
import { getBarns } from '../api/barns'
import { getGrowers } from '../api/growers'
import { getContracts, assignFlockToContract } from '../api/contracts'
import SearchSelect from '../components/common/SearchSelect'
import Modal from '../components/common/Modal'
import Toast from '../components/common/Toast'
import useToast from '../hooks/useToast'

export default function Flocks() {
  const navigate = useNavigate()
  const [flocks, setFlocks] = useState([])
  const [barns, setBarns] = useState([])
  const [growers, setGrowers] = useState([])
  const [contracts, setContracts] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [viewMode, setViewMode] = useState('barn')
  const [createOpen, setCreateOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [splitOpen, setSplitOpen] = useState(false)
  const [sellOpen, setSellOpen] = useState(false)
  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const [closeoutOpen, setCloseoutOpen] = useState(false)
  const [mortalityOpen, setMortalityOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedFlock, setSelectedFlock] = useState(null)
  const [placements, setPlacements] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  const emptyCreate = {
    flock_type: 'pullet', bird_color: 'brown', source_type: 'hatched',
    breed: '', hatch_date: '', arrival_date: '', initial_bird_count: '',
    barn_id: '', cost_per_bird: '', contract_id: '', notes: ''
  }
  const [createForm, setCreateForm] = useState(emptyCreate)
  const [transferForm, setTransferForm] = useState({
    source_barn_id: '', destination_barn_id: '', bird_count: '', transfer_date: '', notes: ''
  })
  const [splitForm, setSplitForm] = useState({
    destination_barn_id: '', bird_count: '', transfer_date: '', layer_flock_number: '', notes: ''
  })
  const [sellForm, setSellForm] = useState({
    bird_count: '', price_per_bird: '', sale_date: '', buyer: '', notes: ''
  })
  const [purchaseForm, setPurchaseForm] = useState({
    bird_color: 'brown', breed: '', hatch_date: '', arrival_date: '',
    bird_count: '', cost_per_bird: '', barn_id: '', flock_number: '', notes: ''
  })
  const [closeoutForm, setCloseoutForm] = useState({
    skids_remaining: 0, cases_remaining: 0, closeout_date: '', notes: ''
  })
  const [mortalityForm, setMortalityForm] = useState({
    flock_id: '', record_date: '', deaths: 0, culls: 0, cause: '', notes: ''
  })

  const load = async () => {
    const params = {}
    if (statusFilter) params.status = statusFilter
    if (typeFilter) params.flock_type = typeFilter
    const [flocksRes, barnsRes, growersRes, contractsRes] = await Promise.all([
      getFlocks(params), getBarns(), getGrowers(), getContracts({ active_only: true })
    ])
    setFlocks(flocksRes.data)
    setBarns(barnsRes.data)
    setGrowers(growersRes.data)
    setContracts(contractsRes.data)
  }

  useEffect(() => { load() }, [statusFilter, typeFilter])

  const flockOptions = flocks.map(f => ({ value: f.id, label: `${f.flock_number} — ${f.current_bird_count} birds` }))
  const pulletBarnOptions = barns.filter(b => b.barn_type === 'pullet').map(b => ({
    value: b.id, label: `${b.name} (${b.grower_name}) — Pullet — ${b.current_bird_count}/${b.bird_capacity}`
  }))
  const layerBarnOptions = barns.filter(b => b.barn_type === 'layer').map(b => ({
    value: b.id, label: `${b.name} (${b.grower_name}) — Layer — ${b.current_bird_count}/${b.bird_capacity}`
  }))
  const allBarnOptions = barns.map(b => ({
    value: b.id, label: `${b.name} (${b.grower_name}) — ${b.barn_type} — ${b.current_bird_count}/${b.bird_capacity}`
  }))

  const barnOptionsForType = (type) => type === 'pullet' ? pulletBarnOptions : type === 'layer' ? layerBarnOptions : allBarnOptions

  const filtered = flocks.filter(f =>
    f.flock_number.toLowerCase().includes(search.toLowerCase()) ||
    (f.current_barn || '').toLowerCase().includes(search.toLowerCase()) ||
    (f.current_grower || '').toLowerCase().includes(search.toLowerCase()) ||
    (f.breed || '').toLowerCase().includes(search.toLowerCase())
  )

  // Group filtered flocks by grower for barn view
  const growerGroups = filtered.reduce((acc, f) => {
    const key = f.current_grower || 'Unassigned'
    ;(acc[key] = acc[key] || []).push(f)
    return acc
  }, {})

  // ── Handlers ──

  const handleCreate = async (e) => {
    e.preventDefault()
    if (submitting) return
    const birdCount = parseInt(createForm.initial_bird_count)
    if (isNaN(birdCount) || birdCount <= 0) return showToast('Bird count required', 'error')
    if (!createForm.barn_id) return showToast('Select a barn', 'error')
    setSubmitting(true)
    try {
      const contractId = createForm.contract_id
      const payload = {
        ...createForm,
        initial_bird_count: birdCount,
        cost_per_bird: createForm.cost_per_bird ? parseFloat(createForm.cost_per_bird) : undefined,
      }
      delete payload.contract_id
      const res = await createFlock(payload)
      if (contractId && res.data?.id) {
        try { await assignFlockToContract({ contract_id: contractId, flock_id: res.data.id }) } catch {}
      }
      showToast('Flock created')
      setCreateOpen(false)
      setCreateForm(emptyCreate)
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error creating flock', 'error')
    } finally { setSubmitting(false) }
  }

  const handleTransfer = async (e) => {
    e.preventDefault()
    if (submitting) return
    const birdCount = parseInt(transferForm.bird_count)
    if (isNaN(birdCount) || birdCount <= 0) return showToast('Bird count required', 'error')
    if (!transferForm.destination_barn_id) return showToast('Select destination', 'error')
    setSubmitting(true)
    try {
      await transferFlock(selectedFlock.id, { ...transferForm, bird_count: birdCount })
      showToast('Transfer complete')
      setTransferOpen(false)
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Transfer failed', 'error')
    } finally { setSubmitting(false) }
  }

  const handleSplit = async (e) => {
    e.preventDefault()
    if (submitting) return
    const birdCount = parseInt(splitForm.bird_count)
    if (isNaN(birdCount) || birdCount <= 0) return showToast('Bird count required', 'error')
    if (!splitForm.destination_barn_id) return showToast('Select a layer barn', 'error')
    setSubmitting(true)
    try {
      const res = await splitFlock(selectedFlock.id, { ...splitForm, bird_count: birdCount })
      showToast(`Split ${birdCount.toLocaleString()} birds → ${res.data.layer_flock_number}`)
      setSplitOpen(false)
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Split failed', 'error')
    } finally { setSubmitting(false) }
  }

  const handleSellPullets = async (e) => {
    e.preventDefault()
    if (submitting) return
    const birdCount = parseInt(sellForm.bird_count)
    const price = parseFloat(sellForm.price_per_bird)
    if (isNaN(birdCount) || birdCount <= 0) return showToast('Bird count required', 'error')
    if (isNaN(price) || price <= 0) return showToast('Price per bird required', 'error')
    if (!sellForm.buyer) return showToast('Buyer required', 'error')
    setSubmitting(true)
    try {
      const res = await sellPullets(selectedFlock.id, { ...sellForm, bird_count: birdCount, price_per_bird: price })
      showToast(res.data.message)
      setSellOpen(false)
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Sale failed', 'error')
    } finally { setSubmitting(false) }
  }

  const handlePurchase = async (e) => {
    e.preventDefault()
    if (submitting) return
    const birdCount = parseInt(purchaseForm.bird_count)
    const cost = parseFloat(purchaseForm.cost_per_bird)
    if (isNaN(birdCount) || birdCount <= 0) return showToast('Bird count required', 'error')
    if (isNaN(cost) || cost <= 0) return showToast('Cost per bird required', 'error')
    if (!purchaseForm.barn_id) return showToast('Select a barn', 'error')
    setSubmitting(true)
    try {
      await purchaseOutside({ ...purchaseForm, bird_count: birdCount, cost_per_bird: cost })
      showToast('Outside pullets purchased')
      setPurchaseOpen(false)
      setPurchaseForm({ bird_color: 'brown', breed: '', hatch_date: '', arrival_date: '', bird_count: '', cost_per_bird: '', barn_id: '', flock_number: '', notes: '' })
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Purchase failed', 'error')
    } finally { setSubmitting(false) }
  }

  const handleCloseout = async (e) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      await initiateCloseout(selectedFlock.id, {
        ...closeoutForm,
        skids_remaining: parseInt(closeoutForm.skids_remaining) || 0,
        cases_remaining: parseInt(closeoutForm.cases_remaining) || 0,
      })
      showToast(`Closeout initiated for ${selectedFlock.flock_number}`)
      setCloseoutOpen(false)
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Closeout failed', 'error')
    } finally { setSubmitting(false) }
  }

  const handleMortality = async (e) => {
    e.preventDefault()
    if (submitting) return
    const deaths = parseInt(mortalityForm.deaths) || 0
    const culls = parseInt(mortalityForm.culls) || 0
    if (deaths === 0 && culls === 0) return showToast('Must record at least one death or cull', 'error')
    if (!mortalityForm.flock_id) return showToast('Select a flock', 'error')
    setSubmitting(true)
    try {
      await recordMortality({ ...mortalityForm, deaths, culls })
      showToast('Mortality recorded')
      setMortalityOpen(false)
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    } finally { setSubmitting(false) }
  }

  // ── Openers ──

  const openTransfer = (flock) => {
    setSelectedFlock(flock)
    setTransferForm({ source_barn_id: flock.current_barn_id || '', destination_barn_id: '', bird_count: flock.current_bird_count, transfer_date: new Date().toISOString().split('T')[0], notes: '' })
    setTransferOpen(true)
  }

  const openSplit = (flock) => {
    setSelectedFlock(flock)
    setSplitForm({ destination_barn_id: '', bird_count: '', transfer_date: new Date().toISOString().split('T')[0], layer_flock_number: '', notes: '' })
    setSplitOpen(true)
  }

  const openSell = (flock) => {
    setSelectedFlock(flock)
    setSellForm({ bird_count: '', price_per_bird: '', sale_date: new Date().toISOString().split('T')[0], buyer: '', notes: '' })
    setSellOpen(true)
  }

  const openCloseout = (flock) => {
    setSelectedFlock(flock)
    setCloseoutForm({ skids_remaining: 0, cases_remaining: 0, closeout_date: new Date().toISOString().split('T')[0], notes: '' })
    setCloseoutOpen(true)
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
    closing: 'bg-lvf-warning/20 text-lvf-warning',
    sold: 'bg-lvf-muted/20 text-lvf-muted',
    culled: 'bg-lvf-danger/20 text-lvf-danger',
  }

  const typeColors = {
    pullet: 'bg-purple-500/20 text-purple-400',
    layer: 'bg-amber-500/20 text-amber-400',
  }

  // Action buttons for a flock (reused in both views)
  const FlockActions = ({ f, size = 13 }) => (
    <div className="flex gap-1">
      <button onClick={(e) => { e.stopPropagation(); openDetail(f) }} title="View Details" className="p-1.5 rounded-lg hover:bg-white/10">
        <Eye size={size} className="text-lvf-muted" />
      </button>
      {f.flock_type === 'pullet' && f.status === 'active' && (
        <>
          <button onClick={(e) => { e.stopPropagation(); openSplit(f) }} title="Split to Layer" className="p-1.5 rounded-lg hover:bg-white/10">
            <Scissors size={size} className="text-purple-400" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); openSell(f) }} title="Sell Pullets" className="p-1.5 rounded-lg hover:bg-white/10">
            <DollarSign size={size} className="text-lvf-success" />
          </button>
        </>
      )}
      {f.flock_type === 'layer' && f.status === 'active' && (
        <button onClick={(e) => { e.stopPropagation(); openCloseout(f) }} title="Closeout Flock" className="p-1.5 rounded-lg hover:bg-white/10">
          <PackageX size={size} className="text-lvf-warning" />
        </button>
      )}
      {f.status === 'active' && (
        <button onClick={(e) => { e.stopPropagation(); openTransfer(f) }} title="Transfer" className="p-1.5 rounded-lg hover:bg-white/10">
          <ArrowRightLeft size={size} className="text-lvf-accent" />
        </button>
      )}
      {!['sold', 'culled'].includes(f.status) && (
        <button onClick={(e) => { e.stopPropagation(); openMortality(f) }} title="Record Mortality" className="p-1.5 rounded-lg hover:bg-white/10">
          <Skull size={size} className="text-lvf-warning" />
        </button>
      )}
    </div>
  )

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Flocks</h2>
        <div className="flex gap-2">
          <button onClick={() => setMortalityOpen(true)} className="glass-button-secondary flex items-center gap-2">
            <Skull size={16} /> Mortality
          </button>
          <button onClick={() => setPurchaseOpen(true)} className="glass-button-secondary flex items-center gap-2">
            <ShoppingCart size={16} /> Buy Pullets
          </button>
          <button onClick={() => setCreateOpen(true)} className="glass-button-primary flex items-center gap-2">
            <Plus size={16} /> New Flock
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <input
          type="text" placeholder="Search flocks..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="glass-input w-64"
        />
        <div className="flex gap-1">
          {['', 'pullet', 'layer'].map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                typeFilter === t ? 'bg-lvf-accent/20 text-lvf-accent border border-lvf-accent/30' : 'text-lvf-muted hover:text-lvf-text hover:bg-white/5 border border-transparent'
              }`}>
              {t === '' ? 'All Types' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {['', 'active', 'closing', 'transferred', 'sold', 'culled'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                statusFilter === s ? 'bg-lvf-accent/20 text-lvf-accent border border-lvf-accent/30' : 'text-lvf-muted hover:text-lvf-text hover:bg-white/5 border border-transparent'
              }`}>
              {s === '' ? 'All Status' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-1 glass-card p-1">
          <button onClick={() => setViewMode('barn')}
            className={`p-2 rounded-lg transition-colors ${viewMode === 'barn' ? 'bg-lvf-accent/20 text-lvf-accent' : 'text-lvf-muted hover:text-lvf-text'}`}
            title="Barn View">
            <LayoutGrid size={16} />
          </button>
          <button onClick={() => setViewMode('list')}
            className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-lvf-accent/20 text-lvf-accent' : 'text-lvf-muted hover:text-lvf-text'}`}
            title="List View">
            <List size={16} />
          </button>
        </div>
      </div>

      {/* ── Barn View ── */}
      {viewMode === 'barn' && (
        <div className="space-y-8">
          {Object.entries(growerGroups).length > 0 ? Object.entries(growerGroups).map(([growerName, growerFlocks]) => (
            <div key={growerName}>
              <h3 className="text-sm font-semibold text-lvf-muted uppercase tracking-wider mb-3">{growerName}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {growerFlocks.map(f => (
                  <div key={f.id} className="barn-building" onClick={() => navigate(`/flocks/${f.id}`)}>
                    {/* Roof */}
                    <div className="barn-roof">
                      <p className="barn-grower-name">{f.current_barn || growerName}</p>
                    </div>
                    {/* Body */}
                    <div className="barn-body relative pb-10">
                      {/* Flock header */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-lvf-accent cursor-pointer hover:underline"
                          onClick={(e) => { e.stopPropagation(); navigate(`/flocks/${f.id}`) }}>
                          {f.flock_number}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${typeColors[f.flock_type] || ''}`}>
                            {f.flock_type}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${statusColors[f.status] || ''}`}>
                            {f.status}
                          </span>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div className="pallet-box">
                          <p className="text-lg font-bold leading-tight">{f.current_bird_count.toLocaleString()}</p>
                          <p className="text-[10px] text-lvf-muted">birds</p>
                          <p className="text-[9px] text-lvf-muted">/ {f.initial_bird_count.toLocaleString()}</p>
                        </div>
                        <div className="pallet-box">
                          <p className="text-sm font-medium leading-tight">{f.breed || '—'}</p>
                          <p className="text-[10px] text-lvf-muted">{f.bird_color || ''}</p>
                          <p className="text-[9px] text-lvf-muted">{f.hatch_date || 'no hatch'}</p>
                        </div>
                      </div>

                      {/* Derived operational data */}
                      <div className="grid grid-cols-3 gap-1 mb-2 text-center">
                        {f.flock_age_weeks != null && (
                          <div className="text-[10px]">
                            <p className="font-semibold">{f.flock_age_weeks}wk</p>
                            <p className="text-lvf-muted">{f.months_laying != null && f.months_laying > 0 ? `${f.months_laying}mo laying` : 'age'}</p>
                          </div>
                        )}
                        {f.current_production_pct != null && (
                          <div className="text-[10px]">
                            <p className={`font-semibold ${
                              f.current_production_pct >= 80 ? 'text-lvf-success' :
                              f.current_production_pct >= 60 ? 'text-lvf-warning' : 'text-lvf-danger'
                            }`}>{f.current_production_pct}%</p>
                            <p className="text-lvf-muted">production</p>
                          </div>
                        )}
                        {f.total_mortality != null && f.total_mortality > 0 && (
                          <div className="text-[10px]">
                            <p className="font-semibold text-lvf-danger">{f.total_mortality}</p>
                            <p className="text-lvf-muted">{f.mortality_pct}% mort</p>
                          </div>
                        )}
                      </div>

                      {(parseFloat(f.cost_per_bird) > 0 || f.bird_weight) && (
                        <div className="flex items-center gap-2 text-xs text-lvf-muted mb-2">
                          {parseFloat(f.cost_per_bird) > 0 && <span>${parseFloat(f.cost_per_bird).toFixed(2)}/bird</span>}
                          {f.bird_weight && <span>{f.bird_weight} lbs</span>}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="mt-1">
                        <FlockActions f={f} />
                      </div>

                      {/* Door */}
                      <div className="barn-door" />
                    </div>
                    {/* Floor */}
                    <div className="barn-floor" />
                  </div>
                ))}
              </div>
            </div>
          )) : (
            <div className="glass-card p-12 text-center text-lvf-muted">No flocks found.</div>
          )}
        </div>
      )}

      {/* ── List View ── */}
      {viewMode === 'list' && (
        <div className="glass-card overflow-hidden">
          <table className="w-full glass-table">
            <thead>
              <tr>
                <th>Flock #</th>
                <th>Type</th>
                <th>Breed</th>
                <th>Hatch</th>
                <th>Birds</th>
                <th>Age</th>
                <th>Prod %</th>
                <th>Mortality</th>
                <th>$/Bird</th>
                <th>Barn</th>
                <th>Status</th>
                <th className="w-36"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(f => (
                <tr key={f.id}>
                  <td className="font-semibold text-lvf-accent cursor-pointer hover:underline"
                      onClick={() => navigate(`/flocks/${f.id}`)}>{f.flock_number}</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeColors[f.flock_type] || ''}`}>
                      {f.flock_type}
                    </span>
                  </td>
                  <td className="text-lvf-muted">{f.breed || '—'}</td>
                  <td className="text-lvf-muted">{f.hatch_date || '—'}</td>
                  <td className="font-medium">
                    {f.current_bird_count.toLocaleString()}
                    <span className="text-lvf-muted text-xs ml-1">/ {f.initial_bird_count.toLocaleString()}</span>
                  </td>
                  <td className="text-lvf-muted text-xs">
                    {f.flock_age_weeks != null ? `${f.flock_age_weeks}wk` : '—'}
                  </td>
                  <td>
                    {f.current_production_pct != null ? (
                      <span className={`text-xs font-medium ${
                        f.current_production_pct >= 80 ? 'text-lvf-success' :
                        f.current_production_pct >= 60 ? 'text-lvf-warning' : 'text-lvf-danger'
                      }`}>{f.current_production_pct}%</span>
                    ) : '—'}
                  </td>
                  <td className="text-xs">
                    {f.total_mortality > 0 ? (
                      <span className="text-lvf-danger">{f.total_mortality} ({f.mortality_pct}%)</span>
                    ) : '—'}
                  </td>
                  <td className="text-lvf-muted">
                    {parseFloat(f.cost_per_bird) > 0 ? `$${parseFloat(f.cost_per_bird).toFixed(2)}` : '—'}
                  </td>
                  <td>{f.current_barn || '—'}</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[f.status] || ''}`}>
                      {f.status}
                    </span>
                  </td>
                  <td><FlockActions f={f} /></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={12} className="text-center py-8 text-lvf-muted">No flocks found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Create Flock Modal ── */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="New Flock" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Flock Type *</label>
              <select className="glass-input w-full" value={createForm.flock_type}
                onChange={e => setCreateForm({ ...createForm, flock_type: e.target.value, barn_id: '' })}>
                <option value="pullet">Pullet</option>
                <option value="layer">Layer</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Bird Color *</label>
              <select className="glass-input w-full" value={createForm.bird_color}
                onChange={e => setCreateForm({ ...createForm, bird_color: e.target.value })}>
                <option value="brown">Brown</option>
                <option value="white">White</option>
              </select>
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
              <label className="block text-sm text-lvf-muted mb-1">
                Place in {createForm.flock_type === 'pullet' ? 'Pullet' : 'Layer'} Barn *
              </label>
              <SearchSelect
                options={barnOptionsForType(createForm.flock_type)}
                value={barnOptionsForType(createForm.flock_type).find(o => o.value === createForm.barn_id) || null}
                onChange={(opt) => setCreateForm({ ...createForm, barn_id: opt?.value || '' })}
                placeholder={`Select ${createForm.flock_type} barn...`}
              />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Cost per Bird</label>
              <input className="glass-input w-full" type="number" step="0.01" min="0"
                placeholder="e.g. 5.50" value={createForm.cost_per_bird}
                onChange={e => setCreateForm({ ...createForm, cost_per_bird: e.target.value })} />
            </div>
          </div>
          <p className="text-xs text-lvf-muted">
            Flock ID will be auto-generated: <span className="text-lvf-accent font-mono">
              {createForm.bird_color === 'brown' ? 'B' : 'W'}{createForm.flock_type === 'pullet' ? 'P' : 'L'}
              xx{createForm.hatch_date ? createForm.hatch_date.replace(/-/g, '').slice(4) + createForm.hatch_date.slice(2, 4) : 'MMDDYY'}
            </span>
          </p>
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

      {/* ── Split Flock Modal ── */}
      <Modal isOpen={splitOpen} onClose={() => setSplitOpen(false)} title={`Split Pullet Flock ${selectedFlock?.flock_number || ''}`} size="lg">
        {selectedFlock && (
          <form onSubmit={handleSplit} className="space-y-4">
            <div className="glass-card p-3 bg-purple-500/10 border-purple-500/20">
              <p className="text-sm">
                <span className="text-purple-400 font-semibold">{selectedFlock.flock_number}</span>
                {' — '}{selectedFlock.current_bird_count.toLocaleString()} birds remaining
                {parseFloat(selectedFlock.cost_per_bird) > 0 && (
                  <span className="text-lvf-muted ml-2">@ ${parseFloat(selectedFlock.cost_per_bird).toFixed(4)}/bird</span>
                )}
              </p>
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Destination Layer Barn *</label>
              <SearchSelect
                options={layerBarnOptions}
                value={layerBarnOptions.find(o => o.value === splitForm.destination_barn_id) || null}
                onChange={(opt) => setSplitForm({ ...splitForm, destination_barn_id: opt?.value || '' })}
                placeholder="Select layer barn..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-lvf-muted mb-1">Birds to Move *</label>
                <input className="glass-input w-full" type="number" required min="1"
                  max={selectedFlock.current_bird_count}
                  placeholder={`Max: ${selectedFlock.current_bird_count.toLocaleString()}`}
                  value={splitForm.bird_count}
                  onChange={e => setSplitForm({ ...splitForm, bird_count: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm text-lvf-muted mb-1">Transfer Date *</label>
                <input className="glass-input w-full" type="date" required
                  value={splitForm.transfer_date}
                  onChange={e => setSplitForm({ ...splitForm, transfer_date: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Layer Flock # (auto-generated if blank)</label>
              <input className="glass-input w-full" placeholder="Leave blank for auto-ID"
                value={splitForm.layer_flock_number}
                onChange={e => setSplitForm({ ...splitForm, layer_flock_number: e.target.value })} />
            </div>
            <p className="text-xs text-lvf-muted">
              If the destination barn already has a layer flock, birds will merge into it with a weighted average cost per bird.
            </p>
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setSplitOpen(false)} className="glass-button-secondary">Cancel</button>
              <button type="submit" disabled={submitting} className="glass-button-primary">{submitting ? 'Splitting...' : 'Split to Layer'}</button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Sell Pullets Modal ── */}
      <Modal isOpen={sellOpen} onClose={() => setSellOpen(false)} title={`Sell Pullets — ${selectedFlock?.flock_number || ''}`}>
        {selectedFlock && (
          <form onSubmit={handleSellPullets} className="space-y-4">
            <div className="glass-card p-3 bg-green-500/10 border-green-500/20">
              <p className="text-sm">{selectedFlock.current_bird_count.toLocaleString()} birds available</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-lvf-muted mb-1">Birds to Sell *</label>
                <input className="glass-input w-full" type="number" required min="1"
                  max={selectedFlock.current_bird_count} value={sellForm.bird_count}
                  onChange={e => setSellForm({ ...sellForm, bird_count: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm text-lvf-muted mb-1">Price per Bird *</label>
                <input className="glass-input w-full" type="number" step="0.01" required min="0.01"
                  value={sellForm.price_per_bird}
                  onChange={e => setSellForm({ ...sellForm, price_per_bird: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-lvf-muted mb-1">Buyer *</label>
                <input className="glass-input w-full" required value={sellForm.buyer}
                  onChange={e => setSellForm({ ...sellForm, buyer: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm text-lvf-muted mb-1">Sale Date *</label>
                <input className="glass-input w-full" type="date" required value={sellForm.sale_date}
                  onChange={e => setSellForm({ ...sellForm, sale_date: e.target.value })} />
              </div>
            </div>
            {sellForm.bird_count && sellForm.price_per_bird && (
              <p className="text-sm text-lvf-success">
                Total: ${(parseInt(sellForm.bird_count) * parseFloat(sellForm.price_per_bird)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            )}
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setSellOpen(false)} className="glass-button-secondary">Cancel</button>
              <button type="submit" disabled={submitting} className="glass-button-primary">{submitting ? 'Selling...' : 'Sell Pullets'}</button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Buy Outside Pullets Modal ── */}
      <Modal isOpen={purchaseOpen} onClose={() => setPurchaseOpen(false)} title="Purchase Outside Pullets" size="lg">
        <form onSubmit={handlePurchase} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Bird Color</label>
              <select className="glass-input w-full" value={purchaseForm.bird_color}
                onChange={e => setPurchaseForm({ ...purchaseForm, bird_color: e.target.value })}>
                <option value="brown">Brown</option>
                <option value="white">White</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Breed</label>
              <input className="glass-input w-full" value={purchaseForm.breed}
                onChange={e => setPurchaseForm({ ...purchaseForm, breed: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Hatch Date</label>
              <input className="glass-input w-full" type="date" value={purchaseForm.hatch_date}
                onChange={e => setPurchaseForm({ ...purchaseForm, hatch_date: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Arrival Date *</label>
              <input className="glass-input w-full" type="date" required value={purchaseForm.arrival_date}
                onChange={e => setPurchaseForm({ ...purchaseForm, arrival_date: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Bird Count *</label>
              <input className="glass-input w-full" type="number" required min="1" value={purchaseForm.bird_count}
                onChange={e => setPurchaseForm({ ...purchaseForm, bird_count: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Cost per Bird *</label>
              <input className="glass-input w-full" type="number" step="0.01" required min="0.01"
                value={purchaseForm.cost_per_bird}
                onChange={e => setPurchaseForm({ ...purchaseForm, cost_per_bird: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Layer Barn *</label>
            <SearchSelect
              options={layerBarnOptions}
              value={layerBarnOptions.find(o => o.value === purchaseForm.barn_id) || null}
              onChange={(opt) => setPurchaseForm({ ...purchaseForm, barn_id: opt?.value || '' })}
              placeholder="Select layer barn..."
            />
          </div>
          <p className="text-xs text-lvf-muted">
            Outside purchases go directly into a layer barn. If the barn already has a flock, birds merge with weighted average cost.
          </p>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setPurchaseOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">{submitting ? 'Purchasing...' : 'Purchase'}</button>
          </div>
        </form>
      </Modal>

      {/* ── Closeout Modal ── */}
      <Modal isOpen={closeoutOpen} onClose={() => setCloseoutOpen(false)} title={`Closeout Flock ${selectedFlock?.flock_number || ''}`}>
        {selectedFlock && (
          <form onSubmit={handleCloseout} className="space-y-4">
            <div className="glass-card p-3 bg-amber-500/10 border-amber-500/20">
              <p className="text-sm text-lvf-warning">
                This will mark the flock as closing. Enter remaining egg inventory at the barn.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-lvf-muted mb-1">Skids Remaining</label>
                <input className="glass-input w-full" type="number" min="0" value={closeoutForm.skids_remaining}
                  onChange={e => setCloseoutForm({ ...closeoutForm, skids_remaining: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm text-lvf-muted mb-1">Cases Remaining</label>
                <input className="glass-input w-full" type="number" min="0" value={closeoutForm.cases_remaining}
                  onChange={e => setCloseoutForm({ ...closeoutForm, cases_remaining: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Closeout Date *</label>
              <input className="glass-input w-full" type="date" required value={closeoutForm.closeout_date}
                onChange={e => setCloseoutForm({ ...closeoutForm, closeout_date: e.target.value })} />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setCloseoutOpen(false)} className="glass-button-secondary">Cancel</button>
              <button type="submit" disabled={submitting} className="glass-button-primary">{submitting ? 'Closing...' : 'Initiate Closeout'}</button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Transfer Modal ── */}
      <Modal isOpen={transferOpen} onClose={() => setTransferOpen(false)} title={`Transfer — ${selectedFlock?.flock_number || ''}`}>
        <form onSubmit={handleTransfer} className="space-y-4">
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Source Barn</label>
            <SearchSelect
              options={allBarnOptions}
              value={allBarnOptions.find(o => o.value === transferForm.source_barn_id) || null}
              onChange={(opt) => setTransferForm({ ...transferForm, source_barn_id: opt?.value || '' })}
              placeholder="Select source..."
            />
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Destination Barn (same type)</label>
            <SearchSelect
              options={allBarnOptions.filter(o => o.value !== transferForm.source_barn_id)}
              value={allBarnOptions.find(o => o.value === transferForm.destination_barn_id) || null}
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
            <button type="submit" disabled={submitting} className="glass-button-primary">{submitting ? 'Transferring...' : 'Transfer'}</button>
          </div>
        </form>
      </Modal>

      {/* ── Mortality Modal ── */}
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

      {/* ── Flock Detail Modal ── */}
      <Modal isOpen={detailOpen} onClose={() => setDetailOpen(false)} title={`Flock ${selectedFlock?.flock_number || ''}`} size="lg">
        {selectedFlock && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-lvf-muted">Type</p>
                <p className="text-sm font-medium mt-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${typeColors[selectedFlock.flock_type] || ''}`}>
                    {selectedFlock.flock_type}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-xs text-lvf-muted">Status</p>
                <p className="text-sm font-medium mt-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${statusColors[selectedFlock.status] || ''}`}>
                    {selectedFlock.status}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-xs text-lvf-muted">Current / Initial Birds</p>
                <p className="text-sm font-medium mt-1">{selectedFlock.current_bird_count.toLocaleString()} / {selectedFlock.initial_bird_count.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-lvf-muted">Cost per Bird</p>
                <p className="text-sm font-medium mt-1 text-lvf-accent">
                  {parseFloat(selectedFlock.cost_per_bird) > 0 ? `$${parseFloat(selectedFlock.cost_per_bird).toFixed(4)}` : '—'}
                </p>
              </div>
            </div>

            {selectedFlock.parent_flock_number && (
              <div className="glass-card p-3 bg-purple-500/10 border-purple-500/20">
                <p className="text-sm text-purple-400">
                  Split from pullet flock: <span className="font-semibold">{selectedFlock.parent_flock_number}</span>
                </p>
              </div>
            )}

            {selectedFlock.flock_sources && selectedFlock.flock_sources.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Source Pullet Flocks</h4>
                <div className="space-y-2">
                  {selectedFlock.flock_sources.map((s, i) => (
                    <div key={i} className="glass-card p-3 flex justify-between items-center">
                      <div>
                        <span className="text-lvf-accent font-semibold">{s.pullet_flock_number}</span>
                        <span className="text-lvf-muted ml-3">{s.bird_count.toLocaleString()} birds</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm">${parseFloat(s.cost_per_bird).toFixed(4)}/bird</span>
                        <span className="text-lvf-muted text-xs ml-2">{s.transfer_date}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedFlock.status === 'closing' && (
              <div className="glass-card p-4 bg-amber-500/10 border-amber-500/20">
                <h4 className="text-sm font-semibold text-lvf-warning mb-2">Closeout In Progress</h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-lvf-muted">Skids Remaining</p>
                    <p className="font-medium">{selectedFlock.closeout_skids_remaining ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-lvf-muted">Cases Remaining</p>
                    <p className="font-medium">{selectedFlock.closeout_cases_remaining ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-lvf-muted">Closeout Date</p>
                    <p className="font-medium">{selectedFlock.closeout_date || '—'}</p>
                  </div>
                </div>
              </div>
            )}

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
                          <span className={`px-2 py-0.5 rounded-full text-xs ${typeColors[p.barn_type] || ''}`}>
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
