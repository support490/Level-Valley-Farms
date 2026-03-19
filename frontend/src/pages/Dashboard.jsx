import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bird, Egg, TrendingUp, DollarSign, Building2, Warehouse, AlertTriangle, AlertCircle, Info, Activity, ClipboardList } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { getDashboardStats, getRecentActivity, getAlerts } from '../api/dashboard'
import WeeklyRecordWizard from '../components/production/WeeklyRecordWizard'
import { getProductionChart } from '../api/production'
import { getFlocks } from '../api/flocks'
import {
  LineChart, Line, Legend
} from 'recharts'

const CHART_COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#818cf8']

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [activity, setActivity] = useState([])
  const [alerts, setAlerts] = useState([])
  const [prodData, setProdData] = useState([])
  const [prodFlocks, setProdFlocks] = useState([])
  const navigate = useNavigate()

  const load = async () => {
    try {
      const [statsRes, activityRes, alertsRes, flocksRes] = await Promise.all([
        getDashboardStats(),
        getRecentActivity(),
        getAlerts(),
        getFlocks({ status: 'active' }),
      ])
      setStats(statsRes.data)
      setActivity(activityRes.data || [])
      setAlerts(alertsRes.data || [])

      // Load production chart for active flocks
      const activeFlocks = (flocksRes.data || []).slice(0, 5)
      if (activeFlocks.length > 0) {
        const ids = activeFlocks.map(f => f.id)
        const chartRes = await getProductionChart(ids)
        const data = chartRes.data
        const flockNames = Object.keys(data)
        setProdFlocks(flockNames)

        const dateMap = {}
        for (const [name, points] of Object.entries(data)) {
          for (const pt of points) {
            if (!dateMap[pt.record_date]) dateMap[pt.record_date] = { date: pt.record_date }
            dateMap[pt.record_date][name] = pt.production_pct
          }
        }
        setProdData(Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date)))
      }
    } catch (err) {
      console.error('Dashboard load error:', err)
    }
  }

  useEffect(() => { load() }, [])

  const fmt = (val) => `$${val.toLocaleString('en-US', { minimumFractionDigits: 2 })}`

  const alertIcon = (type) => {
    if (type === 'danger') return <AlertTriangle size={14} className="text-lvf-danger" />
    if (type === 'warning') return <AlertCircle size={14} className="text-lvf-warning" />
    return <Info size={14} className="text-lvf-accent" />
  }

  const alertColor = (type) => {
    if (type === 'danger') return 'border-lvf-danger/30 bg-lvf-danger/5'
    if (type === 'warning') return 'border-lvf-warning/30 bg-lvf-warning/5'
    return 'border-lvf-accent/30 bg-lvf-accent/5'
  }

  const [wizardOpen, setWizardOpen] = useState(false)

  if (!stats) return <div className="text-center py-12 text-lvf-muted">Loading dashboard...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <button onClick={() => setWizardOpen(true)} className="glass-button-primary flex items-center gap-2">
          <ClipboardList size={16} /> Enter Production Records
        </button>
      </div>

      {wizardOpen && (
        <WeeklyRecordWizard
          onClose={() => setWizardOpen(false)}
          onSaved={() => load()}
          showToast={() => {}}
        />
      )}

      {/* Stat Cards - Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { label: 'Active Flocks', value: stats.active_flocks, icon: Bird, color: 'text-lvf-accent', path: '/flocks' },
          { label: 'Total Birds', value: stats.total_birds.toLocaleString(), icon: Bird, color: 'text-lvf-success', path: '/flocks' },
          { label: 'Production %', value: `${stats.avg_production_pct}%`, icon: TrendingUp, color: stats.avg_production_pct >= 80 ? 'text-lvf-success' : stats.avg_production_pct >= 60 ? 'text-lvf-warning' : 'text-lvf-danger', path: '/production' },
          { label: 'Egg Inventory', value: `${stats.total_egg_skids || 0} skids`, icon: Egg, color: 'text-lvf-accent2', path: '/warehouse' },
          { label: 'Growers', value: stats.active_growers, icon: Building2, color: 'text-lvf-text', path: '/growers' },
          { label: 'Barns', value: stats.active_barns, icon: Warehouse, color: 'text-lvf-text', path: '/growers' },
        ].map(({ label, value, icon: Icon, color, path }) => (
          <div key={label} className="glass-card stat-glow p-4 cursor-pointer hover:scale-[1.02] transition-transform" onClick={() => navigate(path)}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] text-lvf-muted uppercase tracking-wider">{label}</p>
              <Icon size={14} className="text-lvf-muted/50" />
            </div>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Financial Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <div className="glass-card stat-glow p-4 cursor-pointer hover:scale-[1.02] transition-transform" onClick={() => navigate('/accounting')}>
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={14} className="text-lvf-success" />
            <p className="text-xs text-lvf-muted">Total Revenue</p>
          </div>
          <p className="text-xl font-bold text-lvf-success">{fmt(stats.total_revenue)}</p>
        </div>
        <div className="glass-card stat-glow p-4 cursor-pointer hover:scale-[1.02] transition-transform" onClick={() => navigate('/accounting')}>
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={14} className="text-lvf-danger" />
            <p className="text-xs text-lvf-muted">Total Expenses</p>
          </div>
          <p className="text-xl font-bold text-lvf-danger">{fmt(stats.total_expenses)}</p>
        </div>
        <div className="glass-card stat-glow p-4 cursor-pointer hover:scale-[1.02] transition-transform" onClick={() => navigate('/accounting')}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={14} className={stats.net_income >= 0 ? 'text-lvf-success' : 'text-lvf-danger'} />
            <p className="text-xs text-lvf-muted">Net Income</p>
          </div>
          <p className={`text-xl font-bold ${stats.net_income >= 0 ? 'text-lvf-success' : 'text-lvf-danger'}`}>
            {fmt(stats.net_income)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Production Chart */}
        <div className="lg:col-span-2 glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={16} className="text-lvf-accent" />
            <h3 className="font-semibold text-sm">Production Overview</h3>
          </div>
          {prodData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={prodData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,160,255,0.08)" />
                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => `${v}%`} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(15,23,42,0.95)', border: '1px solid rgba(100,160,255,0.15)', borderRadius: '0.75rem', fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {prodFlocks.map((name, i) => (
                  <Line key={name} type="monotone" dataKey={name} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 2 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-lvf-muted text-sm">
              No production data yet. Record daily production to see charts.
            </div>
          )}
        </div>

        {/* Alerts */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={16} className="text-lvf-warning" />
            <h3 className="font-semibold text-sm">Alerts</h3>
          </div>
          {alerts.length > 0 ? (
            <div className="space-y-2">
              {alerts.map((alert, i) => (
                <div key={i} className={`p-3 rounded-xl border cursor-pointer ${alertColor(alert.type)}`} onClick={() => {
                  if (alert.title === 'Low Production' && alert.flock_id) navigate(`/flocks/${alert.flock_id}`)
                  else if (alert.title === 'High Capacity') navigate('/growers')
                  else if (alert.title === 'Unposted Entries') navigate('/accounting')
                }}>
                  <div className="flex items-center gap-2 mb-0.5">
                    {alertIcon(alert.type)}
                    <span className="text-xs font-semibold">{alert.title}</span>
                  </div>
                  <p className="text-xs text-lvf-muted pl-5">{alert.message}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-sm text-lvf-muted">
              No alerts. Everything looks good.
            </div>
          )}

          {/* Mortality quick stat */}
          <div className="mt-4 pt-4 border-t border-lvf-border/30 cursor-pointer hover:bg-lvf-accent/5 rounded-xl" onClick={() => navigate('/flocks')}>
            <div className="flex items-center gap-2 mb-2">
              <Activity size={14} className="text-lvf-muted" />
              <span className="text-xs text-lvf-muted">Total Mortality</span>
            </div>
            <div className="flex gap-4 text-sm">
              <span className="text-lvf-danger">{stats.total_deaths} deaths</span>
              <span className="text-lvf-warning">{stats.total_culls} culls</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} className="text-lvf-accent" />
          <h3 className="font-semibold text-sm">Recent Activity</h3>
        </div>
        {activity.length > 0 ? (
          <div className="space-y-2">
            {activity.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-lvf-border/20 last:border-0 cursor-pointer" onClick={() => {
                if (item.type === 'journal') navigate('/accounting')
                else if (item.type === 'mortality' && item.flock_id) navigate(`/flocks/${item.flock_id}`)
              }}>
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    item.type === 'journal' ? 'bg-lvf-accent' :
                    item.type === 'mortality' ? 'bg-lvf-danger' : 'bg-lvf-success'
                  }`} />
                  <div>
                    <p className="text-sm">{item.description}</p>
                    <div className="flex gap-2 text-[10px] text-lvf-muted">
                      <span>{item.date}</span>
                      {item.flock_number && <span>Flock {item.flock_number}</span>}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono">{item.detail}</p>
                  <span className={`text-[10px] ${
                    item.status === 'posted' ? 'text-lvf-success' :
                    item.status === 'draft' ? 'text-lvf-warning' : 'text-lvf-muted'
                  }`}>{item.status}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-lvf-muted text-center py-6">No recent activity</p>
        )}
      </div>
    </div>
  )
}
