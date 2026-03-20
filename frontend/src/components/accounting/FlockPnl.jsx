import { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { getFlockPnl } from '../../api/reports'
import { getActiveFlocks } from '../../api/accounting'
import Toast from '../common/Toast'
import useToast from '../../hooks/useToast'

export default function FlockPnl() {
  const [flocks, setFlocks] = useState([])
  const [selectedFlock, setSelectedFlock] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  const fmt = (val) => {
    if (val == null || val === 0) return '$0.00'
    if (val < 0) return `($${Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2 })})`
    return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
  }

  const fmtNum = (val) => {
    if (val == null) return '—'
    return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  // Load active flocks on mount
  useEffect(() => {
    getActiveFlocks()
      .then(res => setFlocks(res.data || []))
      .catch(() => {})
  }, [])

  const generate = async () => {
    if (!selectedFlock) {
      showToast('Please select a flock', 'error')
      return
    }
    setLoading(true)
    try {
      const res = await getFlockPnl(selectedFlock)
      setData(res.data)
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error generating Flock P&L', 'error')
    } finally {
      setLoading(false)
    }
  }

  const netIncome = data ? (data.total_revenue || 0) - (data.total_expenses || 0) : 0

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      {/* Flock Selector */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div>
          <label style={{ fontSize: '8pt', color: '#999' }}>Flock</label>
          <select className="glass-input block" value={selectedFlock}
            onChange={e => setSelectedFlock(e.target.value)}>
            <option value="">Select a flock...</option>
            {flocks.map(f => (
              <option key={f.id} value={f.id}>
                Flock #{f.flock_number}
              </option>
            ))}
          </select>
        </div>
        <button onClick={generate} className="glass-button-primary flex items-center gap-2 self-end" disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Generate
        </button>
      </div>

      {/* Empty state */}
      {!data && (
        <div className="glass-card p-8 text-center text-lvf-muted">
          Select a flock and click Generate
        </div>
      )}

      {/* P&L Report */}
      {data && (
        <div className="glass-card overflow-hidden">
          {/* Report Header */}
          <div className="p-4 border-b border-lvf-border bg-lvf-dark/30">
            <h3 className="font-semibold text-center text-lg">Level Valley Farms</h3>
            <p className="text-center text-sm text-lvf-muted">
              Flock P&L — Flock #{data.flock_number}
            </p>
          </div>

          <div className="p-5">
            {/* Revenue Section */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-lvf-success/30">
                <div className="w-3 h-3 rounded-full bg-lvf-success" />
                <h4 className="font-semibold text-lvf-success">Revenue</h4>
              </div>
              <div className="space-y-1 ml-5">
                {(data.revenue || []).map((item, idx) => (
                  <div key={idx} className="flex justify-between py-1">
                    <span className="text-sm">{item.account_name}</span>
                    <span className="font-mono text-sm">{fmt(item.amount)}</span>
                  </div>
                ))}
                {(data.revenue || []).length === 0 && (
                  <p className="text-sm text-lvf-muted py-1">No revenue recorded</p>
                )}
              </div>
              <div className="flex justify-between mt-2 pt-2 border-t border-lvf-border ml-5 font-semibold">
                <span>Total Revenue</span>
                <span className="font-mono text-lvf-success">{fmt(data.total_revenue)}</span>
              </div>
            </div>

            {/* Expense Section */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-lvf-danger/30">
                <div className="w-3 h-3 rounded-full bg-lvf-danger" />
                <h4 className="font-semibold text-lvf-danger">Expenses</h4>
              </div>
              <div className="space-y-1 ml-5">
                {(data.expenses || []).map((item, idx) => (
                  <div key={idx} className="flex justify-between py-1">
                    <span className="text-sm">{item.account_name}</span>
                    <span className="font-mono text-sm">{fmt(item.amount)}</span>
                  </div>
                ))}
                {(data.expenses || []).length === 0 && (
                  <p className="text-sm text-lvf-muted py-1">No expenses recorded</p>
                )}
              </div>
              <div className="flex justify-between mt-2 pt-2 border-t border-lvf-border ml-5 font-semibold">
                <span>Total Expenses</span>
                <span className="font-mono text-lvf-danger">{fmt(data.total_expenses)}</span>
              </div>
            </div>

            {/* Net Income */}
            <div className="flex justify-between py-3 px-4 rounded-lg bg-lvf-dark/40"
              style={{ borderTop: '3px double rgba(226,232,240,0.3)' }}>
              <span className="text-lg font-bold">Net Income</span>
              <span className={`text-lg font-bold font-mono ${netIncome >= 0 ? 'text-lvf-success' : 'text-lvf-danger'}`}>
                {fmt(netIncome)}
              </span>
            </div>
          </div>

          {/* Performance Metrics */}
          <div className="p-5 border-t border-lvf-border">
            <h4 className="font-semibold text-lvf-accent mb-3">Flock Performance Metrics</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="glass-card p-4 text-center bg-lvf-dark/20">
                <p className="text-xs text-lvf-muted mb-1">Bird Count</p>
                <p className="text-xl font-bold text-lvf-accent">
                  {data.bird_count != null ? data.bird_count.toLocaleString() : '—'}
                </p>
              </div>
              <div className="glass-card p-4 text-center bg-lvf-dark/20">
                <p className="text-xs text-lvf-muted mb-1">Dozens Produced</p>
                <p className="text-xl font-bold text-lvf-accent">
                  {data.dozens_produced != null ? data.dozens_produced.toLocaleString() : '—'}
                </p>
              </div>
              <div className="glass-card p-4 text-center bg-lvf-dark/20">
                <p className="text-xs text-lvf-muted mb-1">Cost / Bird</p>
                <p className="text-xl font-bold text-lvf-danger">
                  {data.cost_per_bird != null ? `$${fmtNum(data.cost_per_bird)}` : '—'}
                </p>
              </div>
              <div className="glass-card p-4 text-center bg-lvf-dark/20">
                <p className="text-xs text-lvf-muted mb-1">Cost / Dozen</p>
                <p className="text-xl font-bold text-lvf-danger">
                  {data.cost_per_dozen != null ? `$${fmtNum(data.cost_per_dozen)}` : '—'}
                </p>
              </div>
              <div className="glass-card p-4 text-center bg-lvf-dark/20">
                <p className="text-xs text-lvf-muted mb-1">Revenue / Bird</p>
                <p className="text-xl font-bold text-lvf-success">
                  {data.revenue_per_bird != null ? `$${fmtNum(data.revenue_per_bird)}` : '—'}
                </p>
              </div>
              <div className="glass-card p-4 text-center bg-lvf-dark/20">
                <p className="text-xs text-lvf-muted mb-1">Net Income / Bird</p>
                <p className={`text-xl font-bold ${netIncome >= 0 ? 'text-lvf-success' : 'text-lvf-danger'}`}>
                  {data.bird_count
                    ? `$${fmtNum(netIncome / data.bird_count)}`
                    : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
