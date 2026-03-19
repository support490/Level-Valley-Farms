import { useState, useEffect } from 'react'
import {
  Plus, FileText, UserPlus, X, AlertTriangle, TrendingUp, DollarSign,
  Users, BarChart3, ShoppingBag, Edit2, ToggleLeft, ToggleRight, Phone, Mail, MapPin, Eye,
} from 'lucide-react'
import {
  getContracts, createContract, updateContract, deleteContract,
  assignFlockToContract, unassignFlockFromContract,
  getContractDashboard, getContractPnl, getContractAlerts,
  getPriceHistory, getSpotSales,
  getBuyers, createBuyer, updateBuyer,
} from '../api/contracts'
import { getFlocks } from '../api/flocks'
import { getEggGrades } from '../api/inventory'
import SearchSelect from '../components/common/SearchSelect'
import Modal from '../components/common/Modal'
import Toast from '../components/common/Toast'
import useToast from '../hooks/useToast'

export default function Contracts() {
  const [tab, setTab] = useState('dashboard')
  const [contracts, setContracts] = useState([])
  const [dashboard, setDashboard] = useState([])
  const [alerts, setAlerts] = useState([])
  const [priceHistory, setPriceHistory] = useState([])
  const [spotSales, setSpotSales] = useState([])
  const [buyers, setBuyers] = useState([])
  const [flocks, setFlocks] = useState([])
  const [grades, setGrades] = useState([])
  const [pnlData, setPnlData] = useState(null)
  const [pnlOpen, setPnlOpen] = useState(false)

  const [contractOpen, setContractOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignTarget, setAssignTarget] = useState(null)
  const [createBuyerOpen, setCreateBuyerOpen] = useState(false)
  const [editBuyerOpen, setEditBuyerOpen] = useState(false)
  const [editBuyerTarget, setEditBuyerTarget] = useState(null)
  const [priceFilter, setPriceFilter] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  const [contractForm, setContractForm] = useState({
    contract_number: '', buyer: '', buyer_id: '', description: '', num_flocks: 1,
    start_date: '', end_date: '', price_per_dozen: '', grade: '',
    volume_committed_dozens: '', notes: '',
  })
  const [buyerForm, setBuyerForm] = useState({
    name: '', contact_name: '', phone: '', email: '', address: '', notes: '', customer_type: '',
  })

  const load = async () => {
    try {
      const [contractsRes, dashRes, alertsRes, priceRes, spotRes, buyersRes, flocksRes, gradesRes] = await Promise.all([
        getContracts(), getContractDashboard(), getContractAlerts(),
        getPriceHistory(), getSpotSales(),
        getBuyers(), getFlocks({ status: 'active' }), getEggGrades(),
      ])
      setContracts(contractsRes.data || [])
      setDashboard(dashRes.data)
      setAlerts(alertsRes.data || [])
      setPriceHistory(priceRes.data || [])
      setSpotSales(spotRes.data || [])
      setBuyers(buyersRes.data || [])
      setFlocks(flocksRes.data || [])
      setGrades(gradesRes.data || [])
    } catch (err) {
      showToast('Error loading data', 'error')
    }
  }

  useEffect(() => { load() }, [])

  const flockOptions = flocks.map(f => ({ value: f.id, label: `${f.flock_number} — ${f.current_bird_count} birds` }))
  const gradeOptions = grades.map(g => ({ value: g.value, label: g.label }))
  const buyerOptions = buyers.filter(b => b.is_active).map(b => ({ value: b.id, label: b.name }))
  const gradeLabel = (val) => {
    const g = grades.find(o => o.value === val)
    return g ? g.label : val?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || ''
  }

  // Unique buyers from price history for filter
  const priceBuyers = [...new Set(priceHistory.map(p => p.buyer))]

  // ── Contract Handlers ──
  const handleCreateContract = async (e) => {
    e.preventDefault()
    if (submitting) return
    if (!contractForm.contract_number.trim() || !contractForm.buyer.trim()) {
      showToast('Contract number and buyer are required', 'error'); return
    }
    setSubmitting(true)
    try {
      await createContract({
        ...contractForm,
        num_flocks: parseInt(contractForm.num_flocks) || 1,
        price_per_dozen: contractForm.price_per_dozen ? parseFloat(contractForm.price_per_dozen) : null,
        grade: contractForm.grade || null,
        start_date: contractForm.start_date || null,
        end_date: contractForm.end_date || null,
        buyer_id: contractForm.buyer_id || null,
        volume_committed_dozens: contractForm.volume_committed_dozens ? parseInt(contractForm.volume_committed_dozens) : null,
      })
      showToast('Contract created')
      setContractOpen(false)
      setContractForm({
        contract_number: '', buyer: '', buyer_id: '', description: '', num_flocks: 1,
        start_date: '', end_date: '', price_per_dozen: '', grade: '',
        volume_committed_dozens: '', notes: '',
      })
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    } finally { setSubmitting(false) }
  }

  const handleDeleteContract = async (contractId) => {
    try { await deleteContract(contractId); showToast('Contract deactivated'); load() }
    catch (err) { showToast(err.response?.data?.detail || 'Error', 'error') }
  }

  const handleAssignFlock = async (flockId) => {
    if (!assignTarget) return
    try {
      await assignFlockToContract({ contract_id: assignTarget.id, flock_id: flockId })
      showToast('Flock assigned'); load(); setAssignOpen(false); setAssignTarget(null)
    } catch (err) { showToast(err.response?.data?.detail || 'Error', 'error') }
  }

  const handleUnassignFlock = async (contractId, flockId) => {
    try { await unassignFlockFromContract(contractId, flockId); showToast('Flock removed'); load() }
    catch (err) { showToast(err.response?.data?.detail || 'Error', 'error') }
  }

  const handleBuyerSelect = (opt) => {
    const b = opt ? buyers.find(x => x.id === opt.value) : null
    setContractForm(prev => ({
      ...prev, buyer_id: opt?.value || '', buyer: b?.name || '',
    }))
  }

  const openPnl = async (contractId) => {
    try {
      const res = await getContractPnl(contractId)
      setPnlData(res.data)
      setPnlOpen(true)
    } catch (err) { showToast('Error loading P&L', 'error') }
  }

  // ── Buyer Handlers ──
  const handleCreateBuyer = async (e) => {
    e.preventDefault()
    if (submitting) return
    if (!buyerForm.name.trim()) { showToast('Buyer name is required', 'error'); return }
    setSubmitting(true)
    try {
      await createBuyer(buyerForm)
      showToast('Buyer created')
      setCreateBuyerOpen(false)
      setBuyerForm({ name: '', contact_name: '', phone: '', email: '', address: '', notes: '', customer_type: '' })
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    } finally { setSubmitting(false) }
  }

  const openEditBuyer = (b) => {
    setEditBuyerTarget(b)
    setBuyerForm({
      name: b.name, contact_name: b.contact_name || '', phone: b.phone || '',
      email: b.email || '', address: b.address || '', notes: b.notes || '',
      customer_type: b.customer_type || '',
    })
    setEditBuyerOpen(true)
  }

  const handleUpdateBuyer = async (e) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      await updateBuyer(editBuyerTarget.id, buyerForm)
      showToast('Buyer updated')
      setEditBuyerOpen(false); setEditBuyerTarget(null)
      setBuyerForm({ name: '', contact_name: '', phone: '', email: '', address: '', notes: '', customer_type: '' })
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    } finally { setSubmitting(false) }
  }

  const handleToggleBuyer = async (b) => {
    try {
      await updateBuyer(b.id, { is_active: !b.is_active })
      showToast(b.is_active ? 'Buyer deactivated' : 'Buyer activated'); load()
    } catch (err) { showToast(err.response?.data?.detail || 'Error', 'error') }
  }

  const statusColors = {
    pending: 'bg-lvf-warning/20 text-lvf-warning',
    shipped: 'bg-lvf-accent/20 text-lvf-accent',
    delivered: 'bg-lvf-success/20 text-lvf-success',
  }

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'contracts', label: 'Contracts', icon: FileText },
    { id: 'buyers', label: 'Buyers', icon: Users },
    { id: 'pricehistory', label: 'Price History', icon: TrendingUp },
    { id: 'spotsales', label: 'Spot Sales', icon: ShoppingBag },
  ]

  // Dashboard totals
  const totalRevenue = dashboard.reduce((s, d) => s + d.total_revenue, 0)
  const totalShipments = dashboard.reduce((s, d) => s + d.num_shipments, 0)

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Contracts & Sales</h2>
        <div className="flex gap-2">
          {tab === 'contracts' && (
            <button onClick={() => setContractOpen(true)} className="glass-button-primary flex items-center gap-2">
              <Plus size={16} /> New Contract
            </button>
          )}
          {tab === 'buyers' && (
            <button onClick={() => setCreateBuyerOpen(true)} className="glass-button-primary flex items-center gap-2">
              <Plus size={16} /> Add Buyer
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="glass-card stat-glow p-4">
          <div className="flex items-center gap-2 mb-1">
            <FileText size={14} className="text-lvf-accent" />
            <p className="text-xs text-lvf-muted">Active Contracts</p>
          </div>
          <p className="text-2xl font-bold text-lvf-accent">{dashboard.length}</p>
        </div>
        <div className="glass-card stat-glow p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign size={14} className="text-lvf-success" />
            <p className="text-xs text-lvf-muted">Contract Revenue</p>
          </div>
          <p className="text-2xl font-bold text-lvf-success">${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <div className="glass-card stat-glow p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShoppingBag size={14} className="text-lvf-accent2" />
            <p className="text-xs text-lvf-muted">Total Shipments</p>
          </div>
          <p className="text-2xl font-bold">{totalShipments}</p>
        </div>
        <div className="glass-card stat-glow p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={14} className={alerts.length > 0 ? 'text-lvf-warning' : 'text-lvf-muted'} />
            <p className="text-xs text-lvf-muted">Alerts</p>
          </div>
          <p className={`text-2xl font-bold ${alerts.length > 0 ? 'text-lvf-warning' : ''}`}>{alerts.length}</p>
        </div>
      </div>

      {/* Alerts Banner */}
      {alerts.length > 0 && (
        <div className="mb-4 space-y-2">
          {alerts.slice(0, 3).map((a, i) => (
            <div key={i} className={`glass-card p-3 border flex items-center gap-3 ${
              a.severity === 'danger' ? 'border-lvf-danger/30 bg-lvf-danger/10' :
              a.severity === 'warning' ? 'border-lvf-warning/30 bg-lvf-warning/10' :
              'border-lvf-accent/30 bg-lvf-accent/10'
            }`}>
              <AlertTriangle size={16} className={
                a.severity === 'danger' ? 'text-lvf-danger' :
                a.severity === 'warning' ? 'text-lvf-warning' : 'text-lvf-accent'
              } />
              <span className="text-sm flex-1">{a.message}</span>
              <span className="text-xs text-lvf-muted">{a.buyer}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 glass-card w-fit flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              tab === t.id ? 'bg-lvf-accent/20 text-lvf-accent' : 'text-lvf-muted hover:text-lvf-text hover:bg-white/5'
            }`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════ DASHBOARD TAB ═══════════ */}
      {tab === 'dashboard' && (
        <div className="space-y-4">
          {dashboard.map(d => (
            <div key={d.id} className="glass-card p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-lvf-accent" />
                    <h4 className="font-semibold">{d.contract_number}</h4>
                    {d.days_remaining !== null && d.days_remaining <= 30 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-lvf-danger/20 text-lvf-danger">
                        {d.days_remaining < 0 ? 'Expired' : `${d.days_remaining}d left`}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-lvf-muted mt-0.5">{d.buyer}</p>
                </div>
                <button onClick={() => openPnl(d.id)} className="glass-button-secondary text-xs flex items-center gap-1">
                  <Eye size={12} /> P&L
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm mb-4">
                <div>
                  <p className="text-[10px] text-lvf-muted">Flocks</p>
                  <p className="font-medium">{d.assigned_flocks} / {d.num_flocks}</p>
                </div>
                <div>
                  <p className="text-[10px] text-lvf-muted">Price/Doz</p>
                  <p className="font-medium">{d.price_per_dozen ? `$${d.price_per_dozen.toFixed(2)}` : '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-lvf-muted">Skids Shipped</p>
                  <p className="font-medium">{Math.round(d.volume_shipped_dozens / 900)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-lvf-muted">Revenue</p>
                  <p className="font-medium text-lvf-success">${d.total_revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <p className="text-[10px] text-lvf-muted">Shipments</p>
                  <p className="font-medium">{d.num_shipments}</p>
                </div>
                <div>
                  <p className="text-[10px] text-lvf-muted">Grade</p>
                  <p className="font-medium">{d.grade ? gradeLabel(d.grade) : 'Any'}</p>
                </div>
              </div>

              {/* Fulfillment Progress Bar */}
              {d.volume_committed_dozens ? (
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-lvf-muted">
                      Fulfillment: {d.volume_shipped_dozens.toLocaleString()} / {d.volume_committed_dozens.toLocaleString()} doz
                    </span>
                    <span className={`font-medium ${
                      d.fulfillment_pct >= 100 ? 'text-lvf-success' :
                      d.fulfillment_pct >= 75 ? 'text-lvf-accent' :
                      d.fulfillment_pct >= 50 ? 'text-lvf-warning' : 'text-lvf-danger'
                    }`}>
                      {d.fulfillment_pct}%
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-lvf-dark/60 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        d.fulfillment_pct >= 100 ? 'bg-lvf-success' :
                        d.fulfillment_pct >= 75 ? 'bg-lvf-accent' :
                        d.fulfillment_pct >= 50 ? 'bg-lvf-warning' : 'bg-lvf-danger'
                      }`}
                      style={{ width: `${Math.min(d.fulfillment_pct, 100)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="text-xs text-lvf-muted">
                  Shipped: {d.volume_shipped_dozens.toLocaleString()} dozens (no volume commitment set)
                </div>
              )}
            </div>
          ))}
          {dashboard.length === 0 && (
            <div className="glass-card p-8 text-center text-lvf-muted">No active contracts.</div>
          )}
        </div>
      )}

      {/* ═══════════ CONTRACTS TAB ═══════════ */}
      {tab === 'contracts' && (
        <div className="space-y-4">
          {contracts.map(c => (
            <div key={c.id} className={`glass-card p-5 ${!c.is_active ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-lvf-accent" />
                    <h4 className="font-semibold">{c.contract_number}</h4>
                    {!c.is_active && <span className="px-2 py-0.5 rounded-full text-[10px] bg-lvf-danger/20 text-lvf-danger">Inactive</span>}
                  </div>
                  <p className="text-sm text-lvf-muted mt-1">{c.buyer}{c.description ? ` — ${c.description}` : ''}</p>
                </div>
                <div className="flex gap-1">
                  {c.is_active && (
                    <>
                      <button onClick={() => { setAssignTarget(c); setAssignOpen(true) }}
                        className="p-1.5 rounded-lg hover:bg-white/10" title="Assign Flock">
                        <UserPlus size={14} className="text-lvf-accent" />
                      </button>
                      <button onClick={() => handleDeleteContract(c.id)}
                        className="p-1.5 rounded-lg hover:bg-white/10" title="Deactivate">
                        <X size={14} className="text-lvf-danger" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
                <div>
                  <p className="text-[10px] text-lvf-muted">Flocks</p>
                  <p className="font-medium">{c.assigned_flocks?.length || 0} / {c.num_flocks}</p>
                </div>
                <div>
                  <p className="text-[10px] text-lvf-muted">Price/Doz</p>
                  <p className="font-medium">{c.price_per_dozen ? `$${c.price_per_dozen.toFixed(2)}` : '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-lvf-muted">Grade</p>
                  <p className="font-medium">{c.grade ? gradeLabel(c.grade) : '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-lvf-muted">Volume Committed</p>
                  <p className="font-medium">{c.volume_committed_dozens ? `${c.volume_committed_dozens.toLocaleString()} doz` : '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-lvf-muted">Start</p>
                  <p className="font-medium">{c.start_date || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-lvf-muted">End</p>
                  <p className="font-medium">{c.end_date || '—'}</p>
                </div>
              </div>
              {c.assigned_flocks?.length > 0 && (
                <div className="mt-3 pt-3 border-t border-lvf-border/30">
                  <p className="text-[10px] text-lvf-muted mb-2">Assigned Flocks</p>
                  <div className="flex flex-wrap gap-2">
                    {c.assigned_flocks.map(af => (
                      <span key={af.flock_id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-lvf-accent/10 text-lvf-accent border border-lvf-accent/20">
                        {af.flock_number}
                        {c.is_active && (
                          <button onClick={() => handleUnassignFlock(c.id, af.flock_id)}
                            className="hover:text-lvf-danger ml-1"><X size={10} /></button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {c.notes && <p className="text-xs text-lvf-muted mt-2">{c.notes}</p>}
            </div>
          ))}
          {contracts.length === 0 && (
            <div className="glass-card p-8 text-center text-lvf-muted">No contracts yet.</div>
          )}
        </div>
      )}

      {/* ═══════════ BUYERS TAB ═══════════ */}
      {tab === 'buyers' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {buyers.map(b => (
            <div key={b.id} className={`glass-card p-4 ${!b.is_active ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-lg">{b.name}</h4>
                    {b.customer_type && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-lvf-accent/20 text-lvf-accent capitalize">
                        {b.customer_type}
                      </span>
                    )}
                  </div>
                  {b.contact_name && <p className="text-xs text-lvf-muted">{b.contact_name}</p>}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEditBuyer(b)} className="p-1.5 rounded-lg hover:bg-white/10" title="Edit">
                    <Edit2 size={13} className="text-lvf-muted" />
                  </button>
                  <button onClick={() => handleToggleBuyer(b)} className="p-1.5 rounded-lg hover:bg-white/10"
                    title={b.is_active ? 'Deactivate' : 'Activate'}>
                    {b.is_active
                      ? <ToggleRight size={16} className="text-lvf-success" />
                      : <ToggleLeft size={16} className="text-lvf-muted" />
                    }
                  </button>
                </div>
              </div>
              <div className="space-y-1.5 text-sm">
                {b.phone && <div className="flex items-center gap-2 text-lvf-muted"><Phone size={12} /> {b.phone}</div>}
                {b.email && <div className="flex items-center gap-2 text-lvf-muted"><Mail size={12} /> {b.email}</div>}
                {b.address && <div className="flex items-center gap-2 text-lvf-muted"><MapPin size={12} /> {b.address}</div>}
              </div>
            </div>
          ))}
          {buyers.length === 0 && (
            <div className="col-span-full glass-card p-8 text-center text-lvf-muted">
              No buyers yet. Click "Add Buyer" to create one.
            </div>
          )}
        </div>
      )}

      {/* ═══════════ PRICE HISTORY TAB ═══════════ */}
      {tab === 'pricehistory' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <label className="text-sm text-lvf-muted">Filter by buyer:</label>
            <div className="w-64">
              <SearchSelect
                options={priceBuyers.map(b => ({ value: b, label: b }))}
                value={priceFilter ? { value: priceFilter, label: priceFilter } : null}
                onChange={(opt) => setPriceFilter(opt?.value || '')}
                placeholder="All buyers..." isClearable
              />
            </div>
          </div>
          <div className="glass-card overflow-hidden">
            <table className="w-full glass-table">
              <thead>
                <tr>
                  <th>Date</th><th>Buyer</th><th>Grade</th>
                  <th className="text-right">$/Doz</th><th>Source</th><th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {priceHistory
                  .filter(p => !priceFilter || p.buyer === priceFilter)
                  .map((p, i) => (
                  <tr key={i}>
                    <td className="text-lvf-muted">{p.date}</td>
                    <td className="font-medium">{p.buyer}</td>
                    <td>{p.grade_label || '—'}</td>
                    <td className="text-right font-mono font-medium">${p.price_per_dozen.toFixed(4)}</td>
                    <td>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        p.source === 'shipment' ? 'bg-lvf-accent/20 text-lvf-accent' : 'bg-lvf-success/20 text-lvf-success'
                      }`}>{p.source}</span>
                    </td>
                    <td className="text-xs text-lvf-muted font-mono">{p.reference}</td>
                  </tr>
                ))}
                {priceHistory.filter(p => !priceFilter || p.buyer === priceFilter).length === 0 && (
                  <tr><td colSpan={6} className="text-center py-8 text-lvf-muted">No price history data.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════ SPOT SALES TAB ═══════════ */}
      {tab === 'spotsales' && (
        <div className="glass-card overflow-hidden">
          <table className="w-full glass-table">
            <thead>
              <tr>
                <th>Shipment #</th><th>Date</th><th>Buyer</th>
                <th className="text-right">Skids</th><th className="text-right">Dozens</th>
                <th className="text-right">Amount</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {spotSales.map(s => (
                <tr key={s.shipment_id}>
                  <td className="font-semibold text-lvf-accent">{s.shipment_number}</td>
                  <td className="text-lvf-muted">{s.ship_date}</td>
                  <td>{s.buyer}</td>
                  <td className="text-right font-mono">{s.total_skids}</td>
                  <td className="text-right font-mono text-lvf-muted">{s.total_dozens.toLocaleString()}</td>
                  <td className="text-right font-mono font-medium text-lvf-success">
                    {s.total_amount > 0 ? `$${s.total_amount.toFixed(2)}` : '—'}
                  </td>
                  <td>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[s.status] || ''}`}>{s.status}</span>
                  </td>
                </tr>
              ))}
              {spotSales.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-lvf-muted">No spot sales (all shipments have contracts).</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══════════ MODALS ═══════════ */}

      {/* Create Contract Modal */}
      <Modal isOpen={contractOpen} onClose={() => setContractOpen(false)} title="New Egg Sale Contract" size="lg">
        <form onSubmit={handleCreateContract} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Contract Number *</label>
              <input className="glass-input w-full" required value={contractForm.contract_number}
                placeholder="e.g. EC-2025-004"
                onChange={e => setContractForm({ ...contractForm, contract_number: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Buyer *</label>
              <SearchSelect options={buyerOptions}
                value={buyerOptions.find(o => o.value === contractForm.buyer_id) || null}
                onChange={handleBuyerSelect} placeholder="Select buyer..." isClearable />
            </div>
          </div>
          {!contractForm.buyer_id && (
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Buyer Name (manual)</label>
              <input className="glass-input w-full" value={contractForm.buyer} placeholder="Type buyer name if not in list"
                onChange={e => setContractForm({ ...contractForm, buyer: e.target.value })} />
            </div>
          )}
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Description</label>
            <input className="glass-input w-full" value={contractForm.description}
              placeholder="e.g. Two-flock Grade A Large contract"
              onChange={e => setContractForm({ ...contractForm, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1"># of Flocks</label>
              <input className="glass-input w-full" type="number" min="1" value={contractForm.num_flocks}
                onChange={e => setContractForm({ ...contractForm, num_flocks: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Price/Doz ($)</label>
              <input className="glass-input w-full" type="number" step="0.01" min="0" value={contractForm.price_per_dozen}
                onChange={e => setContractForm({ ...contractForm, price_per_dozen: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Grade</label>
              <SearchSelect options={gradeOptions}
                value={gradeOptions.find(o => o.value === contractForm.grade) || null}
                onChange={(opt) => setContractForm({ ...contractForm, grade: opt?.value || '' })}
                placeholder="Any" isClearable />
              <p className="text-[10px] text-lvf-muted mt-1">(grading done by buyer)</p>
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Vol. Commitment (doz)</label>
              <input className="glass-input w-full" type="number" min="0" value={contractForm.volume_committed_dozens}
                placeholder="e.g. 500000"
                onChange={e => setContractForm({ ...contractForm, volume_committed_dozens: e.target.value })} />
              <p className="text-[10px] text-lvf-muted mt-1">Optional — leave blank if open-ended</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Start Date</label>
              <input className="glass-input w-full" type="date" value={contractForm.start_date}
                onChange={e => setContractForm({ ...contractForm, start_date: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">End Date</label>
              <input className="glass-input w-full" type="date" value={contractForm.end_date}
                onChange={e => setContractForm({ ...contractForm, end_date: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Notes</label>
            <textarea className="glass-input w-full" rows={2} value={contractForm.notes}
              onChange={e => setContractForm({ ...contractForm, notes: e.target.value })} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setContractOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">
              {submitting ? 'Creating...' : 'Create Contract'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Assign Flock Modal */}
      <Modal isOpen={assignOpen} onClose={() => { setAssignOpen(false); setAssignTarget(null) }}
        title={`Assign Flock to ${assignTarget?.contract_number || ''}`} size="sm">
        <div className="space-y-3">
          <p className="text-sm text-lvf-muted">
            {assignTarget?.assigned_flocks?.length || 0} / {assignTarget?.num_flocks} flocks assigned
          </p>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Select Flock</label>
            <SearchSelect
              options={flockOptions.filter(o => !assignTarget?.assigned_flocks?.some(af => af.flock_id === o.value))}
              value={null}
              onChange={(opt) => { if (opt) handleAssignFlock(opt.value) }}
              placeholder="Search flocks..."
            />
          </div>
        </div>
      </Modal>

      {/* Contract P&L Modal */}
      <Modal isOpen={pnlOpen} onClose={() => { setPnlOpen(false); setPnlData(null) }}
        title={`P&L — ${pnlData?.contract_number || ''}`} size="lg">
        {pnlData && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="glass-card p-4 text-center">
                <p className="text-xs text-lvf-muted mb-1">Total Revenue</p>
                <p className="text-2xl font-bold text-lvf-success">${pnlData.total_revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div className="glass-card p-4 text-center">
                <p className="text-xs text-lvf-muted mb-1">Dozens Shipped</p>
                <p className="text-2xl font-bold">{pnlData.total_shipped_dozens.toLocaleString()}</p>
              </div>
              <div className="glass-card p-4 text-center">
                <p className="text-xs text-lvf-muted mb-1">Shipments</p>
                <p className="text-2xl font-bold">{pnlData.num_shipments}</p>
              </div>
            </div>
            <table className="w-full glass-table">
              <thead>
                <tr>
                  <th>Shipment #</th><th>Date</th><th>Status</th>
                  <th className="text-right">Dozens</th><th className="text-right">Revenue</th>
                  <th className="text-right">Freight</th>
                </tr>
              </thead>
              <tbody>
                {pnlData.shipments.map(s => (
                  <tr key={s.shipment_id}>
                    <td className="font-semibold text-lvf-accent">{s.shipment_number}</td>
                    <td className="text-lvf-muted">{s.ship_date}</td>
                    <td>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[s.status] || ''}`}>{s.status}</span>
                    </td>
                    <td className="text-right font-mono">{s.total_dozens.toLocaleString()}</td>
                    <td className="text-right font-mono font-medium text-lvf-success">${s.revenue.toFixed(2)}</td>
                    <td className="text-right font-mono text-xs text-lvf-muted">{s.freight_cost ? `$${s.freight_cost.toFixed(2)}` : '—'}</td>
                  </tr>
                ))}
                {pnlData.shipments.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-6 text-lvf-muted">No shipments for this contract.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Create Buyer Modal */}
      <Modal isOpen={createBuyerOpen} onClose={() => setCreateBuyerOpen(false)} title="Add Buyer" size="md">
        <form onSubmit={handleCreateBuyer} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Company / Buyer Name *</label>
              <input className="glass-input w-full" required value={buyerForm.name} placeholder="Buyer name"
                onChange={e => setBuyerForm({ ...buyerForm, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Customer Type</label>
              <select className="glass-input w-full" value={buyerForm.customer_type}
                onChange={e => setBuyerForm({ ...buyerForm, customer_type: e.target.value })}>
                <option value="">Select type...</option>
                <option value="breaker">Breaker</option>
                <option value="broker">Broker</option>
                <option value="retail">Retail</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Contact Name</label>
              <input className="glass-input w-full" value={buyerForm.contact_name} placeholder="Contact person"
                onChange={e => setBuyerForm({ ...buyerForm, contact_name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Phone</label>
              <input className="glass-input w-full" value={buyerForm.phone} placeholder="555-0100"
                onChange={e => setBuyerForm({ ...buyerForm, phone: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Email</label>
            <input className="glass-input w-full" type="email" value={buyerForm.email}
              onChange={e => setBuyerForm({ ...buyerForm, email: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Address</label>
            <textarea className="glass-input w-full" rows={2} value={buyerForm.address}
              onChange={e => setBuyerForm({ ...buyerForm, address: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Notes</label>
            <textarea className="glass-input w-full" rows={2} value={buyerForm.notes}
              onChange={e => setBuyerForm({ ...buyerForm, notes: e.target.value })} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setCreateBuyerOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">
              {submitting ? 'Creating...' : 'Add Buyer'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Buyer Modal */}
      <Modal isOpen={editBuyerOpen} onClose={() => { setEditBuyerOpen(false); setEditBuyerTarget(null) }}
        title={`Edit Buyer — ${editBuyerTarget?.name || ''}`} size="md">
        <form onSubmit={handleUpdateBuyer} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Name *</label>
              <input className="glass-input w-full" required value={buyerForm.name}
                onChange={e => setBuyerForm({ ...buyerForm, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Customer Type</label>
              <select className="glass-input w-full" value={buyerForm.customer_type}
                onChange={e => setBuyerForm({ ...buyerForm, customer_type: e.target.value })}>
                <option value="">Select type...</option>
                <option value="breaker">Breaker</option>
                <option value="broker">Broker</option>
                <option value="retail">Retail</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Contact Name</label>
              <input className="glass-input w-full" value={buyerForm.contact_name}
                onChange={e => setBuyerForm({ ...buyerForm, contact_name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Phone</label>
              <input className="glass-input w-full" value={buyerForm.phone}
                onChange={e => setBuyerForm({ ...buyerForm, phone: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Email</label>
            <input className="glass-input w-full" type="email" value={buyerForm.email}
              onChange={e => setBuyerForm({ ...buyerForm, email: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Address</label>
            <textarea className="glass-input w-full" rows={2} value={buyerForm.address}
              onChange={e => setBuyerForm({ ...buyerForm, address: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Notes</label>
            <textarea className="glass-input w-full" rows={2} value={buyerForm.notes}
              onChange={e => setBuyerForm({ ...buyerForm, notes: e.target.value })} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => { setEditBuyerOpen(false); setEditBuyerTarget(null) }} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
