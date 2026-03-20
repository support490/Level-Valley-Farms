import { useState, useEffect } from 'react'
import { getGrowers, getPaymentFormula, upsertPaymentFormula } from '../../api/growers'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'

const defaultFormula = {
  base_rate_per_bird: '',
  mortality_deduction_rate: '',
  production_bonus_rate: '',
  production_target_pct: '80',
  feed_conversion_bonus: '',
  notes: '',
}

export default function GrowerPaymentFormulaEditor() {
  const [growers, setGrowers] = useState([])
  const [selectedGrowerId, setSelectedGrowerId] = useState('')
  const [formula, setFormula] = useState({ ...defaultFormula })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [hasExisting, setHasExisting] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  useEffect(() => {
    getGrowers().then(res => setGrowers(res.data || [])).catch(() => {})
  }, [])

  const handleSelectGrower = async (growerId) => {
    setSelectedGrowerId(growerId)
    if (!growerId) { setFormula({ ...defaultFormula }); setHasExisting(false); return }
    setLoading(true)
    try {
      const res = await getPaymentFormula(growerId)
      if (res.data) {
        setFormula({
          base_rate_per_bird: res.data.base_rate_per_bird || '',
          mortality_deduction_rate: res.data.mortality_deduction_rate || '',
          production_bonus_rate: res.data.production_bonus_rate || '',
          production_target_pct: res.data.production_target_pct || '80',
          feed_conversion_bonus: res.data.feed_conversion_bonus || '',
          notes: res.data.notes || '',
        })
        setHasExisting(true)
      } else {
        setFormula({ ...defaultFormula })
        setHasExisting(false)
      }
    } catch {
      setFormula({ ...defaultFormula })
      setHasExisting(false)
    } finally { setLoading(false) }
  }

  const handleSave = async () => {
    if (!selectedGrowerId) { showToast('Select a grower first', 'warning'); return }
    setSaving(true)
    try {
      await upsertPaymentFormula(selectedGrowerId, {
        base_rate_per_bird: parseFloat(formula.base_rate_per_bird) || 0,
        mortality_deduction_rate: parseFloat(formula.mortality_deduction_rate) || 0,
        production_bonus_rate: parseFloat(formula.production_bonus_rate) || 0,
        production_target_pct: parseFloat(formula.production_target_pct) || 80,
        feed_conversion_bonus: parseFloat(formula.feed_conversion_bonus) || 0,
        notes: formula.notes || null,
      })
      showToast('Payment formula saved')
      setHasExisting(true)
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error saving formula', 'error')
    } finally { setSaving(false) }
  }

  const updateField = (field, value) => setFormula(prev => ({ ...prev, [field]: value }))

  // Preview calculation
  const birdCount = 25000
  const mortalityPct = 5
  const productionPct = parseFloat(formula.production_target_pct) + 2
  const basePay = birdCount * (parseFloat(formula.base_rate_per_bird) || 0)
  const mortalityDed = birdCount * (mortalityPct / 100) * (parseFloat(formula.mortality_deduction_rate) || 0)
  const bonusEligible = productionPct >= (parseFloat(formula.production_target_pct) || 80)
  const prodBonus = bonusEligible ? birdCount * (parseFloat(formula.production_bonus_rate) || 0) : 0
  const totalPreview = basePay - mortalityDed + prodBonus

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      <div className="glass-card p-5 m-2">
        <h2 style={{ fontSize: '12pt', fontWeight: 700, marginBottom: 12, color: '#60a5fa' }}>
          Grower Payment Formula
        </h2>
        <p style={{ fontSize: '8pt', color: '#94a3b8', marginBottom: 16 }}>
          Configure how grower settlements are calculated. Each grower can have their own formula for base pay, mortality deductions, and production bonuses.
        </p>

        {/* Grower Selector */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 2 }}>SELECT GROWER</label>
          <select className="glass-input text-sm" value={selectedGrowerId}
            onChange={e => handleSelectGrower(e.target.value)}
            style={{ maxWidth: 400 }}>
            <option value="">-- Select Grower --</option>
            {growers.map(g => (
              <option key={g.id} value={g.id}>{g.name}{g.location ? ` — ${g.location}` : ''}</option>
            ))}
          </select>
          {hasExisting && selectedGrowerId && (
            <span style={{ fontSize: '7pt', color: '#34d399', marginLeft: 8 }}>Has existing formula</span>
          )}
        </div>

        {loading && <p style={{ fontSize: '9pt', color: '#94a3b8' }}>Loading formula...</p>}

        {selectedGrowerId && !loading && (
          <>
            {/* Formula Fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Base Rate per Bird ($)</label>
                <input className="glass-input text-sm" type="number" step="0.0001" min="0"
                  value={formula.base_rate_per_bird} onChange={e => updateField('base_rate_per_bird', e.target.value)}
                  placeholder="e.g. 0.0650" style={{ textAlign: 'right' }} />
                <span style={{ fontSize: '7pt', color: '#64748b' }}>Paid per bird placed</span>
              </div>
              <div>
                <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Mortality Deduction Rate ($)</label>
                <input className="glass-input text-sm" type="number" step="0.0001" min="0"
                  value={formula.mortality_deduction_rate} onChange={e => updateField('mortality_deduction_rate', e.target.value)}
                  placeholder="e.g. 0.0200" style={{ textAlign: 'right' }} />
                <span style={{ fontSize: '7pt', color: '#64748b' }}>Per dead bird deduction</span>
              </div>
              <div>
                <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Production Bonus Rate ($)</label>
                <input className="glass-input text-sm" type="number" step="0.0001" min="0"
                  value={formula.production_bonus_rate} onChange={e => updateField('production_bonus_rate', e.target.value)}
                  placeholder="e.g. 0.0100" style={{ textAlign: 'right' }} />
                <span style={{ fontSize: '7pt', color: '#64748b' }}>Per bird if target met</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Production Target (%)</label>
                <input className="glass-input text-sm" type="number" step="0.01" min="0" max="100"
                  value={formula.production_target_pct} onChange={e => updateField('production_target_pct', e.target.value)}
                  placeholder="80" style={{ textAlign: 'right' }} />
                <span style={{ fontSize: '7pt', color: '#64748b' }}>Min % for bonus eligibility</span>
              </div>
              <div>
                <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Feed Conversion Bonus ($)</label>
                <input className="glass-input text-sm" type="number" step="0.0001" min="0"
                  value={formula.feed_conversion_bonus} onChange={e => updateField('feed_conversion_bonus', e.target.value)}
                  placeholder="e.g. 0.0050" style={{ textAlign: 'right' }} />
                <span style={{ fontSize: '7pt', color: '#64748b' }}>Per bird if FCR target met</span>
              </div>
              <div>
                <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Notes</label>
                <input className="glass-input text-sm" value={formula.notes}
                  onChange={e => updateField('notes', e.target.value)}
                  placeholder="Contract notes..." />
              </div>
            </div>

            {/* Preview Calculation */}
            <div style={{
              padding: 12, borderRadius: 12, marginBottom: 16,
              background: 'rgba(96,165,250,0.05)', border: '1px solid rgba(96,165,250,0.15)',
            }}>
              <span style={{ fontSize: '7pt', color: '#60a5fa', display: 'block', marginBottom: 8, fontWeight: 600 }}>
                EXAMPLE CALCULATION — {birdCount.toLocaleString()} birds, {mortalityPct}% mortality, {productionPct}% production
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                <div>
                  <span style={{ fontSize: '7pt', color: '#94a3b8', display: 'block' }}>Base Pay</span>
                  <span style={{ fontSize: '10pt', fontWeight: 600, color: '#e2e8f0' }}>${basePay.toFixed(2)}</span>
                </div>
                <div>
                  <span style={{ fontSize: '7pt', color: '#f87171', display: 'block' }}>Mortality Deduction</span>
                  <span style={{ fontSize: '10pt', fontWeight: 600, color: '#f87171' }}>-${mortalityDed.toFixed(2)}</span>
                </div>
                <div>
                  <span style={{ fontSize: '7pt', color: '#34d399', display: 'block' }}>Production Bonus</span>
                  <span style={{ fontSize: '10pt', fontWeight: 600, color: bonusEligible ? '#34d399' : '#64748b' }}>
                    {bonusEligible ? `+$${prodBonus.toFixed(2)}` : '$0.00 (below target)'}
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: '7pt', color: '#60a5fa', display: 'block' }}>Total Settlement</span>
                  <span style={{ fontSize: '12pt', fontWeight: 700, color: '#60a5fa' }}>${totalPreview.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
              <button type="button" onClick={() => { setFormula({ ...defaultFormula }); setHasExisting(false) }}
                className="glass-button-secondary text-sm">Reset</button>
              <button type="button" onClick={handleSave} disabled={saving} className="glass-button-primary text-sm">
                {saving ? 'Saving...' : hasExisting ? 'Update Formula' : 'Save Formula'}
              </button>
            </div>
          </>
        )}

        {!selectedGrowerId && (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: '9pt' }}>
            Select a grower above to configure their payment formula.
          </div>
        )}
      </div>
    </div>
  )
}
