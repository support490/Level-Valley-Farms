import { useState, useEffect } from 'react'
import { createBill, getAccounts, getVendors } from '../../api/accounting'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'
import AddressAutocomplete from '../common/AddressAutocomplete'

const TERMS_OPTIONS = ['Net 15', 'Net 30', 'Net 45', 'Net 60', 'Due on Receipt']

function computeDueDate(billDate, terms) {
  if (!billDate) return ''
  const d = new Date(billDate + 'T00:00:00')
  if (terms === 'Net 15') d.setDate(d.getDate() + 15)
  else if (terms === 'Net 30') d.setDate(d.getDate() + 30)
  else if (terms === 'Net 45') d.setDate(d.getDate() + 45)
  else if (terms === 'Net 60') d.setDate(d.getDate() + 60)
  return d.toISOString().split('T')[0]
}

const today = () => new Date().toISOString().split('T')[0]
const emptyExpenseLine = () => ({ account_id: '', amount: '', memo: '', flock_id: '' })
const emptyItemLine = () => ({ item_description: '', quantity: '', cost: '', amount: '' })

const initialForm = () => ({
  vendor_name: '', vendor_id: '', bill_date: today(), ref_no: '',
  terms: 'Net 30', due_date: computeDueDate(today(), 'Net 30'),
  discount_date: '', description: '', notes: '', address: '',
})

export default function EnterBills({ onSaved }) {
  const [form, setForm] = useState(initialForm())
  const [expenseLines, setExpenseLines] = useState([emptyExpenseLine()])
  const [itemLines, setItemLines] = useState([emptyItemLine()])
  const [vendors, setVendors] = useState([])
  const [accounts, setAccounts] = useState([])
  const [activeTab, setActiveTab] = useState('expenses')
  const [submitting, setSubmitting] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  useEffect(() => {
    const load = async () => {
      try {
        const [acctRes, vendorRes] = await Promise.all([getAccounts(), getVendors()])
        setAccounts(acctRes.data || [])
        setVendors(vendorRes.data || [])
      } catch {
        try { const acctRes = await getAccounts(); setAccounts(acctRes.data || []) } catch {}
      }
    }
    load()
  }, [])

  const updateField = (field, value) => {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      if (field === 'terms' || field === 'bill_date') {
        const bd = field === 'bill_date' ? value : prev.bill_date
        const tm = field === 'terms' ? value : prev.terms
        next.due_date = computeDueDate(bd, tm)
      }
      if (field === 'vendor_name') {
        const match = vendors.find(v => v.name === value || v.vendor_name === value)
        if (match) { next.vendor_id = match.id || ''; next.address = match.address || '' }
      }
      return next
    })
  }

  const updateExpenseLine = (idx, field, value) =>
    setExpenseLines(prev => prev.map((line, i) => i === idx ? { ...line, [field]: value } : line))
  const addExpenseLine = () => setExpenseLines(prev => [...prev, emptyExpenseLine()])
  const removeExpenseLine = (idx) => setExpenseLines(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)

  const updateItemLine = (idx, field, value) => {
    setItemLines(prev => prev.map((line, i) => {
      if (i !== idx) return line
      const updated = { ...line, [field]: value }
      if (field === 'quantity' || field === 'cost') {
        const qty = parseFloat(field === 'quantity' ? value : line.quantity) || 0
        const cost = parseFloat(field === 'cost' ? value : line.cost) || 0
        updated.amount = (qty * cost).toFixed(2)
      }
      return updated
    }))
  }
  const addItemLine = () => setItemLines(prev => [...prev, emptyItemLine()])
  const removeItemLine = (idx) => setItemLines(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)

  const expenseTotal = expenseLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
  const itemTotal = itemLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
  const amountDue = expenseTotal + itemTotal
  const expenseAccountOptions = accounts.filter(a => a.account_type === 'expense')

  const handleSave = async (andNew) => {
    if (submitting) return
    if (amountDue <= 0) { showToast('Add at least one line with an amount', 'error'); return }
    setSubmitting(true)
    try {
      const payload = {
        bill_number: 'BILL-' + Date.now(), vendor_name: form.vendor_name,
        bill_date: form.bill_date, due_date: form.due_date, amount: amountDue,
        description: form.description, notes: form.notes, terms: form.terms,
        ref_no: form.ref_no, discount_date: form.discount_date || null,
        expense_lines: expenseLines.filter(l => parseFloat(l.amount) > 0).map(l => ({ ...l, amount: parseFloat(l.amount) })),
        item_lines: itemLines.filter(l => parseFloat(l.amount) > 0).map(l => ({
          ...l, quantity: parseFloat(l.quantity) || 0, cost: parseFloat(l.cost) || 0, amount: parseFloat(l.amount),
        })),
      }
      await createBill(payload)
      showToast('Bill saved successfully')
      if (onSaved) onSaved()
      if (andNew) { setForm(initialForm()); setExpenseLines([emptyExpenseLine()]); setItemLines([emptyItemLine()]) }
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error saving bill', 'error')
    } finally { setSubmitting(false) }
  }

  const handleClear = () => { setForm(initialForm()); setExpenseLines([emptyExpenseLine()]); setItemLines([emptyItemLine()]) }

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      <div className="glass-card p-4 m-2">
        {/* ── QB 2017 Split layout: Left 60% Vendor, Right 40% Details ── */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
          {/* Left: Vendor */}
          <div style={{ flex: '0 0 58%' }}>
            <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 2 }}>VENDOR</label>
            <input className="glass-input text-sm" list="vendor-list" value={form.vendor_name}
              onChange={e => updateField('vendor_name', e.target.value)}
              placeholder="Select or type vendor..." style={{ fontSize: '10pt', fontWeight: 600, marginBottom: 6 }} />
            <datalist id="vendor-list">
              {vendors.map((v, i) => <option key={i} value={v.name || v.vendor_name} />)}
            </datalist>
            <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Address</label>
            <AddressAutocomplete
              className="glass-input text-sm"
              value={form.address}
              onChange={val => updateField('address', val)}
              placeholder="Enter address..."
              style={{ width: '100%' }}
            />
          </div>

          {/* Right: Date / Ref / Amount Due / Terms / Due Date / Disc */}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
              <div>
                <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 1 }}>Date</label>
                <input className="glass-input text-sm" type="date" value={form.bill_date} onChange={e => updateField('bill_date', e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 1 }}>Ref. No.</label>
                <input className="glass-input text-sm" value={form.ref_no} onChange={e => updateField('ref_no', e.target.value)} />
              </div>
            </div>

            <div style={{ marginBottom: 6 }}>
              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 1 }}>Amount Due</label>
              <div style={{ fontSize: '14pt', fontWeight: 700, color: '#60a5fa', padding: '2px 0' }}>
                ${amountDue.toFixed(2)}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <div>
                <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 1 }}>Terms</label>
                <select className="glass-input text-sm" value={form.terms} onChange={e => updateField('terms', e.target.value)}>
                  {TERMS_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 1 }}>Bill Due</label>
                <input className="glass-input text-sm" type="date" value={form.due_date} onChange={e => updateField('due_date', e.target.value)} />
              </div>
            </div>

            <div style={{ marginTop: 6 }}>
              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 1 }}>Discount Date</label>
              <input className="glass-input text-sm" type="date" value={form.discount_date} onChange={e => updateField('discount_date', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Memo */}
        <div style={{ marginBottom: 6 }}>
          <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 1 }}>Memo</label>
          <input className="glass-input text-sm" value={form.description} onChange={e => updateField('description', e.target.value)} />
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 px-2 mb-0">
          <button className={activeTab === 'expenses' ? 'bg-lvf-dark/60 text-lvf-accent font-semibold px-3 py-1.5 text-sm rounded-t-lg border border-lvf-border border-b-0' : 'px-3 py-1.5 text-sm text-lvf-muted hover:text-lvf-text cursor-pointer'} onClick={() => setActiveTab('expenses')}>Expenses</button>
          <button className={activeTab === 'items' ? 'bg-lvf-dark/60 text-lvf-accent font-semibold px-3 py-1.5 text-sm rounded-t-lg border border-lvf-border border-b-0' : 'px-3 py-1.5 text-sm text-lvf-muted hover:text-lvf-text cursor-pointer'} onClick={() => setActiveTab('items')}>Items</button>
        </div>

        <div className="border border-lvf-border rounded-b-xl p-3 bg-lvf-dark/20">
          {activeTab === 'expenses' && (
            <div>
              <table className="glass-table w-full">
                <thead><tr>
                  <th style={{ width: '30%' }}>Account</th>
                  <th style={{ width: '18%' }}>Amount</th>
                  <th style={{ width: '25%' }}>Memo</th>
                  <th style={{ width: '12%' }}>Flock</th>
                  <th style={{ width: '8%' }}>Billable?</th>
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
                      <td><input className="glass-input text-sm" type="number" step="0.01" min="0" value={line.amount}
                        onChange={e => updateExpenseLine(idx, 'amount', e.target.value)} style={{ textAlign: 'right' }} /></td>
                      <td><input className="glass-input text-sm" value={line.memo} onChange={e => updateExpenseLine(idx, 'memo', e.target.value)} /></td>
                      <td><input className="glass-input text-sm" value={line.flock_id} onChange={e => updateExpenseLine(idx, 'flock_id', e.target.value)} placeholder="Flock #" /></td>
                      <td style={{ textAlign: 'center' }}><input type="checkbox" /></td>
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
                  <td colSpan={4} style={{ border: 'none' }}></td>
                </tr></tfoot>
              </table>
            </div>
          )}

          {activeTab === 'items' && (
            <div>
              <table className="glass-table w-full">
                <thead><tr>
                  <th style={{ width: '30%' }}>Description</th>
                  <th style={{ width: '12%' }}>Qty</th>
                  <th style={{ width: '15%' }}>Cost</th>
                  <th style={{ width: '18%' }}>Amount</th>
                  <th style={{ width: '8%' }}>Billable?</th>
                  <th style={{ width: '7%' }}></th>
                </tr></thead>
                <tbody>
                  {itemLines.map((line, idx) => (
                    <tr key={idx}>
                      <td><input className="glass-input text-sm" value={line.item_description}
                        onChange={e => updateItemLine(idx, 'item_description', e.target.value)} /></td>
                      <td><input className="glass-input text-sm" type="number" min="0" value={line.quantity}
                        onChange={e => updateItemLine(idx, 'quantity', e.target.value)} style={{ textAlign: 'right' }} /></td>
                      <td><input className="glass-input text-sm" type="number" step="0.01" min="0" value={line.cost}
                        onChange={e => updateItemLine(idx, 'cost', e.target.value)} style={{ textAlign: 'right' }} /></td>
                      <td><input className="glass-input text-sm" type="number" step="0.01" value={line.amount} readOnly
                        style={{ textAlign: 'right', background: '#f5f5f0' }} /></td>
                      <td style={{ textAlign: 'center' }}><input type="checkbox" /></td>
                      <td style={{ textAlign: 'center' }}>
                        <button type="button" onClick={() => removeItemLine(idx)}
                          style={{ color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer', fontSize: '10pt' }}>x</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr>
                  <td style={{ border: 'none', paddingTop: 4 }}>
                    <button type="button" onClick={addItemLine} className="glass-button-secondary text-sm">+ Add Line</button>
                  </td>
                  <td colSpan={2} style={{ border: 'none' }}></td>
                  <td style={{ border: 'none', textAlign: 'right', fontWeight: 700, paddingTop: 4 }}>${itemTotal.toFixed(2)}</td>
                  <td colSpan={2} style={{ border: 'none' }}></td>
                </tr></tfoot>
              </table>
            </div>
          )}
        </div>

        {/* ── Footer Buttons ── */}
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
