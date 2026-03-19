import { useState, useEffect } from 'react'
import { Lock, Unlock, Plus, Calendar } from 'lucide-react'
import {
  getFiscalPeriods, closeFiscalPeriod, reopenFiscalPeriod, generateFiscalPeriods
} from '../../api/accounting'
import Modal from '../common/Modal'
import Toast from '../common/Toast'
import useToast from '../../hooks/useToast'

export default function FiscalPeriods() {
  const [periods, setPeriods] = useState([])
  const [generateOpen, setGenerateOpen] = useState(false)
  const [genYear, setGenYear] = useState(new Date().getFullYear())
  const [genMonth, setGenMonth] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  const load = async () => {
    const res = await getFiscalPeriods()
    setPeriods(res.data || [])
  }

  useEffect(() => { load() }, [])

  const handleClose = async (id) => {
    setSubmitting(true)
    try {
      await closeFiscalPeriod(id)
      showToast('Period closed')
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error closing period', 'error')
    } finally { setSubmitting(false) }
  }

  const handleReopen = async (id) => {
    setSubmitting(true)
    try {
      await reopenFiscalPeriod(id)
      showToast('Period reopened')
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error reopening', 'error')
    } finally { setSubmitting(false) }
  }

  const handleGenerate = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await generateFiscalPeriods(genYear, genMonth)
      showToast(`Generated ${res.data.count} fiscal periods`)
      setGenerateOpen(false)
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    } finally { setSubmitting(false) }
  }

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-lvf-muted">Manage fiscal periods for month-end and year-end closing</p>
        <button onClick={() => setGenerateOpen(true)}
          className="glass-button-primary flex items-center gap-2 text-sm">
          <Calendar size={14} /> Generate Periods
        </button>
      </div>

      {periods.length > 0 ? (
        <div className="glass-card overflow-hidden">
          <table className="w-full glass-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Status</th>
                <th>Closed Date</th>
                <th className="w-24"></th>
              </tr>
            </thead>
            <tbody>
              {periods.map(p => (
                <tr key={p.id}>
                  <td className="font-medium">{p.period_name}</td>
                  <td className="text-lvf-muted">{p.start_date}</td>
                  <td className="text-lvf-muted">{p.end_date}</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      p.is_closed ? 'bg-lvf-danger/20 text-lvf-danger' : 'bg-lvf-success/20 text-lvf-success'
                    }`}>
                      {p.is_closed ? 'Closed' : 'Open'}
                    </span>
                  </td>
                  <td className="text-lvf-muted">{p.closed_date || '—'}</td>
                  <td>
                    {p.is_closed ? (
                      <button onClick={() => handleReopen(p.id)} disabled={submitting}
                        className="flex items-center gap-1 text-xs text-lvf-warning hover:text-lvf-warning/80">
                        <Unlock size={12} /> Reopen
                      </button>
                    ) : (
                      <button onClick={() => handleClose(p.id)} disabled={submitting}
                        className="flex items-center gap-1 text-xs text-lvf-accent hover:text-lvf-accent/80">
                        <Lock size={12} /> Close
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="glass-card p-12 text-center text-lvf-muted">
          <Calendar size={48} className="mx-auto mb-4 opacity-30" />
          <p>No fiscal periods defined. Click "Generate Periods" to create monthly periods for a year.</p>
        </div>
      )}

      <Modal isOpen={generateOpen} onClose={() => setGenerateOpen(false)} title="Generate Fiscal Periods" size="sm">
        <form onSubmit={handleGenerate} className="space-y-4">
          <p className="text-sm text-lvf-muted">Generate 12 monthly fiscal periods for a year.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Year</label>
              <input className="glass-input w-full" type="number" min="2020" max="2030" required
                value={genYear} onChange={e => setGenYear(parseInt(e.target.value) || 2026)} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Start Month</label>
              <select className="glass-input w-full" value={genMonth}
                onChange={e => setGenMonth(parseInt(e.target.value))}>
                {[...Array(12)].map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(2000, i).toLocaleString('default', { month: 'long' })}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setGenerateOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">{submitting ? 'Generating...' : 'Generate'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
