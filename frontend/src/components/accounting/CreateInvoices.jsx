import { useState, useEffect } from 'react'
import { createInvoice, getInvoices, getAccounts, getBuyers } from '../../api/accounting'
import { getSettings, updateSettings } from '../../api/settings'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'
import AddressAutocomplete from '../common/AddressAutocomplete'

const defaultTermsOptions = [
  { value: 'Due on Receipt', days: 0 },
  { value: 'Net 15', days: 15 },
  { value: 'Net 30', days: 30 },
  { value: 'Net 45', days: 45 },
  { value: 'Net 60', days: 60 },
]

const emptyLine = {
  item_description: '', quantity: '', unit_of_measure: '', rate: '', amount: 0, account_id: '', flock_id: '',
}

function addDays(dateStr, days) {
  const d = new Date(dateStr); d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function termsToDays(termsValue) {
  const match = termsValue.match(/Net\s+(\d+)/)
  if (match) return parseInt(match[1], 10)
  if (termsValue === 'Due on Receipt') return 0
  return 30
}

export default function CreateInvoices({ onSaved }) {
  const today = new Date().toISOString().split('T')[0]
  const { toast, showToast, hideToast } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [buyers, setBuyers] = useState([])
  const [accounts, setAccounts] = useState([])

  // Settings-driven state
  const [termsOptions, setTermsOptions] = useState(defaultTermsOptions)
  const [invoicePrefix, setInvoicePrefix] = useState('INV-')
  const [nextNumber, setNextNumber] = useState('')
  const [defaultTerms, setDefaultTerms] = useState('Net 30')

  // Invoice navigation
  const [invoices, setInvoices] = useState([])
  const [currentIndex, setCurrentIndex] = useState(-1) // -1 = new invoice

  const [form, setForm] = useState({
    buyer: '', buyer_id: '', class_name: '', template: '',
    invoice_date: today, invoice_number: '',
    bill_to_address: '', ship_to_address: '',
    po_number: '', terms: 'Net 30', due_date: addDays(today, 30),
    ship_date: '', ship_via: '', customer_message: '', description: '', notes: '',
  })

  const [lineItems, setLineItems] = useState([{ ...emptyLine }])

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      const [acctRes, buyerRes, settingsRes, invoiceRes] = await Promise.all([
        getAccounts(), getBuyers(), getSettings(), getInvoices(),
      ])
      setAccounts(acctRes.data || [])
      setBuyers(buyerRes.data || [])
      setInvoices(invoiceRes.data || [])

      const s = settingsRes.data || {}

      // Payment terms from settings
      try {
        const terms = JSON.parse(s.payment_terms?.value || '[]')
        if (terms.length > 0) {
          setTermsOptions(terms.map(t => ({ value: t, days: termsToDays(t) })))
        }
      } catch {}

      // Numbering
      const prefix = s.invoice_prefix?.value || 'INV-'
      const num = s.invoice_next_number?.value || ''
      setInvoicePrefix(prefix)
      setNextNumber(num)

      // Default terms
      const dt = s.default_invoice_terms?.value || 'Net 30'
      setDefaultTerms(dt)

      // Set initial invoice number and terms
      setForm(prev => ({
        ...prev,
        invoice_number: num ? `${prefix}${num}` : `INV-${Date.now()}`,
        terms: dt,
        due_date: addDays(prev.invoice_date, termsToDays(dt)),
      }))
    } catch {
      try { const acctRes = await getAccounts(); setAccounts(acctRes.data || []) } catch {}
    }
  }

  const updateTerms = (newDate, newTerms) => {
    const days = termsToDays(newTerms)
    const due = addDays(newDate, days)
    setForm(prev => ({ ...prev, invoice_date: newDate, terms: newTerms, due_date: due }))
  }

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

  const addLine = () => setLineItems(prev => [...prev, { ...emptyLine }])
  const removeLine = (idx) => { if (lineItems.length > 1) setLineItems(prev => prev.filter((_, i) => i !== idx)) }

  const subtotal = lineItems.reduce((sum, li) => sum + (li.amount || 0), 0)
  const tax = 0
  const total = subtotal + tax

  const clearForm = () => {
    const num = nextNumber ? parseInt(nextNumber, 10) + 1 : ''
    setForm({
      buyer: '', buyer_id: '', class_name: '', template: '',
      invoice_date: today, invoice_number: num ? `${invoicePrefix}${num}` : `INV-${Date.now()}`,
      bill_to_address: '', ship_to_address: '',
      po_number: '', terms: defaultTerms, due_date: addDays(today, termsToDays(defaultTerms)),
      ship_date: '', ship_via: '', customer_message: '', description: '', notes: '',
    })
    setLineItems([{ ...emptyLine }])
    setCurrentIndex(-1)
  }

  const handleSave = async (andNew = false) => {
    if (!form.buyer) { showToast('Customer / Buyer name is required', 'error'); return }
    if (lineItems.every(li => !li.item_description && !li.quantity)) { showToast('Add at least one line item', 'error'); return }
    setSubmitting(true)
    try {
      const payload = {
        buyer: form.buyer, buyer_id: form.buyer_id || undefined,
        invoice_date: form.invoice_date, due_date: form.due_date, amount: total,
        description: form.description || lineItems.map(li => li.item_description).filter(Boolean).join('; '),
        notes: form.notes, ship_to_address: form.ship_to_address,
        po_number: form.po_number, terms: form.terms,
        ship_date: form.ship_date || undefined, ship_via: form.ship_via || undefined,
        customer_message: form.customer_message,
        line_items: lineItems.filter(li => li.item_description || li.quantity).map(li => ({
          item_description: li.item_description, quantity: parseFloat(li.quantity) || 0,
          unit_of_measure: li.unit_of_measure, rate: parseFloat(li.rate) || 0, amount: li.amount,
          account_id: li.account_id || undefined, flock_id: li.flock_id || undefined,
        })),
      }
      await createInvoice(payload)
      showToast('Invoice created successfully')

      // Increment next number in settings
      if (nextNumber) {
        const newNum = String(parseInt(nextNumber, 10) + 1)
        setNextNumber(newNum)
        try { await updateSettings({ invoice_next_number: newNum }) } catch {}
      }

      if (onSaved) onSaved()
      if (andNew) clearForm()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error creating invoice', 'error')
    } finally { setSubmitting(false) }
  }

  const handleBuyerSelect = (name) => {
    const match = buyers.find(b => b.name === name || b.buyer_name === name)
    setForm(prev => ({
      ...prev, buyer: name,
      buyer_id: match?.id || match?.buyer_id || '',
      bill_to_address: match?.address || match?.bill_to_address || prev.bill_to_address,
      ship_to_address: match?.ship_to_address || prev.ship_to_address,
    }))
  }

  // Prev/Next navigation
  const loadInvoiceAtIndex = (idx) => {
    if (idx < 0 || idx >= invoices.length) return
    setCurrentIndex(idx)
    const inv = invoices[idx]
    setForm({
      buyer: inv.buyer || '', buyer_id: inv.buyer_id || '', class_name: '', template: '',
      invoice_date: inv.invoice_date || today, invoice_number: inv.invoice_number || '',
      bill_to_address: inv.bill_to_address || '', ship_to_address: inv.ship_to_address || '',
      po_number: inv.po_number || '', terms: inv.terms || 'Net 30', due_date: inv.due_date || '',
      ship_date: inv.ship_date || '', ship_via: inv.ship_via || '',
      customer_message: inv.customer_message || '', description: inv.description || '', notes: inv.notes || '',
    })
    setLineItems(inv.line_items?.length > 0
      ? inv.line_items.map(li => ({
          item_description: li.item_description || '', quantity: li.quantity || '',
          unit_of_measure: li.unit_of_measure || '', rate: li.rate || '',
          amount: li.amount || 0, account_id: li.account_id || '', flock_id: li.flock_id || '',
        }))
      : [{ ...emptyLine }]
    )
  }

  const handlePrev = () => {
    if (invoices.length === 0) return
    if (currentIndex <= 0) {
      loadInvoiceAtIndex(invoices.length - 1)
    } else {
      loadInvoiceAtIndex(currentIndex - 1)
    }
  }

  const handleNext = () => {
    if (invoices.length === 0) return
    if (currentIndex >= invoices.length - 1 || currentIndex === -1) {
      loadInvoiceAtIndex(0)
    } else {
      loadInvoiceAtIndex(currentIndex + 1)
    }
  }

  const handleEmail = () => {
    showToast('Email not configured — set up SMTP in Settings', 'warning')
  }

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      {/* Header strip: Prev/Next | Print | Email */}
      <div className="bg-lvf-dark/30 border-b border-lvf-border" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '3px 8px',
      }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button className="glass-button-secondary text-sm" style={{ padding: '2px 8px' }} onClick={handlePrev}
            title={invoices.length > 0 ? `${invoices.length} invoices` : 'No saved invoices'}>&#9664; Prev</button>
          <button className="glass-button-secondary text-sm" style={{ padding: '2px 8px' }} onClick={handleNext}>Next &#9654;</button>
          {currentIndex >= 0 && (
            <span style={{ fontSize: '8pt', color: '#999', marginLeft: 4 }}>
              {currentIndex + 1} of {invoices.length}
            </span>
          )}
          {currentIndex >= 0 && (
            <button className="glass-button-secondary text-sm" style={{ padding: '2px 8px', marginLeft: 4 }} onClick={clearForm}>+ New</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="glass-button-secondary text-sm" onClick={() => window.print()} style={{ padding: '2px 8px' }}>Print</button>
          <button className="glass-button-secondary text-sm" style={{ padding: '2px 8px' }} onClick={handleEmail}>Email</button>
        </div>
      </div>

      {/* Header Form */}
      <div className="glass-card p-4 m-2">
        {/* Row 1: Customer:Job | Template */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 8 }}>
          <div>
            <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 1 }}>Customer:Job</label>
            <input className="glass-input text-sm" list="buyer-list" value={form.buyer}
              onChange={e => handleBuyerSelect(e.target.value)}
              placeholder="Type or select customer..." style={{ fontSize: '10pt', fontWeight: 600 }} />
            <datalist id="buyer-list">
              {buyers.map(b => <option key={b.id || b.buyer_id} value={b.name || b.buyer_name} />)}
            </datalist>
          </div>
          <div>
            <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 1 }}>Template</label>
            <select className="glass-input text-sm" value={form.template}
              onChange={e => setForm({ ...form, template: e.target.value })}>
              <option value="">Intuit Product Invoice</option>
              <option value="service">Intuit Service Invoice</option>
              <option value="custom">Custom Template</option>
            </select>
          </div>
        </div>

        {/* Row 2: Date | Invoice # */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
          <div>
            <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 1 }}>Date</label>
            <input className="glass-input text-sm" type="date" value={form.invoice_date}
              onChange={e => updateTerms(e.target.value, form.terms)} />
          </div>
          <div>
            <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 1 }}>Invoice #</label>
            <input className="glass-input text-sm" value={form.invoice_number} readOnly style={{ background: '#f5f5f0' }} />
          </div>
        </div>

        {/* Row 3: Bill To | Ship To */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
          <div>
            <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 1 }}>Bill To</label>
            <AddressAutocomplete
              className="glass-input text-sm"
              value={form.bill_to_address}
              onChange={val => setForm({ ...form, bill_to_address: val })}
              placeholder="Billing address..."
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 1 }}>Ship To</label>
            <AddressAutocomplete
              className="glass-input text-sm"
              value={form.ship_to_address}
              onChange={val => setForm({ ...form, ship_to_address: val })}
              placeholder="Shipping address..."
              style={{ width: '100%' }}
            />
          </div>
        </div>

        {/* Row 4: P.O. # | Terms | Due Date | Ship Date | Ship Via */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 8 }}>
          <div>
            <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 1 }}>P.O. Number</label>
            <input className="glass-input text-sm" value={form.po_number} onChange={e => setForm({ ...form, po_number: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 1 }}>Terms</label>
            <select className="glass-input text-sm" value={form.terms} onChange={e => updateTerms(form.invoice_date, e.target.value)}>
              {termsOptions.map(t => <option key={t.value} value={t.value}>{t.value}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 1 }}>Due Date</label>
            <input className="glass-input text-sm" type="date" value={form.due_date}
              onChange={e => setForm({ ...form, due_date: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 1 }}>Ship Date</label>
            <input className="glass-input text-sm" type="date" value={form.ship_date}
              onChange={e => setForm({ ...form, ship_date: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 1 }}>Ship Via</label>
            <input className="glass-input text-sm" value={form.ship_via}
              onChange={e => setForm({ ...form, ship_via: e.target.value })} placeholder="e.g. FedEx" />
          </div>
        </div>
      </div>

      {/* Line Items Table */}
      <div style={{ margin: '0 8px' }}>
        <table className="glass-table w-full">
          <thead>
            <tr>
              <th style={{ width: '22%' }}>Item</th>
              <th style={{ width: '18%' }}>Description</th>
              <th style={{ width: '8%', textAlign: 'right' }}>Qty</th>
              <th style={{ width: '7%' }}>U/M</th>
              <th style={{ width: '10%', textAlign: 'right' }}>Rate</th>
              <th style={{ width: '12%', textAlign: 'right' }}>Amount</th>
              <th style={{ width: '6%', textAlign: 'center' }}>Tax</th>
              <th style={{ width: '10%' }}>Flock</th>
              <th style={{ width: '5%' }}></th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((li, idx) => (
              <tr key={idx}>
                <td>
                  <input className="glass-input text-sm" value={li.item_description}
                    onChange={e => updateLine(idx, 'item_description', e.target.value)} placeholder="Item name..." />
                </td>
                <td>
                  <input className="glass-input text-sm" value={li.description || ''}
                    onChange={e => updateLine(idx, 'description', e.target.value)} />
                </td>
                <td>
                  <input className="glass-input text-sm" type="number" step="any" min="0" value={li.quantity}
                    onChange={e => updateLine(idx, 'quantity', e.target.value)} style={{ textAlign: 'right' }} />
                </td>
                <td>
                  <input className="glass-input text-sm" value={li.unit_of_measure}
                    onChange={e => updateLine(idx, 'unit_of_measure', e.target.value)} placeholder="ea" />
                </td>
                <td>
                  <input className="glass-input text-sm" type="number" step="0.01" min="0" value={li.rate}
                    onChange={e => updateLine(idx, 'rate', e.target.value)} style={{ textAlign: 'right' }} />
                </td>
                <td style={{ textAlign: 'right', fontWeight: 600, padding: '2px 6px' }}>
                  ${(li.amount || 0).toFixed(2)}
                </td>
                <td style={{ textAlign: 'center' }}><input type="checkbox" /></td>
                <td>
                  <input className="glass-input text-sm" value={li.flock_id}
                    onChange={e => updateLine(idx, 'flock_id', e.target.value)} placeholder="Flock #" />
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
        <div style={{ marginTop: 4 }}>
          <button type="button" className="glass-button-secondary text-sm" onClick={addLine}>+ Add Line</button>
        </div>
      </div>

      {/* Footer: Customer Message + Totals */}
      <div className="glass-card p-4 m-2" style={{ marginTop: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 1 }}>Customer Message</label>
          <textarea className="glass-input text-sm" rows={3} value={form.customer_message}
            onChange={e => setForm({ ...form, customer_message: e.target.value })}
            placeholder="Thank you for your business..." style={{ resize: 'vertical' }} />
          <label style={{ fontSize: '8pt', display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, cursor: 'pointer' }}>
            <input type="checkbox" defaultChecked /> To be printed
          </label>
        </div>
        <div>
          <table style={{ width: '100%', fontSize: '8pt' }}>
            <tbody>
              <tr>
                <td style={{ textAlign: 'right', padding: '3px 8px', color: '#666' }}>Subtotal</td>
                <td style={{ textAlign: 'right', padding: '3px 6px', fontWeight: 600, width: 100 }}>${subtotal.toFixed(2)}</td>
              </tr>
              <tr>
                <td style={{ textAlign: 'right', padding: '3px 8px', color: '#666' }}>Tax</td>
                <td style={{ textAlign: 'right', padding: '3px 6px' }}>${tax.toFixed(2)}</td>
              </tr>
              <tr style={{ borderTop: '2px solid #333' }}>
                <td style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 700, fontSize: '10pt' }}>Total</td>
                <td style={{ textAlign: 'right', padding: '4px 6px', fontWeight: 700, fontSize: '10pt' }}>${total.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, margin: '6px 8px 0' }}>
        <button type="button" className="glass-button-secondary text-sm" onClick={clearForm}>Revert</button>
        <button type="button" className="glass-button-secondary text-sm" onClick={() => window.print()}>Print</button>
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
