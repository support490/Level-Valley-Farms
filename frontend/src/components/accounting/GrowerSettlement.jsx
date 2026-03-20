import { useState, useEffect } from 'react'
import { getActiveFlocks, getGrowerSettlement, executeGrowerSettlement } from '../../api/accounting'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'

const fmt = (v) => parseFloat(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function GrowerSettlement() {
  const [flocks, setFlocks] = useState([])
  const [selectedFlockId, setSelectedFlockId] = useState('')
  const [settlement, setSettlement] = useState(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [completed, setCompleted] = useState(null)
  const { toast, showToast, hideToast } = useToast()

  useEffect(() => {
    getActiveFlocks()
      .then(r => setFlocks(r.data || []))
      .catch(() => showToast('Error loading active flocks', 'error'))
  }, [])

  const handleFlockChange = async (flockId) => {
    setSelectedFlockId(flockId)
    setSettlement(null)
    setCompleted(null)
    if (!flockId) return

    setLoading(true)
    try {
      const res = await getGrowerSettlement(flockId)
      setSettlement(res.data)
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error loading settlement preview', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleExecute = async () => {
    if (submitting) return
    setSubmitting(true)
    setShowConfirm(false)
    try {
      const res = await executeGrowerSettlement(selectedFlockId)
      setCompleted(res.data)
      showToast('Settlement executed successfully')
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error executing settlement', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReset = () => {
    setSelectedFlockId('')
    setSettlement(null)
    setCompleted(null)
  }

  const selectedFlock = flocks.find(f => f.id === selectedFlockId)

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      <div style={{ padding: '0 8px', marginBottom: 8 }}>
        <h3 className="text-lg font-semibold text-lvf-accent" style={{ marginBottom: 4 }}>Grower Settlement</h3>
        <p className="text-xs text-lvf-muted">Calculate and execute grower payment based on bird count, mortality, and production performance.</p>
      </div>

      {/* ── Step 1: Select Flock ── */}
      <div className="glass-card p-4 m-2" style={{ marginBottom: 12 }}>
        <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Step 1 — Select Flock</label>
        <select
          className="glass-input w-full text-sm"
          value={selectedFlockId}
          onChange={e => handleFlockChange(e.target.value)}
          disabled={completed != null}
        >
          <option value="">-- Select Active Flock --</option>
          {flocks.map(f => (
            <option key={f.id} value={f.id}>
              Flock #{f.flock_number}{f.grower_name ? ` — ${f.grower_name}` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="glass-card p-8 m-2 text-center text-lvf-muted text-sm">
          Loading settlement preview...
        </div>
      )}

      {/* ── Step 2: Settlement Preview ── */}
      {settlement && !completed && (
        <div className="glass-card p-5 m-2" style={{ marginBottom: 12 }}>
          <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 8 }}>Step 2 — Settlement Preview</label>

          {/* Grower Info Header */}
          <div style={{ display: 'flex', gap: 24, marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.12)' }}>
            <div>
              <span style={{ fontSize: '7pt', color: '#666', display: 'block' }}>Grower</span>
              <span className="font-semibold text-lvf-text" style={{ fontSize: '11pt' }}>{settlement.grower_name || 'N/A'}</span>
            </div>
            <div>
              <span style={{ fontSize: '7pt', color: '#666', display: 'block' }}>Flock</span>
              <span className="font-semibold text-lvf-accent">#{settlement.flock_number}</span>
            </div>
            {selectedFlock?.barn && (
              <div>
                <span style={{ fontSize: '7pt', color: '#666', display: 'block' }}>Barn</span>
                <span className="font-medium text-lvf-text">{selectedFlock.barn}</span>
              </div>
            )}
          </div>

          {/* Settlement Breakdown */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 6 }}>Settlement Breakdown</label>
            <table className="w-full" style={{ fontSize: '10pt' }}>
              <tbody>
                {/* Base Pay */}
                <tr>
                  <td style={{ padding: '6px 0' }}>
                    <span className="font-medium">Base Pay</span>
                    <span className="text-lvf-muted" style={{ fontSize: '8pt', marginLeft: 8 }}>
                      {settlement.bird_count != null ? `${settlement.bird_count.toLocaleString()} birds` : ''}
                      {settlement.base_rate_per_bird != null ? ` x $${settlement.base_rate_per_bird.toFixed(4)}/bird` : ''}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'Tahoma, monospace', padding: '6px 0' }} className="font-medium">
                    ${fmt(settlement.base_pay)}
                  </td>
                </tr>

                {/* Mortality Deduction */}
                <tr>
                  <td style={{ padding: '6px 0' }}>
                    <span className="font-medium">Mortality Deduction</span>
                    <span className="text-lvf-muted" style={{ fontSize: '8pt', marginLeft: 8 }}>
                      {settlement.mortality_count != null ? `${settlement.mortality_count.toLocaleString()} birds` : ''}
                      {settlement.mortality_rate != null ? ` (${settlement.mortality_rate.toFixed(2)}%)` : ''}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'Tahoma, monospace', padding: '6px 0' }} className="text-lvf-danger font-medium">
                    {settlement.mortality_deduction ? `-$${fmt(settlement.mortality_deduction)}` : '$0.00'}
                  </td>
                </tr>

                {/* Production Bonus */}
                <tr>
                  <td style={{ padding: '6px 0' }}>
                    <span className="font-medium">Production Bonus</span>
                    <span className="text-lvf-muted" style={{ fontSize: '8pt', marginLeft: 8 }}>
                      {settlement.production_pct != null ? `${settlement.production_pct.toFixed(1)}%` : ''}
                      {settlement.production_target != null ? ` vs ${settlement.production_target.toFixed(1)}% target` : ''}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'Tahoma, monospace', padding: '6px 0' }}
                    className={`font-medium ${settlement.production_bonus > 0 ? 'text-lvf-success' : 'text-lvf-muted'}`}>
                    {settlement.production_bonus > 0 ? `+$${fmt(settlement.production_bonus)}` : '$0.00'}
                  </td>
                </tr>

                {/* Separator */}
                <tr>
                  <td colSpan={2} style={{ padding: 0 }}>
                    <div style={{ borderTop: '2px solid rgba(255,255,255,0.15)', margin: '4px 0' }} />
                  </td>
                </tr>

                {/* Total Settlement */}
                <tr>
                  <td style={{ padding: '6px 0' }}>
                    <span className="font-bold" style={{ fontSize: '11pt' }}>Total Settlement</span>
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'Tahoma, monospace', padding: '6px 0', fontSize: '11pt' }} className="font-bold">
                    ${fmt(settlement.total_settlement)}
                  </td>
                </tr>

                {/* Costs Already Paid */}
                <tr>
                  <td style={{ padding: '6px 0' }}>
                    <span className="font-medium text-lvf-muted">Less: Costs Already Paid</span>
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'Tahoma, monospace', padding: '6px 0' }} className="text-lvf-danger font-medium">
                    -${fmt(settlement.costs_already_paid)}
                  </td>
                </tr>

                {/* Net Due */}
                <tr style={{ borderTop: '2px solid rgba(255,255,255,0.2)' }}>
                  <td style={{ padding: '10px 0' }}>
                    <span className="font-bold" style={{ fontSize: '13pt' }}>Net Amount Due</span>
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'Tahoma, monospace', padding: '10px 0', fontSize: '16pt' }}
                    className="font-bold text-lvf-accent">
                    ${fmt(settlement.net_due)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Additional Breakdown Details */}
          {settlement.breakdown && settlement.breakdown.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 4 }}>Detailed Breakdown</label>
              <div className="glass-card" style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.02)' }}>
                {settlement.breakdown.map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '9pt', borderBottom: i < settlement.breakdown.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                    <span className="text-lvf-muted">{item.label || item.description || item.category}</span>
                    <span style={{ fontFamily: 'Tahoma, monospace' }} className={item.amount >= 0 ? '' : 'text-lvf-danger'}>
                      {item.amount >= 0 ? '' : '-'}${fmt(Math.abs(item.amount || 0))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Execute Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 10 }}>
            <button className="glass-button-secondary text-sm" onClick={handleReset}>Cancel</button>
            <button
              className="glass-button-primary text-sm"
              disabled={submitting}
              onClick={() => setShowConfirm(true)}
            >
              {submitting ? 'Processing...' : 'Execute Settlement'}
            </button>
          </div>
        </div>
      )}

      {/* ── Completion ── */}
      {completed && (
        <div className="glass-card p-5 m-2" style={{ marginBottom: 12 }}>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: '16pt', fontWeight: 700, marginBottom: 4 }} className="text-lvf-success">Settlement Executed</div>
            <p className="text-sm text-lvf-muted">
              {completed.bill_number
                ? `Bill #${completed.bill_number} created for ${settlement?.grower_name || 'grower'}`
                : `Settlement created for ${settlement?.grower_name || 'grower'}`
              }
            </p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 20, padding: '12px 0' }}>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '7pt', color: '#666', display: 'block' }}>Grower</span>
              <span className="font-semibold text-lvf-text">{settlement?.grower_name}</span>
            </div>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '7pt', color: '#666', display: 'block' }}>Flock</span>
              <span className="font-semibold text-lvf-accent">#{settlement?.flock_number}</span>
            </div>
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: '7pt', color: '#666', display: 'block' }}>Net Due</span>
              <span className="font-bold text-lvf-accent" style={{ fontSize: '14pt', fontFamily: 'Tahoma, monospace' }}>
                ${fmt(settlement?.net_due)}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="glass-button-primary text-sm" onClick={handleReset}>Settle Another Flock</button>
          </div>
        </div>
      )}

      {/* ── Confirmation Dialog ── */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 z-[1000] flex items-center justify-center backdrop-blur-sm">
          <div className="glass-card rounded-xl min-w-[320px] max-w-[480px] overflow-hidden">
            <div className="px-4 py-2 border-b border-lvf-border font-semibold text-sm text-lvf-accent">Execute Grower Settlement</div>
            <div className="p-4 text-sm">
              <p style={{ marginBottom: 8 }}>
                This will create a bill payable to <strong>{settlement?.grower_name}</strong> for{' '}
                <strong className="text-lvf-accent">${fmt(settlement?.net_due)}</strong>.
              </p>
              <p style={{ color: '#94a3b8', fontSize: '9pt' }}>
                Flock #{settlement?.flock_number} — {settlement?.bird_count?.toLocaleString()} birds
              </p>
            </div>
            <div className="px-4 py-3 flex justify-end gap-2 border-t border-lvf-border/30">
              <button className="glass-button-secondary text-sm" onClick={() => setShowConfirm(false)}>Cancel</button>
              <button className="glass-button-primary text-sm" onClick={handleExecute}>
                {submitting ? 'Processing...' : 'Execute Settlement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
