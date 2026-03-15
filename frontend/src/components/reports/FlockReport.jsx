import { useState, useEffect } from 'react'
import { FileText, TrendingUp, Skull, DollarSign, MapPin, ClipboardList } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
  PieChart, Pie, Cell
} from 'recharts'
import { getFlockReport } from '../../api/reports'
import { getFlocks } from '../../api/flocks'
import { getProductionChart } from '../../api/production'
import SearchSelect from '../common/SearchSelect'

const PIE_COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#818cf8', '#fb923c', '#a78bfa', '#22d3ee']

export default function FlockReport() {
  const [flocks, setFlocks] = useState([])
  const [selectedFlock, setSelectedFlock] = useState(null)
  const [report, setReport] = useState(null)
  const [chartData, setChartData] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getFlocks().then(res => setFlocks(res.data))
  }, [])

  const flockOptions = flocks.map(f => ({
    value: f.id, label: `${f.flock_number} — ${f.status} — ${f.current_bird_count} birds`
  }))

  const loadReport = async (flockId) => {
    setLoading(true)
    try {
      const [reportRes, chartRes] = await Promise.all([
        getFlockReport(flockId),
        getProductionChart([flockId]),
      ])
      setReport(reportRes.data)

      const flockData = Object.values(chartRes.data)[0] || []
      setChartData(flockData.map(p => ({
        date: p.record_date,
        production: p.production_pct,
        eggs: p.egg_count,
      })))
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = (opt) => {
    setSelectedFlock(opt)
    if (opt) loadReport(opt.value)
    else { setReport(null); setChartData([]) }
  }

  const fmt = (val) => `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div>
      <div className="mb-6 max-w-md">
        <label className="block text-sm text-lvf-muted mb-2">Select Flock</label>
        <SearchSelect
          options={flockOptions}
          value={selectedFlock}
          onChange={handleSelect}
          placeholder="Search for a flock..."
          isClearable
        />
      </div>

      {loading && <div className="text-center py-12 text-lvf-muted">Loading report...</div>}

      {report && !loading && (
        <div className="space-y-6">
          {/* Header */}
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <FileText size={24} className="text-lvf-accent" />
                <div>
                  <h3 className="text-xl font-bold">Layer Cost Report</h3>
                  <p className="text-sm text-lvf-muted">
                    Flock {report.flock_number} — {report.breed || 'No breed'} — {report.status}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-2xl font-bold ${report.net_profit_loss >= 0 ? 'text-lvf-success' : 'text-lvf-danger'}`}>
                  {fmt(Math.abs(report.net_profit_loss))}
                </div>
                <span className="text-xs text-lvf-muted">
                  {report.net_profit_loss >= 0 ? 'Net Profit' : 'Net Loss'}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-lvf-muted">Flock ID: </span>
                <span className="font-medium">{report.flock_number}</span>
              </div>
              <div>
                <span className="text-lvf-muted">Birds Placed: </span>
                <span className="font-medium">{report.initial_bird_count.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-lvf-muted">Arrival: </span>
                <span className="font-medium">{report.arrival_date}</span>
              </div>
            </div>
          </div>

          {/* Key Metrics Row */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Birds Placed', value: report.initial_bird_count.toLocaleString(), color: 'text-lvf-text' },
              { label: 'Current Birds', value: report.current_bird_count.toLocaleString(), color: 'text-lvf-accent' },
              { label: 'Total Deaths', value: report.total_deaths.toLocaleString(), color: 'text-lvf-danger' },
              { label: 'Total Culls', value: report.total_culls.toLocaleString(), color: 'text-lvf-warning' },
              { label: 'Mortality %', value: `${report.mortality_pct}%`, color: report.mortality_pct > 5 ? 'text-lvf-danger' : 'text-lvf-success' },
              { label: 'DZ/Bird Housed', value: report.dozens_per_bird_housed.toFixed(1), color: 'text-lvf-accent' },
            ].map(m => (
              <div key={m.label} className="glass-card p-3 text-center">
                <p className="text-[10px] text-lvf-muted uppercase tracking-wider">{m.label}</p>
                <p className={`text-lg font-bold mt-1 ${m.color}`}>{m.value}</p>
              </div>
            ))}
          </div>

          {/* Total Expenses Table (Layer Cost Report Format) */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <ClipboardList size={18} className="text-lvf-accent" />
              <h4 className="font-semibold">Total Expenses</h4>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-lvf-border/30">
                  <th className="text-left py-2 text-lvf-muted font-medium">Category</th>
                  <th className="text-right py-2 text-lvf-muted font-medium">Total</th>
                  <th className="text-right py-2 text-lvf-muted font-medium">Expense Per Bird</th>
                  <th className="text-right py-2 text-lvf-muted font-medium">Expense Per DZ Eggs</th>
                </tr>
              </thead>
              <tbody>
                {report.expenses_by_category.map((exp, i) => (
                  <tr key={exp.category} className="border-b border-lvf-border/10">
                    <td className="py-2 capitalize">{exp.category.replace(/_/g, ' ')}</td>
                    <td className="py-2 text-right font-mono">{fmt(exp.total)}</td>
                    <td className="py-2 text-right font-mono text-lvf-muted">{fmt(exp.per_bird)}</td>
                    <td className="py-2 text-right font-mono text-lvf-muted">{fmt(exp.per_dozen_eggs)}</td>
                  </tr>
                ))}
                {report.expenses_by_category.length === 0 && (
                  <tr><td colSpan={4} className="py-4 text-center text-lvf-muted">No posted expenses for this flock.</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-lvf-border/50 font-semibold">
                  <td className="py-2">Total Expense</td>
                  <td className="py-2 text-right font-mono text-lvf-danger">{fmt(report.total_expenses)}</td>
                  <td className="py-2 text-right font-mono">Gross Expense Per Bird</td>
                  <td className="py-2 text-right font-mono">{fmt(report.expense_per_bird)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Financial Summary - Layer Cost Report Style */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-card p-6">
              <h4 className="font-semibold mb-4">Revenue & Profitability</h4>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-lvf-muted">Eggs Produced to Date (DZ)</span>
                  <span className="font-mono font-medium">{report.eggs_produced_dozens.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-lvf-muted">DZ Eggs Per Bird Housed</span>
                  <span className="font-mono">{report.dozens_per_bird_housed.toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-lvf-muted">Egg Sales To Date</span>
                  <span className="font-mono text-lvf-success">{fmt(report.total_revenue)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-lvf-muted">Avg Sale Price Per DZ Eggs</span>
                  <span className="font-mono">{fmt(report.avg_sale_price_per_dozen)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-lvf-muted">Gross Income Per Bird</span>
                  <span className="font-mono">{fmt(report.gross_income_per_bird)}</span>
                </div>
                <div className="border-t border-lvf-border/50 pt-3 flex justify-between font-semibold">
                  <span>Net Profit Per Bird</span>
                  <span className={`font-mono ${report.net_profit_per_bird >= 0 ? 'text-lvf-success' : 'text-lvf-danger'}`}>
                    {fmt(report.net_profit_per_bird)}
                  </span>
                </div>
                <div className="flex justify-between font-semibold text-lg">
                  <span>{report.net_profit_loss >= 0 ? 'Net Profit' : 'Net Loss'}</span>
                  <span className={`font-mono ${report.net_profit_loss >= 0 ? 'text-lvf-success' : 'text-lvf-danger'}`}>
                    {fmt(Math.abs(report.net_profit_loss))}
                  </span>
                </div>
              </div>
            </div>

            <div className="glass-card p-6">
              <h4 className="font-semibold mb-4">Feed & Conversion</h4>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-lvf-muted">Feed Purchased (Tons)</span>
                  <span className="font-mono font-medium">{report.feed_purchased_tons.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-lvf-muted">Feed Conversion (LBS/DOZ)</span>
                  <span className="font-mono">{report.feed_conversion_lbs_per_doz.toFixed(6)}</span>
                </div>
                <div className="border-t border-lvf-border/50 pt-3">
                  <div className="flex justify-between">
                    <span className="text-lvf-muted">Current Total Cost</span>
                    <span className={`font-mono font-medium ${report.net_profit_loss < 0 ? 'text-lvf-danger' : 'text-lvf-success'}`}>
                      {report.net_profit_loss < 0 ? fmt(report.net_profit_loss) : fmt(-report.net_profit_loss)}
                    </span>
                  </div>
                  <div className="flex justify-between mt-2">
                    <span className="text-lvf-muted">Current Cost Per Bird</span>
                    <span className="font-mono">{fmt(report.current_cost_per_bird)}</span>
                  </div>
                </div>
              </div>

              {/* Contracts */}
              {report.contracts && report.contracts.length > 0 && (
                <div className="mt-6 pt-4 border-t border-lvf-border/30">
                  <h5 className="text-sm font-semibold mb-2">Assigned Contracts</h5>
                  {report.contracts.map((c, i) => (
                    <div key={i} className="flex justify-between text-sm py-1">
                      <span className="text-lvf-accent">{c.contract_number} — {c.buyer}</span>
                      <span className="font-mono text-lvf-muted">
                        {c.shipped_dozens.toLocaleString()} doz shipped
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Expense Breakdown Pie Chart */}
          {report.expenses_by_category.length > 0 && (
            <div className="glass-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <DollarSign size={18} className="text-lvf-accent" />
                <h4 className="font-semibold">Expense Breakdown</h4>
              </div>
              <div className="flex gap-6">
                <div className="w-48 h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={report.expenses_by_category}
                        dataKey="total"
                        nameKey="category"
                        cx="50%" cy="50%"
                        outerRadius={80}
                        innerRadius={40}
                      >
                        {report.expenses_by_category.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-2">
                  {report.expenses_by_category.map((exp, i) => (
                    <div key={exp.category} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="capitalize">{exp.category.replace(/_/g, ' ')}</span>
                      </div>
                      <span className="font-mono">{fmt(exp.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Production Chart */}
          {chartData.length > 0 && (
            <div className="glass-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={18} className="text-lvf-accent" />
                <h4 className="font-semibold">Production History</h4>
                <div className="flex gap-4 ml-auto text-sm">
                  <span className="text-lvf-muted">Avg: <strong className="text-lvf-warning">{report.production_summary.avg_production_pct}%</strong></span>
                  <span className="text-lvf-muted">Peak: <strong className="text-lvf-success">{report.production_summary.peak_production_pct}%</strong></span>
                  <span className="text-lvf-muted">Total: <strong className="text-lvf-text">{report.production_summary.total_eggs.toLocaleString()} eggs</strong></span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,160,255,0.1)" />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => `${v}%`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'rgba(15,23,42,0.95)', border: '1px solid rgba(100,160,255,0.15)', borderRadius: '0.75rem' }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <ReferenceLine y={80} stroke="rgba(52,211,153,0.3)" strokeDasharray="5 5" />
                  <Line type="monotone" dataKey="production" stroke="#60a5fa" strokeWidth={2} dot={{ r: 3 }} name="Production %" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Placement History */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <MapPin size={18} className="text-lvf-accent" />
              <h4 className="font-semibold">Placement History</h4>
            </div>
            <table className="w-full glass-table">
              <thead>
                <tr><th>Barn</th><th>Grower</th><th>Type</th><th>Birds</th><th>Placed</th><th>Removed</th><th>Current</th></tr>
              </thead>
              <tbody>
                {report.placement_history.map((p, i) => (
                  <tr key={i}>
                    <td className="font-medium">{p.barn_name}</td>
                    <td className="text-lvf-muted">{p.grower_name}</td>
                    <td>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${p.barn_type === 'pullet' ? 'bg-purple-500/20 text-purple-400' : 'bg-amber-500/20 text-amber-400'}`}>
                        {p.barn_type}
                      </span>
                    </td>
                    <td>{p.bird_count.toLocaleString()}</td>
                    <td className="text-lvf-muted">{p.placed_date}</td>
                    <td className="text-lvf-muted">{p.removed_date || '—'}</td>
                    <td>{p.is_current ? <span className="text-lvf-success">Yes</span> : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!report && !loading && (
        <div className="glass-card p-12 text-center text-lvf-muted">
          <FileText size={48} className="mx-auto mb-4 opacity-30" />
          <p>Select a flock above to view its Layer Cost Report</p>
          <p className="text-xs mt-1">Includes all expenses per bird/dozen, revenue, production, feed conversion, contracts, and placement history</p>
        </div>
      )}
    </div>
  )
}
