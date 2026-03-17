import { useState, useEffect } from 'react'
import {
  Download, BarChart3, TrendingUp, Users, DollarSign, Bird, Award,
} from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import {
  getGrowerScorecard, getFarmPnl, getCostPerDozen, getFlockComparison, exportCsv,
} from '../api/reports'
import FlockReport from '../components/reports/FlockReport'
import IncomeStatement from '../components/reports/IncomeStatement'
import BalanceSheet from '../components/reports/BalanceSheet'
import SearchSelect from '../components/common/SearchSelect'
import Toast from '../components/common/Toast'
import useToast from '../hooks/useToast'

const CHART_COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#818cf8']

export default function Reports() {
  const [activeTab, setActiveTab] = useState('flock')
  const [scorecard, setScorecard] = useState([])
  const [farmPnl, setFarmPnl] = useState(null)
  const [pnlPeriod, setPnlPeriod] = useState('monthly')
  const [pnlYear, setPnlYear] = useState(new Date().getFullYear())
  const [costTrend, setCostTrend] = useState([])
  const [costMonths, setCostMonths] = useState(12)
  const [flockComp, setFlockComp] = useState([])
  const { toast, showToast, hideToast } = useToast()

  useEffect(() => {
    if (activeTab === 'scorecard') loadScorecard()
    if (activeTab === 'farmpnl') loadFarmPnl()
    if (activeTab === 'costtrend') loadCostTrend()
    if (activeTab === 'flockcomp') loadFlockComp()
  }, [activeTab, pnlPeriod, pnlYear, costMonths])

  const loadScorecard = async () => {
    try { const res = await getGrowerScorecard(); setScorecard(res.data) }
    catch { showToast('Error loading scorecard', 'error') }
  }
  const loadFarmPnl = async () => {
    try { const res = await getFarmPnl({ period: pnlPeriod, year: pnlYear }); setFarmPnl(res.data) }
    catch { showToast('Error loading P&L', 'error') }
  }
  const loadCostTrend = async () => {
    try { const res = await getCostPerDozen(costMonths); setCostTrend(res.data) }
    catch { showToast('Error loading cost trend', 'error') }
  }
  const loadFlockComp = async () => {
    try { const res = await getFlockComparison(); setFlockComp(res.data) }
    catch { showToast('Error loading flock comparison', 'error') }
  }

  const handleExport = async (reportType, params = {}) => {
    try {
      const res = await exportCsv(reportType, params)
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      const disposition = res.headers['content-disposition']
      const filename = disposition ? disposition.split('filename=')[1] : `${reportType}.csv`
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      showToast('CSV exported')
    } catch {
      showToast('Error exporting CSV', 'error')
    }
  }

  const tabs = [
    { id: 'flock', label: 'Flock Report', icon: Bird },
    { id: 'income', label: 'Income Statement', icon: DollarSign },
    { id: 'balance', label: 'Balance Sheet', icon: BarChart3 },
    { id: 'scorecard', label: 'Grower Scorecard', icon: Award },
    { id: 'farmpnl', label: 'Farm P&L', icon: TrendingUp },
    { id: 'costtrend', label: 'Cost Trends', icon: TrendingUp },
    { id: 'flockcomp', label: 'Flock Comparison', icon: Users },
  ]

  const yearOptions = Array.from({ length: 5 }, (_, i) => {
    const y = new Date().getFullYear() - i
    return { value: y, label: String(y) }
  })

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Reports & Analytics</h2>
        {/* Export buttons per tab */}
        <div className="flex gap-2">
          {activeTab === 'scorecard' && (
            <button onClick={() => handleExport('grower-scorecard')} className="glass-button-secondary flex items-center gap-2 text-sm">
              <Download size={14} /> Export CSV
            </button>
          )}
          {activeTab === 'farmpnl' && (
            <button onClick={() => handleExport('farm-pnl', { period: pnlPeriod, year: pnlYear })} className="glass-button-secondary flex items-center gap-2 text-sm">
              <Download size={14} /> Export CSV
            </button>
          )}
          {activeTab === 'costtrend' && (
            <button onClick={() => handleExport('cost-per-dozen')} className="glass-button-secondary flex items-center gap-2 text-sm">
              <Download size={14} /> Export CSV
            </button>
          )}
          {activeTab === 'flockcomp' && (
            <button onClick={() => handleExport('flock-comparison')} className="glass-button-secondary flex items-center gap-2 text-sm">
              <Download size={14} /> Export CSV
            </button>
          )}
          {activeTab === 'income' && (
            <button onClick={() => handleExport('income-statement')} className="glass-button-secondary flex items-center gap-2 text-sm">
              <Download size={14} /> Export CSV
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 mb-6 p-1 glass-card w-fit flex-wrap">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              activeTab === tab.id ? 'bg-lvf-accent/20 text-lvf-accent' : 'text-lvf-muted hover:text-lvf-text hover:bg-white/5'
            }`}>
            <tab.icon size={14} /> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'flock' && <FlockReport />}
      {activeTab === 'income' && <IncomeStatement />}
      {activeTab === 'balance' && <BalanceSheet />}

      {/* ═══════════ GROWER SCORECARD ═══════════ */}
      {activeTab === 'scorecard' && (
        <div className="space-y-4">
          {scorecard.map(g => (
            <div key={g.grower_id} className="glass-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="font-semibold text-lg">{g.grower_name}</h4>
                  <p className="text-xs text-lvf-muted">{g.location}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-lvf-muted">{g.num_barns} barns</span>
                  <span className="text-xs text-lvf-muted">{g.active_flocks} active flocks</span>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                <div className="glass-card p-3 text-center">
                  <p className="text-[10px] text-lvf-muted">Birds</p>
                  <p className="text-lg font-bold">{g.total_birds.toLocaleString()}</p>
                </div>
                <div className="glass-card p-3 text-center">
                  <p className="text-[10px] text-lvf-muted">Avg Prod %</p>
                  <p className={`text-lg font-bold ${g.avg_production_pct >= 80 ? 'text-lvf-success' : g.avg_production_pct >= 60 ? 'text-lvf-warning' : 'text-lvf-danger'}`}>
                    {g.avg_production_pct}%
                  </p>
                </div>
                <div className="glass-card p-3 text-center">
                  <p className="text-[10px] text-lvf-muted">Eggs</p>
                  <p className="text-lg font-bold">{g.total_eggs.toLocaleString()}</p>
                </div>
                <div className="glass-card p-3 text-center">
                  <p className="text-[10px] text-lvf-muted">Mortality</p>
                  <p className={`text-lg font-bold ${g.mortality_pct > 5 ? 'text-lvf-danger' : 'text-lvf-success'}`}>
                    {g.mortality_pct}%
                  </p>
                </div>
                <div className="glass-card p-3 text-center">
                  <p className="text-[10px] text-lvf-muted">Expenses</p>
                  <p className="text-lg font-bold text-lvf-danger">${g.total_expenses.toLocaleString()}</p>
                </div>
                <div className="glass-card p-3 text-center">
                  <p className="text-[10px] text-lvf-muted">Revenue</p>
                  <p className="text-lg font-bold text-lvf-success">${g.total_revenue.toLocaleString()}</p>
                </div>
                <div className="glass-card p-3 text-center">
                  <p className="text-[10px] text-lvf-muted">Net Profit</p>
                  <p className={`text-lg font-bold ${g.net_profit >= 0 ? 'text-lvf-success' : 'text-lvf-danger'}`}>
                    ${g.net_profit.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
          {scorecard.length === 0 && (
            <div className="glass-card p-8 text-center text-lvf-muted">No grower data available.</div>
          )}
        </div>
      )}

      {/* ═══════════ FARM P&L ═══════════ */}
      {activeTab === 'farmpnl' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex gap-1 p-1 glass-card">
              {['monthly', 'quarterly', 'yearly'].map(p => (
                <button key={p} onClick={() => setPnlPeriod(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    pnlPeriod === p ? 'bg-lvf-accent/20 text-lvf-accent' : 'text-lvf-muted hover:text-lvf-text'
                  }`}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
            <div className="w-32">
              <SearchSelect options={yearOptions}
                value={yearOptions.find(o => o.value === pnlYear)}
                onChange={(opt) => setPnlYear(opt?.value || new Date().getFullYear())} />
            </div>
          </div>

          {farmPnl && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="glass-card stat-glow p-4 text-center">
                  <p className="text-xs text-lvf-muted mb-1">Total Revenue</p>
                  <p className="text-2xl font-bold text-lvf-success">${farmPnl.total_revenue.toLocaleString()}</p>
                </div>
                <div className="glass-card stat-glow p-4 text-center">
                  <p className="text-xs text-lvf-muted mb-1">Total Expenses</p>
                  <p className="text-2xl font-bold text-lvf-danger">${farmPnl.total_expenses.toLocaleString()}</p>
                </div>
                <div className="glass-card stat-glow p-4 text-center">
                  <p className="text-xs text-lvf-muted mb-1">Net Income</p>
                  <p className={`text-2xl font-bold ${farmPnl.total_net_income >= 0 ? 'text-lvf-success' : 'text-lvf-danger'}`}>
                    ${farmPnl.total_net_income.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Chart */}
              <div className="glass-card p-5 mb-6">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={farmPnl.periods}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,160,255,0.08)" />
                    <XAxis dataKey="period" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => `$${v}`} />
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(15,23,42,0.95)', border: '1px solid rgba(100,160,255,0.15)', borderRadius: '0.75rem', fontSize: 12 }}
                      formatter={(v) => `$${v.toLocaleString()}`} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="revenue" fill="#34d399" name="Revenue" radius={[4,4,0,0]} />
                    <Bar dataKey="expenses" fill="#f87171" name="Expenses" radius={[4,4,0,0]} />
                    <ReferenceLine y={0} stroke="#94a3b8" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Table */}
              <div className="glass-card overflow-hidden">
                <table className="w-full glass-table">
                  <thead>
                    <tr><th>Period</th><th className="text-right">Revenue</th><th className="text-right">Expenses</th><th className="text-right">Net Income</th></tr>
                  </thead>
                  <tbody>
                    {farmPnl.periods.map(p => (
                      <tr key={p.period}>
                        <td className="font-medium">{p.period}</td>
                        <td className="text-right font-mono text-lvf-success">${p.revenue.toLocaleString()}</td>
                        <td className="text-right font-mono text-lvf-danger">${p.expenses.toLocaleString()}</td>
                        <td className={`text-right font-mono font-bold ${p.net_income >= 0 ? 'text-lvf-success' : 'text-lvf-danger'}`}>
                          ${p.net_income.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-lvf-border">
                      <td className="font-bold">TOTAL</td>
                      <td className="text-right font-mono font-bold text-lvf-success">${farmPnl.total_revenue.toLocaleString()}</td>
                      <td className="text-right font-mono font-bold text-lvf-danger">${farmPnl.total_expenses.toLocaleString()}</td>
                      <td className={`text-right font-mono font-bold ${farmPnl.total_net_income >= 0 ? 'text-lvf-success' : 'text-lvf-danger'}`}>
                        ${farmPnl.total_net_income.toLocaleString()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══════════ COST TRENDS ═══════════ */}
      {activeTab === 'costtrend' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <label className="text-sm text-lvf-muted">Months:</label>
            <div className="flex gap-1 p-1 glass-card">
              {[6, 12, 24].map(m => (
                <button key={m} onClick={() => setCostMonths(m)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    costMonths === m ? 'bg-lvf-accent/20 text-lvf-accent' : 'text-lvf-muted hover:text-lvf-text'
                  }`}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          {costTrend.length > 0 && (
            <>
              <div className="glass-card p-5 mb-6">
                <h4 className="text-sm font-semibold mb-3">Cost vs Revenue per Dozen</h4>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={costTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,160,255,0.08)" />
                    <XAxis dataKey="period" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => `$${v}`} />
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(15,23,42,0.95)', border: '1px solid rgba(100,160,255,0.15)', borderRadius: '0.75rem', fontSize: 12 }}
                      formatter={(v) => `$${v.toFixed(4)}`} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="cost_per_dozen" stroke="#f87171" strokeWidth={2} name="Cost/Doz" dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="revenue_per_dozen" stroke="#34d399" strokeWidth={2} name="Revenue/Doz" dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="margin_per_dozen" stroke="#60a5fa" strokeWidth={2} name="Margin/Doz" dot={{ r: 3 }} strokeDasharray="5 5" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="glass-card overflow-hidden">
                <table className="w-full glass-table">
                  <thead>
                    <tr>
                      <th>Period</th><th className="text-right">Expenses</th><th className="text-right">Eggs</th>
                      <th className="text-right">Dozens</th><th className="text-right">Cost/Doz</th>
                      <th className="text-right">Rev/Doz</th><th className="text-right">Margin/Doz</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costTrend.map(r => (
                      <tr key={r.period}>
                        <td className="font-medium">{r.period}</td>
                        <td className="text-right font-mono">${r.total_expenses.toLocaleString()}</td>
                        <td className="text-right font-mono text-lvf-muted">{r.total_eggs.toLocaleString()}</td>
                        <td className="text-right font-mono">{r.total_dozens.toLocaleString()}</td>
                        <td className="text-right font-mono text-lvf-danger">${r.cost_per_dozen.toFixed(4)}</td>
                        <td className="text-right font-mono text-lvf-success">${r.revenue_per_dozen.toFixed(4)}</td>
                        <td className={`text-right font-mono font-bold ${r.margin_per_dozen >= 0 ? 'text-lvf-success' : 'text-lvf-danger'}`}>
                          ${r.margin_per_dozen.toFixed(4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {costTrend.length === 0 && (
            <div className="glass-card p-8 text-center text-lvf-muted">No cost data available.</div>
          )}
        </div>
      )}

      {/* ═══════════ FLOCK COMPARISON ═══════════ */}
      {activeTab === 'flockcomp' && (
        <div>
          {flockComp.length > 0 && (
            <>
              {/* Top 3 summary */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                {flockComp.slice(0, 3).map((f, i) => (
                  <div key={f.flock_id} className="glass-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        i === 0 ? 'bg-lvf-success/20 text-lvf-success' :
                        i === 1 ? 'bg-lvf-accent/20 text-lvf-accent' :
                        'bg-lvf-warning/20 text-lvf-warning'
                      }`}>#{i + 1}</span>
                      <span className="font-semibold">{f.flock_number}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-lvf-muted">Net Profit</p>
                        <p className={`font-bold ${f.net_profit >= 0 ? 'text-lvf-success' : 'text-lvf-danger'}`}>
                          ${f.net_profit.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-lvf-muted">Profit/Bird</p>
                        <p className={`font-bold ${f.profit_per_bird >= 0 ? 'text-lvf-success' : 'text-lvf-danger'}`}>
                          ${f.profit_per_bird.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-lvf-muted">Prod %</p>
                        <p className="font-bold">{f.avg_production_pct}%</p>
                      </div>
                      <div>
                        <p className="text-lvf-muted">Cost/Doz</p>
                        <p className="font-bold">${f.cost_per_dozen.toFixed(4)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="glass-card overflow-hidden">
                <table className="w-full glass-table">
                  <thead>
                    <tr>
                      <th>Rank</th><th>Flock #</th><th>Status</th><th className="text-right">Birds</th>
                      <th className="text-right">Prod %</th><th className="text-right">Dozens</th>
                      <th className="text-right">Expenses</th><th className="text-right">Revenue</th>
                      <th className="text-right">Net Profit</th><th className="text-right">Cost/Doz</th>
                      <th className="text-right">$/Bird</th><th className="text-right">Mort %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flockComp.map((f, i) => (
                      <tr key={f.flock_id}>
                        <td className="font-bold text-lvf-accent">#{i + 1}</td>
                        <td className="font-semibold">{f.flock_number}</td>
                        <td>
                          <span className={`px-2 py-0.5 rounded-full text-xs ${
                            f.status === 'active' ? 'bg-lvf-success/20 text-lvf-success' :
                            f.status === 'closing' ? 'bg-lvf-warning/20 text-lvf-warning' :
                            'bg-lvf-muted/20 text-lvf-muted'
                          }`}>{f.status}</span>
                        </td>
                        <td className="text-right font-mono">{f.bird_count.toLocaleString()}</td>
                        <td className={`text-right font-mono ${f.avg_production_pct >= 80 ? 'text-lvf-success' : f.avg_production_pct >= 60 ? 'text-lvf-warning' : 'text-lvf-danger'}`}>
                          {f.avg_production_pct}%
                        </td>
                        <td className="text-right font-mono">{f.total_dozens.toLocaleString()}</td>
                        <td className="text-right font-mono text-lvf-danger">${f.total_expenses.toLocaleString()}</td>
                        <td className="text-right font-mono text-lvf-success">${f.total_revenue.toLocaleString()}</td>
                        <td className={`text-right font-mono font-bold ${f.net_profit >= 0 ? 'text-lvf-success' : 'text-lvf-danger'}`}>
                          ${f.net_profit.toLocaleString()}
                        </td>
                        <td className="text-right font-mono">${f.cost_per_dozen.toFixed(4)}</td>
                        <td className={`text-right font-mono ${f.profit_per_bird >= 0 ? 'text-lvf-success' : 'text-lvf-danger'}`}>
                          ${f.profit_per_bird.toFixed(2)}
                        </td>
                        <td className={`text-right font-mono ${f.mortality_pct > 5 ? 'text-lvf-danger' : 'text-lvf-success'}`}>
                          {f.mortality_pct}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {flockComp.length === 0 && (
            <div className="glass-card p-8 text-center text-lvf-muted">No layer flocks to compare.</div>
          )}
        </div>
      )}
    </div>
  )
}
