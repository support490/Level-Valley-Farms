import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { getIncomeStatement } from '../../api/reports'

export default function IncomeStatement() {
  const [data, setData] = useState(null)
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().slice(0, 7) + '-01')
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await getIncomeStatement(dateFrom, dateTo)
      setData(res.data)
    } finally {
      setLoading(false)
    }
  }

  const fmt = (val) => {
    const abs = Math.abs(val)
    const str = `$${abs.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
    return val < 0 ? `(${str})` : str
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div>
          <label className="block text-xs text-lvf-muted mb-1">From</label>
          <input type="date" className="glass-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-lvf-muted mb-1">To</label>
          <input type="date" className="glass-input" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        <div className="pt-4">
          <button onClick={load} className="glass-button-primary flex items-center gap-2" disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Generate
          </button>
        </div>
      </div>

      {data && (
        <div className="glass-card overflow-hidden max-w-2xl">
          <div className="p-5 border-b border-lvf-border bg-lvf-dark/30 text-center">
            <h3 className="text-lg font-bold">Level Valley Farms</h3>
            <p className="text-sm text-lvf-muted">Income Statement</p>
            <p className="text-xs text-lvf-muted">{data.period_from} to {data.period_to}</p>
          </div>

          <div className="p-5">
            {/* Revenue */}
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-lvf-success uppercase tracking-wider mb-3">Revenue</h4>
              {data.revenue.length > 0 ? (
                <div className="space-y-1">
                  {data.revenue.map(r => (
                    <div key={r.account_id} className="flex justify-between text-sm pl-4">
                      <span>{r.account_name}</span>
                      <span className="font-mono">{fmt(r.amount)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-lvf-muted pl-4">No revenue</p>
              )}
              <div className="flex justify-between text-sm font-semibold mt-2 pt-2 border-t border-lvf-border/30">
                <span>Total Revenue</span>
                <span className="font-mono text-lvf-success">{fmt(data.total_revenue)}</span>
              </div>
            </div>

            {/* Expenses */}
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-lvf-danger uppercase tracking-wider mb-3">Expenses</h4>
              {data.expenses.length > 0 ? (
                <div className="space-y-1">
                  {data.expenses.map(r => (
                    <div key={r.account_id} className="flex justify-between text-sm pl-4">
                      <span>{r.account_name}</span>
                      <span className="font-mono">{fmt(r.amount)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-lvf-muted pl-4">No expenses</p>
              )}
              <div className="flex justify-between text-sm font-semibold mt-2 pt-2 border-t border-lvf-border/30">
                <span>Total Expenses</span>
                <span className="font-mono text-lvf-danger">{fmt(data.total_expenses)}</span>
              </div>
            </div>

            {/* Net Income */}
            <div className="flex justify-between font-bold text-lg pt-4 border-t-2 border-lvf-border">
              <span>Net Income</span>
              <span className={`font-mono ${data.net_income >= 0 ? 'text-lvf-success' : 'text-lvf-danger'}`}>
                {fmt(data.net_income)}
              </span>
            </div>
          </div>
        </div>
      )}

      {!data && !loading && (
        <div className="glass-card p-12 text-center text-lvf-muted max-w-2xl">
          Select a date range and click Generate to view the income statement.
        </div>
      )}
    </div>
  )
}
