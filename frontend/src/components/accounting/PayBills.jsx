import { useState, useEffect } from 'react'
import { getBills, getBankAccounts, payBillsBatch } from '../../api/accounting'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'

const today = () => new Date().toISOString().split('T')[0]

export default function PayBills({ onPaid }) {
  const [bills, setBills] = useState([])
  const [bankAccounts, setBankAccounts] = useState([])
  const [selectedBills, setSelectedBills] = useState(new Set())
  const [amtToPay, setAmtToPay] = useState({})
  const [filterMode, setFilterMode] = useState('all')
  const [filterDate, setFilterDate] = useState(today())
  const [sortBy, setSortBy] = useState('due_date')
  const [paymentDate, setPaymentDate] = useState(today())
  const [paymentMethod, setPaymentMethod] = useState('Check')
  const [bankAccountId, setBankAccountId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  const load = async () => {
    try {
      const [billsRes, bankRes] = await Promise.all([getBills(), getBankAccounts()])
      const unpaid = (billsRes.data || []).filter(b => b.balance_due > 0)
      setBills(unpaid)
      const defaults = {}
      unpaid.forEach(b => { defaults[b.id] = b.balance_due.toFixed(2) })
      setAmtToPay(defaults)
      setBankAccounts(bankRes.data || [])
      if (bankRes.data?.length && !bankAccountId) setBankAccountId(bankRes.data[0].id)
    } catch { showToast('Error loading bills', 'error') }
  }

  useEffect(() => { load() }, [])

  const filteredBills = bills.filter(b => {
    if (filterMode === 'before' && filterDate) return b.due_date <= filterDate
    return true
  })

  const sortedBills = [...filteredBills].sort((a, b) => {
    if (sortBy === 'due_date') return (a.due_date || '').localeCompare(b.due_date || '')
    if (sortBy === 'vendor') return (a.vendor_name || '').localeCompare(b.vendor_name || '')
    if (sortBy === 'amount') return (b.balance_due || 0) - (a.balance_due || 0)
    return 0
  })

  const toggleBill = (id) => {
    setSelectedBills(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  const toggleAll = () => {
    selectedBills.size === sortedBills.length
      ? setSelectedBills(new Set())
      : setSelectedBills(new Set(sortedBills.map(b => b.id)))
  }

  const totalSelected = sortedBills
    .filter(b => selectedBills.has(b.id))
    .reduce((sum, b) => sum + (parseFloat(amtToPay[b.id]) || 0), 0)

  const handlePay = async () => {
    if (submitting) return
    if (selectedBills.size === 0) { showToast('Select at least one bill to pay', 'error'); return }
    if (!bankAccountId) { showToast('Select a payment account', 'error'); return }
    setSubmitting(true)
    setShowConfirm(false)
    try {
      const billIds = Array.from(selectedBills)
      await payBillsBatch({
        bill_ids: billIds, payment_date: paymentDate, payment_method: paymentMethod,
        bank_account_id: bankAccountId,
        amounts: Object.fromEntries(billIds.map(id => [id, parseFloat(amtToPay[id]) || 0])),
      })
      showToast(`${billIds.length} bill(s) paid successfully`)
      setSelectedBills(new Set())
      if (onPaid) onPaid()
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error processing payments', 'error')
    } finally { setSubmitting(false) }
  }

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      <div className="glass-card p-4 m-2">
        {/* ── Filter Bar ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: '8pt', fontWeight: 600 }}>Show bills:</span>
            <label style={{ fontSize: '8pt', display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
              <input type="radio" name="filter" checked={filterMode === 'before'} onChange={() => setFilterMode('before')} />
              Due on or before
            </label>
            {filterMode === 'before' && (
              <input className="glass-input text-sm" type="date" value={filterDate}
                onChange={e => setFilterDate(e.target.value)} style={{ width: 110 }} />
            )}
            <label style={{ fontSize: '8pt', display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
              <input type="radio" name="filter" checked={filterMode === 'all'} onChange={() => setFilterMode('all')} />
              Show all bills
            </label>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: '8pt', fontWeight: 600 }}>Sort by:</span>
            <select className="glass-input text-sm" value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ width: 110 }}>
              <option value="due_date">Due Date</option>
              <option value="vendor">Vendor</option>
              <option value="amount">Amount</option>
            </select>
          </div>
        </div>

        {/* ── Bill Table ── */}
        <table className="glass-table w-full">
          <thead>
            <tr>
              <th style={{ width: 28, textAlign: 'center' }}>
                <input type="checkbox" checked={selectedBills.size === sortedBills.length && sortedBills.length > 0} onChange={toggleAll} />
              </th>
              <th>Date Due</th>
              <th>Vendor</th>
              <th>Ref No.</th>
              <th>Disc. Date</th>
              <th style={{ textAlign: 'right' }}>Amt Due</th>
              <th style={{ textAlign: 'right' }}>Disc Used</th>
              <th style={{ textAlign: 'right' }}>Credits</th>
              <th style={{ textAlign: 'right', width: 100 }}>Amt. to Pay</th>
            </tr>
          </thead>
          <tbody>
            {sortedBills.map(bill => (
              <tr key={bill.id} style={{ background: selectedBills.has(bill.id) ? '#e8f0fe' : undefined }}>
                <td style={{ textAlign: 'center' }}>
                  <input type="checkbox" checked={selectedBills.has(bill.id)} onChange={() => toggleBill(bill.id)} />
                </td>
                <td>{bill.due_date}</td>
                <td>{bill.vendor_name}</td>
                <td>{bill.ref_no || bill.bill_number}</td>
                <td style={{ color: '#999' }}>{bill.discount_date || ''}</td>
                <td style={{ textAlign: 'right', fontFamily: 'Tahoma, monospace' }}>${bill.balance_due.toFixed(2)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'Tahoma, monospace', color: '#999' }}>$0.00</td>
                <td style={{ textAlign: 'right', fontFamily: 'Tahoma, monospace', color: '#999' }}>$0.00</td>
                <td>
                  <input className="glass-input text-sm" type="number" step="0.01" min="0" max={bill.balance_due}
                    value={amtToPay[bill.id] ?? ''} onChange={e => setAmtToPay(prev => ({ ...prev, [bill.id]: e.target.value }))}
                    style={{ textAlign: 'right', width: '100%' }} />
                </td>
              </tr>
            ))}
            {sortedBills.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 20, color: '#999' }}>
                No unpaid bills found.
              </td></tr>
            )}
          </tbody>
        </table>

        {/* ── Payment Section ── */}
        <div style={{
          marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 10,
          display: 'grid', gridTemplateColumns: '130px 140px 1fr auto', gap: 10, alignItems: 'end',
        }}>
          <div>
            <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 1 }}>Payment Date</label>
            <input className="glass-input text-sm" type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 1 }}>Method</label>
            <select className="glass-input text-sm" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
              <option value="Check">Check</option>
              <option value="Credit Card">Credit Card</option>
              <option value="ACH">ACH</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 1 }}>Payment Account</label>
            <select className="glass-input text-sm" value={bankAccountId} onChange={e => setBankAccountId(e.target.value)}>
              <option value="">-- Select Account --</option>
              {bankAccounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}{a.account_number_last4 ? ` (...${a.account_number_last4})` : ''} - {a.account_type}
                </option>
              ))}
            </select>
          </div>
          <div style={{ textAlign: 'right' }}>
            <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 1 }}>Total Selected</label>
            <div style={{ fontSize: '14pt', fontWeight: 700, color: '#60a5fa', fontFamily: 'Tahoma, monospace' }}>
              ${totalSelected.toFixed(2)}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8 }}>
          <button type="button" className="glass-button-primary text-sm"
            disabled={submitting || selectedBills.size === 0}
            onClick={() => setShowConfirm(true)}
            style={{ opacity: selectedBills.size === 0 ? 0.5 : 1 }}>
            {submitting ? 'Processing...' : `Pay Selected Bills (${selectedBills.size})`}
          </button>
        </div>
      </div>

      {/* ── Confirmation Dialog ── */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 z-[1000] flex items-center justify-center backdrop-blur-sm">
          <div className="glass-card rounded-xl min-w-[320px] max-w-[480px] overflow-hidden">
            <div className="px-4 py-2 border-b border-lvf-border font-semibold text-sm text-lvf-accent">Payment Confirmation</div>
            <div className="p-4 text-sm">
              <p>Are you sure you want to pay <strong>{selectedBills.size}</strong> bill(s) totaling <strong>${totalSelected.toFixed(2)}</strong>?</p>
              <p style={{ marginTop: 6, color: '#999' }}>
                Method: {paymentMethod} | Date: {paymentDate}
              </p>
            </div>
            <div className="px-4 py-3 flex justify-end gap-2 border-t border-lvf-border/30">
              <button className="glass-button-secondary text-sm" onClick={() => setShowConfirm(false)}>Cancel</button>
              <button className="glass-button-primary text-sm" onClick={handlePay}>Pay Bills</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
