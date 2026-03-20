import { useState, useEffect } from 'react'
import {
  getFinanceCharges, assessFinanceCharges, waiveFinanceCharge,
} from '../../api/accounting'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'

const statusConfig = {
  pending:  { label: 'Pending',  bg: 'bg-yellow-500/20', text: 'text-yellow-300', border: 'border-yellow-500/40' },
  assessed: { label: 'Assessed', bg: 'bg-blue-500/20',   text: 'text-blue-300',   border: 'border-blue-500/40' },
  waived:   { label: 'Waived',   bg: 'bg-gray-500/20',   text: 'text-gray-300',   border: 'border-gray-500/40' },
  paid:     { label: 'Paid',     bg: 'bg-green-500/20',  text: 'text-green-300',  border: 'border-green-500/40' },
}

function StatusBadge({ status }) {
  const cfg = statusConfig[status] || statusConfig.pending
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.label}
    </span>
  )
}

export default function FinanceCharges() {
  const [filterTab, setFilterTab] = useState('all')

  // List state
  const [charges, setCharges] = useState([])
  const [loading, setLoading] = useState(false)

  // Assess form state
  const [annualRate, setAnnualRate] = useState('18.0')
  const [graceDays, setGraceDays] = useState('30')
  const [assessing, setAssessing] = useState(false)
  const [assessResult, setAssessResult] = useState(null)

  const { toast, showToast, hideToast } = useToast()

  // ── Load list ──
  const loadCharges = async () => {
    setLoading(true)
    try {
      const params = filterTab !== 'all' ? { status: filterTab } : {}
      const res = await getFinanceCharges(params)
      setCharges(res.data || [])
    } catch {
      setCharges([])
    } finally { setLoading(false) }
  }

  useEffect(() => { loadCharges() }, [filterTab])

  // ── Assess Finance Charges ──
  const handleAssess = async () => {
    const rate = parseFloat(annualRate)
    const days = parseInt(graceDays, 10)
    if (!rate || rate <= 0) { showToast('Enter a valid annual rate', 'error'); return }
    if (!days || days < 0) { showToast('Enter a valid grace period', 'error'); return }
    setAssessing(true)
    setAssessResult(null)
    try {
      const res = await assessFinanceCharges(rate, days)
      const result = res.data || {}
      setAssessResult(result)
      showToast(`Finance charges assessed: ${result.invoices_charged || 0} invoices, $${(result.total_amount || 0).toFixed(2)} total`)
      loadCharges()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error assessing finance charges', 'error')
    } finally { setAssessing(false) }
  }

  // ── Waive ──
  const handleWaive = async (charge) => {
    if (!confirm(`Waive finance charge ${charge.charge_number || '#' + charge.id} ($${(charge.amount || 0).toFixed(2)})?`)) return
    try {
      await waiveFinanceCharge(charge.id)
      showToast('Finance charge waived')
      loadCharges()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error waiving finance charge', 'error')
    }
  }

  // ════════════════════════════════════════
  // MAIN VIEW
  // ════════════════════════════════════════
  const filterTabs = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'assessed', label: 'Assessed' },
    { key: 'waived', label: 'Waived' },
    { key: 'paid', label: 'Paid' },
  ]

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      {/* ── Assess Finance Charges Settings ── */}
      <div className="glass-card p-4 m-2">
        <h2 style={{ fontSize: '14pt', fontWeight: 700, margin: 0, marginBottom: 12 }}>
          Finance Charges &mdash; Late Fee Assessment
        </h2>

        <div className="border border-lvf-border rounded-xl p-4 bg-lvf-dark/20" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: '10pt', fontWeight: 600, marginBottom: 10, color: '#94a3b8' }}>
            Assess Charges on Overdue Invoices
          </h3>

          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
            <div style={{ flex: '0 0 160px' }}>
              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Annual Rate (%)</label>
              <input className="glass-input text-sm" type="number" step="0.1" min="0" max="100"
                value={annualRate} onChange={e => setAnnualRate(e.target.value)}
                style={{ textAlign: 'right' }} />
            </div>
            <div style={{ flex: '0 0 160px' }}>
              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Grace Period (days)</label>
              <input className="glass-input text-sm" type="number" step="1" min="0"
                value={graceDays} onChange={e => setGraceDays(e.target.value)}
                style={{ textAlign: 'right' }} />
            </div>
            <div>
              <button className="glass-button-primary text-sm" onClick={handleAssess} disabled={assessing}
                style={{ padding: '6px 16px' }}>
                {assessing ? 'Assessing...' : 'Assess Charges'}
              </button>
            </div>
          </div>

          {/* Assess Result */}
          {assessResult && (
            <div style={{
              marginTop: 12, padding: '8px 12px', borderRadius: 8,
              background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.3)',
            }}>
              <div style={{ display: 'flex', gap: 24, fontSize: '10pt' }}>
                <div>
                  <span style={{ color: '#999' }}>Invoices Charged: </span>
                  <span style={{ fontWeight: 700, color: '#60a5fa' }}>{assessResult.invoices_charged || 0}</span>
                </div>
                <div>
                  <span style={{ color: '#999' }}>Total Amount: </span>
                  <span style={{ fontWeight: 700, color: '#60a5fa' }}>${(assessResult.total_amount || 0).toFixed(2)}</span>
                </div>
                {assessResult.date && (
                  <div>
                    <span style={{ color: '#999' }}>Assessed Date: </span>
                    <span style={{ color: '#94a3b8' }}>{assessResult.date}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Finance Charges List ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontSize: '11pt', fontWeight: 600, margin: 0 }}>Charge History</h3>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 px-2 mb-3">
          {filterTabs.map(tab => (
            <button key={tab.key}
              className={filterTab === tab.key
                ? 'bg-lvf-dark/60 text-lvf-accent font-semibold px-3 py-1.5 text-sm rounded-t-lg border border-lvf-border border-b-0'
                : 'px-3 py-1.5 text-sm text-lvf-muted hover:text-lvf-text cursor-pointer'}
              onClick={() => setFilterTab(tab.key)}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <p style={{ textAlign: 'center', padding: 20, color: '#999' }}>Loading finance charges...</p>
        ) : charges.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 20, color: '#999' }}>No finance charges found. Use "Assess Charges" above to auto-charge overdue invoices.</p>
        ) : (
          <table className="glass-table w-full">
            <thead>
              <tr>
                <th>Charge #</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Invoice #</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {charges.map(c => {
                const st = c.status || 'pending'
                return (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.charge_number || `FC-${c.id}`}</td>
                    <td style={{ color: '#94a3b8' }}>{c.charge_date || c.assessed_date || '-'}</td>
                    <td>{c.customer_name || '-'}</td>
                    <td style={{ color: '#94a3b8' }}>{c.invoice_number || '-'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>${(c.amount || 0).toFixed(2)}</td>
                    <td style={{ textAlign: 'center' }}><StatusBadge status={st} /></td>
                    <td style={{ textAlign: 'center' }}>
                      {st === 'pending' && (
                        <button className="glass-button-secondary text-sm"
                          style={{ padding: '2px 8px', fontSize: '8pt' }}
                          onClick={() => handleWaive(c)}>
                          Waive
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
