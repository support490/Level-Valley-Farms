import { useState, useEffect, Fragment } from 'react'
import { RefreshCw } from 'lucide-react'
import { getArAgingDetail } from '../../api/reports'
import Toast from '../common/Toast'
import useToast from '../../hooks/useToast'

const BUCKET_LABELS = [
  { key: 'current', label: 'Current', color: 'text-lvf-success', bg: 'bg-lvf-success/10 border-lvf-success/20' },
  { key: 'over_30', label: '1-30 Days', color: 'text-lvf-accent', bg: 'bg-lvf-accent/10 border-lvf-accent/20' },
  { key: 'over_60', label: '31-60 Days', color: 'text-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/20' },
  { key: 'over_90', label: '61-90 Days', color: 'text-orange-400', bg: 'bg-orange-400/10 border-orange-400/20' },
]

export default function ArAgingDetail() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  const fmt = (val) => {
    if (val == null || val === 0) return '$0.00'
    if (val < 0) return `($${Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2 })})`
    return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
  }

  const load = async () => {
    setLoading(true)
    try {
      const res = await getArAgingDetail()
      setData(res.data)
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error loading AR aging detail', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const over90Amount = data
    ? (data.grand_total || 0) - (data.buckets?.current || 0) - (data.buckets?.over_30 || 0) - (data.buckets?.over_60 || 0) - (data.buckets?.over_90 || 0)
    : 0

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      {/* Refresh */}
      <div className="flex justify-end mb-4">
        <button onClick={load} className="glass-button-secondary flex items-center gap-2" disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {data && (
        <>
          {/* Report Header */}
          <div className="glass-card p-4 mb-4 bg-lvf-dark/30">
            <h3 className="font-semibold text-center text-lg">Level Valley Farms</h3>
            <p className="text-center text-sm text-lvf-muted">Accounts Receivable Aging Detail</p>
          </div>

          {/* Summary Buckets */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            {BUCKET_LABELS.map(b => (
              <div key={b.key} className={`glass-card p-4 text-center border ${b.bg}`}>
                <p className="text-xs text-lvf-muted mb-1">{b.label}</p>
                <p className={`text-xl font-bold font-mono ${b.color}`}>
                  {fmt(data.buckets?.[b.key] || 0)}
                </p>
              </div>
            ))}
            <div className="glass-card p-4 text-center border bg-lvf-danger/10 border-lvf-danger/20">
              <p className="text-xs text-lvf-muted mb-1">90+ Days</p>
              <p className="text-xl font-bold font-mono text-lvf-danger">
                {fmt(over90Amount > 0 ? over90Amount : 0)}
              </p>
            </div>
          </div>

          {/* Detail Table */}
          <div className="glass-card overflow-hidden">
            <table className="w-full glass-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Date</th>
                  <th className="text-right">Original Amount</th>
                  <th className="text-right">Amount Paid</th>
                  <th className="text-right">Balance Due</th>
                  <th className="text-right">Days Overdue</th>
                  <th>Aging Bucket</th>
                </tr>
              </thead>
              <tbody>
                {(data.customers || []).map(customer => (
                  <Fragment key={customer.customer_name}>
                    {/* Customer (Egg Buyer) header */}
                    <tr className="bg-lvf-accent/10">
                      <td colSpan={7} className="font-bold text-lvf-accent">
                        {customer.customer_name}
                      </td>
                    </tr>

                    {/* Invoice rows */}
                    {(customer.invoices || []).map((inv, idx) => (
                      <tr key={`${customer.customer_name}-${idx}`}>
                        <td className="font-mono text-xs">{inv.invoice_number}</td>
                        <td className="text-lvf-muted">{inv.date}</td>
                        <td className="text-right font-mono">{fmt(inv.amount)}</td>
                        <td className="text-right font-mono text-lvf-success">{fmt(inv.amount_paid)}</td>
                        <td className="text-right font-mono font-medium">{fmt((inv.amount || 0) - (inv.amount_paid || 0))}</td>
                        <td className="text-right font-mono">
                          <span className={inv.days_overdue > 60 ? 'text-lvf-danger' : inv.days_overdue > 30 ? 'text-yellow-400' : 'text-lvf-muted'}>
                            {inv.days_overdue}
                          </span>
                        </td>
                        <td>
                          <span className="text-xs font-medium">{inv.bucket}</span>
                        </td>
                      </tr>
                    ))}

                    {/* Customer subtotal */}
                    <tr className="bg-lvf-dark/20 border-t border-lvf-border">
                      <td colSpan={4} className="text-right text-sm font-semibold text-lvf-muted">
                        {customer.customer_name} Subtotal
                      </td>
                      <td className="text-right font-mono font-semibold">{fmt(customer.total)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </Fragment>
                ))}

                {(data.customers || []).length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-lvf-muted">
                      No outstanding receivables from egg buyers.
                    </td>
                  </tr>
                )}
              </tbody>
              {(data.customers || []).length > 0 && (
                <tfoot>
                  <tr className="bg-lvf-dark/40 font-semibold text-lg">
                    <td colSpan={4} className="text-right">Grand Total</td>
                    <td className="text-right font-mono">{fmt(data.grand_total)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}

      {!data && !loading && (
        <div className="glass-card p-8 text-center text-lvf-muted">Loading...</div>
      )}
    </div>
  )
}
