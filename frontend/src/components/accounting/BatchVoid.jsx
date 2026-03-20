import { useState, useEffect } from 'react'
import { CheckSquare, Square, AlertTriangle } from 'lucide-react'
import { getInvoices, getBills, getChecks, batchVoid } from '../../api/accounting'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'

const TRANSACTION_TABS = [
  { value: 'invoice', label: 'Invoice' },
  { value: 'bill', label: 'Bill' },
  { value: 'check', label: 'Check' },
]

const fmt = (val) => {
  const n = parseFloat(val) || 0
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}

export default function BatchVoid() {
  const [activeTab, setActiveTab] = useState('invoice')
  const [transactions, setTransactions] = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  const loadTransactions = async (type) => {
    setLoading(true)
    setSelectedIds(new Set())
    try {
      let res
      if (type === 'invoice') res = await getInvoices({ limit: 500 })
      else if (type === 'bill') res = await getBills({ limit: 500 })
      else res = await getChecks({ limit: 500 })

      const all = res.data || []
      // Only show non-voided transactions
      const filtered = all.filter(t => t.status !== 'voided' && t.status !== 'void')
      setTransactions(filtered)
    } catch (err) {
      showToast(err.response?.data?.detail || `Error loading ${type}s`, 'error')
      setTransactions([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTransactions(activeTab)
  }, [activeTab])

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelectedIds(new Set(transactions.map(t => t.id)))
  }

  const selectNone = () => {
    setSelectedIds(new Set())
  }

  const getNumber = (t) => {
    return t.invoice_number || t.bill_number || t.check_number || t.ref_no || `#${t.id}`
  }

  const getDate = (t) => {
    return t.invoice_date || t.bill_date || t.check_date || t.date || '—'
  }

  const getCustomerVendor = (t) => {
    return t.buyer_name || t.customer_name || t.vendor_name || t.payee_name || '—'
  }

  const getAmount = (t) => {
    return t.total || t.amount || t.amount_due || 0
  }

  const getStatus = (t) => {
    const s = (t.status || 'open').toLowerCase()
    const colors = {
      open: 'bg-blue-500/20 text-blue-400',
      paid: 'bg-lvf-success/20 text-lvf-success',
      partial: 'bg-yellow-500/20 text-yellow-400',
      overdue: 'bg-lvf-danger/20 text-lvf-danger',
      printed: 'bg-green-500/20 text-green-400',
      cleared: 'bg-lvf-success/20 text-lvf-success',
    }
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[s] || 'bg-lvf-muted/20 text-lvf-muted'}`}>
        {s.charAt(0).toUpperCase() + s.slice(1)}
      </span>
    )
  }

  const handleVoid = async () => {
    if (selectedIds.size === 0) return
    setSubmitting(true)
    try {
      await batchVoid({
        transaction_type: activeTab,
        transaction_ids: Array.from(selectedIds),
      })
      showToast(`Voided ${selectedIds.size} ${activeTab}${selectedIds.size !== 1 ? 's' : ''}`)
      setShowConfirm(false)
      setSelectedIds(new Set())
      loadTransactions(activeTab)
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error voiding transactions', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const customerVendorHeader = () => {
    if (activeTab === 'invoice') return 'Egg Buyer'
    if (activeTab === 'bill') return 'Vendor / Feed Mill'
    return 'Payee'
  }

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      <div className="mb-4">
        <p className="text-sm text-lvf-muted">
          Void multiple invoices, bills, or checks at once
        </p>
      </div>

      {/* Transaction Type Tabs */}
      <div className="flex gap-1 mb-4">
        {TRANSACTION_TABS.map(tab => (
          <button key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors
              ${activeTab === tab.value
                ? 'bg-lvf-accent text-white'
                : 'bg-white/5 text-lvf-muted hover:bg-white/10'}`}>
            {tab.label}s
          </button>
        ))}
      </div>

      {/* Transaction Table */}
      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-lvf-muted">Loading {activeTab}s...</div>
        ) : transactions.length === 0 ? (
          <div className="p-12 text-center text-lvf-muted">
            No non-voided {activeTab}s found.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between p-3 border-b border-lvf-border">
              <div className="flex gap-2">
                <button onClick={selectAll} className="glass-button-secondary text-xs px-3 py-1">Select All</button>
                <button onClick={selectNone} className="glass-button-secondary text-xs px-3 py-1">Select None</button>
              </div>
              <span className="text-xs text-lvf-muted">
                {selectedIds.size} of {transactions.length} selected
              </span>
            </div>

            <table className="w-full glass-table">
              <thead>
                <tr>
                  <th className="w-10 p-3"></th>
                  <th className="text-left p-3 text-xs font-semibold text-lvf-muted">#</th>
                  <th className="text-left p-3 text-xs font-semibold text-lvf-muted">Date</th>
                  <th className="text-left p-3 text-xs font-semibold text-lvf-muted">{customerVendorHeader()}</th>
                  <th className="text-right p-3 text-xs font-semibold text-lvf-muted">Amount</th>
                  <th className="text-center p-3 text-xs font-semibold text-lvf-muted">Status</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(t => {
                  const isSelected = selectedIds.has(t.id)
                  return (
                    <tr key={t.id}
                      onClick={() => toggleSelect(t.id)}
                      className={`border-t border-lvf-border cursor-pointer transition-colors
                        ${isSelected ? 'bg-lvf-accent/10' : 'hover:bg-white/5'}`}>
                      <td className="p-3 text-center">
                        {isSelected
                          ? <CheckSquare size={16} className="text-lvf-accent" />
                          : <Square size={16} className="text-lvf-muted" />}
                      </td>
                      <td className="p-3 text-sm font-mono">{getNumber(t)}</td>
                      <td className="p-3 text-sm">{getDate(t)}</td>
                      <td className="p-3 text-sm">{getCustomerVendor(t)}</td>
                      <td className="p-3 text-sm text-right font-mono">{fmt(getAmount(t))}</td>
                      <td className="p-3 text-center">{getStatus(t)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* Void Button */}
      {selectedIds.size > 0 && (
        <div className="flex justify-end mt-4">
          <button onClick={() => setShowConfirm(true)}
            className="glass-button-danger flex items-center gap-2 text-sm">
            <AlertTriangle size={14} />
            Void {selectedIds.size} Selected {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}{selectedIds.size !== 1 ? 's' : ''}
          </button>
        </div>
      )}

      {/* Confirmation Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass-card p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-lvf-danger/20 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={20} className="text-lvf-danger" />
              </div>
              <div>
                <h3 className="font-semibold">Confirm Batch Void</h3>
                <p className="text-sm text-lvf-muted">This action cannot be undone</p>
              </div>
            </div>

            <p className="text-sm mb-6">
              Void <strong>{selectedIds.size}</strong> {activeTab}{selectedIds.size !== 1 ? 's' : ''}? Voided transactions will be marked as void and their amounts will no longer affect account balances.
            </p>

            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowConfirm(false)}
                className="glass-button-secondary" disabled={submitting}>
                Cancel
              </button>
              <button onClick={handleVoid} disabled={submitting}
                className="glass-button-danger flex items-center gap-2">
                <AlertTriangle size={14} />
                {submitting ? 'Voiding...' : `Void ${selectedIds.size} ${activeTab}${selectedIds.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
