import { useState, useEffect } from 'react'
import { Download, DollarSign, FileText, AlertTriangle } from 'lucide-react'
import {
  getYearEndClose, getRetainedEarnings, getScheduleF, get1099Report,
  getPeriodComparison, getRatioAnalysis, getAuditExport, exportQuickBooks,
} from '../../api/accounting'
import Toast from '../common/Toast'
import useToast from '../../hooks/useToast'

export default function Compliance({ subTab = 'schedulef' }) {
  const [scheduleF, setScheduleF] = useState(null)
  const [report1099, setReport1099] = useState(null)
  const [retained, setRetained] = useState(null)
  const [ratios, setRatios] = useState(null)
  const [comparison, setComparison] = useState(null)
  const [yearEnd, setYearEnd] = useState(null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [compDates, setCompDates] = useState({
    p1_start: `${new Date().getFullYear()}-01-01`, p1_end: `${new Date().getFullYear()}-06-30`,
    p2_start: `${new Date().getFullYear() - 1}-01-01`, p2_end: `${new Date().getFullYear() - 1}-06-30`,
  })
  const { toast, showToast, hideToast } = useToast()

  useEffect(() => {
    if (subTab === 'schedulef') getScheduleF(year).then(r => setScheduleF(r.data)).catch(() => {})
    if (subTab === '1099') get1099Report(year).then(r => setReport1099(r.data)).catch(() => {})
    if (subTab === 'retained') getRetainedEarnings().then(r => setRetained(r.data)).catch(() => {})
    if (subTab === 'ratios') getRatioAnalysis().then(r => setRatios(r.data)).catch(() => {})
    if (subTab === 'yearend') getYearEndClose(year).then(r => setYearEnd(r.data)).catch(() => {})
  }, [subTab, year])

  const loadComparison = async () => {
    try {
      const res = await getPeriodComparison(compDates.p1_start, compDates.p1_end, compDates.p2_start, compDates.p2_end)
      setComparison(res.data)
    } catch { showToast('Error loading comparison', 'error') }
  }

  useEffect(() => { if (subTab === 'comparison') loadComparison() }, [subTab])

  const handleQBExport = async () => {
    try {
      const res = await exportQuickBooks(year)
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a'); a.href = url
      a.download = `quickbooks-export-${year}.csv`
      document.body.appendChild(a); a.click(); a.remove()
      showToast('QuickBooks export downloaded')
    } catch { showToast('Export failed', 'error') }
  }

  const catLabel = (c) => c.replace(/_/g, ' ').replace(/\b\w/g, x => x.toUpperCase())

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      {/* Year selector for most tabs */}
      {['schedulef', '1099', 'yearend'].includes(subTab) && (
        <div className="flex items-center gap-3 mb-4">
          <label className="text-sm text-lvf-muted">Year:</label>
          <input className="glass-input w-24" type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} />
        </div>
      )}

      {/* ═══ SCHEDULE F ═══ */}
      {subTab === 'schedulef' && scheduleF && (
        <div className="max-w-2xl space-y-4">
          <div className="glass-card p-5">
            <h4 className="font-semibold mb-3">Schedule F — Farm Income ({scheduleF.year})</h4>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-lvf-border/30">
                <span className="font-medium">Gross Income (Egg Sales)</span>
                <span className="font-mono font-bold text-lvf-success">${scheduleF.gross_income.egg_sales.toLocaleString()}</span>
              </div>
              <h5 className="text-sm text-lvf-muted pt-2">Expenses</h5>
              {Object.entries(scheduleF.expenses).map(([cat, amt]) => (
                <div key={cat} className="flex justify-between py-1">
                  <span className="text-sm">{catLabel(cat)}</span>
                  <span className="font-mono text-lvf-danger">${amt.toLocaleString()}</span>
                </div>
              ))}
              <div className="flex justify-between py-2 border-t border-lvf-border/30 font-bold">
                <span>Total Expenses</span>
                <span className="font-mono text-lvf-danger">${scheduleF.total_expenses.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-2 border-t-2 border-lvf-border text-lg font-bold">
                <span>Net Farm Profit (Loss)</span>
                <span className={`font-mono ${scheduleF.net_farm_profit >= 0 ? 'text-lvf-success' : 'text-lvf-danger'}`}>
                  ${scheduleF.net_farm_profit.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 1099 ═══ */}
      {subTab === '1099' && report1099 && (
        <div className="max-w-2xl">
          <div className="glass-card p-3 mb-4 flex items-center gap-2 border-lvf-warning/30 bg-lvf-warning/5">
            <AlertTriangle size={14} className="text-lvf-warning" />
            <span className="text-sm">{report1099.vendors_requiring_1099} vendor(s) require 1099 filing (payments {'>='} ${report1099.threshold})</span>
          </div>
          <div className="glass-card overflow-hidden">
            <table className="w-full glass-table">
              <thead><tr><th>Vendor</th><th className="text-right">Total Paid</th><th className="text-right">Payments</th><th>1099 Required</th></tr></thead>
              <tbody>
                {report1099.vendors.map(v => (
                  <tr key={v.vendor_name}>
                    <td className="font-medium">{v.vendor_name}</td>
                    <td className="text-right font-mono">${v.total_paid.toLocaleString()}</td>
                    <td className="text-right">{v.num_payments}</td>
                    <td>{v.requires_1099 ? <span className="px-2 py-0.5 rounded-full text-xs bg-lvf-warning/20 text-lvf-warning">Yes</span> : <span className="text-xs text-lvf-muted">No</span>}</td>
                  </tr>
                ))}
                {report1099.vendors.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-lvf-muted">No vendor payments this year.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ RETAINED EARNINGS ═══ */}
      {subTab === 'retained' && retained && (
        <div className="max-w-md glass-card p-6 text-center">
          <h4 className="text-sm text-lvf-muted mb-2">Retained Earnings</h4>
          <p className={`text-3xl font-bold ${retained.retained_earnings >= 0 ? 'text-lvf-success' : 'text-lvf-danger'}`}>
            ${retained.retained_earnings.toLocaleString()}
          </p>
          <p className="text-xs text-lvf-muted mt-2">Through year {retained.through_year}</p>
        </div>
      )}

      {/* ═══ YEAR-END CLOSE ═══ */}
      {subTab === 'yearend' && yearEnd && (
        <div className="max-w-lg glass-card p-6">
          <h4 className="font-semibold mb-4">Year-End Close — {yearEnd.year}</h4>
          <div className="space-y-3">
            <div className="flex justify-between"><span className="text-lvf-muted">Total Revenue</span><span className="font-mono text-lvf-success">${yearEnd.total_revenue.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-lvf-muted">Total Expenses</span><span className="font-mono text-lvf-danger">${yearEnd.total_expenses.toLocaleString()}</span></div>
            <div className="flex justify-between border-t border-lvf-border/30 pt-3 font-bold">
              <span>Net Income</span>
              <span className={`font-mono ${yearEnd.net_income >= 0 ? 'text-lvf-success' : 'text-lvf-danger'}`}>${yearEnd.net_income.toLocaleString()}</span>
            </div>
            <p className="text-xs text-lvf-muted mt-3">{yearEnd.message}</p>
          </div>
        </div>
      )}

      {/* ═══ PERIOD COMPARISON ═══ */}
      {subTab === 'comparison' && (
        <div className="max-w-3xl">
          <div className="flex gap-4 mb-4 flex-wrap">
            <div className="glass-card p-3">
              <p className="text-[10px] text-lvf-muted mb-1">Period 1</p>
              <div className="flex gap-2">
                <input className="glass-input text-xs" type="date" value={compDates.p1_start} onChange={e => setCompDates({ ...compDates, p1_start: e.target.value })} />
                <input className="glass-input text-xs" type="date" value={compDates.p1_end} onChange={e => setCompDates({ ...compDates, p1_end: e.target.value })} />
              </div>
            </div>
            <div className="glass-card p-3">
              <p className="text-[10px] text-lvf-muted mb-1">Period 2</p>
              <div className="flex gap-2">
                <input className="glass-input text-xs" type="date" value={compDates.p2_start} onChange={e => setCompDates({ ...compDates, p2_start: e.target.value })} />
                <input className="glass-input text-xs" type="date" value={compDates.p2_end} onChange={e => setCompDates({ ...compDates, p2_end: e.target.value })} />
              </div>
            </div>
            <button onClick={loadComparison} className="glass-button-primary self-end">Compare</button>
          </div>
          {comparison && (
            <div className="glass-card overflow-hidden">
              <table className="w-full glass-table">
                <thead><tr><th>Metric</th><th className="text-right">Period 1</th><th className="text-right">Period 2</th><th className="text-right">Change</th></tr></thead>
                <tbody>
                  {[
                    { label: 'Revenue', k1: comparison.period1.revenue, k2: comparison.period2.revenue, chg: comparison.changes.revenue_pct, color: 'text-lvf-success' },
                    { label: 'Expenses', k1: comparison.period1.expenses, k2: comparison.period2.expenses, chg: comparison.changes.expenses_pct, color: 'text-lvf-danger' },
                    { label: 'Net Income', k1: comparison.period1.net_income, k2: comparison.period2.net_income, chg: comparison.changes.net_income_pct },
                    { label: 'Eggs Produced', k1: comparison.period1.total_eggs, k2: comparison.period2.total_eggs, chg: comparison.changes.production_pct },
                  ].map(r => (
                    <tr key={r.label}>
                      <td className="font-medium">{r.label}</td>
                      <td className="text-right font-mono">{typeof r.k1 === 'number' && r.label !== 'Eggs Produced' ? `$${r.k1.toLocaleString()}` : r.k1.toLocaleString()}</td>
                      <td className="text-right font-mono">{typeof r.k2 === 'number' && r.label !== 'Eggs Produced' ? `$${r.k2.toLocaleString()}` : r.k2.toLocaleString()}</td>
                      <td className={`text-right font-mono font-bold ${r.chg >= 0 ? 'text-lvf-success' : 'text-lvf-danger'}`}>{r.chg > 0 ? '+' : ''}{r.chg}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ RATIO ANALYSIS ═══ */}
      {subTab === 'ratios' && ratios && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-3xl">
          {[
            { label: 'Profit Margin', value: `${ratios.profit_margin}%`, color: ratios.profit_margin >= 0 ? 'text-lvf-success' : 'text-lvf-danger' },
            { label: 'Expense Ratio', value: `${ratios.expense_ratio}%`, color: 'text-lvf-warning' },
            { label: 'Current Ratio', value: ratios.current_ratio.toFixed(2), color: ratios.current_ratio >= 1 ? 'text-lvf-success' : 'text-lvf-danger' },
            { label: 'Debt to Equity', value: ratios.debt_to_equity.toFixed(2), color: ratios.debt_to_equity <= 1 ? 'text-lvf-success' : 'text-lvf-warning' },
            { label: 'Return on Assets', value: `${ratios.return_on_assets}%`, color: ratios.return_on_assets >= 0 ? 'text-lvf-success' : 'text-lvf-danger' },
            { label: 'Net Income', value: `$${ratios.net_income.toLocaleString()}`, color: ratios.net_income >= 0 ? 'text-lvf-success' : 'text-lvf-danger' },
          ].map(r => (
            <div key={r.label} className="glass-card stat-glow p-4 text-center">
              <p className="text-xs text-lvf-muted mb-1">{r.label}</p>
              <p className={`text-2xl font-bold ${r.color}`}>{r.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ═══ QB EXPORT ═══ */}
      {subTab === 'qbexport' && (
        <div className="max-w-md glass-card p-6 text-center">
          <FileText size={32} className="text-lvf-accent mx-auto mb-3" />
          <h4 className="font-semibold mb-2">QuickBooks / Xero Export</h4>
          <p className="text-sm text-lvf-muted mb-4">Download journal entries in CSV format compatible with QuickBooks and Xero import.</p>
          <div className="flex items-center justify-center gap-3 mb-4">
            <label className="text-sm text-lvf-muted">Year:</label>
            <input className="glass-input w-24" type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} />
          </div>
          <button onClick={handleQBExport} className="glass-button-primary flex items-center gap-2 mx-auto">
            <Download size={14} /> Download CSV
          </button>
        </div>
      )}
    </div>
  )
}
