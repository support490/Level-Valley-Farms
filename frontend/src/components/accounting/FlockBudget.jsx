import { useState, useEffect } from 'react'
import { getActiveFlocks, getFlockBudget, createFlockBudget, getFlockBudgetVariance } from '../../api/accounting'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'

const BUDGET_CATEGORIES = [
  { key: 'feed', label: 'Feed' },
  { key: 'grower_payment', label: 'Grower Payment' },
  { key: 'veterinary', label: 'Veterinary' },
  { key: 'chick_purchase', label: 'Chick Purchase' },
  { key: 'transport', label: 'Transport' },
  { key: 'utilities', label: 'Utilities' },
  { key: 'other', label: 'Other' },
]

const fmt = (v) => parseFloat(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const varianceColor = (variance_pct) => {
  if (variance_pct == null) return ''
  if (variance_pct >= 0) return 'text-lvf-success'
  if (variance_pct >= -10) return 'text-lvf-warning'
  return 'text-lvf-danger'
}

const barColor = (variance_pct) => {
  if (variance_pct == null) return '#94a3b8'
  if (variance_pct >= 0) return '#34d399'
  if (variance_pct >= -10) return '#fbbf24'
  return '#f87171'
}

export default function FlockBudget() {
  const [flocks, setFlocks] = useState([])
  const [selectedFlockId, setSelectedFlockId] = useState('')
  const [mode, setMode] = useState('budget')
  const [budgetLines, setBudgetLines] = useState(BUDGET_CATEGORIES.map(c => ({ category: c.key, budgeted_amount: '' })))
  const [variance, setVariance] = useState(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  useEffect(() => {
    getActiveFlocks()
      .then(r => setFlocks(r.data || []))
      .catch(() => showToast('Error loading active flocks', 'error'))
  }, [])

  const handleFlockChange = async (flockId) => {
    setSelectedFlockId(flockId)
    setVariance(null)
    setBudgetLines(BUDGET_CATEGORIES.map(c => ({ category: c.key, budgeted_amount: '' })))
    if (!flockId) return

    setLoading(true)
    try {
      if (mode === 'budget') {
        await loadBudget(flockId)
      } else {
        await loadVariance(flockId)
      }
    } finally {
      setLoading(false)
    }
  }

  const loadBudget = async (flockId) => {
    try {
      const res = await getFlockBudget(flockId)
      if (res.data?.budgets && res.data.budgets.length > 0) {
        const existing = res.data.budgets
        const lines = BUDGET_CATEGORIES.map(c => {
          const found = existing.find(e => e.category === c.key)
          return { category: c.key, budgeted_amount: found ? String(found.budgeted_amount) : '' }
        })
        setBudgetLines(lines)
      }
    } catch {
      // No existing budget, keep defaults
    }
  }

  const loadVariance = async (flockId) => {
    try {
      const res = await getFlockBudgetVariance(flockId)
      setVariance(res.data)
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error loading variance data', 'error')
    }
  }

  const handleModeChange = async (newMode) => {
    setMode(newMode)
    if (!selectedFlockId) return

    setLoading(true)
    try {
      if (newMode === 'budget') {
        await loadBudget(selectedFlockId)
      } else {
        await loadVariance(selectedFlockId)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleBudgetLineChange = (index, value) => {
    const updated = [...budgetLines]
    updated[index] = { ...updated[index], budgeted_amount: value }
    setBudgetLines(updated)
  }

  const totalBudget = budgetLines.reduce((sum, l) => sum + (parseFloat(l.budgeted_amount) || 0), 0)

  const handleSaveBudget = async () => {
    if (submitting || !selectedFlockId) return
    setSubmitting(true)
    try {
      const budgets = budgetLines
        .filter(l => parseFloat(l.budgeted_amount) > 0)
        .map(l => ({ category: l.category, budgeted_amount: parseFloat(l.budgeted_amount) }))
      await createFlockBudget(selectedFlockId, { budgets })
      showToast('Flock budget saved successfully')
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error saving budget', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedFlock = flocks.find(f => f.id === selectedFlockId)

  // Variance totals
  const varianceItems = variance?.items || []
  const totalBudgeted = varianceItems.reduce((s, i) => s + (i.budgeted || 0), 0)
  const totalActual = varianceItems.reduce((s, i) => s + (i.actual || 0), 0)
  const totalVar = totalBudgeted - totalActual
  const totalVarPct = totalBudgeted > 0 ? ((totalVar / totalBudgeted) * 100) : 0

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      <div style={{ padding: '0 8px', marginBottom: 8 }}>
        <h3 className="text-lg font-semibold text-lvf-accent" style={{ marginBottom: 4 }}>Flock Budget & Variance Analysis</h3>
        <p className="text-xs text-lvf-muted">Plan and track costs per flock — set budgets and monitor actual spend against targets.</p>
      </div>

      {/* ── Flock Selector + Mode Toggle ── */}
      <div className="glass-card p-4 m-2" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Select Flock</label>
            <select
              className="glass-input w-full text-sm"
              value={selectedFlockId}
              onChange={e => handleFlockChange(e.target.value)}
            >
              <option value="">-- Select Active Flock --</option>
              {flocks.map(f => (
                <option key={f.id} value={f.id}>
                  Flock #{f.flock_number}{f.grower_name ? ` — ${f.grower_name}` : ''}{f.barn ? ` — ${f.barn}` : ''}{f.bird_count ? ` (${f.bird_count.toLocaleString()} birds)` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>View Mode</label>
            <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(96,165,250,0.2)' }}>
              <button
                onClick={() => handleModeChange('budget')}
                style={{
                  padding: '5px 16px', fontSize: '9pt', fontWeight: 600, cursor: 'pointer', border: 'none',
                  background: mode === 'budget' ? 'rgba(96,165,250,0.2)' : 'transparent',
                  color: mode === 'budget' ? '#60a5fa' : '#94a3b8',
                }}
              >
                Set Budget
              </button>
              <button
                onClick={() => handleModeChange('variance')}
                style={{
                  padding: '5px 16px', fontSize: '9pt', fontWeight: 600, cursor: 'pointer', border: 'none',
                  borderLeft: '1px solid rgba(96,165,250,0.2)',
                  background: mode === 'variance' ? 'rgba(96,165,250,0.2)' : 'transparent',
                  color: mode === 'variance' ? '#60a5fa' : '#94a3b8',
                }}
              >
                View Variance
              </button>
            </div>
          </div>
        </div>
        {selectedFlock && (
          <div style={{ display: 'flex', gap: 20, marginTop: 8, fontSize: '10pt' }}>
            <span className="text-lvf-muted">Flock: <span className="text-lvf-accent font-semibold">#{selectedFlock.flock_number}</span></span>
            {selectedFlock.grower_name && <span className="text-lvf-muted">Grower: <span className="text-lvf-text font-medium">{selectedFlock.grower_name}</span></span>}
            {selectedFlock.bird_count != null && <span className="text-lvf-muted">Birds: <span className="text-lvf-text font-medium">{selectedFlock.bird_count.toLocaleString()}</span></span>}
          </div>
        )}
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="glass-card p-8 m-2 text-center text-lvf-muted text-sm">Loading...</div>
      )}

      {/* ══════ SET BUDGET MODE ══════ */}
      {!loading && selectedFlockId && mode === 'budget' && (
        <div className="glass-card p-4 m-2" style={{ marginBottom: 12 }}>
          <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 6 }}>Flock Budget — Farm Expense Categories</label>

          <table className="glass-table w-full">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Category</th>
                <th style={{ textAlign: 'right', width: 180 }}>Budgeted Amount ($)</th>
              </tr>
            </thead>
            <tbody>
              {budgetLines.map((line, i) => {
                const cat = BUDGET_CATEGORIES.find(c => c.key === line.category)
                return (
                  <tr key={line.category}>
                    <td className="font-medium">{cat?.label || line.category}</td>
                    <td>
                      <input
                        className="glass-input w-full text-sm"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={line.budgeted_amount}
                        onChange={e => handleBudgetLineChange(i, e.target.value)}
                        style={{ textAlign: 'right' }}
                      />
                    </td>
                  </tr>
                )
              })}
              <tr style={{ borderTop: '2px solid rgba(255,255,255,0.15)' }}>
                <td className="font-bold" style={{ fontSize: '11pt' }}>Total Budget</td>
                <td style={{ textAlign: 'right', fontFamily: 'Tahoma, monospace', fontSize: '12pt' }} className="font-bold text-lvf-accent">
                  ${fmt(totalBudget)}
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 10 }}>
            <button
              className="glass-button-primary text-sm"
              disabled={submitting || totalBudget <= 0}
              onClick={handleSaveBudget}
              style={{ opacity: totalBudget <= 0 ? 0.5 : 1 }}
            >
              {submitting ? 'Saving...' : 'Save Budget'}
            </button>
          </div>
        </div>
      )}

      {/* ══════ VIEW VARIANCE MODE ══════ */}
      {!loading && selectedFlockId && mode === 'variance' && variance && (
        <div className="glass-card p-4 m-2" style={{ marginBottom: 12 }}>
          <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 6 }}>Budget vs. Actual Variance</label>

          <table className="glass-table w-full" style={{ marginBottom: 16 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Category</th>
                <th style={{ textAlign: 'right' }}>Budgeted</th>
                <th style={{ textAlign: 'right' }}>Actual</th>
                <th style={{ textAlign: 'right' }}>Variance ($)</th>
                <th style={{ textAlign: 'right' }}>Variance (%)</th>
                <th style={{ width: 140 }}>Utilization</th>
              </tr>
            </thead>
            <tbody>
              {varianceItems.map(item => {
                const catInfo = BUDGET_CATEGORIES.find(c => c.key === item.category)
                const pct = item.variance_pct != null ? item.variance_pct : 0
                const utilPct = item.budgeted > 0 ? Math.min((item.actual / item.budgeted) * 100, 150) : 0
                const isOver = item.variance < 0

                return (
                  <tr key={item.category}>
                    <td className="font-medium">{catInfo?.label || item.category}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'Tahoma, monospace' }}>${fmt(item.budgeted)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'Tahoma, monospace' }}>${fmt(item.actual)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'Tahoma, monospace' }} className={`font-bold ${varianceColor(pct)}`}>
                      {item.variance >= 0 ? '' : '-'}${fmt(Math.abs(item.variance))}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'Tahoma, monospace' }} className={`font-bold ${varianceColor(pct)}`}>
                      {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                    </td>
                    <td>
                      <div style={{ position: 'relative', height: 14, borderRadius: 7, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: `${Math.min(utilPct, 100)}%`,
                          borderRadius: 7,
                          background: barColor(pct),
                          opacity: 0.7,
                          transition: 'width 0.4s ease',
                        }} />
                        {utilPct > 100 && (
                          <div style={{
                            position: 'absolute', top: 0, left: '100%',
                            height: '100%', width: `${Math.min(utilPct - 100, 50)}%`,
                            background: '#f87171', opacity: 0.4,
                          }} />
                        )}
                        <span style={{
                          position: 'absolute', top: 0, right: 4, fontSize: '7pt',
                          lineHeight: '14px', color: isOver ? '#f87171' : '#94a3b8',
                        }}>
                          {item.budgeted > 0 ? `${Math.round((item.actual / item.budgeted) * 100)}%` : ''}
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}

              {/* Summary Row */}
              <tr style={{ borderTop: '2px solid rgba(255,255,255,0.15)' }}>
                <td className="font-bold" style={{ fontSize: '11pt' }}>Total</td>
                <td style={{ textAlign: 'right', fontFamily: 'Tahoma, monospace', fontSize: '11pt' }} className="font-bold">
                  ${fmt(totalBudgeted)}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'Tahoma, monospace', fontSize: '11pt' }} className="font-bold">
                  ${fmt(totalActual)}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'Tahoma, monospace', fontSize: '11pt' }}
                  className={`font-bold ${varianceColor(totalVarPct)}`}>
                  {totalVar >= 0 ? '' : '-'}${fmt(Math.abs(totalVar))}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'Tahoma, monospace', fontSize: '11pt' }}
                  className={`font-bold ${varianceColor(totalVarPct)}`}>
                  {totalVarPct >= 0 ? '+' : ''}{totalVarPct.toFixed(1)}%
                </td>
                <td>
                  <div style={{ position: 'relative', height: 14, borderRadius: 7, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${totalBudgeted > 0 ? Math.min((totalActual / totalBudgeted) * 100, 100) : 0}%`,
                      borderRadius: 7,
                      background: barColor(totalVarPct),
                      opacity: 0.7,
                    }} />
                    <span style={{
                      position: 'absolute', top: 0, right: 4, fontSize: '7pt',
                      lineHeight: '14px', color: totalVar < 0 ? '#f87171' : '#94a3b8',
                    }}>
                      {totalBudgeted > 0 ? `${Math.round((totalActual / totalBudgeted) * 100)}%` : ''}
                    </span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* ── Visual Summary Cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 8 }}>
            <div className="glass-card stat-glow p-4" style={{ textAlign: 'center' }}>
              <p className="text-xs text-lvf-muted" style={{ marginBottom: 2 }}>Total Budgeted</p>
              <p className="text-xl font-bold text-lvf-accent" style={{ fontFamily: 'Tahoma, monospace' }}>${fmt(totalBudgeted)}</p>
            </div>
            <div className="glass-card stat-glow p-4" style={{ textAlign: 'center' }}>
              <p className="text-xs text-lvf-muted" style={{ marginBottom: 2 }}>Total Actual</p>
              <p className="text-xl font-bold" style={{ fontFamily: 'Tahoma, monospace', color: totalActual > totalBudgeted ? '#f87171' : '#e2e8f0' }}>
                ${fmt(totalActual)}
              </p>
            </div>
            <div className="glass-card stat-glow p-4" style={{ textAlign: 'center' }}>
              <p className="text-xs text-lvf-muted" style={{ marginBottom: 2 }}>Net Variance</p>
              <p className={`text-xl font-bold ${varianceColor(totalVarPct)}`} style={{ fontFamily: 'Tahoma, monospace' }}>
                {totalVar >= 0 ? '+' : '-'}${fmt(Math.abs(totalVar))}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Empty state for variance ── */}
      {!loading && selectedFlockId && mode === 'variance' && !variance && (
        <div className="glass-card p-8 m-2 text-center text-lvf-muted text-sm">
          No variance data available. Set a budget first, then record expenses against this flock.
        </div>
      )}

      {/* ── No flock selected ── */}
      {!selectedFlockId && (
        <div className="glass-card p-8 m-2 text-center text-lvf-muted text-sm">
          Select a flock above to {mode === 'budget' ? 'set or edit its budget' : 'view budget vs. actual variance'}.
        </div>
      )}
    </div>
  )
}
