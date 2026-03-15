import { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { getTrialBalance } from '../../api/accounting'

const typeColors = {
  asset: 'text-blue-400',
  liability: 'text-orange-400',
  equity: 'text-purple-400',
  revenue: 'text-green-400',
  expense: 'text-red-400',
}

export default function TrialBalance() {
  const [data, setData] = useState(null)
  const [asOfDate, setAsOfDate] = useState('')
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const params = asOfDate ? { as_of_date: asOfDate } : {}
      const res = await getTrialBalance(params)
      setData(res.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const fmt = (val) => val > 0 ? `$${val.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : ''

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <input type="date" className="glass-input" value={asOfDate}
          onChange={e => setAsOfDate(e.target.value)} />
        <button onClick={load} className="glass-button-primary flex items-center gap-2" disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Generate
        </button>
      </div>

      {data && (
        <div className="glass-card overflow-hidden">
          <div className="p-4 border-b border-lvf-border bg-lvf-dark/30">
            <h3 className="font-semibold text-center text-lg">Level Valley Farms</h3>
            <p className="text-center text-sm text-lvf-muted">Trial Balance — As of {data.as_of_date}</p>
          </div>

          <table className="w-full glass-table">
            <thead>
              <tr>
                <th>Account #</th>
                <th>Account Name</th>
                <th>Type</th>
                <th className="text-right">Debit</th>
                <th className="text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map(row => (
                <tr key={row.account_id}>
                  <td className="font-mono">{row.account_number}</td>
                  <td>{row.account_name}</td>
                  <td><span className={`text-xs font-medium uppercase ${typeColors[row.account_type]}`}>{row.account_type}</span></td>
                  <td className="text-right font-mono">{fmt(row.debit_balance)}</td>
                  <td className="text-right font-mono">{fmt(row.credit_balance)}</td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-lvf-muted">No posted entries found.</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-lvf-dark/40 font-semibold">
                <td colSpan={3} className="text-right">Totals</td>
                <td className="text-right font-mono">${data.total_debits.toFixed(2)}</td>
                <td className="text-right font-mono">${data.total_credits.toFixed(2)}</td>
              </tr>
              <tr>
                <td colSpan={5} className={`text-center text-sm font-medium ${data.is_balanced ? 'text-lvf-success' : 'text-lvf-danger'}`}>
                  {data.is_balanced ? 'Trial Balance is in balance' : `OUT OF BALANCE by $${Math.abs(data.total_debits - data.total_credits).toFixed(2)}`}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
