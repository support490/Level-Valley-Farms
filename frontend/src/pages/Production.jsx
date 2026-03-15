import { useState, useEffect } from 'react'
import { Plus, TrendingUp, AlertTriangle, ClipboardList } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine
} from 'recharts'
import {
  recordProduction, recordBulkProduction, getProductionChart,
  getProductionSummary, getProductionAlerts, getBreedCurves
} from '../api/production'
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
  const [entryOpen, setEntryOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [dateRange, setDateRange] = useState({ from: '', to: '' })
  const [submitting, setSubmitting] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  const [form, setForm] = useState({
    flock_id: '', record_date: new Date().toISOString().split('T')[0],
    bird_count: '', egg_count: '', cracked: 0, floor_eggs: 0, notes: ''
  })

  const [bulkForm, setBulkForm] = useState({
    record_date: new Date().toISOString().split('T')[0],
    entries: []
  })

  const load = async () => {
    const [flocksRes, alertsRes, curvesRes] = await Promise.all([
      getFlocks({ status: 'active' }),
      getProductionAlerts().catch(() => ({ data: [] })),
      getBreedCurves().catch(() => ({ data: { curves: {} } })),
    ])
    setFlocks(flocksRes.data)
    setAlerts(alertsRes.data)
    setBreedCurves(curvesRes.data.curves || {})
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

  // ── Single entry ──
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    const birdCount = parseInt(form.bird_count)
    const eggCount = parseInt(form.egg_count)
    if (isNaN(birdCount) || birdCount <= 0) return showToast('Bird count required', 'error')
    if (isNaN(eggCount) || eggCount < 0) return showToast('Egg count required', 'error')
    if (!form.flock_id) return showToast('Select a flock', 'error')
    setSubmitting(true)
    try {
      await recordProduction({
        ...form, bird_count: birdCount, egg_count: eggCount,
        cracked: parseInt(form.cracked) || 0, floor_eggs: parseInt(form.floor_eggs) || 0,
      })
      const pct = birdCount > 0 ? (eggCount / birdCount * 100).toFixed(1) : 0
      showToast(`Production recorded: ${pct}%`)
      setEntryOpen(false)
      setForm(prev => ({ ...prev, bird_count: '', egg_count: '', cracked: 0, floor_eggs: 0, notes: '' }))
      if (selectedFlocks.some(f => f.value === form.flock_id)) setSelectedFlocks([...selectedFlocks])
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    } finally { setSubmitting(false) }
  }

  // ── Bulk entry ──
  const openBulk = () => {
    const layerFlocks = flocks.filter(f => f.flock_type === 'layer')
    setBulkForm({
      record_date: new Date().toISOString().split('T')[0],
      entries: layerFlocks.map(f => ({
        flock_id: f.id,
        flock_number: f.flock_number,
        bird_count: f.current_bird_count,
        egg_count: '',
        cracked: 0,
        floor_eggs: 0,
        notes: '',
        _include: true,
      }))
    })
    setBulkOpen(true)
  }

  const handleBulkSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    const entries = bulkForm.entries
      .filter(e => e._include && parseInt(e.egg_count) >= 0)
      .map(e => ({
        flock_id: e.flock_id,
        bird_count: parseInt(e.bird_count),
        egg_count: parseInt(e.egg_count) || 0,
        cracked: parseInt(e.cracked) || 0,
        floor_eggs: parseInt(e.floor_eggs) || 0,
        notes: e.notes || undefined,
      }))

    if (entries.length === 0) return showToast('No entries to record', 'error')
    setSubmitting(true)
    try {
      const res = await recordBulkProduction({ record_date: bulkForm.record_date, entries })
      showToast(`Recorded production for ${res.data.recorded.length} flocks`)
      setBulkOpen(false)
      if (selectedFlocks.length > 0) setSelectedFlocks([...selectedFlocks])
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    } finally { setSubmitting(false) }
  }

  const updateBulkEntry = (idx, field, value) => {
    const entries = [...bulkForm.entries]
    entries[idx] = { ...entries[idx], [field]: value }
    setBulkForm({ ...bulkForm, entries })
  }

  const handleFlockSelect = (opt) => {
    const flock = flocks.find(f => f.id === opt?.value)
    setForm(prev => ({
      ...prev, flock_id: opt?.value || '',
      bird_count: flock ? flock.current_bird_count : '',
    }))
  }

  const calcPct = (birds, eggs) => {
    const b = parseInt(birds) || 0
    const e = parseInt(eggs) || 0
    return b > 0 ? (e / b * 100).toFixed(1) : '0.0'
  }

  const alertColors = { danger: 'border-lvf-danger/30 bg-lvf-danger/10', warning: 'border-lvf-warning/30 bg-lvf-warning/10' }

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Production</h2>
        <div className="flex gap-2">
          <button onClick={openBulk} className="glass-button-secondary flex items-center gap-2">
            <ClipboardList size={16} /> Bulk Entry
          </button>
          <button onClick={() => setEntryOpen(true)} className="glass-button-primary flex items-center gap-2">
            <Plus size={16} /> Record Production
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

      {/* Single Entry Modal */}
      <Modal isOpen={entryOpen} onClose={() => setEntryOpen(false)} title="Record Production">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Flock *</label>
              <SearchSelect options={flockOptions}
                value={flockOptions.find(o => o.value === form.flock_id) || null}
                onChange={handleFlockSelect} placeholder="Select flock..." />
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
                parseFloat(calcPct(form.bird_count, form.egg_count)) >= 80 ? 'text-lvf-success' :
                parseFloat(calcPct(form.bird_count, form.egg_count)) >= 60 ? 'text-lvf-warning' : 'text-lvf-danger'
              }`}>{calcPct(form.bird_count, form.egg_count)}%</div>
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

      {/* Bulk Entry Modal */}
      <Modal isOpen={bulkOpen} onClose={() => setBulkOpen(false)} title="Bulk Production Entry" size="xl">
        <form onSubmit={handleBulkSubmit} className="space-y-4">
          <div className="flex items-center gap-4 mb-2">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Entry Date</label>
              <input className="glass-input" type="date" required value={bulkForm.record_date}
                onChange={e => setBulkForm({ ...bulkForm, record_date: e.target.value })} />
            </div>
            <p className="text-sm text-lvf-muted mt-5">
              Enter production for all active layer flocks at once. Uncheck flocks you don't want to record.
            </p>
          </div>

          <div className="glass-card overflow-hidden max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-lvf-dark">
                <tr className="border-b border-lvf-border/30">
                  <th className="text-left p-2 w-8"></th>
                  <th className="text-left p-2">Flock</th>
                  <th className="text-right p-2 w-24">Birds</th>
                  <th className="text-right p-2 w-28">Eggs *</th>
                  <th className="text-right p-2 w-20">%</th>
                  <th className="text-right p-2 w-20">Cracked</th>
                  <th className="text-right p-2 w-20">Floor</th>
                </tr>
              </thead>
              <tbody>
                {bulkForm.entries.map((entry, i) => {
                  const pct = calcPct(entry.bird_count, entry.egg_count)
                  return (
                    <tr key={entry.flock_id} className={`border-b border-lvf-border/10 ${!entry._include ? 'opacity-40' : ''}`}>
                      <td className="p-2">
                        <input type="checkbox" checked={entry._include}
                          onChange={e => updateBulkEntry(i, '_include', e.target.checked)} />
                      </td>
                      <td className="p-2 font-medium text-lvf-accent">{entry.flock_number}</td>
                      <td className="p-2">
                        <input className="glass-input w-full text-right" type="number" min="1"
                          value={entry.bird_count}
                          onChange={e => updateBulkEntry(i, 'bird_count', e.target.value)}
                          disabled={!entry._include} />
                      </td>
                      <td className="p-2">
                        <input className="glass-input w-full text-right" type="number" min="0"
                          placeholder="Eggs"
                          value={entry.egg_count}
                          onChange={e => updateBulkEntry(i, 'egg_count', e.target.value)}
                          disabled={!entry._include} />
                      </td>
                      <td className="p-2 text-center">
                        <span className={`font-bold ${
                          parseFloat(pct) >= 80 ? 'text-lvf-success' :
                          parseFloat(pct) >= 60 ? 'text-lvf-warning' : 'text-lvf-danger'
                        }`}>{entry.egg_count ? `${pct}%` : '—'}</span>
                      </td>
                      <td className="p-2">
                        <input className="glass-input w-full text-right" type="number" min="0"
                          value={entry.cracked}
                          onChange={e => updateBulkEntry(i, 'cracked', e.target.value)}
                          disabled={!entry._include} />
                      </td>
                      <td className="p-2">
                        <input className="glass-input w-full text-right" type="number" min="0"
                          value={entry.floor_eggs}
                          onChange={e => updateBulkEntry(i, 'floor_eggs', e.target.value)}
                          disabled={!entry._include} />
                      </td>
                    </tr>
                  )
                })}
                {bulkForm.entries.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-8 text-lvf-muted">No active layer flocks.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setBulkOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">
              {submitting ? 'Recording...' : `Record ${bulkForm.entries.filter(e => e._include && e.egg_count).length} Entries`}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
