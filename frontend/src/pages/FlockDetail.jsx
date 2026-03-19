import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Bird, TrendingUp, Skull, DollarSign, MapPin, GitBranch,
  Calendar, Clock, AlertTriangle, PackageX
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
  PieChart, Pie, Cell
} from 'recharts'
import { getFlock, getFlockPlacements, getMortalityRecords, getCloseoutStatus } from '../api/flocks'
import { getFlockReport } from '../api/reports'
import { getProductionChart } from '../api/production'
import Toast from '../components/common/Toast'
import useToast from '../hooks/useToast'

const PIE_COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#818cf8', '#fb923c', '#a78bfa', '#22d3ee']
const fmt = (val) => `$${(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const TABS = [
  { id: 'overview', label: 'Overview', icon: Bird },
  { id: 'production', label: 'Production', icon: TrendingUp },
  { id: 'mortality', label: 'Mortality', icon: Skull },
  { id: 'financials', label: 'Financials', icon: DollarSign },
  { id: 'lineage', label: 'Lineage', icon: GitBranch },
  { id: 'placements', label: 'Placements', icon: MapPin },
]

export default function FlockDetail() {
  const { flockId } = useParams()
  const navigate = useNavigate()
  const [flock, setFlock] = useState(null)
  const [report, setReport] = useState(null)
  const [chartData, setChartData] = useState([])
  const [mortalityRecords, setMortalityRecords] = useState([])
  const [placements, setPlacements] = useState([])
  const [closeout, setCloseout] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const { toast, showToast, hideToast } = useToast()

  useEffect(() => {
    loadAll()
  }, [flockId])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [flockRes, reportRes, chartRes, mortRes, placeRes] = await Promise.all([
        getFlock(flockId),
        getFlockReport(flockId),
        getProductionChart([flockId]).catch(() => ({ data: {} })),
        getMortalityRecords(flockId),
        getFlockPlacements(flockId),
      ])
      setFlock(flockRes.data)
      setReport(reportRes.data)
      setMortalityRecords(mortRes.data || [])
      setPlacements(placeRes.data || [])

      const flockChartData = Object.values(chartRes.data)[0] || []
      setChartData(flockChartData.map(p => ({
        date: p.record_date, production: p.production_pct, eggs: p.egg_count, birds: p.bird_count
      })))

      if (flockRes.data.status === 'closing') {
        const coRes = await getCloseoutStatus(flockId)
        setCloseout(coRes.data)
      }
    } catch (err) {
      showToast('Error loading flock details', 'error')
    } finally { setLoading(false) }
  }

  if (loading) return <div className="text-center py-12 text-lvf-muted">Loading flock details...</div>
  if (!flock) return <div className="text-center py-12 text-lvf-muted">Flock not found</div>

  const statusColors = {
    active: 'bg-lvf-success/20 text-lvf-success',
    transferred: 'bg-lvf-accent/20 text-lvf-accent',
    closing: 'bg-lvf-warning/20 text-lvf-warning',
    sold: 'bg-lvf-muted/20 text-lvf-muted',
    culled: 'bg-lvf-danger/20 text-lvf-danger',
  }
  const typeColors = { pullet: 'bg-purple-500/20 text-purple-400', layer: 'bg-amber-500/20 text-amber-400' }

  // Calculate age
  const hatchDate = flock.hatch_date ? new Date(flock.hatch_date) : null
  const now = new Date()
  const ageWeeks = hatchDate ? Math.floor((now - hatchDate) / (7 * 24 * 60 * 60 * 1000)) : null

  // Weeks in lay (from arrival date for layer flocks)
  const arrivalDate = new Date(flock.arrival_date)
  const weeksInLay = flock.flock_type === 'layer' ? Math.floor((now - arrivalDate) / (7 * 24 * 60 * 60 * 1000)) : null

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      {/* Back button + header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/flocks')} className="p-2 rounded-lg hover:bg-white/10">
          <ArrowLeft size={20} className="text-lvf-muted" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">{flock.flock_number}</h2>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeColors[flock.flock_type]}`}>
              {flock.flock_type}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[flock.status]}`}>
              {flock.status}
            </span>
          </div>
          <p className="text-sm text-lvf-muted mt-1">
            {flock.breed || 'No breed'} — {flock.bird_color} — {flock.current_bird_count.toLocaleString()} birds
            {ageWeeks !== null && <span className="ml-3"><Clock size={12} className="inline" /> {ageWeeks} weeks old</span>}
            {weeksInLay !== null && <span className="ml-3"><Calendar size={12} className="inline" /> {weeksInLay} weeks in lay</span>}
          </p>
        </div>
      </div>

      {/* Closeout banner */}
      {flock.status === 'closing' && closeout && (
        <div className="glass-card p-4 mb-6 bg-amber-500/10 border-amber-500/20 flex items-center gap-3">
          <PackageX size={20} className="text-lvf-warning" />
          <div>
            <p className="text-sm font-semibold text-lvf-warning">Flock Closeout In Progress</p>
            <p className="text-xs text-lvf-muted">
              {closeout.skids_remaining} skids, {closeout.cases_remaining} cases remaining — started {closeout.closeout_date}
            </p>
          </div>
        </div>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        {[
          { label: 'Initial', value: flock.initial_bird_count.toLocaleString() },
          { label: 'Current', value: flock.current_bird_count.toLocaleString(), color: 'text-lvf-accent' },
          { label: 'Cost/Bird', value: parseFloat(flock.cost_per_bird) > 0 ? `$${parseFloat(flock.cost_per_bird).toFixed(2)}` : '—', color: 'text-lvf-accent' },
          { label: 'Mortality %', value: report ? `${report.mortality_pct}%` : '—', color: report && report.mortality_pct > 5 ? 'text-lvf-danger' : 'text-lvf-success' },
          { label: 'Production %', value: report ? `${report.production_summary?.current_production_pct || 0}%` : '—', color: 'text-lvf-success' },
          { label: 'Net P&L', value: report ? fmt(report.net_profit_loss) : '—', color: report && report.net_profit_loss >= 0 ? 'text-lvf-success' : 'text-lvf-danger' },
        ].map(m => (
          <div key={m.label} className="glass-card p-3 text-center">
            <p className="text-[10px] text-lvf-muted uppercase tracking-wider">{m.label}</p>
            <p className={`text-lg font-bold mt-1 ${m.color || 'text-lvf-text'}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-lvf-border/30 pb-0">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${
              activeTab === tab.id
                ? 'border-lvf-accent text-lvf-accent'
                : 'border-transparent text-lvf-muted hover:text-lvf-text'
            }`}>
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && report && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-card p-6">
              <h4 className="font-semibold mb-4">Flock Info</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-lvf-muted">Flock ID</span><span className="font-mono">{flock.flock_number}</span></div>
                <div className="flex justify-between"><span className="text-lvf-muted">Type</span><span className="capitalize">{flock.flock_type}</span></div>
                <div className="flex justify-between"><span className="text-lvf-muted">Color</span><span className="capitalize">{flock.bird_color}</span></div>
                <div className="flex justify-between"><span className="text-lvf-muted">Source</span><span className="capitalize">{flock.source_type}</span></div>
                <div className="flex justify-between"><span className="text-lvf-muted">Breed</span><span>{flock.breed || '—'}</span></div>
                <div className="flex justify-between"><span className="text-lvf-muted">Hatch Date</span><span>{flock.hatch_date || '—'}</span></div>
                <div className="flex justify-between"><span className="text-lvf-muted">Arrival Date</span><span>{flock.arrival_date}</span></div>
                <div className="flex justify-between"><span className="text-lvf-muted">Current Barn</span><span>{flock.current_barn || '—'}</span></div>
                <div className="flex justify-between"><span className="text-lvf-muted">Grower</span><span>{flock.current_grower || '—'}</span></div>
                {flock.parent_flock_number && (
                  <div className="flex justify-between"><span className="text-lvf-muted">Parent Flock</span>
                    <span className="text-purple-400">{flock.parent_flock_number}</span>
                  </div>
                )}
                {ageWeeks !== null && <div className="flex justify-between"><span className="text-lvf-muted">Age</span><span>{ageWeeks} weeks</span></div>}
              </div>
            </div>
            <div className="glass-card p-6">
              <h4 className="font-semibold mb-4">Financial Summary</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-lvf-muted">Inherited Cost/Bird</span><span className="font-mono">{parseFloat(flock.cost_per_bird) > 0 ? fmt(parseFloat(flock.cost_per_bird)) : '—'}</span></div>
                <div className="flex justify-between"><span className="text-lvf-muted">Total Expenses</span><span className="font-mono text-lvf-danger">{fmt(report.total_expenses)}</span></div>
                <div className="flex justify-between"><span className="text-lvf-muted">Total Revenue</span><span className="font-mono text-lvf-success">{fmt(report.total_revenue)}</span></div>
                <div className="flex justify-between"><span className="text-lvf-muted">Expense/Bird</span><span className="font-mono">{fmt(report.expense_per_bird)}</span></div>
                <div className="flex justify-between"><span className="text-lvf-muted">Revenue/Bird</span><span className="font-mono">{fmt(report.gross_income_per_bird)}</span></div>
                <div className="border-t border-lvf-border/50 pt-2 flex justify-between font-semibold">
                  <span>{report.net_profit_loss >= 0 ? 'Net Profit' : 'Net Loss'}</span>
                  <span className={`font-mono ${report.net_profit_loss >= 0 ? 'text-lvf-success' : 'text-lvf-danger'}`}>
                    {fmt(Math.abs(report.net_profit_loss))}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Mini production chart */}
          {chartData.length > 0 && (
            <div className="glass-card p-6">
              <h4 className="font-semibold mb-4 flex items-center gap-2">
                <TrendingUp size={16} className="text-lvf-accent" /> Production Trend
              </h4>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,160,255,0.1)" />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => `${v}%`} />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(15,23,42,0.95)', border: '1px solid rgba(100,160,255,0.15)', borderRadius: '0.75rem' }} />
                  <ReferenceLine y={80} stroke="rgba(52,211,153,0.3)" strokeDasharray="5 5" />
                  <Line type="monotone" dataKey="production" stroke="#60a5fa" strokeWidth={2} dot={{ r: 2 }} name="Production %" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {activeTab === 'production' && (
        <div className="space-y-6">
          {report && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="glass-card p-4 text-center">
                <p className="text-xs text-lvf-muted">Avg Production</p>
                <p className="text-xl font-bold text-lvf-success">{report.production_summary?.avg_production_pct || 0}%</p>
              </div>
              <div className="glass-card p-4 text-center">
                <p className="text-xs text-lvf-muted">Peak Production</p>
                <p className="text-xl font-bold text-lvf-accent">{report.production_summary?.peak_production_pct || 0}%</p>
              </div>
              <div className="glass-card p-4 text-center">
                <p className="text-xs text-lvf-muted">Total Eggs</p>
                <p className="text-xl font-bold">{(report.production_summary?.total_eggs || 0).toLocaleString()}</p>
              </div>
              <div className="glass-card p-4 text-center">
                <p className="text-xs text-lvf-muted">DZ/Bird Housed</p>
                <p className="text-xl font-bold">{report.dozens_per_bird_housed?.toFixed(1) || 0}</p>
              </div>
            </div>
          )}
          {chartData.length > 0 ? (
            <div className="glass-card p-6">
              <h4 className="font-semibold mb-4">Production % Over Time</h4>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,160,255,0.1)" />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => `${v}%`} />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(15,23,42,0.95)', border: '1px solid rgba(100,160,255,0.15)', borderRadius: '0.75rem' }} />
                  <ReferenceLine y={80} stroke="rgba(52,211,153,0.3)" strokeDasharray="5 5" label={{ value: "Target 80%", fill: '#94a3b8', fontSize: 10 }} />
                  <Line type="monotone" dataKey="production" stroke="#60a5fa" strokeWidth={2} dot={{ r: 3 }} name="Production %" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="glass-card p-12 text-center text-lvf-muted">No production records yet.</div>
          )}
        </div>
      )}

      {activeTab === 'mortality' && (
        <div className="space-y-6">
          {report && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="glass-card p-4 text-center">
                <p className="text-xs text-lvf-muted">Total Deaths</p>
                <p className="text-xl font-bold text-lvf-danger">{report.total_deaths?.toLocaleString()}</p>
              </div>
              <div className="glass-card p-4 text-center">
                <p className="text-xs text-lvf-muted">Total Culls</p>
                <p className="text-xl font-bold text-lvf-warning">{report.total_culls?.toLocaleString()}</p>
              </div>
              <div className="glass-card p-4 text-center">
                <p className="text-xs text-lvf-muted">Total Lost</p>
                <p className="text-xl font-bold">{((report.total_deaths || 0) + (report.total_culls || 0)).toLocaleString()}</p>
              </div>
              <div className="glass-card p-4 text-center">
                <p className="text-xs text-lvf-muted">Mortality %</p>
                <p className={`text-xl font-bold ${report.mortality_pct > 5 ? 'text-lvf-danger' : 'text-lvf-success'}`}>{report.mortality_pct}%</p>
              </div>
            </div>
          )}
          <div className="glass-card overflow-hidden">
            <table className="w-full glass-table">
              <thead>
                <tr><th>Date</th><th>Deaths</th><th>Culls</th><th>Total</th><th>Cause</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {mortalityRecords.map(r => (
                  <tr key={r.id}>
                    <td>{r.record_date}</td>
                    <td className="text-lvf-danger">{r.deaths}</td>
                    <td className="text-lvf-warning">{r.culls}</td>
                    <td className="font-semibold">{r.deaths + r.culls}</td>
                    <td className="text-lvf-muted">{r.cause || '—'}</td>
                    <td className="text-lvf-muted text-xs">{r.notes || '—'}</td>
                  </tr>
                ))}
                {mortalityRecords.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-8 text-lvf-muted">No mortality records.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'financials' && report && (
        <div className="space-y-6">
          {/* Expense table */}
          <div className="glass-card p-6">
            <h4 className="font-semibold mb-4">Expenses by Category</h4>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-lvf-border/30">
                  <th className="text-left py-2 text-lvf-muted font-medium">Category</th>
                  <th className="text-right py-2 text-lvf-muted font-medium">Total</th>
                  <th className="text-right py-2 text-lvf-muted font-medium">Per Bird</th>
                  <th className="text-right py-2 text-lvf-muted font-medium">Per DZ Eggs</th>
                </tr>
              </thead>
              <tbody>
                {report.expenses_by_category.map(exp => (
                  <tr key={exp.category} className="border-b border-lvf-border/10">
                    <td className="py-2 capitalize">{exp.category.replace(/_/g, ' ')}</td>
                    <td className="py-2 text-right font-mono">{fmt(exp.total)}</td>
                    <td className="py-2 text-right font-mono text-lvf-muted">{fmt(exp.per_bird)}</td>
                    <td className="py-2 text-right font-mono text-lvf-muted">{fmt(exp.per_dozen_eggs)}</td>
                  </tr>
                ))}
                {report.expenses_by_category.length === 0 && (
                  <tr><td colSpan={4} className="py-4 text-center text-lvf-muted">No posted expenses.</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-lvf-border/50 font-semibold">
                  <td className="py-2">Total</td>
                  <td className="py-2 text-right font-mono text-lvf-danger">{fmt(report.total_expenses)}</td>
                  <td className="py-2 text-right font-mono">{fmt(report.expense_per_bird)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Pie chart + revenue */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {report.expenses_by_category.length > 0 && (
              <div className="glass-card p-6">
                <h4 className="font-semibold mb-4">Expense Breakdown</h4>
                <div className="flex gap-6">
                  <div className="w-40 h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={report.expenses_by_category} dataKey="total" nameKey="category" cx="50%" cy="50%" outerRadius={70} innerRadius={35}>
                          {report.expenses_by_category.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-1.5">
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
            <div className="glass-card p-6">
              <h4 className="font-semibold mb-4">Revenue & Profitability</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-lvf-muted">Egg Sales</span><span className="font-mono text-lvf-success">{fmt(report.total_revenue)}</span></div>
                <div className="flex justify-between"><span className="text-lvf-muted">Eggs (dozens)</span><span className="font-mono">{report.eggs_produced_dozens?.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-lvf-muted">Avg $/doz</span><span className="font-mono">{fmt(report.avg_sale_price_per_dozen)}</span></div>
                <div className="flex justify-between"><span className="text-lvf-muted">Income/Bird</span><span className="font-mono">{fmt(report.gross_income_per_bird)}</span></div>
                <div className="border-t border-lvf-border/50 pt-2 flex justify-between font-semibold text-lg">
                  <span>{report.net_profit_loss >= 0 ? 'Net Profit' : 'Net Loss'}</span>
                  <span className={`font-mono ${report.net_profit_loss >= 0 ? 'text-lvf-success' : 'text-lvf-danger'}`}>{fmt(Math.abs(report.net_profit_loss))}</span>
                </div>
              </div>
              {report.contracts && report.contracts.length > 0 && (
                <div className="mt-4 pt-3 border-t border-lvf-border/30">
                  <h5 className="text-sm font-semibold mb-2">Contracts</h5>
                  {report.contracts.map((c, i) => (
                    <div key={i} className="flex justify-between text-sm py-1">
                      <span className="text-lvf-accent">{c.contract_number} — {c.buyer}</span>
                      <span className="font-mono text-lvf-muted">{c.shipped_dozens?.toLocaleString()} doz</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'lineage' && (
        <div className="space-y-6">
          {/* Parent flock */}
          {flock.parent_flock_number && (
            <div className="glass-card p-6">
              <h4 className="font-semibold mb-4 flex items-center gap-2">
                <GitBranch size={16} className="text-purple-400" /> Parent Pullet Flock
              </h4>
              <div className="glass-card p-4 bg-purple-500/10 border-purple-500/20">
                <p className="text-lg font-semibold text-purple-400">{flock.parent_flock_number}</p>
                <p className="text-sm text-lvf-muted mt-1">This flock was created by splitting birds from the pullet flock above.</p>
              </div>
            </div>
          )}

          {/* Source flocks (for merged layer flocks) */}
          {flock.flock_sources && flock.flock_sources.length > 0 && (
            <div className="glass-card p-6">
              <h4 className="font-semibold mb-4">Source Pullet Flocks</h4>
              <p className="text-sm text-lvf-muted mb-4">
                This layer flock received birds from {flock.flock_sources.length} pullet flock{flock.flock_sources.length > 1 ? 's' : ''}.
                Cost per bird is a weighted average.
              </p>
              <table className="w-full glass-table">
                <thead>
                  <tr><th>Pullet Flock</th><th>Birds</th><th>Cost/Bird</th><th>Total Cost</th><th>Transfer Date</th></tr>
                </thead>
                <tbody>
                  {flock.flock_sources.map((s, i) => (
                    <tr key={i}>
                      <td className="text-purple-400 font-semibold">{s.pullet_flock_number}</td>
                      <td>{s.bird_count.toLocaleString()}</td>
                      <td className="font-mono">${parseFloat(s.cost_per_bird).toFixed(4)}</td>
                      <td className="font-mono">{fmt(s.bird_count * parseFloat(s.cost_per_bird))}</td>
                      <td className="text-lvf-muted">{s.transfer_date}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-lvf-border/50 font-semibold">
                    <td>Weighted Average</td>
                    <td>{flock.flock_sources.reduce((s, f) => s + f.bird_count, 0).toLocaleString()}</td>
                    <td className="font-mono">${parseFloat(flock.cost_per_bird).toFixed(4)}</td>
                    <td></td><td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Flock report source info */}
          {report?.flock_sources && report.flock_sources.length > 0 && !flock.flock_sources?.length && (
            <div className="glass-card p-6">
              <h4 className="font-semibold mb-4">Source Flocks (from report)</h4>
              {report.flock_sources.map((s, i) => (
                <div key={i} className="flex justify-between items-center py-2 text-sm">
                  <span className="text-purple-400">{s.pullet_flock_number}</span>
                  <span>{s.bird_count.toLocaleString()} birds @ ${s.cost_per_bird.toFixed(4)}/bird</span>
                </div>
              ))}
            </div>
          )}

          {!flock.parent_flock_number && (!flock.flock_sources || flock.flock_sources.length === 0) && (
            <div className="glass-card p-12 text-center text-lvf-muted">
              <GitBranch size={48} className="mx-auto mb-4 opacity-30" />
              <p>No lineage data. This flock was {flock.source_type === 'purchased' ? 'purchased directly' : 'created as an original flock'}.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'placements' && (
        <div className="glass-card overflow-hidden">
          <table className="w-full glass-table">
            <thead>
              <tr><th>Barn</th><th>Grower</th><th>Type</th><th>Birds</th><th>Placed</th><th>Removed</th><th>Current</th></tr>
            </thead>
            <tbody>
              {placements.map(p => (
                <tr key={p.id}>
                  <td className="font-medium">{p.barn_name}</td>
                  <td className="text-lvf-muted">{p.grower_name}</td>
                  <td><span className={`px-2 py-0.5 rounded-full text-xs ${typeColors[p.barn_type]}`}>{p.barn_type}</span></td>
                  <td>{p.bird_count.toLocaleString()}</td>
                  <td className="text-lvf-muted">{p.placed_date}</td>
                  <td className="text-lvf-muted">{p.removed_date || '—'}</td>
                  <td>{p.is_current ? <span className="text-lvf-success">Yes</span> : 'No'}</td>
                </tr>
              ))}
              {placements.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-lvf-muted">No placement records.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
