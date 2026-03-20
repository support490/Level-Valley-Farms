import { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { getVendorBalances } from '../../api/reports'
import Toast from '../common/Toast'
import useToast from '../../hooks/useToast'

export default function VendorBalances() {
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
      const res = await getVendorBalances()
      setData(res.data)
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error loading vendor balances', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Sort by total_owed descending
  const sortedVendors = data?.vendors
    ? [...data.vendors].sort((a, b) => (b.total_owed || 0) - (a.total_owed || 0))
    : []

  const grandTotal = sortedVendors.reduce((sum, v) => sum + (v.total_owed || 0), 0)

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
        <div className="glass-card overflow-hidden">
          {/* Report Header */}
          <div className="p-4 border-b border-lvf-border bg-lvf-dark/30">
            <h3 className="font-semibold text-center text-lg">Level Valley Farms</h3>
            <p className="text-center text-sm text-lvf-muted">Vendor Balances</p>
          </div>

          <table className="w-full glass-table">
            <thead>
              <tr>
                <th>Vendor Name</th>
                <th className="text-right">Total Owed</th>
                <th className="text-right">Open Bills</th>
                <th>Oldest Bill</th>
              </tr>
            </thead>
            <tbody>
              {sortedVendors.map(vendor => (
                <tr key={vendor.name}>
                  <td className="font-medium">{vendor.name}</td>
                  <td className="text-right font-mono font-semibold">
                    <span className={vendor.total_owed > 0 ? 'text-lvf-danger' : 'text-lvf-success'}>
                      {fmt(vendor.total_owed)}
                    </span>
                  </td>
                  <td className="text-right font-mono">{vendor.bill_count || 0}</td>
                  <td className="text-lvf-muted">{vendor.oldest_bill_date || '—'}</td>
                </tr>
              ))}
              {sortedVendors.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-lvf-muted">
                    No outstanding vendor balances (feed mills, growers, vets, suppliers).
                  </td>
                </tr>
              )}
            </tbody>
            {sortedVendors.length > 0 && (
              <tfoot>
                <tr className="bg-lvf-dark/40 font-semibold">
                  <td className="text-right">Total</td>
                  <td className="text-right font-mono">{fmt(grandTotal)}</td>
                  <td className="text-right font-mono">
                    {sortedVendors.reduce((sum, v) => sum + (v.bill_count || 0), 0)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {!data && !loading && (
        <div className="glass-card p-8 text-center text-lvf-muted">Loading...</div>
      )}
    </div>
  )
}
