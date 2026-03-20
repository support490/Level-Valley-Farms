import { useState, useEffect } from 'react'
import { createBill, getAccounts, getVendors, suggestFlockForVendor, getActiveFlocks } from '../../api/accounting'
import { getSettings, updateSettings } from '../../api/settings'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'
import AddressAutocomplete from '../common/AddressAutocomplete'

const DEFAULT_TERMS_OPTIONS = ['Net 15', 'Net 30', 'Net 45', 'Net 60', 'Due on Receipt']

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
  const [termsOptions, setTermsOptions] = useState(DEFAULT_TERMS_OPTIONS)
  const [billPrefix, setBillPrefix] = useState('BILL-')
  const [nextNumber, setNextNumber] = useState('')
  const { toast, showToast, hideToast } = useToast()

  // Flock integration state
  const [activeFlocks, setActiveFlocks] = useState([])
  const [suggestedFlocks, setSuggestedFlocks] = useState([])
  const [showSplitModal, setShowSplitModal] = useState(false)
  const [splitLineIdx, setSplitLineIdx] = useState(null)
  const [splitAllocations, setSplitAllocations] = useState([])

  useEffect(() => {
    const load = async () => {
      try {
        const [acctRes, vendorRes, settingsRes, flocksRes] = await Promise.all([
          getAccounts(), getVendors(), getSettings(), getActiveFlocks()
        ])
        setAccounts(acctRes.data || [])
        setVendors(vendorRes.data || [])
        setActiveFlocks(flocksRes.data || [])

        const s = settingsRes.data || {}
        try {
          const terms = JSON.parse(s.payment_terms?.value || '[]')
          if (terms.length > 0) setTermsOptions(terms)
        } catch {}

        const prefix = s.bill_prefix?.value || 'BILL-'
        const num = s.bill_next_number?.value || ''
        setBillPrefix(prefix)
        setNextNumber(num)

        const dt = s.default_bill_terms?.value || 'Net 30'
        setForm(prev => ({ ...prev, terms: dt, due_date: computeDueDate(prev.bill_date, dt) }))
      } catch {
        try { const acctRes = await getAccounts(); setAccounts(acctRes.data || []) } catch {}
      }
    }
    load()
  }, [])

  // Auto-suggest flock when vendor changes
  const handleVendorFlockSuggest = async (vendorId) => {
    if (!vendorId) { setSuggestedFlocks([]); return }
    try {
      const res = await suggestFlockForVendor(vendorId)
      const flocks = res.data?.flocks || res.data || []
      setSuggestedFlocks(Array.isArray(flocks) ? flocks : [])
    } catch { setSuggestedFlocks([]) }
  }

  const applyFlockSuggestion = (flockId) => {
    setExpenseLines(prev => prev.map(line =>
      !line.flock_id ? { ...line, flock_id: flockId } : line
    ))
    showToast(`Flock ${flockId} applied to empty flock fields`)
  }

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
        if (match) {
          next.vendor_id = match.id || ''
          next.address = match.address || ''
          handleVendorFlockSuggest(match.id)
        } else {
          setSuggestedFlocks([])
        }
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

  // Split across flocks
  const openSplitModal = (idx) => {
    const lineAmount = parseFloat(expenseLines[idx]?.amount) || 0
    if (lineAmount <= 0) { showToast('Enter an amount before splitting', 'warning'); return }
    setSplitLineIdx(idx)
    const checkedFlocks = activeFlocks.slice(0, 2).map(f => ({
      flock_id: f.flock_number || f.id,
      flock_label: `${f.flock_number || f.id}${f.grower_name ? ' — ' + f.grower_name : ''}`,
      pct: 50,
      amount: (lineAmount / 2).toFixed(2),
    }))
    setSplitAllocations(checkedFlocks.length > 0 ? checkedFlocks : [])
    setShowSplitModal(true)
  }

  const updateSplitAlloc = (i, field, value) => {
    const lineAmount = parseFloat(expenseLines[splitLineIdx]?.amount) || 0
    setSplitAllocations(prev => prev.map((a, idx) => {
      if (idx !== i) return a
      const updated = { ...a, [field]: value }
      if (field === 'pct') {
        updated.amount = ((parseFloat(value) || 0) / 100 * lineAmount).toFixed(2)
      } else if (field === 'amount') {
        updated.pct = lineAmount > 0 ? ((parseFloat(value) || 0) / lineAmount * 100).toFixed(1) : 0
      }
      return updated
    }))
  }

  const addSplitFlock = () => {
    setSplitAllocations(prev => [...prev, { flock_id: '', flock_label: '', pct: 0, amount: '0.00' }])
  }

  const removeSplitFlock = (i) => {
    setSplitAllocations(prev => prev.filter((_, idx) => idx !== i))
  }

  const applySplit = () => {
    if (splitLineIdx === null) return
    const origLine = expenseLines[splitLineIdx]
    const newLines = splitAllocations
      .filter(a => parseFloat(a.amount) > 0 && a.flock_id)
      .map(a => ({ ...origLine, amount: a.amount, flock_id: a.flock_id }))
    if (newLines.length === 0) { showToast('Add at least one flock with an amount', 'warning'); return }
    setExpenseLines(prev => {
      const copy = [...prev]
      copy.splice(splitLineIdx, 1, ...newLines)
      return copy
    })
    setShowSplitModal(false)
    showToast(`Split into ${newLines.length} flock lines`)
  }

  const expenseTotal = expenseLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
  const itemTotal = itemLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
  const amountDue = expenseTotal + itemTotal
  const expenseAccountOptions = accounts.filter(a => a.account_type === 'expense')

  const handleSave = async (andNew) => {
    if (submitting) return
    if (amountDue <= 0) { showToast('Add at least one line with an amount', 'error'); return }
    setSubmitting(true)
    try {
      const billNumber = nextNumber ? `${billPrefix}${nextNumber}` : `BILL-${Date.now()}`
      const payload = {
        bill_number: billNumber, vendor_name: form.vendor_name,
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

      // Increment next number
      if (nextNumber) {
        const newNum = String(parseInt(nextNumber, 10) + 1)
        setNextNumber(newNum)
        try { await updateSettings({ bill_next_number: newNum }) } catch {}
      }

      if (onSaved) onSaved()
      if (andNew) { setForm(initialForm()); setExpenseLines([emptyExpenseLine()]); setItemLines([emptyItemLine()]); setSuggestedFlocks([]) }
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error saving bill', 'error')
    } finally { setSubmitting(false) }
  }

  const handleClear = () => { setForm(initialForm()); setExpenseLines([emptyExpenseLine()]); setItemLines([emptyItemLine()]); setSuggestedFlocks([]) }

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

            {/* Suggested Flock Chips */}
            {suggestedFlocks.length > 0 && (
              <div style={{ marginTop: 8, padding: '6px 8px', borderRadius: 8, background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)' }}>
                <span style={{ fontSize: '7pt', color: '#60a5fa', display: 'block', marginBottom: 4 }}>SUGGESTED FLOCKS FOR THIS VENDOR</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {suggestedFlocks.map((f, i) => (
                    <button key={i} type="button"
                      onClick={() => applyFlockSuggestion(f.flock_number || f.flock_id || f.id)}
                      style={{
                        fontSize: '8pt', padding: '3px 10px', borderRadius: 12,
                        background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.3)',
                        color: '#60a5fa', cursor: 'pointer',
                      }}>
                      Flock {f.flock_number || f.flock_id || f.id}
                      {f.grower_name ? ` — ${f.grower_name}` : ''}
                      {f.barn ? ` (${f.barn})` : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
                  {termsOptions.map(t => <option key={t} value={t}>{t}</option>)}
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
                  <th style={{ width: '26%' }}>Account</th>
                  <th style={{ width: '15%' }}>Amount</th>
                  <th style={{ width: '20%' }}>Memo</th>
                  <th style={{ width: '14%' }}>Flock</th>
                  <th style={{ width: '6%' }}>Billable?</th>
                  <th style={{ width: '10%' }}>Split</th>
                  <th style={{ width: '5%' }}></th>
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
                      <td>
                        <select className="glass-input text-sm" value={line.flock_id}
                          onChange={e => updateExpenseLine(idx, 'flock_id', e.target.value)}>
                          <option value="">-- Flock --</option>
                          {activeFlocks.map(f => (
                            <option key={f.id || f.flock_number} value={f.flock_number || f.id}>
                              {f.flock_number || f.id}{f.grower_name ? ` — ${f.grower_name}` : ''}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ textAlign: 'center' }}><input type="checkbox" /></td>
                      <td style={{ textAlign: 'center' }}>
                        <button type="button" onClick={() => openSplitModal(idx)}
                          className="text-lvf-accent hover:text-lvf-text transition"
                          style={{ fontSize: '7pt', border: 'none', background: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                          Split Flocks
                        </button>
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
                  <td colSpan={5} style={{ border: 'none' }}></td>
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

      {/* ── Split Across Flocks Modal ── */}
      {showSplitModal && splitLineIdx !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowSplitModal(false)}>
          <div className="glass-card" style={{ minWidth: 500, maxWidth: 600, padding: 20 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '11pt', fontWeight: 700, marginBottom: 10, color: '#60a5fa' }}>
              Split Expense Across Flocks
            </h3>
            <p style={{ fontSize: '8pt', color: '#999', marginBottom: 10 }}>
              Original amount: <strong style={{ color: '#e2e8f0' }}>${parseFloat(expenseLines[splitLineIdx]?.amount || 0).toFixed(2)}</strong>
              {' '}&mdash; Account: {expenseAccountOptions.find(a => a.id === expenseLines[splitLineIdx]?.account_id)?.name || 'Not set'}
            </p>

            <table className="glass-table w-full" style={{ marginBottom: 10 }}>
              <thead><tr>
                <th style={{ width: '35%' }}>Flock</th>
                <th style={{ width: '20%' }}>%</th>
                <th style={{ width: '25%' }}>Amount</th>
                <th style={{ width: '10%' }}></th>
              </tr></thead>
              <tbody>
                {splitAllocations.map((alloc, i) => (
                  <tr key={i}>
                    <td>
                      <select className="glass-input text-sm" value={alloc.flock_id}
                        onChange={e => {
                          const f = activeFlocks.find(fl => (fl.flock_number || fl.id) === e.target.value)
                          setSplitAllocations(prev => prev.map((a, idx) => idx === i
                            ? { ...a, flock_id: e.target.value, flock_label: f ? `${f.flock_number || f.id} — ${f.grower_name || ''}` : e.target.value }
                            : a
                          ))
                        }}>
                        <option value="">-- Select Flock --</option>
                        {activeFlocks.map(f => (
                          <option key={f.id || f.flock_number} value={f.flock_number || f.id}>
                            {f.flock_number || f.id}{f.grower_name ? ` — ${f.grower_name}` : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input className="glass-input text-sm" type="number" step="0.1" min="0" max="100"
                        value={alloc.pct} onChange={e => updateSplitAlloc(i, 'pct', e.target.value)}
                        style={{ textAlign: 'right' }} />
                    </td>
                    <td>
                      <input className="glass-input text-sm" type="number" step="0.01" min="0"
                        value={alloc.amount} onChange={e => updateSplitAlloc(i, 'amount', e.target.value)}
                        style={{ textAlign: 'right' }} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button type="button" onClick={() => removeSplitFlock(i)}
                        style={{ color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer' }}>x</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {(() => {
              const origAmount = parseFloat(expenseLines[splitLineIdx]?.amount) || 0
              const allocated = splitAllocations.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0)
              const remaining = origAmount - allocated
              return remaining !== 0 ? (
                <p style={{ fontSize: '8pt', color: remaining > 0 ? '#fbbf24' : '#f87171', marginBottom: 8 }}>
                  {remaining > 0 ? `$${remaining.toFixed(2)} unallocated` : `$${Math.abs(remaining).toFixed(2)} over-allocated`}
                </p>
              ) : (
                <p style={{ fontSize: '8pt', color: '#34d399', marginBottom: 8 }}>Fully allocated</p>
              )
            })()}

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button type="button" onClick={addSplitFlock} className="glass-button-secondary text-sm">+ Add Flock</button>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={() => setShowSplitModal(false)} className="glass-button-secondary text-sm">Cancel</button>
                <button type="button" onClick={applySplit} className="glass-button-primary text-sm">Apply Split</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
