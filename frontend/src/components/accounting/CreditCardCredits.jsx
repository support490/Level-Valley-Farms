import { useState, useEffect } from 'react'
import {
  getCCCredits, createCCCredit,
  getVendors, getAccounts, getBankAccounts,
} from '../../api/accounting'
import { getSettings, updateSettings } from '../../api/settings'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'

const today = () => new Date().toISOString().split('T')[0]

const initialForm = () => ({
  vendor_name: '', vendor_id: '', credit_date: today(),
  cc_account_id: '', amount: '', memo: '',
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

export default function CreditCardCredits() {
  const [mode, setMode] = useState('list')
  const [filterTab, setFilterTab] = useState('all')

  // List state
  const [credits, setCredits] = useState([])
  const [loading, setLoading] = useState(false)

  // Form state
  const [form, setForm] = useState(initialForm())
  const [vendors, setVendors] = useState([])
  const [accounts, setAccounts] = useState([])
  const [bankAccounts, setBankAccounts] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [creditPrefix, setCreditPrefix] = useState('CCR-')
  const [nextNumber, setNextNumber] = useState('')

  const { toast, showToast, hideToast } = useToast()

  // ── Load list ──
  const loadCredits = async () => {
    setLoading(true)
    try {
      const params = filterTab !== 'all' ? { status: filterTab } : {}
      const res = await getCCCredits(params)
      setCredits(res.data || [])
    } catch {
      setCredits([])
    } finally { setLoading(false) }
  }

  useEffect(() => { loadCredits() }, [filterTab])

  // ── Load form data ──
  const loadFormData = async () => {
    try {
      const [vendorRes, acctRes, bankRes, settingsRes] = await Promise.all([
        getVendors(), getAccounts(), getBankAccounts(), getSettings(),
      ])
      setVendors(vendorRes.data || [])
      setAccounts(acctRes.data || [])
      setBankAccounts(bankRes.data || [])

      const s = settingsRes.data || {}
      const prefix = s.cc_credit_prefix?.value || 'CCR-'
      const num = s.cc_credit_next_number?.value || ''
      setCreditPrefix(prefix)
      setNextNumber(num)
    } catch {}
  }

  // CC account options: liability accounts + bank accounts
  const ccAccountOptions = [
    ...accounts.filter(a => a.account_type === 'liability' || a.account_type === 'credit_card'),
    ...bankAccounts,
  ]

  const openNewCredit = () => {
    setForm(initialForm())
    loadFormData()
    setMode('create')
  }

  const goBackToList = () => {
    setMode('list')
    loadCredits()
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

  // ── Save ──
  const handleSave = async (andNew) => {
    if (submitting) return
    if (!form.vendor_name) { showToast('Vendor is required', 'error'); return }
    if (!form.amount || parseFloat(form.amount) <= 0) { showToast('Amount is required', 'error'); return }
    setSubmitting(true)
    try {
      const creditNumber = nextNumber ? `${creditPrefix}${nextNumber}` : `CCR-${Date.now()}`
      const payload = {
        credit_number: creditNumber,
        vendor_name: form.vendor_name,
        vendor_id: form.vendor_id || undefined,
        credit_date: form.credit_date,
        cc_account_id: form.cc_account_id || undefined,
        amount: parseFloat(form.amount),
        memo: form.memo,
      }
      await createCCCredit(payload)
      showToast('Credit card credit saved successfully')

      if (nextNumber) {
        const newNum = String(parseInt(nextNumber, 10) + 1)
        setNextNumber(newNum)
        try { await updateSettings({ cc_credit_next_number: newNum }) } catch {}
      }

      if (andNew) {
        setForm(initialForm())
      } else {
        goBackToList()
      }
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error saving credit card credit', 'error')
    } finally { setSubmitting(false) }
  }

  const handleClear = () => {
    setForm(initialForm())
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
          <span style={{ fontSize: '9pt', fontWeight: 600 }}>New Credit Card Credit &mdash; Return / Refund</span>
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
              <input className="glass-input text-sm" list="ccr-vendor-list" value={form.vendor_name}
                onChange={e => updateField('vendor_name', e.target.value)}
                placeholder="Select feed mill, vet, supply co..." style={{ fontSize: '10pt', fontWeight: 600, marginBottom: 6 }} />
              <datalist id="ccr-vendor-list">
                {vendors.map((v, i) => <option key={i} value={v.name || v.vendor_name} />)}
              </datalist>

              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Date</label>
              <input className="glass-input text-sm" type="date" value={form.credit_date}
                onChange={e => updateField('credit_date', e.target.value)} />
            </div>

            {/* Right: Amount, Credit #, Memo */}
            <div style={{ flex: 1 }}>
              <div style={{ marginBottom: 6 }}>
                <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Credit Amount</label>
                <input className="glass-input" type="number" step="0.01" min="0" value={form.amount}
                  onChange={e => updateField('amount', e.target.value)}
                  placeholder="0.00"
                  style={{ fontSize: '14pt', fontWeight: 700, textAlign: 'right' }} />
              </div>

              <div style={{ marginBottom: 6 }}>
                <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Credit #</label>
                <input className="glass-input text-sm" value={nextNumber ? `${creditPrefix}${nextNumber}` : 'Auto'} readOnly
                  style={{ background: 'rgba(255,255,255,0.05)' }} />
              </div>

              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Memo</label>
              <input className="glass-input text-sm" value={form.memo}
                onChange={e => updateField('memo', e.target.value)}
                placeholder="e.g. Returned feed bags, credit from supplier..." />
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
          <h2 style={{ fontSize: '14pt', fontWeight: 700, margin: 0 }}>Credit Card Credits &mdash; Returns &amp; Refunds</h2>
          <button className="glass-button-primary text-sm" onClick={openNewCredit}>+ New CC Credit</button>
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
          <p style={{ textAlign: 'center', padding: 20, color: '#999' }}>Loading credit card credits...</p>
        ) : credits.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 20, color: '#999' }}>No credit card credits found. Click "New CC Credit" to record a return.</p>
        ) : (
          <table className="glass-table w-full">
            <thead>
              <tr>
                <th>Credit #</th>
                <th>Date</th>
                <th>Vendor</th>
                <th>CC Account</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th style={{ textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {credits.map(c => {
                const st = c.status || 'completed'
                return (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.credit_number || `CCR-${c.id}`}</td>
                    <td style={{ color: '#94a3b8' }}>{c.credit_date || '-'}</td>
                    <td>{c.vendor_name || '-'}</td>
                    <td style={{ color: '#94a3b8' }}>{c.cc_account_name || '-'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>${(c.amount || 0).toFixed(2)}</td>
                    <td style={{ textAlign: 'center' }}><StatusBadge status={st} /></td>
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
