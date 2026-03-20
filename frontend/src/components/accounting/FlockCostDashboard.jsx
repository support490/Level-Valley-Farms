import { useState, useEffect } from 'react'
import { getFlockCostDashboard } from '../../api/reports'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'

const fmt = (n) => {
  if (n == null) return '$0.00'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const fmtShort = (n) => {
  if (n == null) return '$0'
  if (Math.abs(n) >= 1000) return '$' + (n / 1000).toFixed(1) + 'k'
  return '$' + Number(n).toFixed(0)
}

function CostBreakdownBar({ breakdown }) {
  if (!breakdown) return null
  const total = (breakdown.feed || 0) + (breakdown.grower_payment || 0) +
    (breakdown.veterinary || 0) + (breakdown.chick_purchase || 0) + (breakdown.other || 0)
  if (total <= 0) return null

  const segments = [
    { key: 'feed', label: 'Feed', color: '#60a5fa', amount: breakdown.feed || 0 },
    { key: 'grower', label: 'Grower', color: '#34d399', amount: breakdown.grower_payment || 0 },
    { key: 'vet', label: 'Vet', color: '#fbbf24', amount: breakdown.veterinary || 0 },
    { key: 'chick', label: 'Chicks', color: '#a78bfa', amount: breakdown.chick_purchase || 0 },
    { key: 'other', label: 'Other', color: '#94a3b8', amount: breakdown.other || 0 },
  ].filter(s => s.amount > 0)

  return (
    <div>
      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 4 }}>
        {segments.map(s => (
          <div key={s.key} style={{
            width: `${(s.amount / total * 100).toFixed(1)}%`,
            backgroundColor: s.color,
            minWidth: s.amount > 0 ? 3 : 0,
          }} title={`${s.label}: ${fmt(s.amount)} (${(s.amount / total * 100).toFixed(0)}%)`} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {segments.map(s => (
          <span key={s.key} style={{ fontSize: '7pt', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ width: 6, height: 6, borderRadius: 2, backgroundColor: s.color, display: 'inline-block' }} />
            {s.label} {(s.amount / total * 100).toFixed(0)}%
          </span>
        ))}
      </div>
    </div>
  )
}

export default function FlockCostDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const { toast, showToast, hideToast } = useToast()

  const loadDashboard = async () => {
    setLoading(true)
    try {
      const res = await getFlockCostDashboard()
      setData(res.data || { flocks: [] })
    } catch {
      setData({ flocks: [] })
      showToast('Error loading flock cost dashboard', 'error')
    } finally { setLoading(false) }
  }

  useEffect(() => { loadDashboard() }, [])

  const flocks = data?.flocks || []

  // Summary calculations
  const totalFlocks = flocks.length
  const totalBirds = flocks.reduce((s, f) => s + (f.bird_count || 0), 0)
  const avgCostPerBird = totalFlocks > 0
    ? flocks.reduce((s, f) => s + (f.cost_per_bird || 0), 0) / totalFlocks
    : 0
  const avgCostPerDozen = totalFlocks > 0
    ? flocks.reduce((s, f) => s + (f.cost_per_dozen || 0), 0) / totalFlocks
    : 0

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      <div className="glass-card p-4 m-2">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: '14pt', fontWeight: 700, margin: 0 }}>Flock Cost Dashboard &mdash; Active Flocks</h2>
          <button className="glass-button-secondary text-sm" onClick={loadDashboard} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {loading && !data ? (
          <p style={{ textAlign: 'center', padding: 40, color: '#999' }}>Loading flock cost data...</p>
        ) : flocks.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 40, color: '#999' }}>No active flocks found.</p>
        ) : (
          <>
            {/* Summary Cards Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              <div className="glass-card" style={{ padding: '12px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: '8pt', color: '#94a3b8', marginBottom: 4 }}>Total Active Flocks</div>
                <div style={{ fontSize: '18pt', fontWeight: 700, color: '#60a5fa' }}>{totalFlocks}</div>
              </div>
              <div className="glass-card" style={{ padding: '12px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: '8pt', color: '#94a3b8', marginBottom: 4 }}>Total Birds</div>
                <div style={{ fontSize: '18pt', fontWeight: 700, color: '#60a5fa' }}>{totalBirds.toLocaleString()}</div>
              </div>
              <div className="glass-card" style={{ padding: '12px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: '8pt', color: '#94a3b8', marginBottom: 4 }}>Avg Cost / Bird</div>
                <div style={{ fontSize: '18pt', fontWeight: 700, color: '#60a5fa' }}>{fmt(avgCostPerBird)}</div>
              </div>
              <div className="glass-card" style={{ padding: '12px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: '8pt', color: '#94a3b8', marginBottom: 4 }}>Avg Cost / Dozen</div>
                <div style={{ fontSize: '18pt', fontWeight: 700, color: '#60a5fa' }}>{fmt(avgCostPerDozen)}</div>
              </div>
            </div>

            {/* Flock Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
              {flocks.map(f => {
                const netIncome = f.net_income || ((f.total_revenue || 0) - (f.total_costs || 0))
                const profitable = netIncome >= 0
                return (
                  <div key={f.flock_id || f.flock_number} className="glass-card" style={{
                    padding: 14,
                    borderLeft: `4px solid ${profitable ? '#34d399' : '#f87171'}`,
                  }}>
                    {/* Flock header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div>
                        <span style={{ fontSize: '14pt', fontWeight: 700, color: '#e2e8f0' }}>
                          Flock {f.flock_number}
                        </span>
                        {f.status && (
                          <span style={{
                            marginLeft: 8, fontSize: '8pt', padding: '1px 6px', borderRadius: 4,
                            backgroundColor: f.status === 'active' ? 'rgba(52,211,153,0.2)' : 'rgba(148,163,184,0.2)',
                            color: f.status === 'active' ? '#34d399' : '#94a3b8',
                          }}>
                            {f.status}
                          </span>
                        )}
                      </div>
                      {f.days_active != null && (
                        <span style={{ fontSize: '8pt', color: '#94a3b8' }}>{f.days_active} days</span>
                      )}
                    </div>

                    {/* Grower + Barn + Birds */}
                    <div style={{ fontSize: '9pt', color: '#94a3b8', marginBottom: 10 }}>
                      {f.grower_name && <span>{f.grower_name}</span>}
                      {f.barn && <span> &bull; {f.barn}</span>}
                      {f.bird_count != null && (
                        <span style={{ marginLeft: 8, color: '#e2e8f0', fontWeight: 600 }}>
                          {f.bird_count.toLocaleString()} birds
                        </span>
                      )}
                    </div>

                    {/* Stats Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: '7pt', color: '#94a3b8' }}>Total Costs</div>
                        <div style={{ fontSize: '10pt', fontWeight: 600, color: '#f87171' }}>{fmt(f.total_costs)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '7pt', color: '#94a3b8' }}>Revenue</div>
                        <div style={{ fontSize: '10pt', fontWeight: 600, color: '#34d399' }}>{fmt(f.total_revenue)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '7pt', color: '#94a3b8' }}>Net</div>
                        <div style={{ fontSize: '10pt', fontWeight: 600, color: profitable ? '#34d399' : '#f87171' }}>
                          {fmt(netIncome)}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '7pt', color: '#94a3b8' }}>Burn Rate/Day</div>
                        <div style={{ fontSize: '10pt', fontWeight: 600, color: '#e2e8f0' }}>{fmt(f.burn_rate_per_day)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '7pt', color: '#94a3b8' }}>Projected Total</div>
                        <div style={{ fontSize: '10pt', fontWeight: 600, color: '#e2e8f0' }}>{fmtShort(f.projected_total)}</div>
                      </div>
                      <div></div>
                    </div>

                    {/* KEY METRICS: Cost/Bird and Cost/Dozen */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10,
                      padding: '8px 10px', borderRadius: 6,
                      backgroundColor: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)',
                    }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '7pt', color: '#60a5fa', fontWeight: 600 }}>COST / BIRD</div>
                        <div style={{ fontSize: '14pt', fontWeight: 700, color: '#60a5fa' }}>{fmt(f.cost_per_bird)}</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '7pt', color: '#60a5fa', fontWeight: 600 }}>COST / DOZEN</div>
                        <div style={{ fontSize: '14pt', fontWeight: 700, color: '#60a5fa' }}>{fmt(f.cost_per_dozen)}</div>
                      </div>
                    </div>

                    {/* Cost Breakdown Bar */}
                    <CostBreakdownBar breakdown={f.cost_breakdown} />
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
