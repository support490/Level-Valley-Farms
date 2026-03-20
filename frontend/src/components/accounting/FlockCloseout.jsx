import { useState, useEffect } from 'react'
import { getActiveFlocks, executeFlockCloseout } from '../../api/accounting'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'

const today = () => new Date().toISOString().split('T')[0]

const fmt = (v) => parseFloat(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function FlockCloseout() {
  const [flocks, setFlocks] = useState([])
  const [selectedFlockId, setSelectedFlockId] = useState('')
  const [closeoutDate, setCloseoutDate] = useState(today())
  const [birdSaleRevenue, setBirdSaleRevenue] = useState('')
  const [disposalCost, setDisposalCost] = useState('')
  const [remainingFeedValue, setRemainingFeedValue] = useState('')
  const [summary, setSummary] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [completed, setCompleted] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  useEffect(() => {
    getActiveFlocks()
      .then(r => setFlocks(r.data || []))
      .catch(() => showToast('Error loading active flocks', 'error'))
  }, [])

  const selectedFlock = flocks.find(f => f.id === selectedFlockId)

  const birdSale = parseFloat(birdSaleRevenue) || 0
  const disposal = parseFloat(disposalCost) || 0
  const feedCredit = parseFloat(remainingFeedValue) || 0
  const netNewEntries = birdSale - disposal + feedCredit

  const canPreview = selectedFlockId && closeoutDate && birdSaleRevenue !== ''

  const handleConfirmCloseout = async () => {
    if (submitting) return
    setSubmitting(true)
    setShowConfirm(false)
    try {
      const res = await executeFlockCloseout(selectedFlockId, {
        closeout_date: closeoutDate,
        bird_sale_revenue: birdSale,
        disposal_cost: disposal,
        remaining_feed_value: feedCredit,
      })
      setSummary(res.data)
      setCompleted(true)
      showToast('Flock closeout completed successfully')
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error executing closeout', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReset = () => {
    setSelectedFlockId('')
    setCloseoutDate(today())
    setBirdSaleRevenue('')
    setDisposalCost('')
    setRemainingFeedValue('')
    setSummary(null)
    setCompleted(false)
  }

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      <div style={{ padding: '0 8px', marginBottom: 8 }}>
        <h3 className="text-lg font-semibold text-lvf-accent" style={{ marginBottom: 4 }}>Flock Closeout</h3>
        <p className="text-xs text-lvf-muted">Close out a flock when birds are sold or removed — ends the flock lifecycle and records final P&L.</p>
      </div>

      {/* ── Step 1: Select Flock ── */}
      <div className="glass-card p-4 m-2" style={{ marginBottom: 12 }}>
        <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Step 1 — Select Flock</label>
        <select
          className="glass-input w-full text-sm"
          value={selectedFlockId}
          onChange={e => { setSelectedFlockId(e.target.value); setSummary(null); setCompleted(false) }}
          disabled={completed}
        >
          <option value="">-- Select Active Flock --</option>
          {flocks.map(f => (
            <option key={f.id} value={f.id}>
              Flock #{f.flock_number}{f.grower_name ? ` — ${f.grower_name}` : ''}{f.barn ? ` — ${f.barn}` : ''}{f.bird_count ? ` (${f.bird_count.toLocaleString()} birds)` : ''}
            </option>
          ))}
        </select>
        {selectedFlock && (
          <div style={{ display: 'flex', gap: 20, marginTop: 8, fontSize: '10pt' }}>
            <span className="text-lvf-muted">Flock: <span className="text-lvf-accent font-semibold">#{selectedFlock.flock_number}</span></span>
            {selectedFlock.grower_name && <span className="text-lvf-muted">Grower: <span className="text-lvf-text font-medium">{selectedFlock.grower_name}</span></span>}
            {selectedFlock.barn && <span className="text-lvf-muted">Barn: <span className="text-lvf-text font-medium">{selectedFlock.barn}</span></span>}
            {selectedFlock.bird_count != null && <span className="text-lvf-muted">Birds: <span className="text-lvf-text font-medium">{selectedFlock.bird_count.toLocaleString()}</span></span>}
            {selectedFlock.placement_date && <span className="text-lvf-muted">Placed: <span className="text-lvf-text font-medium">{selectedFlock.placement_date}</span></span>}
          </div>
        )}
      </div>

      {/* ── Step 2: Closeout Details ── */}
      {selectedFlockId && !completed && (
        <div className="glass-card p-4 m-2" style={{ marginBottom: 12 }}>
          <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 6 }}>Step 2 — Closeout Details</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Closeout Date</label>
              <input className="glass-input text-sm" type="date" value={closeoutDate} onChange={e => setCloseoutDate(e.target.value)} style={{ width: 180 }} />
            </div>
            <div>
              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Bird Sale Revenue ($)</label>
              <input className="glass-input w-full text-sm" type="number" step="0.01" min="0" placeholder="0.00"
                value={birdSaleRevenue} onChange={e => setBirdSaleRevenue(e.target.value)} />
              <span style={{ fontSize: '7pt', color: '#666' }}>Amount received from selling the birds</span>
            </div>
            <div>
              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Disposal Cost ($)</label>
              <input className="glass-input w-full text-sm" type="number" step="0.01" min="0" placeholder="0.00"
                value={disposalCost} onChange={e => setDisposalCost(e.target.value)} />
              <span style={{ fontSize: '7pt', color: '#666' }}>Cost of disposal or transport out</span>
            </div>
            <div>
              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Remaining Feed Value ($)</label>
              <input className="glass-input w-full text-sm" type="number" step="0.01" min="0" placeholder="0.00"
                value={remainingFeedValue} onChange={e => setRemainingFeedValue(e.target.value)} />
              <span style={{ fontSize: '7pt', color: '#666' }}>Value of unused feed (credited back)</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 3: Summary Preview ── */}
      {canPreview && !completed && (
        <div className="glass-card p-4 m-2" style={{ marginBottom: 12 }}>
          <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 6 }}>Step 3 — Closeout Summary Preview</label>

          <table className="glass-table w-full" style={{ marginBottom: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Entry</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-medium">Bird Sale Revenue</td>
                <td style={{ textAlign: 'right', fontFamily: 'Tahoma, monospace' }} className="text-lvf-success">+${fmt(birdSale)}</td>
              </tr>
              <tr>
                <td className="font-medium">Disposal Cost</td>
                <td style={{ textAlign: 'right', fontFamily: 'Tahoma, monospace' }} className="text-lvf-danger">-${fmt(disposal)}</td>
              </tr>
              <tr>
                <td className="font-medium">Remaining Feed Credit</td>
                <td style={{ textAlign: 'right', fontFamily: 'Tahoma, monospace' }} className="text-lvf-success">+${fmt(feedCredit)}</td>
              </tr>
              <tr style={{ borderTop: '2px solid rgba(255,255,255,0.15)' }}>
                <td className="font-bold">Net Closeout Entries</td>
                <td style={{ textAlign: 'right', fontFamily: 'Tahoma, monospace', fontSize: '11pt' }}
                  className={`font-bold ${netNewEntries >= 0 ? 'text-lvf-success' : 'text-lvf-danger'}`}>
                  {netNewEntries >= 0 ? '+' : '-'}${fmt(Math.abs(netNewEntries))}
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 10 }}>
            <button className="glass-button-secondary text-sm" onClick={handleReset}>Cancel</button>
            <button
              className="glass-button-danger text-sm"
              disabled={submitting}
              onClick={() => setShowConfirm(true)}
            >
              {submitting ? 'Processing...' : 'Confirm Closeout'}
            </button>
          </div>
        </div>
      )}

      {/* ── Completion Summary ── */}
      {completed && summary && (
        <div className="glass-card p-5 m-2" style={{ marginBottom: 12 }}>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: '16pt', fontWeight: 700, marginBottom: 4 }} className="text-lvf-success">Flock Closeout Complete</div>
            <p className="text-sm text-lvf-muted">Flock #{selectedFlock?.flock_number} has been closed out successfully.</p>
          </div>

          {summary.costs && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 4 }}>Accumulated Flock Costs</label>
              <table className="glass-table w-full">
                <tbody>
                  {(Array.isArray(summary.costs) ? summary.costs : []).map((c, i) => (
                    <tr key={i}>
                      <td className="text-lvf-muted">{c.category || c.description || 'Cost'}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'Tahoma, monospace' }} className="text-lvf-danger">${fmt(c.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ borderTop: '2px solid rgba(255,255,255,0.15)', paddingTop: 12 }}>
            <table className="w-full" style={{ fontSize: '10pt' }}>
              <tbody>
                {summary.total_revenue != null && (
                  <tr>
                    <td className="font-medium" style={{ padding: '3px 0' }}>Total Revenue</td>
                    <td style={{ textAlign: 'right', fontFamily: 'Tahoma, monospace' }} className="text-lvf-success font-bold">${fmt(summary.total_revenue)}</td>
                  </tr>
                )}
                {summary.total_costs != null && (
                  <tr>
                    <td className="font-medium" style={{ padding: '3px 0' }}>Total Costs</td>
                    <td style={{ textAlign: 'right', fontFamily: 'Tahoma, monospace' }} className="text-lvf-danger font-bold">${fmt(summary.total_costs)}</td>
                  </tr>
                )}
                {summary.net_result != null && (
                  <tr style={{ borderTop: '2px solid rgba(255,255,255,0.2)' }}>
                    <td className="font-bold" style={{ padding: '6px 0', fontSize: '12pt' }}>Net Result</td>
                    <td style={{ textAlign: 'right', fontFamily: 'Tahoma, monospace', fontSize: '14pt' }}
                      className={`font-bold ${summary.net_result >= 0 ? 'text-lvf-success' : 'text-lvf-danger'}`}>
                      {summary.net_result >= 0 ? '' : '-'}${fmt(Math.abs(summary.net_result))}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="glass-button-primary text-sm" onClick={handleReset}>Close Another Flock</button>
          </div>
        </div>
      )}

      {/* ── Confirmation Dialog ── */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 z-[1000] flex items-center justify-center backdrop-blur-sm">
          <div className="glass-card rounded-xl min-w-[320px] max-w-[480px] overflow-hidden">
            <div className="px-4 py-2 border-b border-lvf-border font-semibold text-sm text-lvf-danger">Confirm Flock Closeout</div>
            <div className="p-4 text-sm">
              <p style={{ marginBottom: 8 }}>
                Are you sure you want to close out <strong>Flock #{selectedFlock?.flock_number}</strong>
                {selectedFlock?.grower_name ? ` (${selectedFlock.grower_name})` : ''}?
              </p>
              <p style={{ color: '#f87171', fontWeight: 600 }}>This action cannot be undone.</p>
              <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', fontSize: '9pt' }}>
                <div>Closeout Date: {closeoutDate}</div>
                <div>Bird Sale Revenue: ${fmt(birdSale)}</div>
                <div>Disposal Cost: ${fmt(disposal)}</div>
                <div>Remaining Feed Value: ${fmt(feedCredit)}</div>
              </div>
            </div>
            <div className="px-4 py-3 flex justify-end gap-2 border-t border-lvf-border/30">
              <button className="glass-button-secondary text-sm" onClick={() => setShowConfirm(false)}>Cancel</button>
              <button className="glass-button-danger text-sm" onClick={handleConfirmCloseout}>
                {submitting ? 'Processing...' : 'Close Out Flock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
