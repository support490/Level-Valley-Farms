import { useState, useEffect } from 'react'
import { Plus, ShoppingCart, Trash2 } from 'lucide-react'
import {
  addInventory, getInventory, recordSale, getSales,
  getEggGrades, createEggGrade, deleteEggGrade,
  getInventoryByFlock, getInventoryAging,
} from '../../api/inventory'
import { getFlocks } from '../../api/flocks'
import SearchSelect from '../common/SearchSelect'
import Modal from '../common/Modal'
import ConfirmDialog from '../common/ConfirmDialog'

const DOZENS_PER_SKID = 900

const TAB_MAP = { floor: 'floor', receiving: 'log', sales: 'sales', grades: 'grades' }

const fmtPeriod = (start, end) => {
  if (!start || !end) return ''
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  return `${s.getMonth()+1}/${s.getDate()}\u2013${e.getMonth()+1}/${e.getDate()}`
}

const CONDITION_BADGE = {
  clean:   'bg-green-500/20 text-green-400',
  dirty:   'bg-amber-500/20 text-amber-400',
  cracked: 'bg-red-500/20 text-red-400',
}

export default function WarehouseTab({ showToast, forceSubTab = null }) {
  const [subTab, setSubTab] = useState(forceSubTab ? (TAB_MAP[forceSubTab] || forceSubTab) : 'floor')
  const [flocks, setFlocks] = useState([])
  const [records, setRecords] = useState([])
  const [sales, setSales] = useState([])
  const [gradeOptions, setGradeOptions] = useState([])
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [saleOpen, setSaleOpen] = useState(false)
  const [addGradeOpen, setAddGradeOpen] = useState(false)
  const [deleteGradeTarget, setDeleteGradeTarget] = useState(null)
  const [byFlock, setByFlock] = useState([])
  const [aging, setAging] = useState([])
  const [submitting, setSubmitting] = useState(false)

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
      const [flocksRes, recordsRes, salesRes, gradesRes, byFlockRes, agingRes] = await Promise.all([
        getFlocks(), getInventory(), getSales(), getEggGrades(),
        getInventoryByFlock().catch(() => ({ data: [] })),
        getInventoryAging(7).catch(() => ({ data: [] })),
      ])
      setFlocks(flocksRes.data || [])
      setRecords(recordsRes.data || [])
      setSales(salesRes.data || [])
      setByFlock(byFlockRes.data || [])
      setAging(agingRes.data || [])
      const grades = (gradesRes.data || []).map(g => ({ value: g.value, label: g.label, id: g.id }))
      setGradeOptions(grades)
      if (grades.length > 0 && !receiveForm.grade) {
        setReceiveForm(prev => ({ ...prev, grade: grades[0].value }))
        setSaleForm(prev => ({ ...prev, grade: grades[0].value }))
      }
    } catch {
      showToast?.('Error loading warehouse data', 'error')
    }
  }

  useEffect(() => {
    if (forceSubTab) {
      const mapped = TAB_MAP[forceSubTab] || forceSubTab
      if (mapped !== subTab) setSubTab(mapped)
    }
  }, [forceSubTab])

  useEffect(() => { load() }, [])

  const flockOptions = flocks.map(f => ({ value: f.id, label: `${f.flock_number} — ${f.current_bird_count} birds` }))
  const gradeSelectOptions = gradeOptions.map(g => ({ value: g.value, label: g.label }))

  const gradeLabel = (val) => {
    const g = gradeOptions.find(o => o.value === val)
    return g ? g.label : val?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || ''
  }

  // Build aging lookup: flock_number+grade_label → age_days
  const agingMap = {}
  aging.forEach(a => { agingMap[`${a.flock_id}_${a.grade}`] = a.age_days })

  const ageBadge = (days) => {
    if (days == null) return { label: 'Fresh', cls: 'bg-lvf-success/20 text-lvf-success' }
    if (days <= 7) return { label: `${days}d`, cls: 'bg-lvf-success/20 text-lvf-success' }
    if (days <= 14) return { label: `${days}d`, cls: 'bg-lvf-warning/20 text-lvf-warning' }
    return { label: `${days}d`, cls: 'bg-lvf-danger/20 text-lvf-danger' }
  }

  // Group byFlock by grower for farm sections
  const growerGroups = byFlock.reduce((acc, f) => {
    const key = f.grower_name || 'Unknown Grower'
    ;(acc[key] = acc[key] || []).push(f)
    return acc
  }, {})

  const handleReceive = async (e) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      const skidsIn = parseInt(receiveForm.skids_in)
      const skidsOut = parseInt(receiveForm.skids_out) || 0
      if (isNaN(skidsIn) || (skidsIn === 0 && skidsOut === 0)) {
        showToast?.('Must specify at least skids in or out', 'error')
        return
      }
      await addInventory({ ...receiveForm, skids_in: skidsIn, skids_out: skidsOut, dozens_per_skid: DOZENS_PER_SKID })
      showToast?.('Inventory received')
      setReceiveOpen(false)
      setReceiveForm(prev => ({ ...prev, skids_in: '', skids_out: 0, notes: '' }))
      load()
    } catch (err) {
      showToast?.(err.response?.data?.detail || 'Error', 'error')
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
      if (isNaN(skids) || skids <= 0) { showToast?.('Skids must be positive', 'error'); return }
      if (isNaN(price) || price <= 0) { showToast?.('Price must be positive', 'error'); return }
      const result = await recordSale({ ...saleForm, skids_sold: skids, price_per_dozen: price })
      showToast?.(`Sale recorded: $${result.data.total_amount.toFixed(2)}`)
      setSaleOpen(false)
      setSaleForm(prev => ({ ...prev, flock_id: '', buyer: '', grade: '', skids_sold: '', price_per_dozen: '', notes: '' }))
      load()
    } catch (err) {
      showToast?.(err.response?.data?.detail || 'Error', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAddGrade = async (e) => {
    e.preventDefault()
    if (submitting || !newGrade.label.trim()) { showToast?.('Grade name required', 'error'); return }
    setSubmitting(true)
    try {
      const value = newGrade.label.trim().toLowerCase().replace(/\s+/g, '_')
      await createEggGrade({ value, label: newGrade.label.trim() })
      showToast?.('Grade added')
      setAddGradeOpen(false)
      setNewGrade({ label: '' })
      load()
    } catch (err) {
      showToast?.(err.response?.data?.detail || 'Error', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteGrade = async () => {
    if (!deleteGradeTarget) return
    try {
      await deleteEggGrade(deleteGradeTarget.id)
      showToast?.('Grade removed')
      setDeleteGradeTarget(null)
      load()
    } catch (err) {
      showToast?.(err.response?.data?.detail || 'Error', 'error')
    }
  }

  return (
    <div>
      {/* Actions */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setSaleOpen(true)} className="glass-button-secondary flex items-center gap-2 text-sm">
          <ShoppingCart size={14} /> Record Sale
        </button>
        <button onClick={() => setReceiveOpen(true)} className="glass-button-primary flex items-center gap-2 text-sm">
          <Plus size={14} /> Receive Eggs
        </button>
      </div>

      {/* Sub-tabs (hidden when parent controls tab) */}
      {!forceSubTab && (
        <div className="flex gap-1 mb-4 p-1 glass-card w-fit">
          {[
            { id: 'floor', label: 'Warehouse Floor' },
            { id: 'log', label: 'Receiving Log' },
            { id: 'sales', label: 'Sales' },
            { id: 'grades', label: 'Grades' },
          ].map(t => (
            <button key={t.id} onClick={() => setSubTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                subTab === t.id ? 'bg-lvf-accent/20 text-lvf-accent' : 'text-lvf-muted hover:text-lvf-text hover:bg-white/5'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Warehouse Floor — compact farm boxes with skid rectangles */}
      {subTab === 'floor' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(growerGroups).length > 0 ? Object.entries(growerGroups).map(([growerName, flockItems]) => {
            const farmTotalSkids = flockItems.reduce((s, f) => s + f.total_skids, 0)
            return (
              <div key={growerName} className="glass-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">{growerName}</h3>
                  <span className="text-xs text-lvf-muted font-mono">{farmTotalSkids} skids</span>
                </div>
                <div className="space-y-0">
                  {flockItems.map((f, fi) => (
                    <div key={f.flock_id}>
                      {fi > 0 && <div className="border-t border-lvf-border/30 my-2" />}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-medium text-lvf-accent">{f.flock_number}</span>
                        <span className="text-[10px] text-lvf-muted">{f.barn_name}</span>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {f.grades.map(g => {
                          const days = agingMap[`${f.flock_id}_${g.grade}`]
                          const age = ageBadge(days)
                          const wps = g.weight_per_skid || f.weight_per_skid || 37800
                          const period = fmtPeriod(g.production_period_start, g.production_period_end)
                          return Array.from({ length: Math.min(g.skids_on_hand, 40) }, (_, i) => (
                            <div key={`${g.grade}-${i}`} className="skid-rect group relative"
                                 title={`${g.grade_label} — ${age.label}${period ? ` — ${period}` : ''} — ${wps.toLocaleString()} lbs${g.condition ? ` — ${g.condition}` : ''}`}>
                              {i === 0 && (
                                <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-lvf-card"
                                     style={{ background: days == null || days <= 7 ? '#22c55e' : days <= 14 ? '#eab308' : '#ef4444' }} />
                              )}
                            </div>
                          )).concat(
                            g.skids_on_hand > 40 ? [
                              <span key={`${g.grade}-overflow`} className="text-[9px] text-lvf-muted self-end">+{g.skids_on_hand - 40}</span>
                            ] : []
                          )
                        })}
                      </div>
                      <div className="flex gap-3 mt-1.5 flex-wrap">
                        {f.grades.map(g => {
                          const days = agingMap[`${f.flock_id}_${g.grade}`]
                          const age = ageBadge(days)
                          const wps = g.weight_per_skid || f.weight_per_skid || 37800
                          const period = fmtPeriod(g.production_period_start, g.production_period_end)
                          return (
                            <div key={g.grade} className="flex items-center gap-1.5 text-[10px]">
                              <span className="text-lvf-muted">{g.grade_label}:</span>
                              <span className="font-medium">{g.skids_on_hand}</span>
                              <span className={`px-1 py-px rounded text-[9px] font-medium ${age.cls}`}>{age.label}{period ? ` ${period}` : ''}</span>
                              {g.condition && (
                                <span className={`px-1 py-px rounded text-[9px] font-medium ${CONDITION_BADGE[g.condition] || 'bg-white/10 text-lvf-muted'}`}>{g.condition}</span>
                              )}
                              <span className="text-lvf-muted font-mono">{(g.skids_on_hand * wps).toLocaleString()} lbs</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          }) : (
            <div className="glass-card p-12 text-center text-lvf-muted col-span-full">No warehouse inventory on hand.</div>
          )}
        </div>
      )}

      {/* Receiving Log */}
      {subTab === 'log' && (
        <div className="glass-card overflow-hidden">
          <table className="w-full glass-table">
            <thead>
              <tr><th>Date</th><th>Flock</th><th>Grade</th><th className="text-right">In</th><th className="text-right">Out</th><th className="text-right">On Hand</th><th className="text-right">Dozens</th><th>Notes</th></tr>
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
      {subTab === 'sales' && (
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

      {/* Grades Management */}
      {subTab === 'grades' && (
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
        message={`Remove "${deleteGradeTarget?.label}"? If in use, it will be deactivated instead.`}
      />
    </div>
  )
}
