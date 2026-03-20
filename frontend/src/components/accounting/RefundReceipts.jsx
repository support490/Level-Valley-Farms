import { useState, useEffect } from 'react'
import {
  getRefundReceipts, createRefundReceipt, voidRefundReceipt,
  getBuyers, getBankAccounts,
} from '../../api/accounting'
import { getSettings, updateSettings } from '../../api/settings'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'

const today = () => new Date().toISOString().split('T')[0]
const emptyLine = () => ({ description: '', quantity: '', rate: '', amount: '' })

const initialForm = () => ({
  customer_name: '', customer_id: '', refund_date: today(),
  refund_method: 'Check', refund_from: '', memo: '', original_receipt_ref: '',
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

export default function RefundReceipts() {
  const [mode, setMode] = useState('list')
  const [filterTab, setFilterTab] = useState('all')

  // List state
  const [refunds, setRefunds] = useState([])
  const [loading, setLoading] = useState(false)

  // Form state
  const [form, setForm] = useState(initialForm())
  const [lines, setLines] = useState([emptyLine()])
  const [buyers, setBuyers] = useState([])
  const [bankAccounts, setBankAccounts] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [refundPrefix, setRefundPrefix] = useState('RR-')
  const [nextNumber, setNextNumber] = useState('')

  const { toast, showToast, hideToast } = useToast()

  // ── Load list ──
  const loadRefunds = async () => {
    setLoading(true)
    try {
      const params = filterTab !== 'all' ? { status: filterTab } : {}
      const res = await getRefundReceipts(params)
      setRefunds(res.data || [])
    } catch {
      setRefunds([])
    } finally { setLoading(false) }
  }

  useEffect(() => { loadRefunds() }, [filterTab])

  // ── Load form data ──
  const loadFormData = async () => {
    try {
      const [buyerRes, bankRes, settingsRes] = await Promise.all([
        getBuyers(), getBankAccounts(), getSettings(),
      ])
      setBuyers(buyerRes.data || [])
      setBankAccounts(bankRes.data || [])

      const s = settingsRes.data || {}
      const prefix = s.refund_receipt_prefix?.value || 'RR-'
      const num = s.refund_receipt_next_number?.value || ''
      setRefundPrefix(prefix)
      setNextNumber(num)
    } catch {}
  }

  const openNewRefund = () => {
    setForm(initialForm())
    setLines([emptyLine()])
    loadFormData()
    setMode('create')
  }

  const goBackToList = () => {
    setMode('list')
    loadRefunds()
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

  const updateLine = (idx, field, value) => {
    setLines(prev => prev.map((line, i) => {
      if (i !== idx) return line
      const updated = { ...line, [field]: value }
      if (field === 'quantity' || field === 'rate') {
        const qty = parseFloat(field === 'quantity' ? value : line.quantity) || 0
        const rate = parseFloat(field === 'rate' ? value : line.rate) || 0
        updated.amount = (qty * rate).toFixed(2)
      }
      return updated
    }))
  }
  const addLine = () => setLines(prev => [...prev, emptyLine()])
  const removeLine = (idx) => setLines(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)

  const lineTotal = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)

  // ── Save ──
  const handleSave = async (andNew) => {
    if (submitting) return
    if (!form.customer_name) { showToast('Egg buyer is required', 'error'); return }
    if (lineTotal <= 0) { showToast('Add at least one line item with an amount', 'error'); return }
    setSubmitting(true)
    try {
      const refundNumber = nextNumber ? `${refundPrefix}${nextNumber}` : `RR-${Date.now()}`
      const payload = {
        refund_number: refundNumber,
        customer_name: form.customer_name,
        customer_id: form.customer_id || undefined,
        refund_date: form.refund_date,
        refund_method: form.refund_method,
        refund_from: form.refund_from || undefined,
        memo: form.memo,
        original_receipt_ref: form.original_receipt_ref || undefined,
        amount: lineTotal,
        lines: lines.filter(l => parseFloat(l.amount) > 0).map(l => ({
          description: l.description,
          quantity: parseFloat(l.quantity) || 0,
          rate: parseFloat(l.rate) || 0,
          amount: parseFloat(l.amount),
        })),
      }
      await createRefundReceipt(payload)
      showToast('Refund receipt saved successfully')

      if (nextNumber) {
        const newNum = String(parseInt(nextNumber, 10) + 1)
        setNextNumber(newNum)
        try { await updateSettings({ refund_receipt_next_number: newNum }) } catch {}
      }

      if (andNew) {
        setForm(initialForm())
        setLines([emptyLine()])
      } else {
        goBackToList()
      }
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error saving refund receipt', 'error')
    } finally { setSubmitting(false) }
  }

  const handleClear = () => {
    setForm(initialForm())
    setLines([emptyLine()])
  }

  // ── Void ──
  const handleVoid = async (refund) => {
    if (!confirm(`Void refund receipt ${refund.refund_number || '#' + refund.id}?`)) return
    try {
      await voidRefundReceipt(refund.id)
      showToast('Refund receipt voided')
      loadRefunds()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error voiding refund receipt', 'error')
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
          <span style={{ fontSize: '9pt', fontWeight: 600 }}>New Refund Receipt &mdash; Returned / Damaged Eggs</span>
        </div>

        <div className="glass-card p-4 m-2">
          {/* QB-style split */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
            {/* Left: Customer + Date + Refund Method */}
            <div style={{ flex: '0 0 58%' }}>
              <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 2 }}>EGG BUYER</label>
              <input className="glass-input text-sm" list="rr-buyer-list" value={form.customer_name}
                onChange={e => updateField('customer_name', e.target.value)}
                placeholder="Select egg buyer..." style={{ fontSize: '10pt', fontWeight: 600, marginBottom: 6 }} />
              <datalist id="rr-buyer-list">
                {buyers.map((b, i) => <option key={i} value={b.name || b.buyer_name} />)}
              </datalist>

              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Refund Date</label>
              <input className="glass-input text-sm" type="date" value={form.refund_date}
                onChange={e => updateField('refund_date', e.target.value)} style={{ marginBottom: 6 }} />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div>
                  <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Refund Method</label>
                  <select className="glass-input text-sm" value={form.refund_method}
                    onChange={e => updateField('refund_method', e.target.value)}>
                    <option value="Check">Check</option>
                    <option value="Cash">Cash</option>
                    <option value="ACH">ACH</option>
                    <option value="Credit Card">Credit Card</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Refund From</label>
                  <select className="glass-input text-sm" value={form.refund_from}
                    onChange={e => updateField('refund_from', e.target.value)}>
                    <option value="">-- Select Bank Account --</option>
                    {bankAccounts.map(ba => (
                      <option key={ba.id} value={ba.id}>{ba.name || ba.account_name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Right: Total, Refund #, Original Ref, Memo */}
            <div style={{ flex: 1 }}>
              <div style={{ marginBottom: 6 }}>
                <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Refund Total</label>
                <div style={{ fontSize: '14pt', fontWeight: 700, color: '#f87171', padding: '2px 0' }}>
                  ${lineTotal.toFixed(2)}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                <div>
                  <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Refund #</label>
                  <input className="glass-input text-sm" value={nextNumber ? `${refundPrefix}${nextNumber}` : 'Auto'} readOnly
                    style={{ background: 'rgba(255,255,255,0.05)' }} />
                </div>
                <div>
                  <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Original Receipt Ref.</label>
                  <input className="glass-input text-sm" value={form.original_receipt_ref}
                    onChange={e => updateField('original_receipt_ref', e.target.value)}
                    placeholder="SR-1001" />
                </div>
              </div>

              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Memo</label>
              <input className="glass-input text-sm" value={form.memo}
                onChange={e => updateField('memo', e.target.value)}
                placeholder="e.g. Customer returned cracked eggs from 3/15 delivery" />
            </div>
          </div>

          {/* Line Items Table */}
          <div className="border border-lvf-border rounded-b-xl p-3 bg-lvf-dark/20">
            <table className="glass-table w-full">
              <thead><tr>
                <th style={{ width: '34%' }}>Description</th>
                <th style={{ width: '12%' }}>Qty</th>
                <th style={{ width: '16%' }}>Rate</th>
                <th style={{ width: '18%' }}>Amount</th>
                <th style={{ width: '7%' }}></th>
              </tr></thead>
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={idx}>
                    <td>
                      <input className="glass-input text-sm" value={line.description}
                        onChange={e => updateLine(idx, 'description', e.target.value)}
                        placeholder="e.g. Returned 5 cases - cracked" />
                    </td>
                    <td>
                      <input className="glass-input text-sm" type="number" min="0" value={line.quantity}
                        onChange={e => updateLine(idx, 'quantity', e.target.value)} style={{ textAlign: 'right' }} />
                    </td>
                    <td>
                      <input className="glass-input text-sm" type="number" step="0.01" min="0" value={line.rate}
                        onChange={e => updateLine(idx, 'rate', e.target.value)} style={{ textAlign: 'right' }} />
                    </td>
                    <td>
                      <input className="glass-input text-sm" type="number" step="0.01" value={line.amount} readOnly
                        style={{ textAlign: 'right', background: 'rgba(255,255,255,0.05)' }} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button type="button" onClick={() => removeLine(idx)}
                        style={{ color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer', fontSize: '10pt' }}>x</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr>
                <td style={{ border: 'none', paddingTop: 4 }}>
                  <button type="button" onClick={addLine} className="glass-button-secondary text-sm">+ Add Line</button>
                </td>
                <td colSpan={2} style={{ border: 'none' }}></td>
                <td style={{ border: 'none', textAlign: 'right', fontWeight: 700, paddingTop: 4 }}>${lineTotal.toFixed(2)}</td>
                <td style={{ border: 'none' }}></td>
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
          <h2 style={{ fontSize: '14pt', fontWeight: 700, margin: 0 }}>Refund Receipts &mdash; Returned / Damaged Eggs</h2>
          <button className="glass-button-primary text-sm" onClick={openNewRefund}>+ New Refund</button>
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
          <p style={{ textAlign: 'center', padding: 20, color: '#999' }}>Loading refund receipts...</p>
        ) : refunds.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 20, color: '#999' }}>No refund receipts found. Click "New Refund" to record a return.</p>
        ) : (
          <table className="glass-table w-full">
            <thead>
              <tr>
                <th>Refund #</th>
                <th>Date</th>
                <th>Customer</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>Method</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {refunds.map(r => {
                const st = r.status || 'completed'
                return (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.refund_number || `RR-${r.id}`}</td>
                    <td style={{ color: '#94a3b8' }}>{r.refund_date || '-'}</td>
                    <td>{r.customer_name || '-'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>${(r.amount || 0).toFixed(2)}</td>
                    <td>{r.refund_method || '-'}</td>
                    <td style={{ textAlign: 'center' }}><StatusBadge status={st} /></td>
                    <td style={{ textAlign: 'center' }}>
                      {st !== 'voided' && (
                        <button className="glass-button-danger text-sm"
                          style={{ padding: '2px 8px', fontSize: '8pt' }}
                          onClick={() => handleVoid(r)}>
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
