import { useState, useEffect } from 'react'
import { Plus, TrendingUp, DollarSign, BarChart3 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import {
  getBudgets, createBudget, getBudgetVariance,
  getCostCenters, getDepreciation, createDepreciation,
  getBreakEven, getMarginAnalysis, getCashFlow, getFinancialKPIs,
} from '../../api/accounting'
import Modal from '../common/Modal'
import Toast from '../common/Toast'
import useToast from '../../hooks/useToast'

const CATEGORIES = ['feed', 'grower_payment', 'flock_cost', 'veterinary', 'service', 'chick_purchase', 'transport', 'utilities', 'other']

export default function BudgetAnalysis({ subTab = 'kpis' }) {
  const [kpis, setKpis] = useState(null)
  const [variance, setVariance] = useState(null)
  const [costCenters, setCostCenters] = useState(null)
  const [depreciation, setDepreciation] = useState([])
  const [breakEven, setBreakEven] = useState(null)
  const [margins, setMargins] = useState([])
  const [cashFlow, setCashFlow] = useState(null)
  const [budgets, setBudgets] = useState([])

  const [budgetOpen, setBudgetOpen] = useState(false)
  const [depOpen, setDepOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [varianceYear, setVarianceYear] = useState(new Date().getFullYear())
  const { toast, showToast, hideToast } = useToast()

  const [budgetForm, setBudgetForm] = useState({ name: '', year: new Date().getFullYear(), lines: CATEGORIES.map(c => ({ category: c, annual_amount: '' })) })
  const [depForm, setDepForm] = useState({ asset_name: '', purchase_date: '', purchase_cost: '', useful_life_months: '', salvage_value: '0' })

  useEffect(() => {
    if (subTab === 'kpis') getFinancialKPIs().then(r => setKpis(r.data)).catch(() => {})
    if (subTab === 'variance') getBudgetVariance(varianceYear).then(r => setVariance(r.data)).catch(() => {})
    if (subTab === 'costcenters') getCostCenters().then(r => setCostCenters(r.data)).catch(() => {})
    if (subTab === 'depreciation') getDepreciation().then(r => setDepreciation(r.data)).catch(() => {})
    if (subTab === 'breakeven') getBreakEven().then(r => setBreakEven(r.data)).catch(() => {})
    if (subTab === 'margins') getMarginAnalysis().then(r => setMargins(r.data)).catch(() => {})
    if (subTab === 'cashflow') getCashFlow().then(r => setCashFlow(r.data)).catch(() => {})
    if (subTab === 'budgets') getBudgets().then(r => setBudgets(r.data)).catch(() => {})
  }, [subTab, varianceYear])

  const handleCreateBudget = async (e) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      const lines = budgetForm.lines.filter(l => parseFloat(l.annual_amount) > 0).map(l => ({
        category: l.category, annual_amount: parseFloat(l.annual_amount),
        ...Object.fromEntries(['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].map(m => [m, parseFloat(l.annual_amount) / 12]))
      }))
      await createBudget({ name: budgetForm.name, year: parseInt(budgetForm.year), lines })
      showToast('Budget created'); setBudgetOpen(false); getBudgets().then(r => setBudgets(r.data))
    } catch (err) { showToast(err.response?.data?.detail || 'Error', 'error') }
    finally { setSubmitting(false) }
  }

  const handleCreateDep = async (e) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      await createDepreciation({ ...depForm, purchase_cost: parseFloat(depForm.purchase_cost), useful_life_months: parseInt(depForm.useful_life_months), salvage_value: parseFloat(depForm.salvage_value) || 0 })
      showToast('Asset added'); setDepOpen(false); getDepreciation().then(r => setDepreciation(r.data))
    } catch (err) { showToast(err.response?.data?.detail || 'Error', 'error') }
    finally { setSubmitting(false) }
  }

  const catLabel = (c) => c.replace(/_/g, ' ').replace(/\b\w/g, x => x.toUpperCase())

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      {/* ═══ FINANCIAL KPIs ═══ */}
      {subTab === 'kpis' && kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Revenue YTD', value: `$${kpis.revenue_ytd.toLocaleString()}`, color: 'text-lvf-success' },
            { label: 'Expenses YTD', value: `$${kpis.expenses_ytd.toLocaleString()}`, color: 'text-lvf-danger' },
            { label: 'Net Income', value: `$${kpis.net_income_ytd.toLocaleString()}`, color: kpis.net_income_ytd >= 0 ? 'text-lvf-success' : 'text-lvf-danger' },
            { label: 'Profit Margin', value: `${kpis.profit_margin_pct}%`, color: kpis.profit_margin_pct >= 0 ? 'text-lvf-success' : 'text-lvf-danger' },
            { label: 'Dozens Produced', value: kpis.total_dozens_ytd.toLocaleString(), color: 'text-lvf-accent' },
            { label: 'Cost/Dozen', value: `$${kpis.cost_per_dozen.toFixed(4)}`, color: 'text-lvf-danger' },
            { label: 'Revenue/Dozen', value: `$${kpis.revenue_per_dozen.toFixed(4)}`, color: 'text-lvf-success' },
            { label: 'Active Flocks', value: kpis.active_flocks, color: 'text-lvf-accent' },
          ].map(({ label, value, color }) => (
            <div key={label} className="glass-card stat-glow p-4">
              <p className="text-xs text-lvf-muted mb-1">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ═══ BUDGET VARIANCE ═══ */}
      {subTab === 'variance' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <label className="text-sm text-lvf-muted">Year:</label>
            <input className="glass-input w-24" type="number" value={varianceYear} onChange={e => setVarianceYear(parseInt(e.target.value))} />
          </div>
          {variance && (
            <div className="glass-card overflow-hidden">
              <table className="w-full glass-table">
                <thead><tr><th>Category</th><th className="text-right">Budget</th><th className="text-right">Actual</th><th className="text-right">Variance</th></tr></thead>
                <tbody>
                  {variance.categories.filter(c => c.annual_budget > 0 || c.annual_actual > 0).map(c => (
                    <tr key={c.category}>
                      <td className="font-medium">{catLabel(c.category)}</td>
                      <td className="text-right font-mono">${c.annual_budget.toLocaleString()}</td>
                      <td className="text-right font-mono">${c.annual_actual.toLocaleString()}</td>
                      <td className={`text-right font-mono font-bold ${c.annual_variance >= 0 ? 'text-lvf-success' : 'text-lvf-danger'}`}>
                        ${c.annual_variance.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ BUDGETS LIST ═══ */}
      {subTab === 'budgets' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setBudgetOpen(true)} className="glass-button-primary flex items-center gap-2"><Plus size={14} /> New Budget</button>
          </div>
          <div className="space-y-4">
            {budgets.map(b => (
              <div key={b.id} className="glass-card p-5">
                <div className="flex justify-between mb-3">
                  <div><h4 className="font-semibold">{b.name}</h4><p className="text-xs text-lvf-muted">{b.year}</p></div>
                  <p className="text-lg font-bold">${b.total_amount.toLocaleString()}</p>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                  {b.lines.map(l => (
                    <div key={l.category} className="p-2 rounded-lg bg-lvf-dark/40 text-center">
                      <p className="text-[10px] text-lvf-muted">{catLabel(l.category)}</p>
                      <p className="text-sm font-bold">${l.annual_amount.toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {budgets.length === 0 && <div className="glass-card p-8 text-center text-lvf-muted">No budgets created yet.</div>}
          </div>
        </div>
      )}

      {/* ═══ COST CENTERS ═══ */}
      {subTab === 'costcenters' && costCenters && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-semibold text-lvf-muted mb-3">By Flock</h4>
            <div className="glass-card overflow-hidden">
              <table className="w-full glass-table">
                <thead><tr><th>Flock</th><th className="text-right">Total Expenses</th></tr></thead>
                <tbody>
                  {costCenters.by_flock.map(f => (
                    <tr key={f.flock_id}><td className="text-lvf-accent font-medium">{f.flock_number}</td><td className="text-right font-mono">${f.total_expenses.toLocaleString()}</td></tr>
                  ))}
                  {costCenters.by_flock.length === 0 && <tr><td colSpan={2} className="text-center py-6 text-lvf-muted">No data</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-lvf-muted mb-3">By Grower</h4>
            <div className="glass-card overflow-hidden">
              <table className="w-full glass-table">
                <thead><tr><th>Grower</th><th className="text-right">Total Expenses</th></tr></thead>
                <tbody>
                  {costCenters.by_grower.map(g => (
                    <tr key={g.grower_name}><td className="font-medium">{g.grower_name}</td><td className="text-right font-mono">${g.total_expenses.toLocaleString()}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══ DEPRECIATION ═══ */}
      {subTab === 'depreciation' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setDepOpen(true)} className="glass-button-primary flex items-center gap-2"><Plus size={14} /> Add Asset</button>
          </div>
          <div className="glass-card overflow-hidden">
            <table className="w-full glass-table">
              <thead><tr><th>Asset</th><th>Purchase Date</th><th className="text-right">Cost</th><th className="text-right">Monthly Dep.</th><th className="text-right">Accumulated</th><th className="text-right">Book Value</th><th className="text-right">Months</th></tr></thead>
              <tbody>
                {depreciation.map(d => (
                  <tr key={d.id}>
                    <td className="font-medium">{d.asset_name}</td>
                    <td className="text-lvf-muted">{d.purchase_date}</td>
                    <td className="text-right font-mono">${d.purchase_cost.toLocaleString()}</td>
                    <td className="text-right font-mono">${d.monthly_depreciation.toFixed(2)}</td>
                    <td className="text-right font-mono text-lvf-warning">${d.expected_accumulated.toLocaleString()}</td>
                    <td className="text-right font-mono font-bold">${d.book_value.toLocaleString()}</td>
                    <td className="text-right text-lvf-muted">{d.months_elapsed} / {d.useful_life_months}</td>
                  </tr>
                ))}
                {depreciation.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-lvf-muted">No assets.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ BREAK-EVEN ═══ */}
      {subTab === 'breakeven' && breakEven && (
        <div className="max-w-2xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="glass-card p-4 text-center"><p className="text-xs text-lvf-muted">Revenue/Doz</p><p className="text-xl font-bold text-lvf-success">${breakEven.revenue_per_dozen.toFixed(4)}</p></div>
            <div className="glass-card p-4 text-center"><p className="text-xs text-lvf-muted">Cost/Doz</p><p className="text-xl font-bold text-lvf-danger">${breakEven.cost_per_dozen.toFixed(4)}</p></div>
            <div className="glass-card p-4 text-center"><p className="text-xs text-lvf-muted">Margin/Doz</p><p className={`text-xl font-bold ${breakEven.margin_per_dozen >= 0 ? 'text-lvf-success' : 'text-lvf-danger'}`}>${breakEven.margin_per_dozen.toFixed(4)}</p></div>
            <div className="glass-card p-4 text-center"><p className="text-xs text-lvf-muted">Break-Even</p><p className="text-xl font-bold text-lvf-accent">{breakEven.break_even_dozens.toLocaleString()} doz</p></div>
          </div>
          <div className="glass-card p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-3 h-3 rounded-full ${breakEven.is_profitable ? 'bg-lvf-success' : 'bg-lvf-danger'}`} />
              <span className="font-semibold">{breakEven.is_profitable ? 'Profitable' : 'Below Break-Even'}</span>
            </div>
            <p className="text-sm text-lvf-muted">Period: {breakEven.period}</p>
            <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
              <div><span className="text-lvf-muted">Total Revenue: </span><span className="font-mono font-bold text-lvf-success">${breakEven.total_revenue.toLocaleString()}</span></div>
              <div><span className="text-lvf-muted">Total Expenses: </span><span className="font-mono font-bold text-lvf-danger">${breakEven.total_expenses.toLocaleString()}</span></div>
              <div><span className="text-lvf-muted">Dozens Produced: </span><span className="font-mono font-bold">{breakEven.total_dozens_produced.toLocaleString()}</span></div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MARGIN ANALYSIS ═══ */}
      {subTab === 'margins' && (
        <div className="glass-card overflow-hidden">
          <table className="w-full glass-table">
            <thead><tr><th>Contract</th><th>Buyer</th><th>Grade</th><th className="text-right">$/Doz</th><th className="text-right">Dozens</th><th className="text-right">Revenue</th><th className="text-right">Freight</th><th className="text-right">Net</th><th className="text-right">Margin %</th></tr></thead>
            <tbody>
              {margins.map(m => (
                <tr key={m.contract_number}>
                  <td className="font-semibold text-lvf-accent">{m.contract_number}</td>
                  <td>{m.buyer}</td>
                  <td className="text-xs">{m.grade || 'Any'}</td>
                  <td className="text-right font-mono">{m.price_per_dozen ? `$${m.price_per_dozen.toFixed(2)}` : '—'}</td>
                  <td className="text-right font-mono">{m.total_dozens.toLocaleString()}</td>
                  <td className="text-right font-mono text-lvf-success">${m.revenue.toLocaleString()}</td>
                  <td className="text-right font-mono text-lvf-danger">${m.freight.toLocaleString()}</td>
                  <td className="text-right font-mono font-bold">${m.net_revenue.toLocaleString()}</td>
                  <td className={`text-right font-mono font-bold ${m.margin_pct >= 80 ? 'text-lvf-success' : m.margin_pct >= 50 ? 'text-lvf-warning' : 'text-lvf-danger'}`}>{m.margin_pct}%</td>
                </tr>
              ))}
              {margins.length === 0 && <tr><td colSpan={9} className="text-center py-8 text-lvf-muted">No contract data.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ CASH FLOW ═══ */}
      {subTab === 'cashflow' && cashFlow && (
        <div>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="glass-card stat-glow p-4 text-center"><p className="text-xs text-lvf-muted">Total Receipts</p><p className="text-2xl font-bold text-lvf-success">${cashFlow.total_receipts.toLocaleString()}</p></div>
            <div className="glass-card stat-glow p-4 text-center"><p className="text-xs text-lvf-muted">Total Disbursements</p><p className="text-2xl font-bold text-lvf-danger">${cashFlow.total_disbursements.toLocaleString()}</p></div>
            <div className="glass-card stat-glow p-4 text-center"><p className="text-xs text-lvf-muted">Net Cash Flow</p><p className={`text-2xl font-bold ${cashFlow.net_cash_flow >= 0 ? 'text-lvf-success' : 'text-lvf-danger'}`}>${cashFlow.net_cash_flow.toLocaleString()}</p></div>
          </div>
          <div className="glass-card p-5 mb-6">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={cashFlow.months}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,160,255,0.08)" />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={v => `$${v}`} />
                <Tooltip contentStyle={{ backgroundColor: 'rgba(15,23,42,0.95)', border: '1px solid rgba(100,160,255,0.15)', borderRadius: '0.75rem', fontSize: 12 }} formatter={v => `$${v.toLocaleString()}`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="receipts" fill="#34d399" name="Receipts" radius={[4,4,0,0]} />
                <Bar dataKey="disbursements" fill="#f87171" name="Disbursements" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="glass-card overflow-hidden">
            <table className="w-full glass-table">
              <thead><tr><th>Month</th><th className="text-right">Receipts</th><th className="text-right">Disbursements</th><th className="text-right">Net Cash Flow</th></tr></thead>
              <tbody>
                {cashFlow.months.map(m => (
                  <tr key={m.month}>
                    <td className="font-medium">{m.month}</td>
                    <td className="text-right font-mono text-lvf-success">${m.receipts.toLocaleString()}</td>
                    <td className="text-right font-mono text-lvf-danger">${m.disbursements.toLocaleString()}</td>
                    <td className={`text-right font-mono font-bold ${m.net_cash_flow >= 0 ? 'text-lvf-success' : 'text-lvf-danger'}`}>${m.net_cash_flow.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ MODALS ═══ */}
      <Modal isOpen={budgetOpen} onClose={() => setBudgetOpen(false)} title="Create Budget" size="lg">
        <form onSubmit={handleCreateBudget} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm text-lvf-muted mb-1">Name *</label><input className="glass-input w-full" required value={budgetForm.name} placeholder="e.g. 2026 Operating Budget" onChange={e => setBudgetForm({ ...budgetForm, name: e.target.value })} /></div>
            <div><label className="block text-sm text-lvf-muted mb-1">Year *</label><input className="glass-input w-full" type="number" required value={budgetForm.year} onChange={e => setBudgetForm({ ...budgetForm, year: e.target.value })} /></div>
          </div>
          <div>
            <label className="text-sm text-lvf-muted mb-2 block">Annual Budget by Category</label>
            <div className="space-y-2">
              {budgetForm.lines.map((l, i) => (
                <div key={l.category} className="flex items-center gap-3">
                  <span className="text-sm w-40">{catLabel(l.category)}</span>
                  <input className="glass-input flex-1" type="number" step="0.01" min="0" value={l.annual_amount} placeholder="$0.00"
                    onChange={e => { const lines = [...budgetForm.lines]; lines[i] = { ...l, annual_amount: e.target.value }; setBudgetForm({ ...budgetForm, lines }) }} />
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setBudgetOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">{submitting ? 'Creating...' : 'Create Budget'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={depOpen} onClose={() => setDepOpen(false)} title="Add Depreciable Asset" size="md">
        <form onSubmit={handleCreateDep} className="space-y-4">
          <div><label className="block text-sm text-lvf-muted mb-1">Asset Name *</label><input className="glass-input w-full" required value={depForm.asset_name} onChange={e => setDepForm({ ...depForm, asset_name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm text-lvf-muted mb-1">Purchase Date *</label><input className="glass-input w-full" type="date" required value={depForm.purchase_date} onChange={e => setDepForm({ ...depForm, purchase_date: e.target.value })} /></div>
            <div><label className="block text-sm text-lvf-muted mb-1">Purchase Cost *</label><input className="glass-input w-full" type="number" step="0.01" required value={depForm.purchase_cost} onChange={e => setDepForm({ ...depForm, purchase_cost: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm text-lvf-muted mb-1">Useful Life (months) *</label><input className="glass-input w-full" type="number" min="1" required value={depForm.useful_life_months} onChange={e => setDepForm({ ...depForm, useful_life_months: e.target.value })} /></div>
            <div><label className="block text-sm text-lvf-muted mb-1">Salvage Value</label><input className="glass-input w-full" type="number" step="0.01" value={depForm.salvage_value} onChange={e => setDepForm({ ...depForm, salvage_value: e.target.value })} /></div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setDepOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">{submitting ? 'Adding...' : 'Add Asset'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
