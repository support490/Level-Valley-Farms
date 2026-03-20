import { useState, useEffect } from 'react'
import {
  getInventoryAdjustments, createInventoryAdjustment, voidInventoryAdjustment,
  getAccounts, getActiveFlocks,
} from '../../api/accounting'
import { getSettings, updateSettings } from '../../api/settings'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'

const today = () => new Date().toISOString().split('T')[0]

const initialForm = () => ({
  adjustment_date: today(), adjustment_type: 'Increase',
  account_id: '', quantity: '', unit_value: '', reason: '', flock_id: '',
})

const statusConfig = {
  completed: { label: 'Completed', bg: 'bg-green-500/20', text: 'text-green-300', border: 'border-green-500/40' },
  voided:    { label: 'Voided',    bg: 'bg-red-500/20',   text: 'text-red-300',   border: 'border-red-500/40' },
}

const typeConfig = {
  Increase: { label: 'Increase', bg: 'bg-green-500/20', text: 'text-green-300', border: 'border-green-500/40' },
  Decrease: { label: 'Decrease', bg: 'bg-orange-500/20', text: 'text-orange-300', border: 'border-orange-500/40' },
}

function StatusBadge({ status }) {
  const cfg = statusConfig[status] || statusConfig.completed
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.label}
    </span>
  )
}

function TypeBadge({ type }) {
  const cfg = typeConfig[type] || typeConfig.Increase
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.label}
    </span>
  )
}

export default function InventoryAdjustments() {
  const [mode, setMode] = useState('list')
  const [filterTab, setFilterTab] = useState('all')

  // List state
  const [adjustments, setAdjustments] = useState([])
  const [loading, setLoading] = useState(false)

  // Form state
  const [form, setForm] = useState(initialForm())
  const [accounts, setAccounts] = useState([])
  const [flocks, setFlocks] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [adjPrefix, setAdjPrefix] = useState('IA-')
  const [nextNumber, setNextNumber] = useState('')

  const { toast, showToast, hideToast } = useToast()

  // ── Load list ──
  const loadAdjustments = async () => {
    setLoading(true)
    try {
      const params = filterTab !== 'all' ? { status: filterTab } : {}
      const res = await getInventoryAdjustments(params)
      setAdjustments(res.data || [])
    } catch {
      setAdjustments([])
    } finally { setLoading(false) }
  }

  useEffect(() => { loadAdjustments() }, [filterTab])

  // ── Load form data ──
  const loadFormData = async () => {
    try {
      const [acctRes, flockRes, settingsRes] = await Promise.all([
        getAccounts(), getActiveFlocks(), getSettings(),
      ])
      setAccounts(acctRes.data || [])
      setFlocks(flockRes.data || [])

      const s = settingsRes.data || {}
      const prefix = s.inventory_adj_prefix?.value || 'IA-'
      const num = s.inventory_adj_next_number?.value || ''
      setAdjPrefix(prefix)
      setNextNumber(num)
    } catch {
      try { const acctRes = await getAccounts(); setAccounts(acctRes.data || []) } catch {}
    }
  }

  const openNewAdjustment = () => {
    setForm(initialForm())
    loadFormData()
    setMode('create')
  }

  const goBackToList = () => {
    setMode('list')
    loadAdjustments()
  }

  // ── Form helpers ──
  const updateField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const qty = parseFloat(form.quantity) || 0
  const unitVal = parseFloat(form.unit_value) || 0
  const totalValue = qty * unitVal

  // ── Save ──
  const handleSave = async (andNew) => {
    if (submitting) return
    if (qty <= 0) { showToast('Quantity must be greater than zero', 'error'); return }
    if (unitVal <= 0) { showToast('Unit value must be greater than zero', 'error'); return }
    if (!form.reason) { showToast('Reason is required', 'error'); return }
    setSubmitting(true)
    try {
      const adjNumber = nextNumber ? `${adjPrefix}${nextNumber}` : `IA-${Date.now()}`
      const payload = {
        adjustment_number: adjNumber,
        adjustment_date: form.adjustment_date,
        adjustment_type: form.adjustment_type,
        account_id: form.account_id || undefined,
        quantity: qty,
        unit_value: unitVal,
        total_value: totalValue,
        reason: form.reason,
        flock_id: form.flock_id || undefined,
      }
      await createInventoryAdjustment(payload)
      showToast('Inventory adjustment saved successfully')

      if (nextNumber) {
        const newNum = String(parseInt(nextNumber, 10) + 1)
        setNextNumber(newNum)
        try { await updateSettings({ inventory_adj_next_number: newNum }) } catch {}
      }

      if (andNew) {
        setForm(initialForm())
      } else {
        goBackToList()
      }
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error saving inventory adjustment', 'error')
    } finally { setSubmitting(false) }
  }

  const handleClear = () => {
    setForm(initialForm())
  }

  // ── Void ──
  const handleVoid = async (adj) => {
    if (!confirm(`Void inventory adjustment ${adj.adjustment_number || '#' + adj.id}?`)) return
    try {
      await voidInventoryAdjustment(adj.id)
      showToast('Inventory adjustment voided')
      loadAdjustments()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error voiding inventory adjustment', 'error')
    }
  }

  // inventory-related accounts
  const inventoryAccountOptions = accounts.filter(a =>
    a.account_type === 'asset' || a.account_type === 'inventory' || a.account_type === 'expense'
  )

  // ════════════════════════════════════════
  // CREATE VIEW
  // ════════════════════════════════════════
  if (mode === 'create') {
    return (
      <div>
        {toast && <Toast {...toast} onClose={hideToast} />}

        {/* Header strip */}
        <div className="bg-lvf-dark/30 border-b border-lvf-border" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '3px 8px',
        }}>
          <button className="glass-button-secondary text-sm" style={{ padding: '2px 8px' }} onClick={goBackToList}>
            &#9664; Back to List
          </button>
          <span style={{ fontSize: '9pt', fontWeight: 600 }}>New Inventory Adjustment &mdash; Egg Inventory Count</span>
        </div>

        <div className="glass-card p-4 m-2">
          {/* QB-style split */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
            {/* Left: Date, Type, Account */}
            <div style={{ flex: '0 0 58%' }}>
              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Adjustment Date</label>
              <input className="glass-input text-sm" type="date" value={form.adjustment_date}
                onChange={e => updateField('adjustment_date', e.target.value)} style={{ marginBottom: 8 }} />

              <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 4 }}>TYPE</label>
              <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: '10pt' }}>
                  <input type="radio" name="adj_type" value="Increase"
                    checked={form.adjustment_type === 'Increase'}
                    onChange={e => updateField('adjustment_type', e.target.value)} />
                  <span style={{ color: '#4ade80' }}>Increase</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: '10pt' }}>
                  <input type="radio" name="adj_type" value="Decrease"
                    checked={form.adjustment_type === 'Decrease'}
                    onChange={e => updateField('adjustment_type', e.target.value)} />
                  <span style={{ color: '#fb923c' }}>Decrease</span>
                </label>
              </div>

              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Account</label>
              <select className="glass-input text-sm" value={form.account_id}
                onChange={e => updateField('account_id', e.target.value)} style={{ marginBottom: 8 }}>
                <option value="">-- Select Account --</option>
                {inventoryAccountOptions.map(a => (
                  <option key={a.id} value={a.id}>{a.account_number} - {a.name}</option>
                ))}
              </select>

              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Flock (optional)</label>
              <select className="glass-input text-sm" value={form.flock_id}
                onChange={e => updateField('flock_id', e.target.value)}>
                <option value="">-- No Flock --</option>
                {flocks.map(f => (
                  <option key={f.id || f.flock_id} value={f.id || f.flock_id}>
                    {f.flock_number || f.name} {f.grower_name ? `- ${f.grower_name}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Right: Qty, Unit Value, Total, Adj #, Reason */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                <div>
                  <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Quantity (cases)</label>
                  <input className="glass-input text-sm" type="number" step="1" min="0" value={form.quantity}
                    onChange={e => updateField('quantity', e.target.value)}
                    style={{ textAlign: 'right' }} placeholder="0" />
                </div>
                <div>
                  <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Unit Value ($)</label>
                  <input className="glass-input text-sm" type="number" step="0.01" min="0" value={form.unit_value}
                    onChange={e => updateField('unit_value', e.target.value)}
                    style={{ textAlign: 'right' }} placeholder="0.00" />
                </div>
              </div>

              <div style={{ marginBottom: 6 }}>
                <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Total Value</label>
                <div style={{
                  fontSize: '14pt', fontWeight: 700, padding: '2px 0',
                  color: form.adjustment_type === 'Decrease' ? '#fb923c' : '#4ade80',
                }}>
                  {form.adjustment_type === 'Decrease' ? '-' : '+'}${totalValue.toFixed(2)}
                </div>
              </div>

              <div style={{ marginBottom: 6 }}>
                <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Adjustment #</label>
                <input className="glass-input text-sm" value={nextNumber ? `${adjPrefix}${nextNumber}` : 'Auto'} readOnly
                  style={{ background: 'rgba(255,255,255,0.05)' }} />
              </div>

              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Reason</label>
              <input className="glass-input text-sm" value={form.reason}
                onChange={e => updateField('reason', e.target.value)}
                placeholder="e.g. Physical count variance, breakage, spoilage..." />
            </div>
          </div>

          {/* Footer Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8 }}>
            <button type="button" onClick={handleClear} className="glass-button-secondary text-sm">Revert</button>
            <button type="button" onClick={() => handleSave(true)} disabled={submitting} className="glass-button-primary text-sm">
              {submitting ? 'Saving...' : 'Save & New'}
            </button>
            <button type="button" onClick={() => handleSave(false)} disabled={submitting} className="glass-button-primary text-sm">
              {submitting ? 'Saving...' : 'Save & Close'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════
  // LIST VIEW
  // ════════════════════════════════════════
  const filterTabs = [
    { key: 'all', label: 'All' },
    { key: 'completed', label: 'Completed' },
    { key: 'voided', label: 'Voided' },
  ]

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      <div className="glass-card p-4 m-2">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: '14pt', fontWeight: 700, margin: 0 }}>Inventory Adjustments &mdash; Egg Inventory</h2>
          <button className="glass-button-primary text-sm" onClick={openNewAdjustment}>+ New Adjustment</button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 px-2 mb-3">
          {filterTabs.map(tab => (
            <button key={tab.key}
              className={filterTab === tab.key
                ? 'bg-lvf-dark/60 text-lvf-accent font-semibold px-3 py-1.5 text-sm rounded-t-lg border border-lvf-border border-b-0'
                : 'px-3 py-1.5 text-sm text-lvf-muted hover:text-lvf-text cursor-pointer'}
              onClick={() => setFilterTab(tab.key)}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <p style={{ textAlign: 'center', padding: 20, color: '#999' }}>Loading inventory adjustments...</p>
        ) : adjustments.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 20, color: '#999' }}>No inventory adjustments found. Click "New Adjustment" to adjust egg inventory.</p>
        ) : (
          <table className="glass-table w-full">
            <thead>
              <tr>
                <th>Adj #</th>
                <th>Date</th>
                <th style={{ textAlign: 'center' }}>Type</th>
                <th style={{ textAlign: 'right' }}>Qty</th>
                <th style={{ textAlign: 'right' }}>Value</th>
                <th>Reason</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {adjustments.map(a => {
                const st = a.status || 'completed'
                const adjType = a.adjustment_type || 'Increase'
                return (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{a.adjustment_number || `IA-${a.id}`}</td>
                    <td style={{ color: '#94a3b8' }}>{a.adjustment_date || '-'}</td>
                    <td style={{ textAlign: 'center' }}><TypeBadge type={adjType} /></td>
                    <td style={{ textAlign: 'right' }}>{a.quantity || 0}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>${(a.total_value || 0).toFixed(2)}</td>
                    <td style={{ color: '#94a3b8', fontSize: '9pt' }}>{a.reason || '-'}</td>
                    <td style={{ textAlign: 'center' }}><StatusBadge status={st} /></td>
                    <td style={{ textAlign: 'center' }}>
                      {st !== 'voided' && (
                        <button className="glass-button-danger text-sm"
                          style={{ padding: '2px 8px', fontSize: '8pt' }}
                          onClick={() => handleVoid(a)}>
                          Void
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
