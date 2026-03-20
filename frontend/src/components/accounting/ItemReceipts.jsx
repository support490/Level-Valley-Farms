import { useState, useEffect } from 'react'
import {
  getItemReceipts, createItemReceipt, convertReceiptToBill,
  getVendors, getActiveFlocks,
} from '../../api/accounting'
import { getSettings, updateSettings } from '../../api/settings'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'

const today = () => new Date().toISOString().split('T')[0]
const emptyLine = () => ({ item_description: '', quantity: '', cost: '', amount: '', flock_id: '' })

const initialForm = () => ({
  vendor_name: '', vendor_id: '', receipt_date: today(),
  memo: '', ref_no: '',
})

const statusConfig = {
  open:   { label: 'Open',   bg: 'bg-blue-500/20',   text: 'text-blue-300',  border: 'border-blue-500/40' },
  billed: { label: 'Billed', bg: 'bg-green-500/20',  text: 'text-green-300', border: 'border-green-500/40' },
  voided: { label: 'Voided', bg: 'bg-red-500/20',    text: 'text-red-300',   border: 'border-red-500/40' },
}

function StatusBadge({ status }) {
  const cfg = statusConfig[status] || statusConfig.open
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.label}
    </span>
  )
}

export default function ItemReceipts() {
  const [mode, setMode] = useState('list')
  const [filterTab, setFilterTab] = useState('all')

  // List state
  const [receipts, setReceipts] = useState([])
  const [loading, setLoading] = useState(false)
  const [converting, setConverting] = useState(null)

  // Form state
  const [form, setForm] = useState(initialForm())
  const [lines, setLines] = useState([emptyLine()])
  const [vendors, setVendors] = useState([])
  const [flocks, setFlocks] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [receiptPrefix, setReceiptPrefix] = useState('IR-')
  const [nextNumber, setNextNumber] = useState('')

  const { toast, showToast, hideToast } = useToast()

  // ── Load list ──
  const loadReceipts = async () => {
    setLoading(true)
    try {
      const params = filterTab !== 'all' ? { status: filterTab } : {}
      const res = await getItemReceipts(params)
      setReceipts(res.data || [])
    } catch {
      setReceipts([])
    } finally { setLoading(false) }
  }

  useEffect(() => { loadReceipts() }, [filterTab])

  // ── Load form data ──
  const loadFormData = async () => {
    try {
      const [vendorRes, flockRes, settingsRes] = await Promise.all([
        getVendors(), getActiveFlocks(), getSettings(),
      ])
      setVendors(vendorRes.data || [])
      setFlocks(flockRes.data || [])

      const s = settingsRes.data || {}
      const prefix = s.item_receipt_prefix?.value || 'IR-'
      const num = s.item_receipt_next_number?.value || ''
      setReceiptPrefix(prefix)
      setNextNumber(num)
    } catch {}
  }

  const openNewReceipt = () => {
    setForm(initialForm())
    setLines([emptyLine()])
    loadFormData()
    setMode('create')
  }

  const goBackToList = () => {
    setMode('list')
    loadReceipts()
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

  const updateLine = (idx, field, value) => {
    setLines(prev => prev.map((line, i) => {
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
  const addLine = () => setLines(prev => [...prev, emptyLine()])
  const removeLine = (idx) => setLines(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)

  const lineTotal = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)

  // ── Save ──
  const handleSave = async (andNew) => {
    if (submitting) return
    if (!form.vendor_name) { showToast('Vendor is required', 'error'); return }
    if (lineTotal <= 0) { showToast('Add at least one line item with an amount', 'error'); return }
    setSubmitting(true)
    try {
      const receiptNumber = nextNumber ? `${receiptPrefix}${nextNumber}` : `IR-${Date.now()}`
      const payload = {
        receipt_number: receiptNumber,
        vendor_name: form.vendor_name,
        vendor_id: form.vendor_id || undefined,
        receipt_date: form.receipt_date,
        memo: form.memo,
        ref_no: form.ref_no,
        amount: lineTotal,
        lines: lines.filter(l => parseFloat(l.amount) > 0).map(l => ({
          item_description: l.item_description,
          quantity: parseFloat(l.quantity) || 0,
          cost: parseFloat(l.cost) || 0,
          amount: parseFloat(l.amount),
          flock_id: l.flock_id || undefined,
        })),
      }
      await createItemReceipt(payload)
      showToast('Item receipt saved successfully')

      if (nextNumber) {
        const newNum = String(parseInt(nextNumber, 10) + 1)
        setNextNumber(newNum)
        try { await updateSettings({ item_receipt_next_number: newNum }) } catch {}
      }

      if (andNew) {
        setForm(initialForm())
        setLines([emptyLine()])
      } else {
        goBackToList()
      }
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error saving item receipt', 'error')
    } finally { setSubmitting(false) }
  }

  const handleClear = () => {
    setForm(initialForm())
    setLines([emptyLine()])
  }

  // ── Convert to Bill ──
  const handleConvert = async (receipt) => {
    if (converting) return
    setConverting(receipt.id)
    try {
      await convertReceiptToBill(receipt.id)
      showToast(`Receipt ${receipt.receipt_number || '#' + receipt.id} converted to bill`)
      loadReceipts()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error converting receipt to bill', 'error')
    } finally { setConverting(null) }
  }

  // ── Summarize items for list display ──
  const summarizeItems = (receipt) => {
    const receiptLines = receipt.lines || receipt.line_items || []
    if (receiptLines.length === 0) return '-'
    if (receiptLines.length === 1) return receiptLines[0].item_description || '-'
    return `${receiptLines[0].item_description || 'Item'} +${receiptLines.length - 1} more`
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
          <span style={{ fontSize: '9pt', fontWeight: 600 }}>New Item Receipt &mdash; Feed &amp; Supply Delivery</span>
        </div>

        <div className="glass-card p-4 m-2">
          {/* QB-style split */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
            {/* Left: Vendor + Date */}
            <div style={{ flex: '0 0 58%' }}>
              <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 2 }}>VENDOR</label>
              <input className="glass-input text-sm" list="ir-vendor-list" value={form.vendor_name}
                onChange={e => updateField('vendor_name', e.target.value)}
                placeholder="Select feed mill, supply company..." style={{ fontSize: '10pt', fontWeight: 600, marginBottom: 6 }} />
              <datalist id="ir-vendor-list">
                {vendors.map((v, i) => <option key={i} value={v.name || v.vendor_name} />)}
              </datalist>

              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Receipt Date</label>
              <input className="glass-input text-sm" type="date" value={form.receipt_date}
                onChange={e => updateField('receipt_date', e.target.value)} />
            </div>

            {/* Right: Memo, Ref, Total */}
            <div style={{ flex: 1 }}>
              <div style={{ marginBottom: 6 }}>
                <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Total</label>
                <div style={{ fontSize: '14pt', fontWeight: 700, color: '#60a5fa', padding: '2px 0' }}>
                  ${lineTotal.toFixed(2)}
                </div>
              </div>

              <div style={{ marginBottom: 6 }}>
                <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Ref. No.</label>
                <input className="glass-input text-sm" value={form.ref_no}
                  onChange={e => updateField('ref_no', e.target.value)}
                  placeholder="Delivery ticket #" />
              </div>

              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Memo</label>
              <input className="glass-input text-sm" value={form.memo}
                onChange={e => updateField('memo', e.target.value)}
                placeholder="e.g. Feed delivery - Barn 3" />
            </div>
          </div>

          {/* Line Items Table */}
          <div className="border border-lvf-border rounded-b-xl p-3 bg-lvf-dark/20">
            <table className="glass-table w-full">
              <thead><tr>
                <th style={{ width: '28%' }}>Description</th>
                <th style={{ width: '12%' }}>Qty</th>
                <th style={{ width: '14%' }}>Cost</th>
                <th style={{ width: '16%' }}>Amount</th>
                <th style={{ width: '20%' }}>Flock</th>
                <th style={{ width: '7%' }}></th>
              </tr></thead>
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={idx}>
                    <td>
                      <input className="glass-input text-sm" value={line.item_description}
                        onChange={e => updateLine(idx, 'item_description', e.target.value)}
                        placeholder="e.g. Layer Feed 50lb, Day-Old Pullets" />
                    </td>
                    <td>
                      <input className="glass-input text-sm" type="number" min="0" value={line.quantity}
                        onChange={e => updateLine(idx, 'quantity', e.target.value)} style={{ textAlign: 'right' }} />
                    </td>
                    <td>
                      <input className="glass-input text-sm" type="number" step="0.01" min="0" value={line.cost}
                        onChange={e => updateLine(idx, 'cost', e.target.value)} style={{ textAlign: 'right' }} />
                    </td>
                    <td>
                      <input className="glass-input text-sm" type="number" step="0.01" value={line.amount} readOnly
                        style={{ textAlign: 'right', background: 'rgba(255,255,255,0.05)' }} />
                    </td>
                    <td>
                      <select className="glass-input text-sm" value={line.flock_id}
                        onChange={e => updateLine(idx, 'flock_id', e.target.value)}>
                        <option value="">-- Flock --</option>
                        {flocks.map(f => (
                          <option key={f.id || f.flock_id} value={f.id || f.flock_id}>
                            {f.flock_number || f.name} {f.grower_name ? `- ${f.grower_name}` : ''}
                          </option>
                        ))}
                      </select>
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
                <td colSpan={2} style={{ border: 'none' }}></td>
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
    { key: 'open', label: 'Open' },
    { key: 'billed', label: 'Billed' },
    { key: 'voided', label: 'Voided' },
  ]

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      <div className="glass-card p-4 m-2">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: '14pt', fontWeight: 700, margin: 0 }}>Item Receipts &mdash; Feed &amp; Supply Deliveries</h2>
          <button className="glass-button-primary text-sm" onClick={openNewReceipt}>+ New Receipt</button>
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
          <p style={{ textAlign: 'center', padding: 20, color: '#999' }}>Loading item receipts...</p>
        ) : receipts.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 20, color: '#999' }}>No item receipts found. Click "New Receipt" to record a delivery.</p>
        ) : (
          <table className="glass-table w-full">
            <thead>
              <tr>
                <th>Receipt #</th>
                <th>Date</th>
                <th>Vendor</th>
                <th>Items</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map(r => {
                const st = r.status || 'open'
                return (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.receipt_number || `IR-${r.id}`}</td>
                    <td style={{ color: '#94a3b8' }}>{r.receipt_date || '-'}</td>
                    <td>{r.vendor_name || '-'}</td>
                    <td style={{ color: '#94a3b8', fontSize: '9pt' }}>{summarizeItems(r)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>${(r.amount || 0).toFixed(2)}</td>
                    <td style={{ textAlign: 'center' }}><StatusBadge status={st} /></td>
                    <td style={{ textAlign: 'center' }}>
                      {st === 'open' && (
                        <button className="glass-button-primary text-sm"
                          style={{ padding: '2px 8px', fontSize: '8pt' }}
                          disabled={converting === r.id}
                          onClick={() => handleConvert(r)}>
                          {converting === r.id ? 'Converting...' : 'Convert to Bill'}
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
