import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { getBalanceSheet } from '../../api/reports'

export default function BalanceSheet() {
  const [data, setData] = useState(null)
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await getBalanceSheet(asOfDate)
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

  const Section = ({ title, section, color }) => (
    <div className="mb-6">
      <h4 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${color}`}>{title}</h4>
      {section.accounts.length > 0 ? (
        <div className="space-y-1">
          {section.accounts.map((a, i) => (
            <div key={a.account_id || i} className="flex justify-between text-sm pl-4">
              <span>{a.account_number ? `${a.account_number} — ` : ''}{a.account_name}</span>
              <span className="font-mono">{fmt(a.amount)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-lvf-muted pl-4">None</p>
      )}
      <div className="flex justify-between text-sm font-semibold mt-2 pt-2 border-t border-lvf-border/30">
        <span>Total {title}</span>
        <span className="font-mono">{fmt(section.total)}</span>
      </div>
    </div>
  )

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div>
          <label className="block text-xs text-lvf-muted mb-1">As of Date</label>
          <input type="date" className="glass-input" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} />
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
            <p className="text-sm text-lvf-muted">Balance Sheet</p>
            <p className="text-xs text-lvf-muted">As of {data.as_of_date}</p>
          </div>

          <div className="p-5">
            <Section title="Assets" section={data.assets} color="text-blue-400" />
            <Section title="Liabilities" section={data.liabilities} color="text-orange-400" />
            <Section title="Equity" section={data.equity} color="text-purple-400" />

            <div className="flex justify-between font-bold text-lg pt-4 border-t-2 border-lvf-border">
              <span>Total Liabilities & Equity</span>
              <span className="font-mono">{fmt(data.total_liabilities_equity)}</span>
            </div>

            <div className={`text-center text-sm font-medium mt-4 pt-3 border-t border-lvf-border/30 ${data.is_balanced ? 'text-lvf-success' : 'text-lvf-danger'}`}>
              {data.is_balanced
                ? 'Assets = Liabilities + Equity (Balanced)'
                : `OUT OF BALANCE by ${fmt(Math.abs(data.assets.total - data.total_liabilities_equity))}`}
            </div>
          </div>
        </div>
      )}

      {!data && !loading && (
        <div className="glass-card p-12 text-center text-lvf-muted max-w-2xl">
          Select a date and click Generate to view the balance sheet.
        </div>
      )}
    </div>
  )
}
