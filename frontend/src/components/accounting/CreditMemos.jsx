import { useState, useEffect } from 'react'
import {
  getCreditMemos, createCreditMemo, applyCreditMemo, voidCreditMemo,
  getBuyers, getInvoices,
} from '../../api/accounting'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'

const emptyLine = () => ({ description: '', quantity: '', rate: '', amount: 0 })

const emptyForm = () => ({
  customer: '',
  customer_id: '',
  memo_date: new Date().toISOString().split('T')[0],
  reason: '',
  notes: '',
})

const statusBadge = {
  draft: 'bg-gray-500/20 text-gray-400',
  issued: 'bg-blue-500/20 text-blue-400',
  applied: 'bg-green-500/20 text-green-400',
  voided: 'bg-red-500/20 text-red-400',
}

export default function CreditMemos() {
  const [view, setView] = useState('list')
  const [memos, setMemos] = useState([])
  const [buyers, setBuyers] = useState([])
  const [invoices, setInvoices] = useState([])
  const [form, setForm] = useState(emptyForm())
  const [lineItems, setLineItems] = useState([emptyLine()])
  const [submitting, setSubmitting] = useState(false)

  // Apply-to-invoice modal state
  const [applyTarget, setApplyTarget] = useState(null)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('')

  const { toast, showToast, hideToast } = useToast()

  const load = async () => {
    try {
      const [memosRes, buyersRes, invoicesRes] = await Promise.all([
        getCreditMemos(), getBuyers(), getInvoices(),
      ])
      setMemos(memosRes.data || [])
      setBuyers(buyersRes.data || [])
      setInvoices(invoicesRes.data || [])
    } catch {
      showToast('Error loading credit memos', 'error')
    }
  }

  useEffect(() => { load() }, [])

  // ── Line item helpers ──
  const updateLine = (idx, field, value) => {
    setLineItems(prev => {
      const updated = [...prev]
      updated[idx] = { ...updated[idx], [field]: value }
      if (field === 'quantity' || field === 'rate') {
        const qty = parseFloat(field === 'quantity' ? value : updated[idx].quantity) || 0
        const rate = parseFloat(field === 'rate' ? value : updated[idx].rate) || 0
        updated[idx].amount = qty * rate
      }
      return updated
    })
  }
  const addLine = () => setLineItems(prev => [...prev, emptyLine()])
  const removeLine = (idx) => { if (lineItems.length > 1) setLineItems(prev => prev.filter((_, i) => i !== idx)) }

  const total = lineItems.reduce((sum, li) => sum + (li.amount || 0), 0)

  // ── Customer selection ──
  const handleCustomerSelect = (name) => {
    const match = buyers.find(b => (b.name || b.buyer_name) === name)
    setForm(prev => ({
      ...prev,
      customer: name,
      customer_id: match?.id || match?.buyer_id || '',
    }))
  }

  // ── Save credit memo ──
  const handleSave = async () => {
    if (!form.customer) { showToast('Customer is required', 'error'); return }
    if (!form.reason) { showToast('Reason is required', 'error'); return }
    if (lineItems.every(li => !li.description && !li.quantity)) {
      showToast('Add at least one line item', 'error'); return
    }
    setSubmitting(true)
    try {
      const payload = {
        customer: form.customer,
        customer_id: form.customer_id || undefined,
        memo_date: form.memo_date,
        reason: form.reason,
        notes: form.notes,
        amount: total,
        line_items: lineItems.filter(li => li.description || li.quantity).map(li => ({
          description: li.description,
          quantity: parseFloat(li.quantity) || 0,
          rate: parseFloat(li.rate) || 0,
          amount: li.amount,
        })),
      }
      await createCreditMemo(payload)
      showToast('Credit memo created')
      setForm(emptyForm())
      setLineItems([emptyLine()])
      setView('list')
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error creating credit memo', 'error')
    } finally { setSubmitting(false) }
  }

  // ── Apply to invoice ──
  const handleApply = async () => {
    if (!selectedInvoiceId) { showToast('Select an invoice', 'error'); return }
    setSubmitting(true)
    try {
      await applyCreditMemo(applyTarget.id, selectedInvoiceId)
      showToast('Credit memo applied to invoice')
      setApplyTarget(null)
      setSelectedInvoiceId('')
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error applying credit memo', 'error')
    } finally { setSubmitting(false) }
  }

  // ── Void ──
  const handleVoid = async (memo) => {
    if (!confirm(`Void credit memo ${memo.memo_number || '#' + memo.id}?`)) return
    try {
      await voidCreditMemo(memo.id)
      showToast('Credit memo voided')
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error voiding credit memo', 'error')
    }
  }

  const unpaidInvoices = invoices.filter(inv => (inv.balance_due || 0) > 0)

  // ════════════════════════════════════════
  // CREATE FORM VIEW
  // ════════════════════════════════════════
  if (view === 'create') {
    return (
      <div>
        {toast && <Toast {...toast} onClose={hideToast} />}

        {/* Header */}
        <div className="bg-lvf-dark/30 border-b border-lvf-border" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '3px 8px',
        }}>
          <button className="glass-button-secondary text-sm" style={{ padding: '2px 8px' }}
            onClick={() => { setView('list'); setForm(emptyForm()); setLineItems([emptyLine()]) }}>
            &larr; Back to List
          </button>
          <span style={{ fontSize: '9pt', fontWeight: 600 }}>New Credit Memo</span>
        </div>

        {/* Form fields */}
        <div className="glass-card p-4 m-2">
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 8 }}>
            <div>
              <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 1 }}>Customer</label>
              <input className="glass-input text-sm" list="buyer-list" value={form.customer}
                onChange={e => handleCustomerSelect(e.target.value)}
                placeholder="Type or select customer..." style={{ fontSize: '10pt', fontWeight: 600 }} />
              <datalist id="buyer-list">
                {buyers.map(b => <option key={b.id || b.buyer_id} value={b.name || b.buyer_name} />)}
              </datalist>
            </div>
            <div>
              <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 1 }}>Memo Date</label>
              <input className="glass-input text-sm" type="date" value={form.memo_date}
                onChange={e => setForm(prev => ({ ...prev, memo_date: e.target.value }))} />
            </div>
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 1 }}>Reason</label>
            <input className="glass-input text-sm" value={form.reason}
              onChange={e => setForm(prev => ({ ...prev, reason: e.target.value }))}
              placeholder="Reason for credit memo..." style={{ width: '100%' }} />
          </div>
        </div>

        {/* Line Items Table */}
        <div style={{ margin: '0 8px' }}>
          <table className="glass-table w-full">
            <thead>
              <tr>
                <th style={{ width: '40%' }}>Description</th>
                <th style={{ width: '13%', textAlign: 'right' }}>Qty</th>
                <th style={{ width: '15%', textAlign: 'right' }}>Rate</th>
                <th style={{ width: '18%', textAlign: 'right' }}>Amount</th>
                <th style={{ width: '8%' }}></th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((li, idx) => (
                <tr key={idx}>
                  <td>
                    <input className="glass-input text-sm" value={li.description}
                      onChange={e => updateLine(idx, 'description', e.target.value)}
                      placeholder="Line item description..." />
                  </td>
                  <td>
                    <input className="glass-input text-sm" type="number" step="any" min="0" value={li.quantity}
                      onChange={e => updateLine(idx, 'quantity', e.target.value)} style={{ textAlign: 'right' }} />
                  </td>
                  <td>
                    <input className="glass-input text-sm" type="number" step="0.01" min="0" value={li.rate}
                      onChange={e => updateLine(idx, 'rate', e.target.value)} style={{ textAlign: 'right' }} />
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, padding: '2px 6px' }}>
                    ${(li.amount || 0).toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {lineItems.length > 1 && (
                      <button type="button" onClick={() => removeLine(idx)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c00', fontSize: '10pt' }}>&times;</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <button type="button" className="glass-button-secondary text-sm" onClick={addLine}>+ Add Line</button>
            <div style={{ fontSize: '10pt', fontWeight: 700 }}>Total: ${total.toFixed(2)}</div>
          </div>
        </div>

        {/* Notes */}
        <div className="glass-card p-4 m-2" style={{ marginTop: 0 }}>
          <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 1 }}>Notes</label>
          <textarea className="glass-input text-sm" rows={3} value={form.notes}
            onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
            placeholder="Internal notes..." style={{ resize: 'vertical', width: '100%' }} />
        </div>

        {/* Footer buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, margin: '6px 8px 0' }}>
          <button type="button" className="glass-button-secondary text-sm"
            onClick={() => { setView('list'); setForm(emptyForm()); setLineItems([emptyLine()]) }}>
            Cancel
          </button>
          <button type="button" className="glass-button-primary text-sm" disabled={submitting}
            onClick={handleSave}>
            {submitting ? 'Saving...' : 'Save & Close'}
          </button>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════
  // LIST VIEW (default)
  // ════════════════════════════════════════
  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      {/* Header with New button */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold text-lvf-muted">Credit Memos</h3>
        <button className="glass-button-primary text-sm" onClick={() => setView('create')}>
          + New Credit Memo
        </button>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <table className="glass-table w-full">
          <thead>
            <tr>
              <th>Memo #</th>
              <th>Customer</th>
              <th>Date</th>
              <th className="text-right">Amount</th>
              <th>Status</th>
              <th className="w-48">Actions</th>
            </tr>
          </thead>
          <tbody>
            {memos.map(m => (
              <tr key={m.id}>
                <td className="font-semibold font-mono">{m.memo_number || `CM-${m.id}`}</td>
                <td>{m.customer}</td>
                <td className="text-lvf-muted">{m.memo_date}</td>
                <td className="text-right font-mono">${(m.amount || 0).toFixed(2)}</td>
                <td>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge[m.status] || statusBadge.draft}`}>
                    {m.status || 'draft'}
                  </span>
                </td>
                <td>
                  <div className="flex gap-2">
                    {m.status !== 'applied' && m.status !== 'voided' && (
                      <button className="text-xs text-lvf-accent hover:underline"
                        onClick={() => { setApplyTarget(m); setSelectedInvoiceId('') }}>
                        Apply to Invoice
                      </button>
                    )}
                    {m.status !== 'voided' && (
                      <button className="text-xs text-red-400 hover:underline"
                        onClick={() => handleVoid(m)}>
                        Void
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {memos.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-lvf-muted">No credit memos.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Apply to Invoice Dialog ── */}
      {applyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="glass-card p-4 m-2" style={{ minWidth: 380, maxWidth: 460 }}>
            <h4 className="text-sm font-semibold mb-3">
              Apply Credit Memo {applyTarget.memo_number || `CM-${applyTarget.id}`}
            </h4>
            <p className="text-xs text-lvf-muted mb-3">
              Amount: <span className="font-bold text-lvf-text">${(applyTarget.amount || 0).toFixed(2)}</span>
              {' '}&mdash; Customer: {applyTarget.customer}
            </p>

            <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 2 }}>
              Select Unpaid Invoice
            </label>
            <select className="glass-input text-sm" style={{ width: '100%', marginBottom: 12 }}
              value={selectedInvoiceId}
              onChange={e => setSelectedInvoiceId(e.target.value)}>
              <option value="">-- Select an invoice --</option>
              {unpaidInvoices.map(inv => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoice_number} &mdash; {inv.buyer} &mdash; Balance: ${(inv.balance_due || 0).toFixed(2)}
                </option>
              ))}
            </select>

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
