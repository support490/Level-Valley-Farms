import { useState, useEffect } from 'react'
import { Plus, TrendingUp } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine
} from 'recharts'
import { recordProduction, getProduction, getProductionChart, getProductionSummary } from '../api/production'
import { getFlocks } from '../api/flocks'
import SearchSelect from '../components/common/SearchSelect'
import Modal from '../components/common/Modal'
import Toast from '../components/common/Toast'
import useToast from '../hooks/useToast'

const CHART_COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#818cf8', '#fb923c', '#a78bfa', '#22d3ee']

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="glass-card p-3 text-sm">
      <p className="text-lvf-muted mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.dataKey}: <strong>{p.value.toFixed(1)}%</strong>
        </p>
      ))}
    </div>
  )
}

export default function Production() {
  const [flocks, setFlocks] = useState([])
  const [records, setRecords] = useState([])
  const [chartData, setChartData] = useState([])
  const [chartFlockNames, setChartFlockNames] = useState([])
  const [selectedFlocks, setSelectedFlocks] = useState([])
  const [summaries, setSummaries] = useState({})
  const [entryOpen, setEntryOpen] = useState(false)
  const [dateRange, setDateRange] = useState({ from: '', to: '' })
  const [submitting, setSubmitting] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  const [form, setForm] = useState({
    flock_id: '', record_date: new Date().toISOString().split('T')[0],
    bird_count: '', egg_count: '', cracked: 0, floor_eggs: 0, notes: ''
  })

  const load = async () => {
    const res = await getFlocks({ status: 'active' })
    setFlocks(res.data)
  }

  useEffect(() => { load() }, [])

  const flockOptions = flocks.map(f => ({
    value: f.id, label: `${f.flock_number} — ${f.current_bird_count} birds`
  }))
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

      // Merge all flock data into unified date-indexed array
      const flockNames = Object.keys(data)
      setChartFlockNames(flockNames)

      const dateMap = {}
      for (const [flockName, points] of Object.entries(data)) {
        for (const pt of points) {
          if (!dateMap[pt.record_date]) dateMap[pt.record_date] = { date: pt.record_date }
          dateMap[pt.record_date][flockName] = pt.production_pct
        }
      }

      const merged = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date))
      setChartData(merged)

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
  }, [selectedFlocks, dateRange])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    const birdCount = parseInt(form.bird_count)
    const eggCount = parseInt(form.egg_count)
    if (isNaN(birdCount) || birdCount <= 0) {
      showToast('Bird count must be a positive number', 'error')
      return
    }
    if (isNaN(eggCount) || eggCount < 0) {
      showToast('Egg count must be zero or positive', 'error')
      return
    }
    if (!form.flock_id) {
      showToast('Please select a flock', 'error')
      return
    }
    setSubmitting(true)
    try {
      await recordProduction({
        ...form,
        bird_count: birdCount,
        egg_count: eggCount,
        cracked: parseInt(form.cracked) || 0,
        floor_eggs: parseInt(form.floor_eggs) || 0,
      })
      const pct = birdCount > 0 ? (eggCount / birdCount * 100).toFixed(1) : 0
      showToast(`Production recorded: ${pct}%`)
      setEntryOpen(false)
      setForm(prev => ({ ...prev, bird_count: '', egg_count: '', cracked: 0, floor_eggs: 0, notes: '' }))

      // Refresh chart if this flock is selected
      if (selectedFlocks.some(f => f.value === form.flock_id)) {
        setSelectedFlocks([...selectedFlocks]) // trigger reload
      }
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // Auto-fill bird count from flock
  const handleFlockSelect = (opt) => {
    const flock = flocks.find(f => f.id === opt?.value)
    setForm(prev => ({
      ...prev,
      flock_id: opt?.value || '',
      bird_count: flock ? flock.current_bird_count : '',
    }))
  }

  const calcPct = () => {
    const birds = parseInt(form.bird_count) || 0
    const eggs = parseInt(form.egg_count) || 0
    return birds > 0 ? (eggs / birds * 100).toFixed(1) : '0.0'
  }

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Production</h2>
        <button onClick={() => setEntryOpen(true)} className="glass-button-primary flex items-center gap-2">
          <Plus size={16} /> Record Production
        </button>
      </div>

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
                <span>{s.total_days} days</span>
                <span>{s.total_cracked} cracked</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Chart controls */}
      <div className="flex flex-wrap gap-3 mb-4">
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
              <YAxis
                domain={[0, 100]}
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                tickLine={false}
                tickFormatter={v => `${v}%`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <ReferenceLine y={80} stroke="rgba(52,211,153,0.3)" strokeDasharray="5 5" label={{ value: 'Target 80%', fill: '#34d399', fontSize: 10 }} />
              {chartFlockNames.map((name, i) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-lvf-muted">
            Select flocks above to view production chart
          </div>
        )}
      </div>

      {/* Entry Modal */}
      <Modal isOpen={entryOpen} onClose={() => setEntryOpen(false)} title="Record Daily Production">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Flock *</label>
              <SearchSelect
                options={flockOptions}
                value={flockOptions.find(o => o.value === form.flock_id) || null}
                onChange={handleFlockSelect}
                placeholder="Select flock..."
              />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Date *</label>
              <input className="glass-input w-full" type="date" required value={form.record_date}
                onChange={e => setForm({ ...form, record_date: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Bird Count *</label>
              <input className="glass-input w-full" type="number" required min="1" value={form.bird_count}
                onChange={e => setForm({ ...form, bird_count: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Egg Count *</label>
              <input className="glass-input w-full" type="number" required min="0" value={form.egg_count}
                onChange={e => setForm({ ...form, egg_count: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Production %</label>
              <div className={`glass-input w-full text-center font-bold text-lg ${
                parseFloat(calcPct()) >= 80 ? 'text-lvf-success' :
                parseFloat(calcPct()) >= 60 ? 'text-lvf-warning' : 'text-lvf-danger'
              }`}>
                {calcPct()}%
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Cracked Eggs</label>
              <input className="glass-input w-full" type="number" min="0" value={form.cracked}
                onChange={e => setForm({ ...form, cracked: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Floor Eggs</label>
              <input className="glass-input w-full" type="number" min="0" value={form.floor_eggs}
                onChange={e => setForm({ ...form, floor_eggs: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="block text-sm text-lvf-muted mb-1">Notes</label>
            <textarea className="glass-input w-full" rows={2} value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setEntryOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">{submitting ? 'Recording...' : 'Record'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
