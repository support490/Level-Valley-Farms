import { useState, useEffect } from 'react'
import {
  getCustomerDeposits, createCustomerDeposit, applyCustomerDeposit,
  getBuyers, getBankAccounts, getInvoices,
} from '../../api/accounting'
import { getSettings, updateSettings } from '../../api/settings'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'

const today = () => new Date().toISOString().split('T')[0]

const initialForm = () => ({
  customer_name: '', customer_id: '', deposit_date: today(),
  amount: '', payment_method: 'Check', deposit_to: '', memo: '',
})

const statusConfig = {
  unapplied: { label: 'Unapplied', bg: 'bg-yellow-500/20', text: 'text-yellow-300', border: 'border-yellow-500/40' },
  applied:   { label: 'Applied',   bg: 'bg-green-500/20',  text: 'text-green-300',  border: 'border-green-500/40' },
  voided:    { label: 'Voided',    bg: 'bg-red-500/20',    text: 'text-red-300',    border: 'border-red-500/40' },
}

function StatusBadge({ status }) {
  const cfg = statusConfig[status] || statusConfig.unapplied
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.label}
    </span>
  )
}

export default function CustomerDeposits() {
  const [mode, setMode] = useState('list')
  const [filterTab, setFilterTab] = useState('all')

  // List state
  const [deposits, setDeposits] = useState([])
  const [loading, setLoading] = useState(false)

  // Form state
  const [form, setForm] = useState(initialForm())
  const [buyers, setBuyers] = useState([])
  const [bankAccounts, setBankAccounts] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [depositPrefix, setDepositPrefix] = useState('CD-')
  const [nextNumber, setNextNumber] = useState('')

  // Apply modal state
  const [applyTarget, setApplyTarget] = useState(null)
  const [customerInvoices, setCustomerInvoices] = useState([])
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('')

  const { toast, showToast, hideToast } = useToast()

  // ── Load list ──
  const loadDeposits = async () => {
    setLoading(true)
    try {
      const params = filterTab !== 'all' ? { status: filterTab } : {}
      const res = await getCustomerDeposits(params)
      setDeposits(res.data || [])
    } catch {
      setDeposits([])
    } finally { setLoading(false) }
  }

  useEffect(() => { loadDeposits() }, [filterTab])

  // ── Load form data ──
  const loadFormData = async () => {
    try {
      const [buyerRes, bankRes, settingsRes] = await Promise.all([
        getBuyers(), getBankAccounts(), getSettings(),
      ])
      setBuyers(buyerRes.data || [])
      setBankAccounts(bankRes.data || [])

      const s = settingsRes.data || {}
      const prefix = s.customer_deposit_prefix?.value || 'CD-'
      const num = s.customer_deposit_next_number?.value || ''
      setDepositPrefix(prefix)
      setNextNumber(num)
    } catch {}
  }

  const openNewDeposit = () => {
    setForm(initialForm())
    loadFormData()
    setMode('create')
  }

  const goBackToList = () => {
    setMode('list')
    loadDeposits()
  }

  // ── Form helpers ──
  const updateField = (field, value) => {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      if (field === 'customer_name') {
        const match = buyers.find(b => b.name === value || b.buyer_name === value)
        if (match) next.customer_id = match.id || ''
      }
      return next
    })
  }

  // ── Save ──
  const handleSave = async (andNew) => {
    if (submitting) return
    if (!form.customer_name) { showToast('Egg buyer is required', 'error'); return }
    if (!form.amount || parseFloat(form.amount) <= 0) { showToast('Deposit amount is required', 'error'); return }
    setSubmitting(true)
    try {
      const depositNumber = nextNumber ? `${depositPrefix}${nextNumber}` : `CD-${Date.now()}`
      const payload = {
        deposit_number: depositNumber,
        customer_name: form.customer_name,
        customer_id: form.customer_id || undefined,
        deposit_date: form.deposit_date,
        amount: parseFloat(form.amount),
        payment_method: form.payment_method,
        deposit_to: form.deposit_to || undefined,
        memo: form.memo,
      }
      await createCustomerDeposit(payload)
      showToast('Customer deposit saved successfully')

      if (nextNumber) {
        const newNum = String(parseInt(nextNumber, 10) + 1)
        setNextNumber(newNum)
        try { await updateSettings({ customer_deposit_next_number: newNum }) } catch {}
      }

      if (andNew) {
        setForm(initialForm())
      } else {
        goBackToList()
      }
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error saving customer deposit', 'error')
    } finally { setSubmitting(false) }
  }

  const handleClear = () => {
    setForm(initialForm())
  }

  // ── Apply to Invoice ──
  const openApplyModal = async (deposit) => {
    setApplyTarget(deposit)
    setSelectedInvoiceId('')
    try {
      const res = await getInvoices({ status: 'unpaid' })
      const allInvoices = res.data || []
      const custName = deposit.customer_name || ''
      setCustomerInvoices(allInvoices.filter(inv =>
        (inv.customer_name || inv.buyer_name || '').toLowerCase() === custName.toLowerCase()
      ))
    } catch {
      setCustomerInvoices([])
    }
  }

  const handleApply = async () => {
    if (!selectedInvoiceId) { showToast('Select an invoice to apply to', 'error'); return }
    setSubmitting(true)
    try {
      await applyCustomerDeposit(applyTarget.id, selectedInvoiceId)
      showToast('Deposit applied to invoice')
      setApplyTarget(null)
      setSelectedInvoiceId('')
      loadDeposits()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error applying deposit', 'error')
    } finally { setSubmitting(false) }
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
          <span style={{ fontSize: '9pt', fontWeight: 600 }}>New Customer Deposit &mdash; Upfront Egg Buyer Payment</span>
        </div>

        <div className="glass-card p-4 m-2">
          {/* QB-style split */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
            {/* Left: Customer + Date + Payment + Bank */}
            <div style={{ flex: '0 0 58%' }}>
              <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 2 }}>EGG BUYER</label>
              <input className="glass-input text-sm" list="cd-buyer-list" value={form.customer_name}
                onChange={e => updateField('customer_name', e.target.value)}
                placeholder="Select egg buyer..." style={{ fontSize: '10pt', fontWeight: 600, marginBottom: 6 }} />
              <datalist id="cd-buyer-list">
                {buyers.map((b, i) => <option key={i} value={b.name || b.buyer_name} />)}
              </datalist>

              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Deposit Date</label>
              <input className="glass-input text-sm" type="date" value={form.deposit_date}
                onChange={e => updateField('deposit_date', e.target.value)} style={{ marginBottom: 6 }} />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div>
                  <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Payment Method</label>
                  <select className="glass-input text-sm" value={form.payment_method}
                    onChange={e => updateField('payment_method', e.target.value)}>
                    <option value="Check">Check</option>
                    <option value="Cash">Cash</option>
                    <option value="ACH">ACH</option>
                    <option value="Credit Card">Credit Card</option>
                    <option value="Wire Transfer">Wire Transfer</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Deposit To</label>
                  <select className="glass-input text-sm" value={form.deposit_to}
                    onChange={e => updateField('deposit_to', e.target.value)}>
                    <option value="">-- Select Bank Account --</option>
                    {bankAccounts.map(ba => (
                      <option key={ba.id} value={ba.id}>{ba.name || ba.account_name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Right: Amount, Deposit #, Memo */}
            <div style={{ flex: 1 }}>
              <div style={{ marginBottom: 6 }}>
                <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Deposit Amount</label>
                <input className="glass-input" type="number" step="0.01" min="0" value={form.amount}
                  onChange={e => updateField('amount', e.target.value)}
                  placeholder="0.00"
                  style={{ fontSize: '14pt', fontWeight: 700, textAlign: 'right' }} />
              </div>

              <div style={{ marginBottom: 6 }}>
                <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Deposit #</label>
                <input className="glass-input text-sm" value={nextNumber ? `${depositPrefix}${nextNumber}` : 'Auto'} readOnly
                  style={{ background: 'rgba(255,255,255,0.05)' }} />
              </div>

              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Memo</label>
              <input className="glass-input text-sm" value={form.memo}
                onChange={e => updateField('memo', e.target.value)}
                placeholder="e.g. Advance payment for Q2 egg contract" />
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
    { key: 'unapplied', label: 'Unapplied' },
    { key: 'applied', label: 'Applied' },
    { key: 'voided', label: 'Voided' },
  ]

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      <div className="glass-card p-4 m-2">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: '14pt', fontWeight: 700, margin: 0 }}>Customer Deposits &mdash; Upfront Egg Buyer Payments</h2>
          <button className="glass-button-primary text-sm" onClick={openNewDeposit}>+ New Deposit</button>
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
          <p style={{ textAlign: 'center', padding: 20, color: '#999' }}>Loading customer deposits...</p>
        ) : deposits.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 20, color: '#999' }}>No customer deposits found. Click "New Deposit" to record an upfront payment.</p>
        ) : (
          <table className="glass-table w-full">
            <thead>
              <tr>
                <th>Deposit #</th>
                <th>Date</th>
                <th>Customer</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>Method</th>
                <th style={{ textAlign: 'center' }}>Applied?</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {deposits.map(d => {
                const st = d.status || 'unapplied'
                return (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 600 }}>{d.deposit_number || `CD-${d.id}`}</td>
                    <td style={{ color: '#94a3b8' }}>{d.deposit_date || '-'}</td>
                    <td>{d.customer_name || '-'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>${(d.amount || 0).toFixed(2)}</td>
                    <td>{d.payment_method || '-'}</td>
                    <td style={{ textAlign: 'center' }}>
                      {st === 'applied' ? (
                        <span style={{ color: '#4ade80', fontSize: '9pt' }}>Yes</span>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: '9pt' }}>No</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}><StatusBadge status={st} /></td>
                    <td style={{ textAlign: 'center' }}>
                      {st === 'unapplied' && (
                        <button className="glass-button-primary text-sm"
                          style={{ padding: '2px 8px', fontSize: '8pt' }}
                          onClick={() => openApplyModal(d)}>
                          Apply to Invoice
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

      {/* ── Apply to Invoice Modal ── */}
      {applyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="glass-card p-4 m-2" style={{ minWidth: 400, maxWidth: 500 }}>
            <h4 className="text-sm font-semibold mb-3">
              Apply Deposit {applyTarget.deposit_number || `CD-${applyTarget.id}`}
            </h4>
            <p className="text-xs text-lvf-muted mb-3">
              Deposit Amount: <span className="font-bold text-lvf-text">${(applyTarget.amount || 0).toFixed(2)}</span>
              {' '}&mdash; Customer: {applyTarget.customer_name}
            </p>

            <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>
              Select Open Invoice
            </label>
            <select className="glass-input text-sm" style={{ width: '100%', marginBottom: 12 }}
              value={selectedInvoiceId} onChange={e => setSelectedInvoiceId(e.target.value)}>
              <option value="">-- Select an invoice --</option>
              {customerInvoices.map(inv => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoice_number || `INV-${inv.id}`} &mdash; ${(inv.amount || inv.total || 0).toFixed(2)} &mdash; {inv.invoice_date || inv.due_date || ''}
                </option>
              ))}
            </select>

            {customerInvoices.length === 0 && (
              <p style={{ fontSize: '8pt', color: '#f87171', marginBottom: 8 }}>
                No open invoices found for this egg buyer.
              </p>
            )}

            <div className="flex gap-3 justify-end">
              <button className="glass-button-secondary text-sm"
                onClick={() => { setApplyTarget(null); setSelectedInvoiceId('') }}>
                Cancel
              </button>
              <button className="glass-button-primary text-sm" disabled={submitting}
                onClick={handleApply}>
                {submitting ? 'Applying...' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
