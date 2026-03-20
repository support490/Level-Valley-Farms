import { useState, useEffect } from 'react'
import { CheckSquare, Square, ChevronRight, ChevronLeft, FileText } from 'lucide-react'
import { getBuyers, getInvoices, batchCreateInvoices } from '../../api/accounting'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'

const labelStyle = { fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }

const today = () => new Date().toISOString().split('T')[0]

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

const fmt = (val) => {
  const n = parseFloat(val) || 0
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}

export default function BatchInvoicing() {
  const [step, setStep] = useState(1)
  const [buyers, setBuyers] = useState([])
  const [invoices, setInvoices] = useState([])
  const [selectedBuyerIds, setSelectedBuyerIds] = useState(new Set())
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState(null) // { count, total } after success
  const { toast, showToast, hideToast } = useToast()

  // Step 2 fields
  const [invoiceDate, setInvoiceDate] = useState(today())
  const [terms, setTerms] = useState('Net 30')
  const [dueDate, setDueDate] = useState(addDays(today(), 30))
  const [defaultDescription, setDefaultDescription] = useState('Weekly Egg Delivery')
  const [copyLastAmounts, setCopyLastAmounts] = useState(false)
  const [buyerDetails, setBuyerDetails] = useState({}) // { buyerId: { amount, description, line_items } }

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [buyerRes, invRes] = await Promise.all([
        getBuyers(),
        getInvoices({ limit: 500 }),
      ])
      const buyerList = buyerRes.data || []
      const invList = invRes.data || []
      setBuyers(buyerList)
      setInvoices(invList)
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error loading buyers', 'error')
    } finally {
      setLoading(false)
    }
  }

  const getBuyerLastInvoice = (buyerId) => {
    const buyerInvs = invoices
      .filter(inv => inv.buyer_id === buyerId && inv.status !== 'voided')
      .sort((a, b) => (b.invoice_date || '').localeCompare(a.invoice_date || ''))
    return buyerInvs[0] || null
  }

  const toggleBuyer = (id) => {
    setSelectedBuyerIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelectedBuyerIds(new Set(buyers.map(b => b.id)))
  }

  const selectNone = () => {
    setSelectedBuyerIds(new Set())
  }

  const selectedBuyers = buyers.filter(b => selectedBuyerIds.has(b.id))

  // When moving to step 2, initialize buyer details
  const goToStep2 = () => {
    if (selectedBuyerIds.size === 0) {
      showToast('Select at least one egg buyer', 'error')
      return
    }

    const details = {}
    selectedBuyers.forEach(buyer => {
      const lastInv = getBuyerLastInvoice(buyer.id)
      details[buyer.id] = {
        amount: copyLastAmounts && lastInv ? (lastInv.total || lastInv.amount || '') : '',
        description: defaultDescription,
        line_items: [{ description: defaultDescription, amount: '' }],
      }
    })
    setBuyerDetails(details)
    setStep(2)
  }

  const updateBuyerDetail = (buyerId, field, value) => {
    setBuyerDetails(prev => ({
      ...prev,
      [buyerId]: { ...prev[buyerId], [field]: value },
    }))
  }

  const handleTermsChange = (newTerms) => {
    setTerms(newTerms)
    const days = newTerms === 'Due on Receipt' ? 0 :
      parseInt(newTerms.replace('Net ', '')) || 30
    setDueDate(addDays(invoiceDate, days))
  }

  const handleDateChange = (newDate) => {
    setInvoiceDate(newDate)
    const days = terms === 'Due on Receipt' ? 0 :
      parseInt(terms.replace('Net ', '')) || 30
    setDueDate(addDays(newDate, days))
  }

  const handleCopyLastToggle = (checked) => {
    setCopyLastAmounts(checked)
    if (checked) {
      setBuyerDetails(prev => {
        const updated = { ...prev }
        selectedBuyers.forEach(buyer => {
          const lastInv = getBuyerLastInvoice(buyer.id)
          if (lastInv && updated[buyer.id]) {
            updated[buyer.id] = {
              ...updated[buyer.id],
              amount: lastInv.total || lastInv.amount || '',
            }
          }
        })
        return updated
      })
    }
  }

  // Calculate totals for preview
  const invoiceCount = selectedBuyers.length
  const invoiceTotal = selectedBuyers.reduce((sum, b) => {
    return sum + (parseFloat(buyerDetails[b.id]?.amount) || 0)
  }, 0)

  const handleCreate = async () => {
    const invoicesData = selectedBuyers.map(buyer => {
      const detail = buyerDetails[buyer.id] || {}
      return {
        buyer_id: buyer.id,
        buyer_name: buyer.name,
        invoice_date: invoiceDate,
        due_date: dueDate,
        terms: terms,
        description: detail.description || defaultDescription,
        amount: parseFloat(detail.amount) || 0,
        line_items: detail.line_items?.filter(li => li.description || li.amount) || [],
      }
    })

    const hasZero = invoicesData.some(inv => inv.amount <= 0)
    if (hasZero) {
      showToast('All invoices must have an amount greater than zero', 'error')
      return
    }

    setSubmitting(true)
    try {
      const res = await batchCreateInvoices({ invoices: invoicesData })
      const count = res.data?.created || invoicesData.length
      const total = invoicesData.reduce((s, inv) => s + inv.amount, 0)
      setCreated({ count, total })
      showToast(`Created ${count} invoices totaling ${fmt(total)}`)
      setStep(3)
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error creating invoices', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReset = () => {
    setStep(1)
    setSelectedBuyerIds(new Set())
    setBuyerDetails({})
    setCopyLastAmounts(false)
    setCreated(null)
    setDefaultDescription('Weekly Egg Delivery')
    loadData()
  }

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      {/* Header */}
      <div className="mb-4">
        <p className="text-sm text-lvf-muted">
          Create weekly egg invoices for all regular buyers at once
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold
              ${step >= s ? 'bg-lvf-accent text-white' : 'bg-white/10 text-lvf-muted'}`}>
              {s}
            </div>
            <span className={`text-sm ${step >= s ? 'font-medium' : 'text-lvf-muted'}`}>
              {s === 1 ? 'Select Buyers' : s === 2 ? 'Invoice Details' : 'Preview & Create'}
            </span>
            {s < 3 && <ChevronRight size={14} className="text-lvf-muted mx-2" />}
          </div>
        ))}
      </div>

      {/* STEP 1: Select Buyers */}
      {step === 1 && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold">Select Egg Buyers</h4>
            <div className="flex gap-2">
              <button onClick={selectAll} className="glass-button-secondary text-xs px-3 py-1">Select All</button>
              <button onClick={selectNone} className="glass-button-secondary text-xs px-3 py-1">Select None</button>
            </div>
          </div>

          {loading ? (
            <div className="text-center text-lvf-muted py-8">Loading egg buyers...</div>
          ) : buyers.length === 0 ? (
            <div className="text-center text-lvf-muted py-8">
              No egg buyers found. Add buyers in the Customer Center first.
            </div>
          ) : (
            <div className="space-y-1">
              {buyers.map(buyer => {
                const lastInv = getBuyerLastInvoice(buyer.id)
                const isSelected = selectedBuyerIds.has(buyer.id)
                return (
                  <div key={buyer.id}
                    onClick={() => toggleBuyer(buyer.id)}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors
                      ${isSelected ? 'bg-lvf-accent/10 border border-lvf-accent/30' : 'hover:bg-white/5 border border-transparent'}`}>
                    {isSelected
                      ? <CheckSquare size={18} className="text-lvf-accent flex-shrink-0" />
                      : <Square size={18} className="text-lvf-muted flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm">{buyer.name}</span>
                    </div>
                    <div className="text-right text-xs text-lvf-muted flex-shrink-0">
                      {lastInv ? (
                        <>
                          <div>Last: {lastInv.invoice_date}</div>
                          <div className="font-mono">{fmt(lastInv.total || lastInv.amount)}</div>
                        </>
                      ) : (
                        <div>No previous invoices</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="flex justify-between items-center mt-6 pt-4 border-t border-lvf-border">
            <span className="text-sm text-lvf-muted">{selectedBuyerIds.size} buyer{selectedBuyerIds.size !== 1 ? 's' : ''} selected</span>
            <button onClick={goToStep2}
              disabled={selectedBuyerIds.size === 0}
              className="glass-button-primary flex items-center gap-2">
              Next: Invoice Details <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Invoice Details */}
      {step === 2 && (
        <div className="glass-card p-6">
          {/* Global settings */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div>
              <label style={labelStyle}>Invoice Date</label>
              <input className="glass-input w-full" type="date" value={invoiceDate}
                onChange={e => handleDateChange(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Terms</label>
              <select className="glass-input w-full" value={terms}
                onChange={e => handleTermsChange(e.target.value)}>
                <option value="Due on Receipt">Due on Receipt</option>
                <option value="Net 15">Net 15</option>
                <option value="Net 30">Net 30</option>
                <option value="Net 45">Net 45</option>
                <option value="Net 60">Net 60</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Due Date</label>
              <input className="glass-input w-full" type="date" value={dueDate}
                onChange={e => setDueDate(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Default Description</label>
              <input className="glass-input w-full" value={defaultDescription}
                placeholder="Weekly Egg Delivery"
                onChange={e => setDefaultDescription(e.target.value)} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-lvf-muted cursor-pointer mb-6">
            <input type="checkbox" checked={copyLastAmounts}
              onChange={e => handleCopyLastToggle(e.target.checked)} />
            Copy last invoice amounts for each buyer
          </label>

          {/* Per-buyer details */}
          <h4 className="font-semibold text-sm mb-3">Per-Buyer Details</h4>
          <div className="space-y-3">
            {selectedBuyers.map(buyer => {
              const detail = buyerDetails[buyer.id] || {}
              const lastInv = getBuyerLastInvoice(buyer.id)
              return (
                <div key={buyer.id} className="glass-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="font-semibold text-sm">{buyer.name}</span>
                      {lastInv && (
                        <span className="text-xs text-lvf-muted ml-3">
                          Last: {lastInv.invoice_date} — {fmt(lastInv.total || lastInv.amount)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label style={labelStyle}>Description</label>
                      <input className="glass-input w-full" value={detail.description || ''}
                        placeholder="Weekly Egg Delivery"
                        onChange={e => updateBuyerDetail(buyer.id, 'description', e.target.value)} />
                    </div>
                    <div>
                      <label style={labelStyle}>Amount</label>
                      <input className="glass-input w-full" type="number" step="0.01" min="0.01"
                        value={detail.amount || ''}
                        placeholder="0.00"
                        onChange={e => updateBuyerDetail(buyer.id, 'amount', e.target.value)} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex justify-between items-center mt-6 pt-4 border-t border-lvf-border">
            <button onClick={() => setStep(1)}
              className="glass-button-secondary flex items-center gap-2">
              <ChevronLeft size={14} /> Back
            </button>
            <div className="text-sm text-lvf-muted">
              {invoiceCount} invoice{invoiceCount !== 1 ? 's' : ''} — {fmt(invoiceTotal)} total
            </div>
            <button onClick={() => setStep(3)}
              className="glass-button-primary flex items-center gap-2">
              Preview & Create <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Preview & Create */}
      {step === 3 && !created && (
        <div className="glass-card p-6">
          <h4 className="font-semibold mb-4">Review Batch Invoices</h4>

          <div className="glass-card overflow-hidden mb-6">
            <table className="w-full glass-table">
              <thead>
                <tr>
                  <th className="text-left p-3 text-xs font-semibold text-lvf-muted">Egg Buyer</th>
                  <th className="text-left p-3 text-xs font-semibold text-lvf-muted">Description</th>
                  <th className="text-right p-3 text-xs font-semibold text-lvf-muted">Amount</th>
                </tr>
              </thead>
              <tbody>
                {selectedBuyers.map(buyer => {
                  const detail = buyerDetails[buyer.id] || {}
                  return (
                    <tr key={buyer.id} className="border-t border-lvf-border">
                      <td className="p-3 text-sm font-medium">{buyer.name}</td>
                      <td className="p-3 text-sm">{detail.description || defaultDescription}</td>
                      <td className="p-3 text-sm text-right font-mono">{fmt(detail.amount)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-lvf-border bg-white/5">
                  <td className="p-3 text-sm font-semibold" colSpan={2}>
                    Total: {invoiceCount} invoice{invoiceCount !== 1 ? 's' : ''}
                  </td>
                  <td className="p-3 text-sm text-right font-mono font-semibold">{fmt(invoiceTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="text-sm text-lvf-muted mb-4">
            Invoice Date: {invoiceDate} | Terms: {terms} | Due: {dueDate}
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-lvf-border">
            <button onClick={() => setStep(2)}
              className="glass-button-secondary flex items-center gap-2">
              <ChevronLeft size={14} /> Back
            </button>
            <button onClick={handleCreate} disabled={submitting}
              className="glass-button-primary text-base px-8 py-3 flex items-center gap-2">
              <FileText size={16} />
              {submitting ? 'Creating Invoices...' : `Create All ${invoiceCount} Invoices`}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Success */}
      {step === 3 && created && (
        <div className="glass-card p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-lvf-success/20 flex items-center justify-center mx-auto mb-4">
            <FileText size={28} className="text-lvf-success" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Batch Invoicing Complete</h3>
          <p className="text-lvf-muted mb-6">
            Created {created.count} invoice{created.count !== 1 ? 's' : ''} totaling {fmt(created.total)}
          </p>
          <div className="flex gap-3 justify-center">
            <button onClick={handleReset} className="glass-button-secondary">
              Create Another Batch
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
