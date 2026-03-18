import { useState, useEffect } from 'react'
import { getInvoices, getBankAccounts, getBuyers, receivePayment } from '../../api/accounting'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'

const paymentMethods = ['Check', 'Cash', 'Credit Card', 'ACH', 'Wire', 'Other']

export default function ReceivePayments({ onSaved }) {
  const today = new Date().toISOString().split('T')[0]
  const { toast, showToast, hideToast } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [buyers, setBuyers] = useState([])
  const [invoices, setInvoices] = useState([])
  const [bankAccounts, setBankAccounts] = useState([])

  const [form, setForm] = useState({
    customer_name: '', buyer_id: '', payment_date: today,
    amount: '', reference: '', payment_method: 'Check',
    deposit_to_account_id: '', memo: '',
  })
  const [depositTo, setDepositTo] = useState('undeposited')
  const [selectedInvoices, setSelectedInvoices] = useState(new Set())
  const [paymentAmounts, setPaymentAmounts] = useState({})
  const [autoApply, setAutoApply] = useState(true)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      const [invRes, bankRes, buyerRes] = await Promise.all([
        getInvoices({ status: 'sent,partial' }), getBankAccounts(), getBuyers(),
      ])
      setInvoices(invRes.data || []); setBankAccounts(bankRes.data || []); setBuyers(buyerRes.data || [])
    } catch {
      try {
        const [invRes, bankRes] = await Promise.all([getInvoices(), getBankAccounts()])
        setInvoices(invRes.data || []); setBankAccounts(bankRes.data || [])
      } catch {}
    }
  }

  const filteredInvoices = form.customer_name
    ? invoices.filter(inv => {
        const invBuyer = (inv.buyer || inv.buyer_name || '').toLowerCase()
        return invBuyer.includes(form.customer_name.toLowerCase()) &&
          (inv.status === 'sent' || inv.status === 'partial' || inv.status === 'draft' || inv.balance_due > 0)
      })
    : []

  const handleCustomerChange = (name) => {
    const match = buyers.find(b => (b.name || b.buyer_name || '').toLowerCase() === name.toLowerCase())
    setForm(prev => ({ ...prev, customer_name: name, buyer_id: match?.id || match?.buyer_id || '' }))
    setSelectedInvoices(new Set()); setPaymentAmounts({})
  }

  const toggleInvoice = (invoiceId) => {
    setSelectedInvoices(prev => {
      const next = new Set(prev); next.has(invoiceId) ? next.delete(invoiceId) : next.add(invoiceId); return next
    })
    if (selectedInvoices.has(invoiceId)) {
      setPaymentAmounts(prev => { const next = { ...prev }; delete next[invoiceId]; return next })
    }
  }

  const toggleAll = () => {
    selectedInvoices.size === filteredInvoices.length
      ? (setSelectedInvoices(new Set()), setPaymentAmounts({}))
      : setSelectedInvoices(new Set(filteredInvoices.map(inv => inv.id)))
  }

  useEffect(() => {
    if (!autoApply || !form.amount) return
    const totalPayment = parseFloat(form.amount) || 0
    if (totalPayment <= 0) return
    const selected = filteredInvoices
      .filter(inv => selectedInvoices.has(inv.id))
      .sort((a, b) => new Date(a.invoice_date) - new Date(b.invoice_date))
    let remaining = totalPayment
    const newAmounts = {}
    for (const inv of selected) {
      const due = inv.balance_due || (inv.amount - (inv.amount_paid || 0))
      if (remaining <= 0) { newAmounts[inv.id] = 0; continue }
      const apply = Math.min(due, remaining)
      newAmounts[inv.id] = parseFloat(apply.toFixed(2))
      remaining -= apply
    }
    setPaymentAmounts(newAmounts)
  }, [form.amount, selectedInvoices.size, autoApply])

  const amountApplied = Object.values(paymentAmounts).reduce((s, v) => s + (v || 0), 0)
  const totalPayment = parseFloat(form.amount) || 0
  const unapplied = totalPayment - amountApplied

  const clearForm = () => {
    setForm({ customer_name: '', buyer_id: '', payment_date: today, amount: '', reference: '', payment_method: 'Check', deposit_to_account_id: '', memo: '' })
    setDepositTo('undeposited'); setSelectedInvoices(new Set()); setPaymentAmounts({})
  }

  const handleSave = async (andNew = false) => {
    if (!form.customer_name) { showToast('Select a customer', 'error'); return }
    if (!form.amount || parseFloat(form.amount) <= 0) { showToast('Enter a payment amount', 'error'); return }
    if (selectedInvoices.size === 0) { showToast('Select at least one invoice', 'error'); return }
    setSubmitting(true)
    try {
      const applications = []
      for (const invId of selectedInvoices) {
        const amt = paymentAmounts[invId] || 0
        if (amt > 0) applications.push({ invoice_id: invId, amount: amt })
      }
      await receivePayment({
        buyer: form.customer_name, buyer_id: form.buyer_id || undefined,
        payment_date: form.payment_date, amount: parseFloat(form.amount),
        reference: form.reference, payment_method: form.payment_method,
        deposit_to_account_id: depositTo === 'undeposited' ? undefined : form.deposit_to_account_id,
        deposit_to: depositTo, memo: form.memo, applications,
      })
      showToast('Payment received successfully')
      if (onSaved) onSaved()
      await loadData()
      if (andNew) clearForm()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error recording payment', 'error')
    } finally { setSubmitting(false) }
  }

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      {/* ── Header Form ── */}
      <div className="glass-card p-4 m-2">
        {/* Row 1: Received From | Amount (large bold) */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 8 }}>
          <div>
            <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 1 }}>Received From</label>
            <input className="glass-input text-sm" list="rp-buyer-list" value={form.customer_name}
              onChange={e => handleCustomerChange(e.target.value)}
              placeholder="Customer name..." style={{ fontSize: '10pt', fontWeight: 600 }} />
            <datalist id="rp-buyer-list">
              {buyers.map(b => <option key={b.id || b.buyer_id} value={b.name || b.buyer_name} />)}
            </datalist>
          </div>
          <div>
            <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 1 }}>Amount</label>
            <input className="glass-input text-sm" type="number" step="0.01" min="0" value={form.amount}
              onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0.00"
              style={{ fontWeight: 700, fontSize: '12pt' }} />
          </div>
        </div>

        {/* Row 2: Date | Pmt. Method | Reference # */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 8 }}>
          <div>
            <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 1 }}>Date</label>
            <input className="glass-input text-sm" type="date" value={form.payment_date}
              onChange={e => setForm({ ...form, payment_date: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 1 }}>Pmt. Method</label>
            <select className="glass-input text-sm" value={form.payment_method}
              onChange={e => setForm({ ...form, payment_method: e.target.value })}>
              {paymentMethods.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 1 }}>Reference #</label>
            <input className="glass-input text-sm" value={form.reference}
              onChange={e => setForm({ ...form, reference: e.target.value })} placeholder="Check # / Ref..." />
          </div>
        </div>

        {/* Row 3: Deposit To */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <label style={{ fontSize: '8pt', fontWeight: 600 }}>Deposit To:</label>
          <label style={{ fontSize: '8pt', display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
            <input type="radio" name="depositTo" checked={depositTo === 'undeposited'}
              onChange={() => { setDepositTo('undeposited'); setForm(prev => ({ ...prev, deposit_to_account_id: '' })) }} />
            Undeposited Funds
          </label>
          <label style={{ fontSize: '8pt', display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
            <input type="radio" name="depositTo" checked={depositTo !== 'undeposited'}
              onChange={() => setDepositTo('bank')} />
            Bank Account:
          </label>
          {depositTo !== 'undeposited' && (
            <select className="glass-input text-sm" style={{ width: 180 }} value={form.deposit_to_account_id}
              onChange={e => setForm({ ...form, deposit_to_account_id: e.target.value })}>
              <option value="">Select account...</option>
              {bankAccounts.map(ba => (
                <option key={ba.id} value={ba.id}>{ba.name}{ba.account_number_last4 ? ` ••••${ba.account_number_last4}` : ''}</option>
              ))}
            </select>
          )}
        </div>

        {/* Memo */}
        <div>
          <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 1 }}>Memo</label>
          <input className="glass-input text-sm" value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} placeholder="Memo..." />
        </div>
      </div>

      {/* ── "Where does this payment go?" section ── */}
      <div style={{ margin: '0 8px' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 4, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}>
          <span style={{ fontSize: '9pt', fontWeight: 700, color: '#60a5fa' }}>
            Where does this payment go?
            {form.customer_name && (
              <span style={{ fontWeight: 400, color: '#999', marginLeft: 6 }}>
                ({filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? 's' : ''})
              </span>
            )}
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button className="glass-button-secondary text-sm" style={{ padding: '2px 8px' }}
              onClick={() => { setAutoApply(true); setSelectedInvoices(new Set(filteredInvoices.map(i => i.id))) }}>
              Auto Apply
            </button>
            <button className="glass-button-secondary text-sm" style={{ padding: '2px 8px' }}
              onClick={() => { setSelectedInvoices(new Set()); setPaymentAmounts({}); setAutoApply(false) }}>
              Un-Apply
            </button>
          </div>
        </div>

        {!form.customer_name ? (
          <div style={{ padding: '16px 0', textAlign: 'center', fontSize: '8pt', color: '#999', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.1)' }}>
            Select a customer above to see their outstanding invoices
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div style={{ padding: '16px 0', textAlign: 'center', fontSize: '8pt', color: '#999', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.1)' }}>
            No outstanding invoices for {form.customer_name}
          </div>
        ) : (
          <table className="glass-table w-full">
            <thead>
              <tr>
                <th style={{ width: 28, textAlign: 'center' }}>
                  <input type="checkbox" checked={selectedInvoices.size === filteredInvoices.length && filteredInvoices.length > 0} onChange={toggleAll} />
                </th>
                <th>Date</th>
                <th>Number</th>
                <th style={{ textAlign: 'right' }}>Orig. Amt</th>
                <th style={{ textAlign: 'right' }}>Amt. Due</th>
                <th style={{ textAlign: 'right', width: 100 }}>Payment</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map(inv => {
                const isSelected = selectedInvoices.has(inv.id)
                const balanceDue = inv.balance_due ?? (inv.amount - (inv.amount_paid || 0))
                return (
                  <tr key={inv.id} style={{ background: isSelected ? '#e8f0fe' : undefined }}>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleInvoice(inv.id)} />
                    </td>
                    <td>{inv.invoice_date}</td>
                    <td style={{ fontWeight: 600 }}>{inv.invoice_number}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'Tahoma, monospace' }}>${inv.amount.toFixed(2)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'Tahoma, monospace', fontWeight: 600 }}>${balanceDue.toFixed(2)}</td>
                    <td>
                      <input className="glass-input text-sm" type="number" step="0.01" min="0" max={balanceDue}
                        value={paymentAmounts[inv.id] ?? ''} disabled={!isSelected}
                        onChange={e => setPaymentAmounts(prev => ({ ...prev, [inv.id]: parseFloat(e.target.value) || 0 }))}
                        style={{ textAlign: 'right', fontWeight: 600, background: isSelected ? 'white' : '#f0f0f0' }} placeholder="0.00" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {/* Summary: Amount Due / Applied / Unapplied */}
        {form.customer_name && filteredInvoices.length > 0 && (
          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 20, marginTop: 0, fontSize: '8pt',
            padding: '6px 8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderTop: 'none',
          }}>
            <div>
              <span style={{ color: '#999' }}>Amount Due: </span>
              <span style={{ fontWeight: 700 }}>${totalPayment.toFixed(2)}</span>
            </div>
            <div>
              <span style={{ color: '#999' }}>Applied: </span>
              <span style={{ fontWeight: 700 }}>${amountApplied.toFixed(2)}</span>
            </div>
            <div>
              <span style={{ color: '#999' }}>Unapplied: </span>
              <span style={{ fontWeight: 700, color: unapplied > 0 ? '#ef4444' : '#22c55e' }}>
                ${unapplied.toFixed(2)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Action Buttons ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, margin: '6px 8px 0' }}>
        <button type="button" className="glass-button-secondary text-sm" onClick={clearForm}>Revert</button>
        <button type="button" className="glass-button-primary text-sm" disabled={submitting} onClick={() => handleSave(true)}>
          {submitting ? 'Saving...' : 'Save & New'}
        </button>
        <button type="button" className="glass-button-primary text-sm" disabled={submitting} onClick={() => handleSave(false)}>
          {submitting ? 'Saving...' : 'Save & Close'}
        </button>
      </div>
    </div>
  )
}
