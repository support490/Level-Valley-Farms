import { useState, useEffect, useMemo } from 'react'
import { X, ChevronLeft, ChevronRight, Save, Send } from 'lucide-react'
import { getFlocks } from '../../api/flocks'
import { getBarns } from '../../api/barns'
import { createWeeklyRecord, updateWeeklyRecord } from '../../api/production'
import SearchSelect from '../common/SearchSelect'

const STEPS = [
  'Header',
  'Production Log',
  'Feed Log',
  'Environmental',
  'Equipment & Facility',
  'Eggs Shipped',
  'Review & Submit',
]

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getDatesInRange(start, end) {
  const dates = []
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  while (s <= e) {
    const iso = s.toISOString().split('T')[0]
    dates.push({ date: iso, day_name: DAY_NAMES[s.getDay()] })
    s.setDate(s.getDate() + 1)
  }
  return dates
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

const emptyForm = () => ({
  flock_id: '', barn_id: '', grower_name: '',
  start_date: new Date().toISOString().split('T')[0],
  end_date: addDays(new Date().toISOString().split('T')[0], 6),
  starting_bird_count: '', bird_weight: '',
  comments: '',
  production_logs: [],
  feed_logs: [],
  fly_logs: [],
  rodent_logs: [],
  foot_bath_logs: [],
  ammonia_logs: [],
  generator_logs: [],
  eggs_shipped_logs: [],
  alarm_check_logs: [],
  pit_logs: [],
  cooler_temp_logs: [],
})

export default function WeeklyRecordWizard({ onClose, onSaved, editRecord = null, showToast }) {
  const [step, setStep] = useState(0)
  const [formData, setFormData] = useState(editRecord ? { ...editRecord } : emptyForm())
  const [flocks, setFlocks] = useState([])
  const [barns, setBarns] = useState([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    Promise.all([getFlocks({ status: 'active' }), getBarns()])
      .then(([f, b]) => { setFlocks(f.data); setBarns(b.data) })
  }, [])

  const dates = useMemo(() =>
    getDatesInRange(formData.start_date, formData.end_date),
    [formData.start_date, formData.end_date]
  )

  // Sync production_logs and feed_logs rows with date range
  useEffect(() => {
    if (dates.length === 0) return
    setFormData(prev => {
      const newProd = dates.map(d => {
        const existing = prev.production_logs.find(p => p.date === d.date)
        return existing || { date: d.date, day_name: d.day_name, initial_am: '', initial_pm: '', cull_count: 0, cull_reason: '', mortality_count: 0, mortality_reason: '', egg_production: 0, egg_inventory: 0, case_weight: '', temp_high: '', temp_low: '', water_gallons: '' }
      })
      const newFeed = dates.map(d => {
        const existing = prev.feed_logs.find(f => f.date === d.date)
        return existing || { date: d.date, lbs_feed_day: '', lbs_per_100: '', feed_inventory: '', feed_delivered: '', outdoor_access: false, outdoor_access_hours: '', outside_temp: '', initial: '', no_access_reason: '' }
      })
      const newShipped = dates.map(d => {
        const existing = prev.eggs_shipped_logs.find(e => e.date === d.date)
        return existing || { date: d.date, dozens: '' }
      })
      return { ...prev, production_logs: newProd, feed_logs: newFeed, eggs_shipped_logs: newShipped }
    })
  }, [dates.length, formData.start_date])

  const handleFlockSelect = (flockId) => {
    const flock = flocks.find(f => f.id === flockId)
    if (!flock) return
    const barn = barns.find(b => b.id === flock.current_barn_id)
    setFormData(prev => ({
      ...prev,
      flock_id: flockId,
      barn_id: flock.current_barn_id || '',
      grower_name: flock.current_grower || '',
      starting_bird_count: flock.current_bird_count || '',
      bird_weight: flock.bird_weight || '',
    }))
  }

  const updateField = (field, value) => setFormData(prev => ({ ...prev, [field]: value }))

  const updateLogRow = (logKey, idx, field, value) => {
    setFormData(prev => ({
      ...prev,
      [logKey]: prev[logKey].map((row, i) => i === idx ? { ...row, [field]: value } : row),
    }))
  }

  const addLogRow = (logKey, template) => {
    setFormData(prev => ({
      ...prev,
      [logKey]: [...prev[logKey], { date: formData.start_date, ...template }],
    }))
  }

  const removeLogRow = (logKey, idx) => {
    setFormData(prev => ({
      ...prev,
      [logKey]: prev[logKey].filter((_, i) => i !== idx),
    }))
  }

  // Compute summaries
  const summaries = useMemo(() => {
    const pl = formData.production_logs
    const fl = formData.feed_logs
    const numDays = dates.length || 1
    const totalCulls = pl.reduce((s, r) => s + (parseInt(r.cull_count) || 0), 0)
    const totalMort = pl.reduce((s, r) => s + (parseInt(r.mortality_count) || 0), 0)
    const totalEggs = pl.reduce((s, r) => s + (parseInt(r.egg_production) || 0), 0)
    const totalWater = pl.reduce((s, r) => s + (parseFloat(r.water_gallons) || 0), 0)
    const caseWeights = pl.map(r => parseFloat(r.case_weight)).filter(v => !isNaN(v) && v > 0)
    const tempHighs = pl.map(r => parseFloat(r.temp_high)).filter(v => !isNaN(v))
    const tempLows = pl.map(r => parseFloat(r.temp_low)).filter(v => !isNaN(v))
    const startBirds = parseInt(formData.starting_bird_count) || 0
    const endBirds = startBirds - totalCulls - totalMort

    const feedDays = fl.map(r => parseFloat(r.lbs_feed_day)).filter(v => !isNaN(v) && v > 0)
    const feedPer100 = fl.map(r => parseFloat(r.lbs_per_100)).filter(v => !isNaN(v) && v > 0)
    const feedDelivered = fl.reduce((s, r) => s + (parseFloat(r.feed_delivered) || 0), 0)
    const feedInvs = fl.map(r => parseFloat(r.feed_inventory)).filter(v => !isNaN(v))

    return {
      totalCulls, totalMort, totalEggs, totalWater,
      endBirds,
      pctProduction: startBirds > 0 && numDays > 0 ? (totalEggs / (startBirds * numDays) * 100).toFixed(1) : 0,
      galPer100: startBirds > 0 && numDays > 0 && totalWater > 0 ? (totalWater / (startBirds / 100) / numDays).toFixed(2) : 0,
      avgCaseWeight: caseWeights.length > 0 ? (caseWeights.reduce((a, b) => a + b, 0) / caseWeights.length).toFixed(1) : '—',
      avgTempHigh: tempHighs.length > 0 ? (tempHighs.reduce((a, b) => a + b, 0) / tempHighs.length).toFixed(1) : '—',
      avgTempLow: tempLows.length > 0 ? (tempLows.reduce((a, b) => a + b, 0) / tempLows.length).toFixed(1) : '—',
      avgFeedDay: feedDays.length > 0 ? (feedDays.reduce((a, b) => a + b, 0) / feedDays.length).toFixed(1) : '—',
      avgFeedPer100: feedPer100.length > 0 ? (feedPer100.reduce((a, b) => a + b, 0) / feedPer100.length).toFixed(1) : '—',
      totalFeedDelivered: feedDelivered.toFixed(1),
      endFeedInventory: feedInvs.length > 0 ? feedInvs[feedInvs.length - 1].toFixed(1) : '—',
    }
  }, [formData.production_logs, formData.feed_logs, formData.starting_bird_count, dates.length])

  const handleSave = async (status) => {
    if (submitting) return
    setSubmitting(true)
    try {
      const payload = {
        ...formData,
        starting_bird_count: parseInt(formData.starting_bird_count) || 0,
        bird_weight: parseFloat(formData.bird_weight) || null,
        status,
        production_logs: formData.production_logs.map(r => ({
          ...r, cull_count: parseInt(r.cull_count) || 0, mortality_count: parseInt(r.mortality_count) || 0,
          egg_production: parseInt(r.egg_production) || 0, egg_inventory: parseInt(r.egg_inventory) || 0,
          case_weight: parseFloat(r.case_weight) || null, temp_high: parseFloat(r.temp_high) || null,
          temp_low: parseFloat(r.temp_low) || null, water_gallons: parseFloat(r.water_gallons) || null,
        })),
        feed_logs: formData.feed_logs.map(r => ({
          ...r, lbs_feed_day: parseFloat(r.lbs_feed_day) || null, lbs_per_100: parseFloat(r.lbs_per_100) || null,
          feed_inventory: parseFloat(r.feed_inventory) || null, feed_delivered: parseFloat(r.feed_delivered) || null,
          outdoor_access_hours: parseFloat(r.outdoor_access_hours) || null, outside_temp: parseFloat(r.outside_temp) || null,
        })),
        eggs_shipped_logs: formData.eggs_shipped_logs.map(r => ({
          ...r, dozens: parseFloat(r.dozens) || null,
        })),
      }

      if (editRecord?.id) {
        await updateWeeklyRecord(editRecord.id, payload)
      } else {
        await createWeeklyRecord(payload)
      }
      showToast?.(`Weekly record ${status === 'submitted' ? 'submitted' : 'saved as draft'}`, 'success')
      onSaved?.()
      onClose()
    } catch (err) {
      showToast?.(err.response?.data?.detail || 'Error saving record', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const flockOptions = flocks.map(f => ({ value: f.id, label: `${f.flock_number} — ${f.current_bird_count} birds (${f.current_barn || ''})` }))

  const inputClass = "glass-input text-xs px-2 py-1.5 w-full"
  const numInput = "glass-input text-xs px-2 py-1.5 w-full text-right"

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center overflow-auto">
      <div className="glass-card w-full max-w-6xl max-h-[95vh] flex flex-col m-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-lvf-border">
          <h2 className="text-lg font-bold">Weekly Production Record</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded"><X size={18} /></button>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-1 px-6 py-3 border-b border-lvf-border overflow-x-auto">
          {STEPS.map((s, i) => (
            <button key={i} onClick={() => setStep(i)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                i === step ? 'bg-lvf-accent/20 text-lvf-accent' :
                i < step ? 'text-lvf-success' : 'text-lvf-muted'
              }`}>
              {i + 1}. {s}
            </button>
          ))}
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-auto px-6 py-4">

          {/* Step 1: Header */}
          {step === 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
              <div className="md:col-span-2">
                <label className="block text-xs text-lvf-muted mb-1">Flock</label>
                <SearchSelect options={flockOptions} value={formData.flock_id}
                  onChange={handleFlockSelect} placeholder="Select flock..." />
              </div>
              <div>
                <label className="block text-xs text-lvf-muted mb-1">Grower Name</label>
                <input className={inputClass} value={formData.grower_name} onChange={e => updateField('grower_name', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-lvf-muted mb-1">Starting Bird Count</label>
                <input type="number" className={numInput} value={formData.starting_bird_count}
                  onChange={e => updateField('starting_bird_count', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-lvf-muted mb-1">Start Date</label>
                <input type="date" className={inputClass} value={formData.start_date}
                  onChange={e => {
                    updateField('start_date', e.target.value)
                    updateField('end_date', addDays(e.target.value, 6))
                  }} />
              </div>
              <div>
                <label className="block text-xs text-lvf-muted mb-1">End Date</label>
                <input type="date" className={inputClass} value={formData.end_date}
                  onChange={e => updateField('end_date', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-lvf-muted mb-1">Bird Weight (lbs)</label>
                <input type="number" step="0.1" className={numInput} value={formData.bird_weight}
                  onChange={e => updateField('bird_weight', e.target.value)} />
              </div>
            </div>
          )}

          {/* Step 2: Production Log */}
          {step === 1 && (
            <div className="overflow-x-auto">
              <table className="w-full glass-table text-xs">
                <thead>
                  <tr>
                    <th className="whitespace-nowrap">Date</th>
                    <th>Day</th>
                    <th>AM Init</th>
                    <th>PM Init</th>
                    <th>Culls</th>
                    <th>Cull Reason</th>
                    <th>Mort</th>
                    <th>Mort Reason</th>
                    <th>Eggs</th>
                    <th>Egg Inv</th>
                    <th>Case Wt</th>
                    <th>Hi &deg;F</th>
                    <th>Lo &deg;F</th>
                    <th>Water Gal</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.production_logs.map((row, i) => (
                    <tr key={row.date}>
                      <td className="whitespace-nowrap font-mono">{row.date}</td>
                      <td>{row.day_name}</td>
                      <td><input className={inputClass} value={row.initial_am} onChange={e => updateLogRow('production_logs', i, 'initial_am', e.target.value)} /></td>
                      <td><input className={inputClass} value={row.initial_pm} onChange={e => updateLogRow('production_logs', i, 'initial_pm', e.target.value)} /></td>
                      <td><input type="number" className={numInput} value={row.cull_count} onChange={e => updateLogRow('production_logs', i, 'cull_count', e.target.value)} /></td>
                      <td><input className={inputClass} value={row.cull_reason} onChange={e => updateLogRow('production_logs', i, 'cull_reason', e.target.value)} /></td>
                      <td><input type="number" className={numInput} value={row.mortality_count} onChange={e => updateLogRow('production_logs', i, 'mortality_count', e.target.value)} /></td>
                      <td><input className={inputClass} value={row.mortality_reason} onChange={e => updateLogRow('production_logs', i, 'mortality_reason', e.target.value)} /></td>
                      <td><input type="number" className={numInput} value={row.egg_production} onChange={e => updateLogRow('production_logs', i, 'egg_production', e.target.value)} /></td>
                      <td><input type="number" className={numInput} value={row.egg_inventory} onChange={e => updateLogRow('production_logs', i, 'egg_inventory', e.target.value)} /></td>
                      <td><input type="number" step="0.1" className={numInput} value={row.case_weight} onChange={e => updateLogRow('production_logs', i, 'case_weight', e.target.value)} /></td>
                      <td><input type="number" step="0.1" className={numInput} value={row.temp_high} onChange={e => updateLogRow('production_logs', i, 'temp_high', e.target.value)} /></td>
                      <td><input type="number" step="0.1" className={numInput} value={row.temp_low} onChange={e => updateLogRow('production_logs', i, 'temp_low', e.target.value)} /></td>
                      <td><input type="number" step="0.1" className={numInput} value={row.water_gallons} onChange={e => updateLogRow('production_logs', i, 'water_gallons', e.target.value)} /></td>
                    </tr>
                  ))}
                  <tr className="font-bold bg-lvf-accent/5">
                    <td colSpan={4}>Totals / Averages</td>
                    <td className="text-right">{summaries.totalCulls}</td>
                    <td></td>
                    <td className="text-right">{summaries.totalMort}</td>
                    <td></td>
                    <td className="text-right">{summaries.totalEggs}</td>
                    <td></td>
                    <td className="text-right">{summaries.avgCaseWeight}</td>
                    <td className="text-right">{summaries.avgTempHigh}</td>
                    <td className="text-right">{summaries.avgTempLow}</td>
                    <td className="text-right">{summaries.totalWater.toFixed(1)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Step 3: Feed Log */}
          {step === 2 && (
            <div className="overflow-x-auto">
              <table className="w-full glass-table text-xs">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Lbs Feed/Day</th>
                    <th>Lbs/100</th>
                    <th>Feed Inv</th>
                    <th>Feed Delivered</th>
                    <th>Outdoor</th>
                    <th>Hours</th>
                    <th>Outside &deg;F</th>
                    <th>Initial</th>
                    <th>No Access Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.feed_logs.map((row, i) => (
                    <tr key={row.date}>
                      <td className="whitespace-nowrap font-mono">{row.date}</td>
                      <td><input type="number" step="0.1" className={numInput} value={row.lbs_feed_day} onChange={e => updateLogRow('feed_logs', i, 'lbs_feed_day', e.target.value)} /></td>
                      <td><input type="number" step="0.1" className={numInput} value={row.lbs_per_100} onChange={e => updateLogRow('feed_logs', i, 'lbs_per_100', e.target.value)} /></td>
                      <td><input type="number" step="0.1" className={numInput} value={row.feed_inventory} onChange={e => updateLogRow('feed_logs', i, 'feed_inventory', e.target.value)} /></td>
                      <td><input type="number" step="0.1" className={numInput} value={row.feed_delivered} onChange={e => updateLogRow('feed_logs', i, 'feed_delivered', e.target.value)} /></td>
                      <td className="text-center">
                        <input type="checkbox" checked={row.outdoor_access} onChange={e => updateLogRow('feed_logs', i, 'outdoor_access', e.target.checked)} />
                      </td>
                      <td><input type="number" step="0.5" className={numInput} value={row.outdoor_access_hours} onChange={e => updateLogRow('feed_logs', i, 'outdoor_access_hours', e.target.value)} /></td>
                      <td><input type="number" step="0.1" className={numInput} value={row.outside_temp} onChange={e => updateLogRow('feed_logs', i, 'outside_temp', e.target.value)} /></td>
                      <td><input className={inputClass} value={row.initial} onChange={e => updateLogRow('feed_logs', i, 'initial', e.target.value)} /></td>
                      <td><input className={inputClass} value={row.no_access_reason} onChange={e => updateLogRow('feed_logs', i, 'no_access_reason', e.target.value)} /></td>
                    </tr>
                  ))}
                  <tr className="font-bold bg-lvf-accent/5">
                    <td>Averages</td>
                    <td className="text-right">{summaries.avgFeedDay}</td>
                    <td className="text-right">{summaries.avgFeedPer100}</td>
                    <td className="text-right">{summaries.endFeedInventory}</td>
                    <td className="text-right">{summaries.totalFeedDelivered}</td>
                    <td colSpan={5}></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Step 4: Environmental (Fly, Rodent, Foot Bath, Ammonia) */}
          {step === 3 && (
            <div className="space-y-6">
              {/* Fly Log */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Fly Log</h3>
                  <button onClick={() => addLogRow('fly_logs', { time: '', initial: '', fly_count: '', corrective_action: '' })}
                    className="glass-button-secondary text-xs px-2 py-1">+ Add Row</button>
                </div>
                {formData.fly_logs.length > 0 && (
                  <table className="w-full glass-table text-xs">
                    <thead><tr><th>Date</th><th>Time</th><th>Initial</th><th>Fly Count</th><th>Corrective Action</th><th></th></tr></thead>
                    <tbody>
                      {formData.fly_logs.map((row, i) => (
                        <tr key={i}>
                          <td><input type="date" className={inputClass} value={row.date} onChange={e => updateLogRow('fly_logs', i, 'date', e.target.value)} /></td>
                          <td><input className={inputClass} value={row.time} onChange={e => updateLogRow('fly_logs', i, 'time', e.target.value)} /></td>
                          <td><input className={inputClass} value={row.initial} onChange={e => updateLogRow('fly_logs', i, 'initial', e.target.value)} /></td>
                          <td><input type="number" className={numInput} value={row.fly_count} onChange={e => updateLogRow('fly_logs', i, 'fly_count', e.target.value)} /></td>
                          <td><input className={inputClass} value={row.corrective_action} onChange={e => updateLogRow('fly_logs', i, 'corrective_action', e.target.value)} /></td>
                          <td><button onClick={() => removeLogRow('fly_logs', i)} className="text-lvf-danger text-xs">x</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Rodent Log */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Rodent Log</h3>
                  <button onClick={() => addLogRow('rodent_logs', { time: '', initial: '', mice_count: '', brand_active_ingredient: '', rodent_index: '' })}
                    className="glass-button-secondary text-xs px-2 py-1">+ Add Row</button>
                </div>
                {formData.rodent_logs.length > 0 && (
                  <table className="w-full glass-table text-xs">
                    <thead><tr><th>Date</th><th>Time</th><th>Initial</th><th>Mice Count</th><th>Brand/Ingredient</th><th>Index (0-3)</th><th></th></tr></thead>
                    <tbody>
                      {formData.rodent_logs.map((row, i) => (
                        <tr key={i}>
                          <td><input type="date" className={inputClass} value={row.date} onChange={e => updateLogRow('rodent_logs', i, 'date', e.target.value)} /></td>
                          <td><input className={inputClass} value={row.time} onChange={e => updateLogRow('rodent_logs', i, 'time', e.target.value)} /></td>
                          <td><input className={inputClass} value={row.initial} onChange={e => updateLogRow('rodent_logs', i, 'initial', e.target.value)} /></td>
                          <td><input type="number" className={numInput} value={row.mice_count} onChange={e => updateLogRow('rodent_logs', i, 'mice_count', e.target.value)} /></td>
                          <td><input className={inputClass} value={row.brand_active_ingredient} onChange={e => updateLogRow('rodent_logs', i, 'brand_active_ingredient', e.target.value)} /></td>
                          <td><input type="number" min="0" max="3" className={numInput} value={row.rodent_index} onChange={e => updateLogRow('rodent_logs', i, 'rodent_index', e.target.value)} /></td>
                          <td><button onClick={() => removeLogRow('rodent_logs', i)} className="text-lvf-danger text-xs">x</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Foot Bath Log */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Foot Bath Log</h3>
                  <button onClick={() => addLogRow('foot_bath_logs', { time: '', initial: '', brand: '', amount_ratio: '' })}
                    className="glass-button-secondary text-xs px-2 py-1">+ Add Row</button>
                </div>
                {formData.foot_bath_logs.length > 0 && (
                  <table className="w-full glass-table text-xs">
                    <thead><tr><th>Date</th><th>Time</th><th>Initial</th><th>Brand</th><th>Amount/Ratio</th><th></th></tr></thead>
                    <tbody>
                      {formData.foot_bath_logs.map((row, i) => (
                        <tr key={i}>
                          <td><input type="date" className={inputClass} value={row.date} onChange={e => updateLogRow('foot_bath_logs', i, 'date', e.target.value)} /></td>
                          <td><input className={inputClass} value={row.time} onChange={e => updateLogRow('foot_bath_logs', i, 'time', e.target.value)} /></td>
                          <td><input className={inputClass} value={row.initial} onChange={e => updateLogRow('foot_bath_logs', i, 'initial', e.target.value)} /></td>
                          <td><input className={inputClass} value={row.brand} onChange={e => updateLogRow('foot_bath_logs', i, 'brand', e.target.value)} /></td>
                          <td><input className={inputClass} value={row.amount_ratio} onChange={e => updateLogRow('foot_bath_logs', i, 'amount_ratio', e.target.value)} /></td>
                          <td><button onClick={() => removeLogRow('foot_bath_logs', i)} className="text-lvf-danger text-xs">x</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Ammonia Log */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Ammonia Log</h3>
                  <button onClick={() => addLogRow('ammonia_logs', { time: '', initial: '', ppm: '', corrective_action: '' })}
                    className="glass-button-secondary text-xs px-2 py-1">+ Add Row</button>
                </div>
                {formData.ammonia_logs.length > 0 && (
                  <table className="w-full glass-table text-xs">
                    <thead><tr><th>Date</th><th>Time</th><th>Initial</th><th>PPM</th><th>Corrective Action</th><th></th></tr></thead>
                    <tbody>
                      {formData.ammonia_logs.map((row, i) => (
                        <tr key={i}>
                          <td><input type="date" className={inputClass} value={row.date} onChange={e => updateLogRow('ammonia_logs', i, 'date', e.target.value)} /></td>
                          <td><input className={inputClass} value={row.time} onChange={e => updateLogRow('ammonia_logs', i, 'time', e.target.value)} /></td>
                          <td><input className={inputClass} value={row.initial} onChange={e => updateLogRow('ammonia_logs', i, 'initial', e.target.value)} /></td>
                          <td><input type="number" step="0.1" className={numInput} value={row.ppm} onChange={e => updateLogRow('ammonia_logs', i, 'ppm', e.target.value)} /></td>
                          <td><input className={inputClass} value={row.corrective_action} onChange={e => updateLogRow('ammonia_logs', i, 'corrective_action', e.target.value)} /></td>
                          <td><button onClick={() => removeLogRow('ammonia_logs', i)} className="text-lvf-danger text-xs">x</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* Step 5: Equipment & Facility (Generator, Alarm, Pit, Cooler) */}
          {step === 4 && (
            <div className="space-y-6">
              {/* Generator Log */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Generator Log</h3>
                  <button onClick={() => addLogRow('generator_logs', { initial: '', hour_meter: '' })}
                    className="glass-button-secondary text-xs px-2 py-1">+ Add Row</button>
                </div>
                {formData.generator_logs.length > 0 && (
                  <table className="w-full glass-table text-xs">
                    <thead><tr><th>Date</th><th>Initial</th><th>Hour Meter</th><th></th></tr></thead>
                    <tbody>
                      {formData.generator_logs.map((row, i) => (
                        <tr key={i}>
                          <td><input type="date" className={inputClass} value={row.date} onChange={e => updateLogRow('generator_logs', i, 'date', e.target.value)} /></td>
                          <td><input className={inputClass} value={row.initial} onChange={e => updateLogRow('generator_logs', i, 'initial', e.target.value)} /></td>
                          <td><input type="number" step="0.1" className={numInput} value={row.hour_meter} onChange={e => updateLogRow('generator_logs', i, 'hour_meter', e.target.value)} /></td>
                          <td><button onClick={() => removeLogRow('generator_logs', i)} className="text-lvf-danger text-xs">x</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Alarm Check Log */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Alarm Check Log</h3>
                  <button onClick={() => addLogRow('alarm_check_logs', { time: '', initial: '', results: '', corrective_action: '' })}
                    className="glass-button-secondary text-xs px-2 py-1">+ Add Row</button>
                </div>
                {formData.alarm_check_logs.length > 0 && (
                  <table className="w-full glass-table text-xs">
                    <thead><tr><th>Date</th><th>Time</th><th>Initial</th><th>Results</th><th>Corrective Action</th><th></th></tr></thead>
                    <tbody>
                      {formData.alarm_check_logs.map((row, i) => (
                        <tr key={i}>
                          <td><input type="date" className={inputClass} value={row.date} onChange={e => updateLogRow('alarm_check_logs', i, 'date', e.target.value)} /></td>
                          <td><input className={inputClass} value={row.time} onChange={e => updateLogRow('alarm_check_logs', i, 'time', e.target.value)} /></td>
                          <td><input className={inputClass} value={row.initial} onChange={e => updateLogRow('alarm_check_logs', i, 'initial', e.target.value)} /></td>
                          <td><input className={inputClass} value={row.results} onChange={e => updateLogRow('alarm_check_logs', i, 'results', e.target.value)} /></td>
                          <td><input className={inputClass} value={row.corrective_action} onChange={e => updateLogRow('alarm_check_logs', i, 'corrective_action', e.target.value)} /></td>
                          <td><button onClick={() => removeLogRow('alarm_check_logs', i)} className="text-lvf-danger text-xs">x</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Pit Log */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Pit Log</h3>
                  <button onClick={() => addLogRow('pit_logs', { time: '', initial: '', bird_count: '', corrective_action: '' })}
                    className="glass-button-secondary text-xs px-2 py-1">+ Add Row</button>
                </div>
                {formData.pit_logs.length > 0 && (
                  <table className="w-full glass-table text-xs">
                    <thead><tr><th>Date</th><th>Time</th><th>Initial</th><th>Bird Count</th><th>Corrective Action</th><th></th></tr></thead>
                    <tbody>
                      {formData.pit_logs.map((row, i) => (
                        <tr key={i}>
                          <td><input type="date" className={inputClass} value={row.date} onChange={e => updateLogRow('pit_logs', i, 'date', e.target.value)} /></td>
                          <td><input className={inputClass} value={row.time} onChange={e => updateLogRow('pit_logs', i, 'time', e.target.value)} /></td>
                          <td><input className={inputClass} value={row.initial} onChange={e => updateLogRow('pit_logs', i, 'initial', e.target.value)} /></td>
                          <td><input type="number" className={numInput} value={row.bird_count} onChange={e => updateLogRow('pit_logs', i, 'bird_count', e.target.value)} /></td>
                          <td><input className={inputClass} value={row.corrective_action} onChange={e => updateLogRow('pit_logs', i, 'corrective_action', e.target.value)} /></td>
                          <td><button onClick={() => removeLogRow('pit_logs', i)} className="text-lvf-danger text-xs">x</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Cooler Temp Log */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Cooler Temp Log</h3>
                  <button onClick={() => addLogRow('cooler_temp_logs', { time: '', initial: '', temp: '', corrective_action: '' })}
                    className="glass-button-secondary text-xs px-2 py-1">+ Add Row</button>
                </div>
                {formData.cooler_temp_logs.length > 0 && (
                  <table className="w-full glass-table text-xs">
                    <thead><tr><th>Date</th><th>Time</th><th>Initial</th><th>Temp &deg;F</th><th>Corrective Action</th><th></th></tr></thead>
                    <tbody>
                      {formData.cooler_temp_logs.map((row, i) => (
                        <tr key={i}>
                          <td><input type="date" className={inputClass} value={row.date} onChange={e => updateLogRow('cooler_temp_logs', i, 'date', e.target.value)} /></td>
                          <td><input className={inputClass} value={row.time} onChange={e => updateLogRow('cooler_temp_logs', i, 'time', e.target.value)} /></td>
                          <td><input className={inputClass} value={row.initial} onChange={e => updateLogRow('cooler_temp_logs', i, 'initial', e.target.value)} /></td>
                          <td><input type="number" step="0.1" className={numInput} value={row.temp} onChange={e => updateLogRow('cooler_temp_logs', i, 'temp', e.target.value)} /></td>
                          <td><input className={inputClass} value={row.corrective_action} onChange={e => updateLogRow('cooler_temp_logs', i, 'corrective_action', e.target.value)} /></td>
                          <td><button onClick={() => removeLogRow('cooler_temp_logs', i)} className="text-lvf-danger text-xs">x</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* Step 6: Eggs Shipped + Comments */}
          {step === 5 && (
            <div className="space-y-6 max-w-3xl">
              <div>
                <h3 className="text-sm font-semibold mb-2">Eggs Shipped (Dozens)</h3>
                <table className="w-full glass-table text-xs">
                  <thead><tr><th>Date</th><th>Dozens</th></tr></thead>
                  <tbody>
                    {formData.eggs_shipped_logs.map((row, i) => (
                      <tr key={row.date}>
                        <td className="font-mono">{row.date}</td>
                        <td><input type="number" step="0.1" className={numInput} value={row.dozens} onChange={e => updateLogRow('eggs_shipped_logs', i, 'dozens', e.target.value)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <label className="block text-xs text-lvf-muted mb-1">Comments</label>
                <textarea className="glass-input w-full" rows={4} value={formData.comments}
                  onChange={e => updateField('comments', e.target.value)} />
              </div>
            </div>
          )}

          {/* Step 7: Review & Submit */}
          {step === 6 && (
            <div className="max-w-3xl space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="glass-card p-3">
                  <p className="text-[10px] text-lvf-muted">Starting Birds</p>
                  <p className="text-lg font-bold">{parseInt(formData.starting_bird_count || 0).toLocaleString()}</p>
                </div>
                <div className="glass-card p-3">
                  <p className="text-[10px] text-lvf-muted">Ending Birds</p>
                  <p className="text-lg font-bold">{summaries.endBirds.toLocaleString()}</p>
                </div>
                <div className="glass-card p-3">
                  <p className="text-[10px] text-lvf-muted">Production %</p>
                  <p className="text-lg font-bold text-lvf-accent">{summaries.pctProduction}%</p>
                </div>
                <div className="glass-card p-3">
                  <p className="text-[10px] text-lvf-muted">Gal/100 Birds</p>
                  <p className="text-lg font-bold">{summaries.galPer100}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="glass-card p-3">
                  <p className="text-[10px] text-lvf-muted">Total Eggs</p>
                  <p className="font-bold">{summaries.totalEggs.toLocaleString()}</p>
                </div>
                <div className="glass-card p-3">
                  <p className="text-[10px] text-lvf-muted">Total Culls</p>
                  <p className="font-bold text-lvf-warning">{summaries.totalCulls}</p>
                </div>
                <div className="glass-card p-3">
                  <p className="text-[10px] text-lvf-muted">Total Mortality</p>
                  <p className="font-bold text-lvf-danger">{summaries.totalMort}</p>
                </div>
                <div className="glass-card p-3">
                  <p className="text-[10px] text-lvf-muted">Avg Case Weight</p>
                  <p className="font-bold">{summaries.avgCaseWeight}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="glass-card p-3">
                  <p className="text-[10px] text-lvf-muted">Avg Lbs Feed/Day</p>
                  <p className="font-bold">{summaries.avgFeedDay}</p>
                </div>
                <div className="glass-card p-3">
                  <p className="text-[10px] text-lvf-muted">Avg Lbs/100</p>
                  <p className="font-bold">{summaries.avgFeedPer100}</p>
                </div>
                <div className="glass-card p-3">
                  <p className="text-[10px] text-lvf-muted">Feed Delivered</p>
                  <p className="font-bold">{summaries.totalFeedDelivered}</p>
                </div>
                <div className="glass-card p-3">
                  <p className="text-[10px] text-lvf-muted">End Feed Inventory</p>
                  <p className="font-bold">{summaries.endFeedInventory}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="glass-card p-3">
                  <p className="text-[10px] text-lvf-muted">Avg Temp High</p>
                  <p className="font-bold">{summaries.avgTempHigh}&deg;F</p>
                </div>
                <div className="glass-card p-3">
                  <p className="text-[10px] text-lvf-muted">Avg Temp Low</p>
                  <p className="font-bold">{summaries.avgTempLow}&deg;F</p>
                </div>
              </div>

              {formData.comments && (
                <div className="glass-card p-3">
                  <p className="text-[10px] text-lvf-muted mb-1">Comments</p>
                  <p className="text-sm">{formData.comments}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-lvf-border">
          <button onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0}
            className="glass-button-secondary flex items-center gap-2 disabled:opacity-30">
            <ChevronLeft size={16} /> Previous
          </button>

          <div className="flex gap-2">
            {step === 6 ? (
              <>
                <button onClick={() => handleSave('draft')} disabled={submitting}
                  className="glass-button-secondary flex items-center gap-2">
                  <Save size={16} /> Save as Draft
                </button>
                <button onClick={() => handleSave('submitted')} disabled={submitting}
                  className="glass-button-primary flex items-center gap-2">
                  <Send size={16} /> Submit
                </button>
              </>
            ) : (
              <button onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))}
                className="glass-button-primary flex items-center gap-2">
                Next <ChevronRight size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
