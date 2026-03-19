import { useState, useEffect } from 'react'
import { TrendingUp, AlertTriangle, ClipboardList } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine
} from 'recharts'
import {
  getProductionChart,
  getProductionSummary, getProductionAlerts, getBreedCurves,
  getWeeklyRecords, deleteWeeklyRecord,
} from '../api/production'
import { getFlocks } from '../api/flocks'
import SearchSelect from '../components/common/SearchSelect'
import Toast from '../components/common/Toast'
import useToast from '../hooks/useToast'
import WeeklyRecordWizard from '../components/production/WeeklyRecordWizard'

const CHART_COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#818cf8', '#fb923c', '#a78bfa', '#22d3ee']

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="glass-card p-3 text-sm">
      <p className="text-lvf-muted mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.dataKey}: <strong>{typeof p.value === 'number' ? p.value.toFixed(1) + '%' : p.value}</strong>
        </p>
      ))}
    </div>
  )
}

export default function Production() {
  const [flocks, setFlocks] = useState([])
  const [chartData, setChartData] = useState([])
  const [chartFlockNames, setChartFlockNames] = useState([])
  const [selectedFlocks, setSelectedFlocks] = useState([])
  const [summaries, setSummaries] = useState({})
  const [alerts, setAlerts] = useState([])
  const [breedCurves, setBreedCurves] = useState({})
  const [showBreedCurve, setShowBreedCurve] = useState(true)
  const [dateRange, setDateRange] = useState({ from: '', to: '' })
  const [weeklyRecords, setWeeklyRecords] = useState([])
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editRecord, setEditRecord] = useState(null)
  const { toast, showToast, hideToast } = useToast()

  const load = async () => {
    try {
      const [flocksRes, alertsRes, curvesRes] = await Promise.all([
        getFlocks({ status: 'active' }),
        getProductionAlerts().catch(() => ({ data: [] })),
        getBreedCurves().catch(() => ({ data: { curves: {} } })),
      ])
      setFlocks(flocksRes.data || [])
      setAlerts(alertsRes.data || [])
      setBreedCurves(curvesRes.data.curves || {})

      getWeeklyRecords().then(r => setWeeklyRecords(Array.isArray(r.data) ? r.data : [])).catch(() => {})
    } catch (err) {
      console.error('Production load error:', err)
    }
  }

  useEffect(() => { load() }, [])

  const flockMultiOptions = flocks.map(f => ({ value: f.id, label: f.flock_number }))

  // Load chart data when selected flocks change
  useEffect(() => {
    if (selectedFlocks.length === 0) {
      setChartData([])
      setChartFlockNames([])
      setSummaries({})
      return
    }

    const loadChart = async () => {
      const ids = selectedFlocks.map(f => f.value)
      const params = {}
      if (dateRange.from) params.date_from = dateRange.from
      if (dateRange.to) params.date_to = dateRange.to

      const chartRes = await getProductionChart(ids, params)
      const data = chartRes.data

      const flockNames = Object.keys(data)
      setChartFlockNames(flockNames)

      // Build breed curve data if showing
      const selectedFlockObjects = flocks.filter(f => ids.includes(f.id))

      const dateMap = {}
      for (const [flockName, points] of Object.entries(data)) {
        for (const pt of points) {
          if (!dateMap[pt.record_date]) dateMap[pt.record_date] = { date: pt.record_date }
          dateMap[pt.record_date][flockName] = pt.production_pct
        }
      }

      // Add breed curve data points if enabled
      if (showBreedCurve) {
        for (const flock of selectedFlockObjects) {
          if (!flock.breed || !flock.hatch_date) continue
          const breedKey = Object.keys(breedCurves).find(k =>
            k.toLowerCase().includes(flock.breed.toLowerCase()) ||
            flock.breed.toLowerCase().includes(k.toLowerCase())
          )
          if (!breedKey) continue
          const curve = breedCurves[breedKey]
          const hatchDate = new Date(flock.hatch_date)
          const curveName = `${flock.flock_number} (std)`

          for (const [dateStr, row] of Object.entries(dateMap)) {
            const recordDate = new Date(dateStr)
            const ageWeeks = Math.floor((recordDate - hatchDate) / (7 * 24 * 60 * 60 * 1000))
            const weeks = Object.keys(curve).map(Number).sort((a, b) => a - b)
            let expected = null
            for (const w of weeks) {
              if (w >= ageWeeks) { expected = curve[w]; break }
            }
            if (expected === null && weeks.length) expected = curve[weeks[weeks.length - 1]]
            if (expected !== null) row[curveName] = expected
          }

          if (!flockNames.includes(curveName)) flockNames.push(curveName)
        }
      }

      const merged = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date))
      setChartData(merged)
      setChartFlockNames(flockNames)

      // Load summaries
      const sums = {}
      for (const id of ids) {
        try {
          const sumRes = await getProductionSummary(id)
          sums[id] = sumRes.data
        } catch {}
      }
      setSummaries(sums)
    }
    loadChart()
  }, [selectedFlocks, dateRange, showBreedCurve])

  const alertColors = { danger: 'border-lvf-danger/30 bg-lvf-danger/10', warning: 'border-lvf-warning/30 bg-lvf-warning/10' }

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Production</h2>
        <div className="flex gap-2">
          <button onClick={() => setWizardOpen(true)} className="glass-button-primary flex items-center gap-2">
            <ClipboardList size={16} /> Weekly Record
          </button>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className={`glass-card p-3 border ${alertColors[a.severity] || ''} flex items-center gap-3`}>
              <AlertTriangle size={16} className={a.severity === 'danger' ? 'text-lvf-danger' : 'text-lvf-warning'} />
              <div className="flex-1">
                <span className="text-sm font-semibold text-lvf-accent">{a.flock_number}</span>
                <span className="text-sm text-lvf-muted ml-2">{a.message}</span>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                a.alert_type === 'production_drop' ? 'bg-lvf-danger/20 text-lvf-danger' :
                a.alert_type === 'mortality_spike' ? 'bg-lvf-danger/20 text-lvf-danger' :
                a.alert_type === 'below_breed_standard' ? 'bg-lvf-warning/20 text-lvf-warning' :
                'bg-lvf-danger/20 text-lvf-danger'
              }`}>{a.alert_type.replace(/_/g, ' ')}</span>
            </div>
          ))}
        </div>
      )}

      {/* Summary cards */}
      {Object.keys(summaries).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {Object.values(summaries).map(s => (
            <div key={s.flock_id} className="glass-card stat-glow p-4">
              <p className="text-xs text-lvf-muted mb-1">{s.flock_number}</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold text-lvf-accent">{s.current_production_pct}%</p>
                  <p className="text-[10px] text-lvf-muted">Current</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-lvf-success">{s.peak_production_pct}%</p>
                  <p className="text-[10px] text-lvf-muted">Peak</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-lvf-warning">{s.avg_production_pct}%</p>
                  <p className="text-[10px] text-lvf-muted">Average</p>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-lvf-border/30 flex justify-between text-[10px] text-lvf-muted">
                <span>{s.total_eggs.toLocaleString()} eggs</span>
                <span>{s.total_days} entries</span>
                <span>{s.total_cracked} cracked</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Chart controls */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <div className="w-80">
          <SearchSelect
            options={flockMultiOptions}
            value={selectedFlocks}
            onChange={(opts) => setSelectedFlocks(opts || [])}
            placeholder="Select flocks to chart..."
            isMulti
          />
        </div>
        <input type="date" className="glass-input" value={dateRange.from}
          onChange={e => setDateRange(prev => ({ ...prev, from: e.target.value }))} />
        <input type="date" className="glass-input" value={dateRange.to}
          onChange={e => setDateRange(prev => ({ ...prev, to: e.target.value }))} />
        <label className="flex items-center gap-2 text-sm text-lvf-muted cursor-pointer ml-2">
          <input type="checkbox" checked={showBreedCurve} onChange={e => setShowBreedCurve(e.target.checked)}
            className="rounded border-lvf-border" />
          Show breed standard curve
        </label>
      </div>

      {/* Production Chart */}
      <div className="glass-card p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={18} className="text-lvf-accent" />
          <h3 className="font-semibold">Production % Over Time</h3>
        </div>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,160,255,0.1)" />
              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} tickFormatter={v => `${v}%`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <ReferenceLine y={80} stroke="rgba(52,211,153,0.3)" strokeDasharray="5 5" label={{ value: 'Target 80%', fill: '#34d399', fontSize: 10 }} />
              {chartFlockNames.map((name, i) => {
                const isStd = name.endsWith('(std)')
                return (
                  <Line
                    key={name} type="monotone" dataKey={name}
                    stroke={isStd ? CHART_COLORS[i % CHART_COLORS.length] : CHART_COLORS[i % CHART_COLORS.length]}
                    strokeWidth={isStd ? 1 : 2}
                    strokeDasharray={isStd ? '5 5' : undefined}
                    dot={isStd ? false : { r: 3 }}
                    activeDot={isStd ? false : { r: 5 }}
                    opacity={isStd ? 0.5 : 1}
                  />
                )
              })}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-lvf-muted">
            Select flocks above to view production chart
          </div>
        )}
      </div>



      {/* Weekly Records Section */}
      <div className="mt-8">
        <h3 className="text-lg font-semibold mb-3">Weekly Records</h3>
        {weeklyRecords.length > 0 ? (
          <div className="glass-card overflow-hidden">
            <table className="w-full glass-table">
              <thead>
                <tr>
                  <th>Flock</th>
                  <th>Date Range</th>
                  <th>Birds</th>
                  <th>Production %</th>
                  <th>Eggs</th>
                  <th>Mortality</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {weeklyRecords.map(r => (
                  <tr key={r.id}>
                    <td className="font-semibold text-lvf-accent">{r.flock_number || '—'}</td>
                    <td className="text-xs">{r.start_date} — {r.end_date}</td>
                    <td>{r.starting_bird_count?.toLocaleString()} → {r.ending_bird_count?.toLocaleString()}</td>
                    <td className={`font-medium ${
                      (r.percent_production || 0) >= 80 ? 'text-lvf-success' :
                      (r.percent_production || 0) >= 60 ? 'text-lvf-warning' : 'text-lvf-danger'
                    }`}>{r.percent_production ? `${r.percent_production}%` : '—'}</td>
                    <td>{r.total_egg_production?.toLocaleString()}</td>
                    <td className="text-lvf-danger">{(r.total_mortality || 0) + (r.total_culls || 0)}</td>
                    <td>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        r.status === 'submitted' ? 'bg-lvf-success/20 text-lvf-success' : 'bg-lvf-warning/20 text-lvf-warning'
                      }`}>{r.status}</span>
                    </td>
                    <td>
                      <button onClick={() => { setEditRecord(r); setWizardOpen(true) }}
                        className="text-xs text-lvf-accent hover:underline">View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="glass-card p-8 text-center text-lvf-muted">No weekly records yet. Click "Weekly Record" to create one.</div>
        )}
      </div>

      {/* Weekly Record Wizard Modal */}
      {wizardOpen && (
        <WeeklyRecordWizard
          onClose={() => { setWizardOpen(false); setEditRecord(null) }}
          onSaved={() => { load(); getWeeklyRecords().then(r => setWeeklyRecords(Array.isArray(r.data) ? r.data : [])).catch(() => {}) }}
          editRecord={editRecord}
          showToast={showToast}
        />
      )}
    </div>
  )
}
