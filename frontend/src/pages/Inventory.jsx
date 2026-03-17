import { useState, useEffect } from 'react'
import { Plus, ShoppingCart, Package, Trash2, AlertTriangle, Clock, DollarSign } from 'lucide-react'
import { addInventory, getInventory, getInventorySummary, recordSale, getSales, getEggGrades, createEggGrade, deleteEggGrade, getInventoryByFlock, getInventoryAging, getInventoryValue, getInventoryAlerts } from '../api/inventory'
import { getFlocks } from '../api/flocks'
import SearchSelect from '../components/common/SearchSelect'
import Modal from '../components/common/Modal'
import ConfirmDialog from '../components/common/ConfirmDialog'
import Toast from '../components/common/Toast'
import useToast from '../hooks/useToast'

const DOZENS_PER_SKID = 900

export default function Inventory() {
  const [tab, setTab] = useState('overview')
  const [flocks, setFlocks] = useState([])
  const [summary, setSummary] = useState([])
  const [records, setRecords] = useState([])
  const [sales, setSales] = useState([])
  const [gradeOptions, setGradeOptions] = useState([])
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [saleOpen, setSaleOpen] = useState(false)
  const [addGradeOpen, setAddGradeOpen] = useState(false)
  const [deleteGradeTarget, setDeleteGradeTarget] = useState(null)
  const [byFlock, setByFlock] = useState([])
  const [aging, setAging] = useState([])
  const [invValue, setInvValue] = useState(null)
  const [invAlerts, setInvAlerts] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  const [receiveForm, setReceiveForm] = useState({
    flock_id: '', record_date: new Date().toISOString().split('T')[0],
    grade: '', skids_in: '', skids_out: 0, notes: ''
  })

  const [saleForm, setSaleForm] = useState({
    flock_id: '', sale_date: new Date().toISOString().split('T')[0],
    buyer: '', grade: '', skids_sold: '', price_per_dozen: '', notes: ''
  })

  const [newGrade, setNewGrade] = useState({ label: '' })

  const load = async () => {
    try {
      const [flocksRes, summaryRes, recordsRes, salesRes, gradesRes, byFlockRes, agingRes, valueRes, alertsRes] = await Promise.all([
        getFlocks(), getInventorySummary(), getInventory(), getSales(), getEggGrades(),
        getInventoryByFlock().catch(() => ({ data: [] })),
        getInventoryAging(7).catch(() => ({ data: [] })),
        getInventoryValue().catch(() => ({ data: null })),
        getInventoryAlerts().catch(() => ({ data: [] })),
      ])
      setFlocks(flocksRes.data)
      setSummary(summaryRes.data)
      setRecords(recordsRes.data)
      setSales(salesRes.data)
      setByFlock(byFlockRes.data)
      setAging(agingRes.data)
      setInvValue(valueRes.data)
      setInvAlerts(alertsRes.data)
      const grades = gradesRes.data.map(g => ({ value: g.value, label: g.label, id: g.id }))
      setGradeOptions(grades)
      // Set default grade
      if (grades.length > 0 && !receiveForm.grade) {
        setReceiveForm(prev => ({ ...prev, grade: grades[0].value }))
        setSaleForm(prev => ({ ...prev, grade: grades[0].value }))
      }
    } catch (err) {
      showToast('Error loading inventory data', 'error')
    }
  }

  useEffect(() => { load() }, [])

  const flockOptions = flocks.map(f => ({ value: f.id, label: `${f.flock_number} — ${f.current_bird_count} birds` }))

  const handleReceive = async (e) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      const skidsIn = parseInt(receiveForm.skids_in)
      const skidsOut = parseInt(receiveForm.skids_out) || 0
      if (isNaN(skidsIn) || (skidsIn === 0 && skidsOut === 0)) {
        showToast('Must specify at least skids in or out', 'error')
        return
      }
      await addInventory({
        ...receiveForm,
        skids_in: skidsIn,
        skids_out: skidsOut,
        dozens_per_skid: DOZENS_PER_SKID,
      })
      showToast('Inventory received')
      setReceiveOpen(false)
      setReceiveForm(prev => ({ ...prev, skids_in: '', skids_out: 0, notes: '' }))
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSale = async (e) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      const skids = parseInt(saleForm.skids_sold)
      const price = parseFloat(saleForm.price_per_dozen)
      if (isNaN(skids) || skids <= 0) {
        showToast('Skids sold must be a positive number', 'error')
        return
      }
      if (isNaN(price) || price <= 0) {
        showToast('Price per dozen must be a positive number', 'error')
        return
      }
      const result = await recordSale({
        ...saleForm,
        skids_sold: skids,
        price_per_dozen: price,
      })
      showToast(`Sale recorded: $${result.data.total_amount.toFixed(2)}`)
      setSaleOpen(false)
      setSaleForm(prev => ({ ...prev, buyer: '', skids_sold: '', price_per_dozen: '', notes: '' }))
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAddGrade = async (e) => {
    e.preventDefault()
    if (submitting) return
    if (!newGrade.label.trim()) {
      showToast('Grade name is required', 'error')
      return
    }
    setSubmitting(true)
    try {
      const value = newGrade.label.trim().toLowerCase().replace(/\s+/g, '_')
      await createEggGrade({ value, label: newGrade.label.trim() })
      showToast('Grade added')
      setAddGradeOpen(false)
      setNewGrade({ label: '' })
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error adding grade', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteGrade = async () => {
    if (!deleteGradeTarget) return
    try {
      await deleteEggGrade(deleteGradeTarget.id)
      showToast('Grade removed')
      setDeleteGradeTarget(null)
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error removing grade', 'error')
    }
  }

  const totalSkids = summary.reduce((sum, s) => sum + s.total_skids_on_hand, 0)
  const totalDozens = summary.reduce((sum, s) => sum + s.total_dozens, 0)

  const gradeLabel = (val) => {
    const g = gradeOptions.find(o => o.value === val)
    return g ? g.label : val?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || ''
  }

  // Build SearchSelect options with add/delete actions
  const gradeSelectOptions = [
    ...gradeOptions.map(g => ({ value: g.value, label: g.label })),
  ]

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Egg Inventory</h2>
        <div className="flex gap-2">
          <button onClick={() => setSaleOpen(true)} className="glass-button-secondary flex items-center gap-2">
            <ShoppingCart size={16} /> Record Sale
          </button>
          <button onClick={() => setReceiveOpen(true)} className="glass-button-primary flex items-center gap-2">
            <Plus size={16} /> Receive Eggs
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="glass-card stat-glow p-5">
          <div className="flex items-center gap-2 mb-2">
            <Package size={16} className="text-lvf-accent" />
            <p className="text-sm text-lvf-muted">Total On Hand</p>
          </div>
          <p className="text-3xl font-bold text-lvf-accent">{totalSkids.toLocaleString()}</p>
          <p className="text-xs text-lvf-muted mt-1">skids ({totalDozens.toLocaleString()} doz)</p>
        </div>
        <div className="glass-card stat-glow p-5">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={16} className="text-lvf-success" />
            <p className="text-sm text-lvf-muted">Est. Value</p>
          </div>
          <p className="text-2xl font-bold text-lvf-success">
            ${invValue?.total_estimated_value ? invValue.total_estimated_value.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
          </p>
          <p className="text-xs text-lvf-muted mt-1">at contract prices</p>
        </div>
        {summary.slice(0, 2).map(s => (
          <div key={s.grade} className="glass-card stat-glow p-5">
            <p className="text-sm text-lvf-muted mb-2">{s.grade_label || gradeLabel(s.grade)}</p>
            <p className="text-2xl font-bold">{s.total_skids_on_hand.toLocaleString()}</p>
            <p className="text-xs text-lvf-muted mt-1">{s.total_dozens.toLocaleString()} doz</p>
          </div>
        ))}
      </div>

      {/* Inventory Alerts */}
      {invAlerts.length > 0 && (
        <div className="mb-4 space-y-2">
          {invAlerts.map((a, i) => (
            <div key={i} className={`glass-card p-3 border flex items-center gap-3 ${
              a.severity === 'danger' ? 'border-lvf-danger/30 bg-lvf-danger/10' : 'border-lvf-warning/30 bg-lvf-warning/10'
            }`}>
              {a.type === 'aging' ? <Clock size={16} className="text-lvf-warning" /> : <AlertTriangle size={16} className="text-lvf-warning" />}
              <span className="text-sm flex-1">{a.message}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                a.type === 'aging' ? 'bg-lvf-warning/20 text-lvf-warning' : 'bg-lvf-danger/20 text-lvf-danger'
              }`}>{a.type === 'aging' ? 'aging' : 'low stock'}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 glass-card w-fit">
        {[
          { id: 'overview', label: 'By Grade' },
          { id: 'byflock', label: 'By Flock' },
          { id: 'aging', label: 'Aging' },
          { id: 'log', label: 'Receiving Log' },
          { id: 'sales', label: 'Sales' },
          { id: 'grades', label: 'Grades' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              tab === t.id ? 'bg-lvf-accent/20 text-lvf-accent' : 'text-lvf-muted hover:text-lvf-text hover:bg-white/5'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview: inventory by grade */}
      {tab === 'overview' && (
        <div className="glass-card overflow-hidden">
          <table className="w-full glass-table">
            <thead>
              <tr><th>Grade</th><th className="text-right">Skids On Hand</th><th className="text-right">Dozens</th></tr>
            </thead>
            <tbody>
              {summary.map(s => (
                <tr key={s.grade}>
                  <td>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-lvf-accent/10 text-lvf-accent border border-lvf-accent/20">
                      {s.grade_label || gradeLabel(s.grade)}
                    </span>
                  </td>
                  <td className="text-right font-mono font-medium">{s.total_skids_on_hand.toLocaleString()}</td>
                  <td className="text-right font-mono text-lvf-muted">{s.total_dozens.toLocaleString()}</td>
                </tr>
              ))}
              {summary.length === 0 && (
                <tr><td colSpan={3} className="text-center py-8 text-lvf-muted">No inventory on hand.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Inventory by Flock */}
      {tab === 'byflock' && (
        <div className="space-y-4">
          {byFlock.map(f => (
            <div key={f.flock_id} className="glass-card p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-lvf-accent font-semibold">{f.flock_number}</span>
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                    f.flock_status === 'closing' ? 'bg-lvf-warning/20 text-lvf-warning' :
                    f.flock_status === 'active' ? 'bg-lvf-success/20 text-lvf-success' :
                    'bg-lvf-muted/20 text-lvf-muted'
                  }`}>{f.flock_status}</span>
                </div>
                <div className="text-sm text-lvf-muted">
                  {f.barn_name && <span>{f.barn_name}</span>}
                  {f.grower_name && <span className="ml-2">({f.grower_name})</span>}
                </div>
              </div>
              <div className="flex gap-4">
                {f.grades.map(g => (
                  <div key={g.grade} className="glass-card p-3 text-center min-w-[100px]">
                    <p className="text-xs text-lvf-muted">{g.grade_label}</p>
                    <p className="text-lg font-bold">{g.skids_on_hand}</p>
                    <p className="text-[10px] text-lvf-muted">skids</p>
                  </div>
                ))}
                <div className="glass-card p-3 text-center min-w-[100px] bg-lvf-accent/5">
                  <p className="text-xs text-lvf-muted">Total</p>
                  <p className="text-lg font-bold text-lvf-accent">{f.total_skids}</p>
                  <p className="text-[10px] text-lvf-muted">skids</p>
                </div>
              </div>
            </div>
          ))}
          {byFlock.length === 0 && (
            <div className="glass-card p-12 text-center text-lvf-muted">No inventory on hand.</div>
          )}
        </div>
      )}

      {/* Aging */}
      {tab === 'aging' && (
        <div className="glass-card overflow-hidden">
          <table className="w-full glass-table">
            <thead>
              <tr>
                <th>Flock</th><th>Grade</th><th className="text-right">Skids</th>
                <th>Oldest Received</th><th className="text-right">Age (Days)</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {aging.map((a, i) => (
                <tr key={i}>
                  <td className="text-lvf-accent font-medium">{a.flock_number}</td>
                  <td>{a.grade_label}</td>
                  <td className="text-right font-mono">{a.skids_on_hand}</td>
                  <td className="text-lvf-muted">{a.oldest_date}</td>
                  <td className="text-right font-mono font-bold">{a.age_days}</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      a.age_days > 14 ? 'bg-lvf-danger/20 text-lvf-danger' :
                      a.age_days > 7 ? 'bg-lvf-warning/20 text-lvf-warning' :
                      'bg-lvf-success/20 text-lvf-success'
                    }`}>
                      {a.age_days > 14 ? 'Critical' : a.age_days > 7 ? 'Aging' : 'Fresh'}
                    </span>
                  </td>
                </tr>
              ))}
              {aging.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-lvf-muted">No aging inventory (all eggs received within 7 days).</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Receiving Log */}
      {tab === 'log' && (
        <div className="glass-card overflow-hidden">
          <table className="w-full glass-table">
            <thead>
              <tr><th>Date</th><th>Flock</th><th>Grade</th><th className="text-right">Skids In</th><th className="text-right">Skids Out</th><th className="text-right">On Hand</th><th className="text-right">Dozens</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id}>
                  <td className="text-lvf-muted">{r.record_date}</td>
                  <td className="text-lvf-accent">{r.flock_number}</td>
                  <td><span className="px-2 py-0.5 rounded-full text-xs font-medium bg-lvf-accent/10 text-lvf-accent">{r.grade_label || gradeLabel(r.grade)}</span></td>
                  <td className="text-right font-mono text-lvf-success">{r.skids_in > 0 ? `+${r.skids_in}` : ''}</td>
                  <td className="text-right font-mono text-lvf-danger">{r.skids_out > 0 ? `-${r.skids_out}` : ''}</td>
                  <td className="text-right font-mono font-medium">{r.skids_on_hand}</td>
                  <td className="text-right font-mono text-lvf-muted text-xs">{r.dozens_on_hand?.toLocaleString()} doz</td>
                  <td className="text-lvf-muted text-xs">{r.notes || ''}</td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-lvf-muted">No inventory records.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Sales History */}
      {tab === 'sales' && (
        <div className="glass-card overflow-hidden">
          <table className="w-full glass-table">
            <thead>
              <tr><th>Date</th><th>Flock</th><th>Buyer</th><th>Grade</th><th className="text-right">Skids</th><th className="text-right">$/Doz</th><th className="text-right">Total</th></tr>
            </thead>
            <tbody>
              {sales.map(s => (
                <tr key={s.id}>
                  <td className="text-lvf-muted">{s.sale_date}</td>
                  <td className="text-lvf-accent">{s.flock_number}</td>
                  <td>{s.buyer}</td>
                  <td><span className="px-2 py-0.5 rounded-full text-xs font-medium bg-lvf-accent/10 text-lvf-accent">{s.grade_label || gradeLabel(s.grade)}</span></td>
                  <td className="text-right font-mono">{s.skids_sold}</td>
                  <td className="text-right font-mono">${s.price_per_dozen.toFixed(2)}</td>
                  <td className="text-right font-mono font-medium text-lvf-success">${s.total_amount.toFixed(2)}</td>
                </tr>
              ))}
              {sales.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-lvf-muted">No sales recorded.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Egg Grades Management */}
      {tab === 'grades' && (
        <div className="max-w-lg">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-lvf-muted">Manage available egg grade options</p>
            <button onClick={() => setAddGradeOpen(true)} className="glass-button-primary flex items-center gap-2 text-sm">
              <Plus size={14} /> Add Grade
            </button>
          </div>
          <div className="glass-card overflow-hidden">
            <table className="w-full glass-table">
              <thead><tr><th>Grade</th><th>Value</th><th className="w-16"></th></tr></thead>
              <tbody>
                {gradeOptions.map(g => (
                  <tr key={g.id}>
                    <td className="font-medium">{g.label}</td>
                    <td className="text-lvf-muted text-xs font-mono">{g.value}</td>
                    <td>
                      <button onClick={() => setDeleteGradeTarget(g)} className="p-1.5 rounded-lg hover:bg-white/10">
                        <Trash2 size={13} className="text-lvf-danger" />
                      </button>
                    </td>
                  </tr>
                ))}
                {gradeOptions.length === 0 && (
                  <tr><td colSpan={3} className="text-center py-6 text-lvf-muted">No grades configured.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Receive Eggs Modal */}
      <Modal isOpen={receiveOpen} onClose={() => setReceiveOpen(false)} title="Receive Eggs">
        <form onSubmit={handleReceive} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Flock *</label>
              <SearchSelect options={flockOptions}
                value={flockOptions.find(o => o.value === receiveForm.flock_id) || null}
                onChange={(opt) => setReceiveForm({ ...receiveForm, flock_id: opt?.value || '' })}
                placeholder="Select flock..." />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Date *</label>
              <input className="glass-input w-full" type="date" required value={receiveForm.record_date}
                onChange={e => setReceiveForm({ ...receiveForm, record_date: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Grade *</label>
              <SearchSelect options={gradeSelectOptions}
                value={gradeSelectOptions.find(o => o.value === receiveForm.grade)}
                onChange={(opt) => setReceiveForm({ ...receiveForm, grade: opt?.value || '' })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Skids In *</label>
              <input className="glass-input w-full" type="number" required min="0" value={receiveForm.skids_in}
                onChange={e => setReceiveForm({ ...receiveForm, skids_in: e.target.value })} />
              {receiveForm.skids_in > 0 && (
                <p className="text-[10px] text-lvf-muted mt-1">{(parseInt(receiveForm.skids_in) * DOZENS_PER_SKID).toLocaleString()} doz</p>
              )}
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Skids Out</label>
              <input className="glass-input w-full" type="number" min="0" value={receiveForm.skids_out}
                onChange={e => setReceiveForm({ ...receiveForm, skids_out: e.target.value })} />
            </div>
          </div>
          <p className="text-[11px] text-lvf-muted">1 skid = {DOZENS_PER_SKID} dozen</p>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Notes</label>
            <textarea className="glass-input w-full" rows={2} value={receiveForm.notes}
              onChange={e => setReceiveForm({ ...receiveForm, notes: e.target.value })} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setReceiveOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">{submitting ? 'Saving...' : 'Receive'}</button>
          </div>
        </form>
      </Modal>

      {/* Record Sale Modal */}
      <Modal isOpen={saleOpen} onClose={() => setSaleOpen(false)} title="Record Egg Sale">
        <form onSubmit={handleSale} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Flock *</label>
              <SearchSelect options={flockOptions}
                value={flockOptions.find(o => o.value === saleForm.flock_id) || null}
                onChange={(opt) => setSaleForm({ ...saleForm, flock_id: opt?.value || '' })}
                placeholder="Select flock..." />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Sale Date *</label>
              <input className="glass-input w-full" type="date" required value={saleForm.sale_date}
                onChange={e => setSaleForm({ ...saleForm, sale_date: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Buyer *</label>
            <input className="glass-input w-full" required value={saleForm.buyer}
              placeholder="Customer name" onChange={e => setSaleForm({ ...saleForm, buyer: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Grade *</label>
              <SearchSelect options={gradeSelectOptions}
                value={gradeSelectOptions.find(o => o.value === saleForm.grade)}
                onChange={(opt) => setSaleForm({ ...saleForm, grade: opt?.value || '' })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Skids *</label>
              <input className="glass-input w-full" type="number" required min="1" value={saleForm.skids_sold}
                onChange={e => setSaleForm({ ...saleForm, skids_sold: e.target.value })} />
              {saleForm.skids_sold > 0 && (
                <p className="text-[10px] text-lvf-muted mt-1">{(parseInt(saleForm.skids_sold) * DOZENS_PER_SKID).toLocaleString()} doz</p>
              )}
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">$/Doz *</label>
              <input className="glass-input w-full" type="number" step="0.01" required min="0.01" value={saleForm.price_per_dozen}
                onChange={e => setSaleForm({ ...saleForm, price_per_dozen: e.target.value })} />
            </div>
          </div>
          {saleForm.skids_sold && saleForm.price_per_dozen && (
            <div className="text-right text-sm">
              Total: <span className="text-lg font-bold text-lvf-success">
                ${(parseInt(saleForm.skids_sold) * 900 * parseFloat(saleForm.price_per_dozen)).toFixed(2)}
              </span>
            </div>
          )}
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Notes</label>
            <textarea className="glass-input w-full" rows={2} value={saleForm.notes}
              onChange={e => setSaleForm({ ...saleForm, notes: e.target.value })} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setSaleOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">{submitting ? 'Saving...' : 'Record Sale'}</button>
          </div>
        </form>
      </Modal>

      {/* Add Grade Modal */}
      <Modal isOpen={addGradeOpen} onClose={() => setAddGradeOpen(false)} title="Add Egg Grade" size="sm">
        <form onSubmit={handleAddGrade} className="space-y-4">
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Grade Name *</label>
            <input className="glass-input w-full" required value={newGrade.label} placeholder="e.g. Jumbo"
              onChange={e => setNewGrade({ label: e.target.value })} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setAddGradeOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">{submitting ? 'Adding...' : 'Add'}</button>
          </div>
        </form>
      </Modal>

      {/* Delete Grade Confirm */}
      <ConfirmDialog
        isOpen={!!deleteGradeTarget}
        onClose={() => setDeleteGradeTarget(null)}
        onConfirm={handleDeleteGrade}
        title="Remove Egg Grade"
        message={`Remove "${deleteGradeTarget?.label}"? If this grade is in use, it will be deactivated instead of deleted.`}
      />

    </div>
  )
}
