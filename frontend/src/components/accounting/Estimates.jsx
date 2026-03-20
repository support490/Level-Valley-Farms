import { useState, useEffect } from 'react'
import { getEstimates, createEstimate, updateEstimateStatus, convertEstimateToInvoice, getBuyers, getAccounts } from '../../api/accounting'
import { getSettings, updateSettings } from '../../api/settings'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'

const defaultTermsOptions = [
  { value: 'Due on Receipt', days: 0 },
  { value: 'Net 15', days: 15 },
  { value: 'Net 30', days: 30 },
  { value: 'Net 45', days: 45 },
  { value: 'Net 60', days: 60 },
]

function termsToDays(termsValue) {
  const match = termsValue.match(/Net\s+(\d+)/)
  if (match) return parseInt(match[1], 10)
  if (termsValue === 'Due on Receipt') return 0
  return 30
}

const statusConfig = {
  draft:     { label: 'Draft',     bg: 'bg-gray-500/20',   text: 'text-gray-300',   border: 'border-gray-500/40' },
  sent:      { label: 'Sent',      bg: 'bg-blue-500/20',   text: 'text-blue-300',   border: 'border-blue-500/40' },
  accepted:  { label: 'Accepted',  bg: 'bg-green-500/20',  text: 'text-green-300',  border: 'border-green-500/40' },
  rejected:  { label: 'Rejected',  bg: 'bg-red-500/20',    text: 'text-red-300',    border: 'border-red-500/40' },
  converted: { label: 'Converted', bg: 'bg-purple-500/20', text: 'text-purple-300', border: 'border-purple-500/40' },
  expired:   { label: 'Expired',   bg: 'bg-orange-500/20', text: 'text-orange-300', border: 'border-orange-500/40' },
}

const emptyLine = {
  item_description: '', description: '', quantity: '', unit_of_measure: '', rate: '', amount: 0,
}

function addDays(dateStr, days) {
  const d = new Date(dateStr); d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function StatusBadge({ status }) {
  const cfg = statusConfig[status] || statusConfig.draft
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.label}
    </span>
  )
}

export default function Estimates() {
  const today = new Date().toISOString().split('T')[0]
  const { toast, showToast, hideToast } = useToast()

  // View state: 'list' or 'form'
  const [view, setView] = useState('list')

  // List state
  const [estimates, setEstimates] = useState([])
  const [loading, setLoading] = useState(false)
  const [statusDropdownId, setStatusDropdownId] = useState(null)

  // Form state
  const [submitting, setSubmitting] = useState(false)
  const [buyers, setBuyers] = useState([])
  const [accounts, setAccounts] = useState([])
  const [termsOptions, setTermsOptions] = useState(defaultTermsOptions)
  const [estimatePrefix, setEstimatePrefix] = useState('EST-')
  const [nextNumber, setNextNumber] = useState('')

  const [form, setForm] = useState({
    buyer: '', buyer_id: '',
    estimate_date: today, estimate_number: 'EST-' + Date.now(),
    expiration_date: addDays(today, 30),
    po_number: '', terms: 'Net 30',
    customer_message: '', notes: '',
  })

  const [lineItems, setLineItems] = useState([{ ...emptyLine }])

  useEffect(() => { loadEstimates() }, [])

  const loadEstimates = async () => {
    setLoading(true)
    try {
      const res = await getEstimates()
      setEstimates(res.data || [])
    } catch {
      setEstimates([])
    } finally { setLoading(false) }
  }

  const loadFormData = async () => {
    try {
      const [acctRes, buyerRes, settingsRes] = await Promise.all([getAccounts(), getBuyers(), getSettings()])
      setAccounts(acctRes.data || [])
      setBuyers(buyerRes.data || [])

      const s = settingsRes.data || {}
      try {
        const terms = JSON.parse(s.payment_terms?.value || '[]')
        if (terms.length > 0) setTermsOptions(terms.map(t => ({ value: t, days: termsToDays(t) })))
      } catch {}

      const prefix = s.estimate_prefix?.value || 'EST-'
      const num = s.estimate_next_number?.value || ''
      setEstimatePrefix(prefix)
      setNextNumber(num)
      if (num) {
        setForm(prev => ({ ...prev, estimate_number: `${prefix}${num}` }))
      }
    } catch {
      try { const acctRes = await getAccounts(); setAccounts(acctRes.data || []) } catch {}
    }
  }

  const openNewEstimate = () => {
    clearForm()
    loadFormData()
    setView('form')
  }

  const goBackToList = () => {
    setView('list')
    loadEstimates()
  }

  // ── Form helpers ──

  const updateTerms = (newDate, newTerms) => {
    const term = termsOptions.find(t => t.value === newTerms)
    const expiry = term ? addDays(newDate, term.days) : addDays(newDate, 30)
    setForm(prev => ({ ...prev, estimate_date: newDate, terms: newTerms, expiration_date: expiry }))
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
  const total = subtotal

  const clearForm = () => {
    const num = nextNumber ? parseInt(nextNumber, 10) + 1 : ''
    setForm({
      buyer: '', buyer_id: '',
      estimate_date: today, estimate_number: num ? `${estimatePrefix}${num}` : `EST-${Date.now()}`,
      expiration_date: addDays(today, 30),
      po_number: '', terms: 'Net 30',
      customer_message: '', notes: '',
    })
    setLineItems([{ ...emptyLine }])
  }

  const handleSave = async (andNew = false) => {
    if (!form.buyer) { showToast('Customer / Buyer name is required', 'error'); return }
    if (lineItems.every(li => !li.item_description && !li.quantity)) { showToast('Add at least one line item', 'error'); return }
    setSubmitting(true)
    try {
      const payload = {
        buyer: form.buyer, buyer_id: form.buyer_id || undefined,
        estimate_date: form.estimate_date, expiration_date: form.expiration_date,
        estimate_number: form.estimate_number, amount: total,
        po_number: form.po_number, terms: form.terms,
        customer_message: form.customer_message, notes: form.notes,
        line_items: lineItems.filter(li => li.item_description || li.quantity).map(li => ({
          item_description: li.item_description, description: li.description,
          quantity: parseFloat(li.quantity) || 0,
          unit_of_measure: li.unit_of_measure, rate: parseFloat(li.rate) || 0, amount: li.amount,
        })),
      }
      await createEstimate(payload)
      showToast('Estimate created successfully')

      // Increment next number in settings
      if (nextNumber) {
        const newNum = String(parseInt(nextNumber, 10) + 1)
        setNextNumber(newNum)
        try { await updateSettings({ estimate_next_number: newNum }) } catch {}
      }

      if (andNew) { clearForm() } else { goBackToList() }
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error creating estimate', 'error')
    } finally { setSubmitting(false) }
  }

  const handleBuyerSelect = (name) => {
    const match = buyers.find(b => b.name === name || b.buyer_name === name)
    setForm(prev => ({
      ...prev, buyer: name,
      buyer_id: match?.id || match?.buyer_id || '',
    }))
  }

  // ── List actions ──

  const handleStatusChange = async (id, newStatus) => {
    try {
      await updateEstimateStatus(id, newStatus)
      showToast(`Status updated to ${newStatus}`)
      setStatusDropdownId(null)
      loadEstimates()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error updating status', 'error')
    }
  }

  const handleConvertToInvoice = async (id) => {
    try {
      await convertEstimateToInvoice(id)
      showToast('Estimate converted to invoice successfully')
      loadEstimates()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error converting estimate', 'error')
    }
  }

  // ── Render ──

  if (view === 'form') {
    return (
      <div>
        {toast && <Toast {...toast} onClose={hideToast} />}

        {/* Header strip */}
        <div className="bg-lvf-dark/30 border-b border-lvf-border" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '3px 8px',
        }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="glass-button-secondary text-sm" style={{ padding: '2px 8px' }} onClick={goBackToList}>
              &#9664; Back to List
            </button>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="glass-button-secondary text-sm" onClick={() => window.print()} style={{ padding: '2px 8px' }}>Print</button>
            <button className="glass-button-secondary text-sm" style={{ padding: '2px 8px' }}
              onClick={() => showToast('Email not configured — set up SMTP in Settings', 'warning')}>Email</button>
          </div>
        </div>

        {/* Header Form */}
        <div className="glass-card p-4 m-2">
          {/* Row 1: Customer */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 8 }}>
            <div>
              <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 1 }}>Customer:Job</label>
              <input className="glass-input text-sm" list="est-buyer-list" value={form.buyer}
                onChange={e => handleBuyerSelect(e.target.value)}
                placeholder="Type or select customer..." style={{ fontSize: '10pt', fontWeight: 600 }} />
              <datalist id="est-buyer-list">
                {buyers.map(b => <option key={b.id || b.buyer_id} value={b.name || b.buyer_name} />)}
              </datalist>
            </div>
            <div>
              <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 1 }}>Estimate #</label>
              <input className="glass-input text-sm" value={form.estimate_number} readOnly style={{ background: '#f5f5f0' }} />
            </div>
          </div>

          {/* Row 2: Date | Expiration Date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
            <div>
              <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 1 }}>Estimate Date</label>
              <input className="glass-input text-sm" type="date" value={form.estimate_date}
                onChange={e => updateTerms(e.target.value, form.terms)} />
            </div>
            <div>
              <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 1 }}>Expiration Date</label>
              <input className="glass-input text-sm" type="date" value={form.expiration_date}
                onChange={e => setForm({ ...form, expiration_date: e.target.value })} />
            </div>
          </div>

          {/* Row 3: P.O. # | Terms */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 1 }}>P.O. Number</label>
              <input className="glass-input text-sm" value={form.po_number} onChange={e => setForm({ ...form, po_number: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 1 }}>Terms</label>
              <select className="glass-input text-sm" value={form.terms} onChange={e => updateTerms(form.estimate_date, e.target.value)}>
                {termsOptions.map(t => <option key={t.value} value={t.value}>{t.value}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <div style={{ margin: '0 8px' }}>
          <table className="glass-table w-full">
            <thead>
              <tr>
                <th style={{ width: '22%' }}>Item</th>
                <th style={{ width: '22%' }}>Description</th>
                <th style={{ width: '10%', textAlign: 'right' }}>Qty</th>
                <th style={{ width: '10%' }}>U/M</th>
                <th style={{ width: '12%', textAlign: 'right' }}>Rate</th>
                <th style={{ width: '14%', textAlign: 'right' }}>Amount</th>
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
            <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 1, marginTop: 8 }}>Notes</label>
            <textarea className="glass-input text-sm" rows={2} value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder="Internal notes..." style={{ resize: 'vertical' }} />
          </div>
          <div>
            <table style={{ width: '100%', fontSize: '8pt' }}>
              <tbody>
                <tr>
                  <td style={{ textAlign: 'right', padding: '3px 8px', color: '#999' }}>Subtotal</td>
                  <td style={{ textAlign: 'right', padding: '3px 6px', fontWeight: 600, width: 100 }}>${subtotal.toFixed(2)}</td>
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

  // ── List View ──
  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      <div className="glass-card p-4 m-2">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: '14pt', fontWeight: 700, margin: 0 }}>Estimates</h2>
          <button className="glass-button-primary text-sm" onClick={openNewEstimate}>+ New Estimate</button>
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', padding: 20, color: '#999' }}>Loading estimates...</p>
        ) : estimates.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 20, color: '#999' }}>No estimates found. Click "New Estimate" to create one.</p>
        ) : (
          <table className="glass-table w-full">
            <thead>
              <tr>
                <th>Estimate #</th>
                <th>Customer</th>
                <th>Date</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {estimates.map(est => {
                const estStatus = est.status || 'draft'
                const canConvert = estStatus === 'sent' || estStatus === 'accepted'
                return (
                  <tr key={est.id}>
                    <td style={{ fontWeight: 600 }}>{est.estimate_number || est.id}</td>
                    <td>{est.buyer || est.customer || '-'}</td>
                    <td>{est.estimate_date || '-'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>${(est.amount || 0).toFixed(2)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <StatusBadge status={estStatus} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: 4, position: 'relative' }}>
                        {/* Edit Status dropdown */}
                        <div style={{ position: 'relative' }}>
                          <button
                            className="glass-button-secondary text-sm"
                            style={{ padding: '2px 8px', fontSize: '8pt' }}
                            onClick={() => setStatusDropdownId(statusDropdownId === est.id ? null : est.id)}
                          >
                            Edit Status &#9662;
                          </button>
                          {statusDropdownId === est.id && (
                            <div
                              className="glass-card"
                              style={{
                                position: 'absolute', top: '100%', right: 0, zIndex: 50,
                                minWidth: 130, padding: 4, marginTop: 2,
                              }}
                            >
                              {Object.keys(statusConfig).map(s => (
                                <button
                                  key={s}
                                  className="glass-button-secondary text-sm"
                                  style={{
                                    display: 'block', width: '100%', textAlign: 'left',
                                    padding: '3px 8px', fontSize: '8pt', marginBottom: 1,
                                  }}
                                  onClick={() => handleStatusChange(est.id, s)}
                                >
                                  {statusConfig[s].label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Convert to Invoice */}
                        {canConvert && (
                          <button
                            className="glass-button-primary text-sm"
                            style={{ padding: '2px 8px', fontSize: '8pt' }}
                            onClick={() => handleConvertToInvoice(est.id)}
                          >
                            Convert to Invoice
                          </button>
                        )}
                      </div>
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
