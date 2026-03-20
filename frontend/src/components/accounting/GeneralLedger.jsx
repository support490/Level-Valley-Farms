import { useState, Fragment } from 'react'
import { RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'
import { getGeneralLedger } from '../../api/reports'
import Toast from '../common/Toast'
import useToast from '../../hooks/useToast'

export default function GeneralLedger() {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [collapsed, setCollapsed] = useState({})
  const { toast, showToast, hideToast } = useToast()

  const fmt = (val) => {
    if (val == null || val === 0) return ''
    if (val < 0) return `($${Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2 })})`
    return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
  }

  const generate = async () => {
    if (!dateFrom || !dateTo) {
      showToast('Please select both From and To dates', 'error')
      return
    }
    setLoading(true)
    try {
      const res = await getGeneralLedger(dateFrom, dateTo)
      setData(res.data)
      setCollapsed({})
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error generating General Ledger', 'error')
    } finally {
      setLoading(false)
    }
  }

  const toggleAccount = (accountId) => {
    setCollapsed(prev => ({ ...prev, [accountId]: !prev[accountId] }))
  }

  let grandDebit = 0
  let grandCredit = 0
  if (data?.accounts) {
    data.accounts.forEach(acct => {
      grandDebit += acct.total_debit || 0
      grandCredit += acct.total_credit || 0
    })
  }

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div>
          <label style={{ fontSize: '8pt', color: '#999' }}>From</label>
          <input type="date" className="glass-input block" value={dateFrom}
            onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: '8pt', color: '#999' }}>To</label>
          <input type="date" className="glass-input block" value={dateTo}
            onChange={e => setDateTo(e.target.value)} />
        </div>
        <button onClick={generate} className="glass-button-primary flex items-center gap-2 self-end" disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Generate
        </button>
      </div>

      {/* Empty state */}
      {!data && (
        <div className="glass-card p-8 text-center text-lvf-muted">
          Select date range and click Generate
        </div>
      )}

      {/* Report */}
      {data && (
        <div className="glass-card overflow-hidden">
          {/* Report Header */}
          <div className="p-4 border-b border-lvf-border bg-lvf-dark/30">
            <h3 className="font-semibold text-center text-lg">Level Valley Farms</h3>
            <p className="text-center text-sm text-lvf-muted">
              General Ledger — {data.period_from} through {data.period_to}
            </p>
          </div>

          <table className="w-full glass-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Entry #</th>
                <th>Description</th>
                <th className="text-right">Debit</th>
                <th className="text-right">Credit</th>
                <th className="text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {(data.accounts || []).map(acct => {
                const isCollapsed = collapsed[acct.account_id]
                return (
                  <Fragment key={acct.account_id}>
                    {/* Account header row */}
                    <tr
                      className="bg-lvf-accent/10 cursor-pointer hover:bg-lvf-accent/20 transition-colors"
                      onClick={() => toggleAccount(acct.account_id)}
                    >
                      <td colSpan={6} className="font-bold text-lvf-accent">
                        <div className="flex items-center gap-2">
                          {isCollapsed
                            ? <ChevronRight size={14} />
                            : <ChevronDown size={14} />
                          }
                          <span className="font-mono mr-2">{acct.account_number}</span>
                          {acct.account_name}
                          <span className="text-xs text-lvf-muted ml-2 font-normal uppercase">
                            ({acct.account_type})
                          </span>
                        </div>
                      </td>
                    </tr>

                    {/* Transaction rows */}
                    {!isCollapsed && (acct.entries || []).map((entry, idx) => (
                      <tr key={`${acct.account_id}-${idx}`}>
                        <td className="text-lvf-muted">{entry.date}</td>
                        <td className="font-mono text-xs">{entry.entry_number}</td>
                        <td>{entry.description}</td>
                        <td className="text-right font-mono">{fmt(entry.debit)}</td>
                        <td className="text-right font-mono">{fmt(entry.credit)}</td>
                        <td className="text-right font-mono font-medium">{fmt(entry.balance)}</td>
                      </tr>
                    ))}

                    {/* Account totals row */}
                    {!isCollapsed && (
                      <tr className="bg-lvf-dark/20 border-t border-lvf-border">
                        <td colSpan={3} className="text-right text-sm font-semibold text-lvf-muted">
                          {acct.account_name} Totals
                        </td>
                        <td className="text-right font-mono font-semibold">{fmt(acct.total_debit)}</td>
                        <td className="text-right font-mono font-semibold">{fmt(acct.total_credit)}</td>
                        <td></td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}

              {(data.accounts || []).length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-lvf-muted">
                    No ledger entries found for this period.
                  </td>
                </tr>
              )}
            </tbody>
            {(data.accounts || []).length > 0 && (
              <tfoot>
                <tr className="bg-lvf-dark/40 font-semibold text-lg">
                  <td colSpan={3} className="text-right">Grand Totals</td>
                  <td className="text-right font-mono">{fmt(grandDebit)}</td>
                  <td className="text-right font-mono">{fmt(grandCredit)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}
