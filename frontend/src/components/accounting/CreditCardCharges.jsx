import { useState, useEffect } from 'react'
import {
  getCCCharges, createCCCharge, voidCCCharge,
  getVendors, getAccounts, getBankAccounts, getActiveFlocks,
} from '../../api/accounting'
import { getSettings, updateSettings } from '../../api/settings'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'

const today = () => new Date().toISOString().split('T')[0]
const emptyExpenseLine = () => ({ account_id: '', amount: '', memo: '', flock_id: '' })

const initialForm = () => ({
  vendor_name: '', vendor_id: '', charge_date: today(),
  cc_account_id: '', ref_no: '', memo: '',
})

const statusConfig = {
  completed: { label: 'Completed', bg: 'bg-green-500/20', text: 'text-green-300', border: 'border-green-500/40' },
  voided:    { label: 'Voided',    bg: 'bg-red-500/20',   text: 'text-red-300',   border: 'border-red-500/40' },
}

function StatusBadge({ status }) {
  const cfg = statusConfig[status] || statusConfig.completed
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.label}
    </span>
  )
}

export default function CreditCardCharges() {
  const [mode, setMode] = useState('list')
  const [filterTab, setFilterTab] = useState('all')

  // List state
  const [charges, setCharges] = useState([])
  const [loading, setLoading] = useState(false)

  // Form state
  const [form, setForm] = useState(initialForm())
  const [expenseLines, setExpenseLines] = useState([emptyExpenseLine()])
  const [vendors, setVendors] = useState([])
  const [accounts, setAccounts] = useState([])
  const [bankAccounts, setBankAccounts] = useState([])
  const [flocks, setFlocks] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [chargePrefix, setChargePrefix] = useState('CC-')
  const [nextNumber, setNextNumber] = useState('')

  const { toast, showToast, hideToast } = useToast()

  // ── Load list ──
  const loadCharges = async () => {
    setLoading(true)
    try {
      const params = filterTab !== 'all' ? { status: filterTab } : {}
      const res = await getCCCharges(params)
      setCharges(res.data || [])
    } catch {
      setCharges([])
    } finally { setLoading(false) }
  }

  useEffect(() => { loadCharges() }, [filterTab])

  // ── Load form data ──
  const loadFormData = async () => {
    try {
      const [vendorRes, acctRes, bankRes, flockRes, settingsRes] = await Promise.all([
        getVendors(), getAccounts(), getBankAccounts(), getActiveFlocks(), getSettings(),
      ])
      setVendors(vendorRes.data || [])
      setAccounts(acctRes.data || [])
      setBankAccounts(bankRes.data || [])
      setFlocks(flockRes.data || [])

      const s = settingsRes.data || {}
      const prefix = s.cc_charge_prefix?.value || 'CC-'
      const num = s.cc_charge_next_number?.value || ''
      setChargePrefix(prefix)
      setNextNumber(num)
    } catch {
      try { const acctRes = await getAccounts(); setAccounts(acctRes.data || []) } catch {}
    }
  }

  const openNewCharge = () => {
    setForm(initialForm())
    setExpenseLines([emptyExpenseLine()])
    loadFormData()
    setMode('create')
  }

  const goBackToList = () => {
    setMode('list')
    loadCharges()
  }

  // ── Form helpers ──
  const updateField = (field, value) => {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      if (field === 'vendor_name') {
        const match = vendors.find(v => v.name === value || v.vendor_name === value)
        if (match) next.vendor_id = match.id || ''
      }
      return next
    })
  }

  const updateExpenseLine = (idx, field, value) =>
    setExpenseLines(prev => prev.map((line, i) => i === idx ? { ...line, [field]: value } : line))
  const addExpenseLine = () => setExpenseLines(prev => [...prev, emptyExpenseLine()])
  const removeExpenseLine = (idx) => setExpenseLines(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)

  const expenseTotal = expenseLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
  const expenseAccountOptions = accounts.filter(a => a.account_type === 'expense')

  // CC account options: liability accounts + bank accounts
  const ccAccountOptions = [
    ...accounts.filter(a => a.account_type === 'liability' || a.account_type === 'credit_card'),
    ...bankAccounts,
  ]

  // ── Save ──
  const handleSave = async (andNew) => {
    if (submitting) return
    if (!form.vendor_name) { showToast('Vendor is required', 'error'); return }
    if (expenseTotal <= 0) { showToast('Add at least one expense line with an amount', 'error'); return }
    setSubmitting(true)
    try {
      const chargeNumber = nextNumber ? `${chargePrefix}${nextNumber}` : `CC-${Date.now()}`
      const payload = {
        charge_number: chargeNumber,
        vendor_name: form.vendor_name,
        vendor_id: form.vendor_id || undefined,
        charge_date: form.charge_date,
        cc_account_id: form.cc_account_id || undefined,
        ref_no: form.ref_no,
        memo: form.memo,
        amount: expenseTotal,
        expense_lines: expenseLines.filter(l => parseFloat(l.amount) > 0).map(l => ({
          account_id: l.account_id,
          amount: parseFloat(l.amount),
          memo: l.memo,
          flock_id: l.flock_id || undefined,
        })),
      }
      await createCCCharge(payload)
      showToast('Credit card charge saved successfully')

      if (nextNumber) {
        const newNum = String(parseInt(nextNumber, 10) + 1)
        setNextNumber(newNum)
        try { await updateSettings({ cc_charge_next_number: newNum }) } catch {}
      }

      if (andNew) {
        setForm(initialForm())
        setExpenseLines([emptyExpenseLine()])
      } else {
        goBackToList()
      }
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error saving credit card charge', 'error')
    } finally { setSubmitting(false) }
  }

  const handleClear = () => {
    setForm(initialForm())
    setExpenseLines([emptyExpenseLine()])
  }

  // ── Void ──
  const handleVoid = async (charge) => {
    if (!confirm(`Void credit card charge ${charge.charge_number || '#' + charge.id}?`)) return
    try {
      await voidCCCharge(charge.id)
      showToast('Credit card charge voided')
      loadCharges()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error voiding credit card charge', 'error')
    }
  }

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
          <span style={{ fontSize: '9pt', fontWeight: 600 }}>New Credit Card Charge &mdash; Feed, Supplies &amp; Vet</span>
        </div>

        <div className="glass-card p-4 m-2">
          {/* QB-style split */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
            {/* Left: CC Account, Vendor, Date */}
            <div style={{ flex: '0 0 58%' }}>
              <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 2 }}>CREDIT CARD ACCOUNT</label>
              <select className="glass-input text-sm" value={form.cc_account_id}
                onChange={e => updateField('cc_account_id', e.target.value)}
                style={{ fontSize: '10pt', fontWeight: 600, marginBottom: 6 }}>
                <option value="">-- Select Credit Card --</option>
                {ccAccountOptions.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.account_number ? `${a.account_number} - ` : ''}{a.name || a.account_name}
                  </option>
                ))}
              </select>

              <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 2 }}>VENDOR</label>
              <input className="glass-input text-sm" list="cc-vendor-list" value={form.vendor_name}
                onChange={e => updateField('vendor_name', e.target.value)}
                placeholder="Select feed mill, vet, supply co..." style={{ fontSize: '10pt', fontWeight: 600, marginBottom: 6 }} />
              <datalist id="cc-vendor-list">
                {vendors.map((v, i) => <option key={i} value={v.name || v.vendor_name} />)}
              </datalist>

              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Date</label>
              <input className="glass-input text-sm" type="date" value={form.charge_date}
                onChange={e => updateField('charge_date', e.target.value)} />
            </div>

            {/* Right: Total, Ref, Charge #, Memo */}
            <div style={{ flex: 1 }}>
              <div style={{ marginBottom: 6 }}>
                <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Charge Total</label>
                <div style={{ fontSize: '14pt', fontWeight: 700, color: '#60a5fa', padding: '2px 0' }}>
                  ${expenseTotal.toFixed(2)}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                <div>
                  <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Ref. No.</label>
                  <input className="glass-input text-sm" value={form.ref_no}
                    onChange={e => updateField('ref_no', e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Charge #</label>
                  <input className="glass-input text-sm" value={nextNumber ? `${chargePrefix}${nextNumber}` : 'Auto'} readOnly
                    style={{ background: 'rgba(255,255,255,0.05)' }} />
                </div>
              </div>

              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Memo</label>
              <input className="glass-input text-sm" value={form.memo}
                onChange={e => updateField('memo', e.target.value)}
                placeholder="e.g. Feed order - Tractor Supply, Vet visit..." />
            </div>
          </div>

          {/* Expense Lines Table */}
          <div className="border border-lvf-border rounded-b-xl p-3 bg-lvf-dark/20">
            <table className="glass-table w-full">
              <thead><tr>
                <th style={{ width: '30%' }}>Account</th>
                <th style={{ width: '18%' }}>Amount</th>
                <th style={{ width: '22%' }}>Memo</th>
                <th style={{ width: '18%' }}>Flock</th>
                <th style={{ width: '7%' }}></th>
              </tr></thead>
              <tbody>
                {expenseLines.map((line, idx) => (
                  <tr key={idx}>
                    <td>
                      <select className="glass-input text-sm" value={line.account_id}
                        onChange={e => updateExpenseLine(idx, 'account_id', e.target.value)}>
                        <option value="">-- Select --</option>
                        {expenseAccountOptions.map(a => <option key={a.id} value={a.id}>{a.account_number} - {a.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <input className="glass-input text-sm" type="number" step="0.01" min="0" value={line.amount}
                        onChange={e => updateExpenseLine(idx, 'amount', e.target.value)} style={{ textAlign: 'right' }} />
                    </td>
                    <td>
                      <input className="glass-input text-sm" value={line.memo}
                        onChange={e => updateExpenseLine(idx, 'memo', e.target.value)} />
                    </td>
                    <td>
                      <select className="glass-input text-sm" value={line.flock_id}
                        onChange={e => updateExpenseLine(idx, 'flock_id', e.target.value)}>
                        <option value="">-- Flock --</option>
                        {flocks.map(f => (
                          <option key={f.id || f.flock_id} value={f.id || f.flock_id}>
                            {f.flock_number || f.name} {f.grower_name ? `- ${f.grower_name}` : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button type="button" onClick={() => removeExpenseLine(idx)}
                        style={{ color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer', fontSize: '10pt' }}>x</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr>
                <td style={{ border: 'none', paddingTop: 4 }}>
                  <button type="button" onClick={addExpenseLine} className="glass-button-secondary text-sm">+ Add Line</button>
                </td>
                <td style={{ border: 'none', textAlign: 'right', fontWeight: 700, paddingTop: 4 }}>${expenseTotal.toFixed(2)}</td>
                <td colSpan={3} style={{ border: 'none' }}></td>
              </tr></tfoot>
            </table>
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
          <h2 style={{ fontSize: '14pt', fontWeight: 700, margin: 0 }}>Credit Card Charges &mdash; Farm Purchases</h2>
          <button className="glass-button-primary text-sm" onClick={openNewCharge}>+ New CC Charge</button>
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
          <p style={{ textAlign: 'center', padding: 20, color: '#999' }}>Loading credit card charges...</p>
        ) : charges.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 20, color: '#999' }}>No credit card charges found. Click "New CC Charge" to record a purchase.</p>
        ) : (
          <table className="glass-table w-full">
            <thead>
              <tr>
                <th>Charge #</th>
                <th>Date</th>
                <th>Vendor</th>
                <th>CC Account</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {charges.map(c => {
                const st = c.status || 'completed'
                return (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.charge_number || `CC-${c.id}`}</td>
                    <td style={{ color: '#94a3b8' }}>{c.charge_date || '-'}</td>
                    <td>{c.vendor_name || '-'}</td>
                    <td style={{ color: '#94a3b8' }}>{c.cc_account_name || '-'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>${(c.amount || 0).toFixed(2)}</td>
                    <td style={{ textAlign: 'center' }}><StatusBadge status={st} /></td>
                    <td style={{ textAlign: 'center' }}>
                      {st !== 'voided' && (
                        <button className="glass-button-danger text-sm"
                          style={{ padding: '2px 8px', fontSize: '8pt' }}
                          onClick={() => handleVoid(c)}>
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
