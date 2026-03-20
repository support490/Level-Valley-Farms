import { useState, useEffect } from 'react'
import { allocateExpense, getActiveFlocks, getAccounts } from '../../api/accounting'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'

const today = () => new Date().toISOString().split('T')[0]

export default function AllocateExpense() {
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState('')
  const [expenseDate, setExpenseDate] = useState(today())
  const [method, setMethod] = useState('bird_count')

  const [flocks, setFlocks] = useState([])
  const [accounts, setAccounts] = useState([])
  const [selectedFlocks, setSelectedFlocks] = useState({})
  const [customAmounts, setCustomAmounts] = useState({})
  const [customPcts, setCustomPcts] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const { toast, showToast, hideToast } = useToast()

  useEffect(() => {
    const load = async () => {
      try {
        const [flockRes, acctRes] = await Promise.all([getActiveFlocks(), getAccounts()])
        const flockData = flockRes.data || []
        const acctData = acctRes.data || []
        setFlocks(flockData)
        setAccounts(acctData)

        // Select all flocks by default
        const sel = {}
        flockData.forEach(f => { sel[f.id || f.flock_id] = true })
        setSelectedFlocks(sel)
      } catch {
        showToast('Error loading data', 'error')
      }
    }
    load()
  }, [])

  const expenseAccounts = accounts.filter(a => a.account_type === 'expense')

  const totalAmount = parseFloat(amount) || 0
  const checkedFlocks = flocks.filter(f => selectedFlocks[f.id || f.flock_id])
  const totalBirds = checkedFlocks.reduce((s, f) => s + (f.bird_count || 0), 0)

  // Toggle flock selection
  const toggleFlock = (flockId) => {
    setSelectedFlocks(prev => ({ ...prev, [flockId]: !prev[flockId] }))
  }

  const selectAll = () => {
    const sel = {}
    flocks.forEach(f => { sel[f.id || f.flock_id] = true })
    setSelectedFlocks(sel)
  }

  const selectNone = () => setSelectedFlocks({})

  // Compute allocations based on method
  const computeAllocations = () => {
    if (checkedFlocks.length === 0 || totalAmount <= 0) return []

    return checkedFlocks.map(f => {
      const flockId = f.id || f.flock_id
      let pct = 0
      let allocAmount = 0

      if (method === 'bird_count') {
        pct = totalBirds > 0 ? ((f.bird_count || 0) / totalBirds * 100) : 0
        allocAmount = totalBirds > 0 ? (totalAmount * (f.bird_count || 0) / totalBirds) : 0
      } else if (method === 'equal') {
        pct = 100 / checkedFlocks.length
        allocAmount = totalAmount / checkedFlocks.length
      } else if (method === 'custom') {
        pct = parseFloat(customPcts[flockId]) || 0
        allocAmount = parseFloat(customAmounts[flockId]) || 0
      }

      return {
        flock: f,
        flock_id: flockId,
        percentage: pct,
        amount: allocAmount,
      }
    })
  }

  const allocations = computeAllocations()
  const allocatedTotal = allocations.reduce((s, a) => s + a.amount, 0)
  const unallocated = totalAmount - allocatedTotal

  // Update custom percentage and recalculate amount
  const updateCustomPct = (flockId, pct) => {
    const p = parseFloat(pct) || 0
    setCustomPcts(prev => ({ ...prev, [flockId]: pct }))
    setCustomAmounts(prev => ({ ...prev, [flockId]: (totalAmount * p / 100).toFixed(2) }))
  }

  // Update custom amount and recalculate percentage
  const updateCustomAmount = (flockId, amt) => {
    const a = parseFloat(amt) || 0
    setCustomAmounts(prev => ({ ...prev, [flockId]: amt }))
    setCustomPcts(prev => ({ ...prev, [flockId]: totalAmount > 0 ? (a / totalAmount * 100).toFixed(2) : '0' }))
  }

  // ── Submit ──
  const handleAllocate = async () => {
    if (submitting) return
    if (!description) { showToast('Description is required', 'error'); return }
    if (totalAmount <= 0) { showToast('Enter an amount greater than zero', 'error'); return }
    if (!accountId) { showToast('Select an expense account', 'error'); return }
    if (checkedFlocks.length === 0) { showToast('Select at least one flock', 'error'); return }

    if (method === 'custom' && Math.abs(unallocated) > 0.01) {
      showToast(`Allocated total ($${allocatedTotal.toFixed(2)}) does not match expense amount ($${totalAmount.toFixed(2)})`, 'error')
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        description,
        amount: totalAmount,
        account_id: accountId,
        expense_date: expenseDate,
        allocation_method: method,
        flock_allocations: allocations.map(a => ({
          flock_id: a.flock_id,
          amount: parseFloat(a.amount.toFixed(2)),
          percentage: parseFloat(a.percentage.toFixed(2)),
        })),
      }
      await allocateExpense(payload)
      showToast(`Expense allocated to ${checkedFlocks.length} flocks`)

      // Reset form
      setDescription('')
      setAmount('')
      setAccountId('')
      setExpenseDate(today())
      setMethod('bird_count')
      setCustomAmounts({})
      setCustomPcts({})
      selectAll()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error allocating expense', 'error')
    } finally { setSubmitting(false) }
  }

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      <div className="glass-card p-4 m-2">
        <h2 style={{ fontSize: '14pt', fontWeight: 700, margin: '0 0 16px 0' }}>
          Allocate Shared Expense Across Flocks
        </h2>

        {/* Expense Details */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Description</label>
            <input className="glass-input text-sm" value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Shared utilities, farm insurance, shared vet visit..."
              style={{ fontSize: '10pt' }} />
          </div>
          <div>
            <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Total Amount</label>
            <input className="glass-input text-sm" type="number" step="0.01" min="0"
              value={amount} onChange={e => setAmount(e.target.value)}
              style={{ textAlign: 'right', fontSize: '10pt', fontWeight: 600 }} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Expense Account</label>
            <select className="glass-input text-sm" value={accountId}
              onChange={e => setAccountId(e.target.value)}>
              <option value="">-- Select Account --</option>
              {expenseAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.account_number} - {a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Date</label>
            <input className="glass-input text-sm" type="date" value={expenseDate}
              onChange={e => setExpenseDate(e.target.value)} />
          </div>
        </div>

        {/* Allocation Method */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 6 }}>Allocation Method</label>
          <div style={{ display: 'flex', gap: 16 }}>
            {[
              { key: 'bird_count', label: 'By Bird Count (proportional)' },
              { key: 'equal', label: 'Equal Split' },
              { key: 'custom', label: 'Custom' },
            ].map(opt => (
              <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '10pt', color: '#e2e8f0', cursor: 'pointer' }}>
                <input type="radio" name="alloc-method" value={opt.key}
                  checked={method === opt.key} onChange={() => setMethod(opt.key)} />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        {/* Flock Selection Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: '9pt', fontWeight: 600, color: '#e2e8f0' }}>
            Flock Allocations ({checkedFlocks.length} of {flocks.length} selected)
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="glass-button-secondary text-sm" style={{ padding: '1px 8px', fontSize: '8pt' }}
              onClick={selectAll}>Select All</button>
            <button type="button" className="glass-button-secondary text-sm" style={{ padding: '1px 8px', fontSize: '8pt' }}
              onClick={selectNone}>Select None</button>
          </div>
        </div>

        {/* Allocation Table */}
        {flocks.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 20, color: '#999' }}>No active flocks found.</p>
        ) : (
          <div className="border border-lvf-border rounded-xl p-3 bg-lvf-dark/20" style={{ marginBottom: 14 }}>
            <table className="glass-table w-full">
              <thead><tr>
                <th style={{ width: '5%' }}></th>
                <th style={{ width: '18%' }}>Flock #</th>
                <th style={{ width: '22%' }}>Grower</th>
                <th style={{ width: '15%', textAlign: 'right' }}>Birds</th>
                <th style={{ width: '18%', textAlign: 'right' }}>Allocation %</th>
                <th style={{ width: '22%', textAlign: 'right' }}>Amount</th>
              </tr></thead>
              <tbody>
                {flocks.map(f => {
                  const flockId = f.id || f.flock_id
                  const checked = !!selectedFlocks[flockId]
                  const alloc = allocations.find(a => a.flock_id === flockId)
                  const pct = alloc ? alloc.percentage : 0
                  const allocAmt = alloc ? alloc.amount : 0

                  return (
                    <tr key={flockId} style={{ opacity: checked ? 1 : 0.4 }}>
                      <td style={{ textAlign: 'center' }}>
                        <input type="checkbox" checked={checked}
                          onChange={() => toggleFlock(flockId)} />
                      </td>
                      <td style={{ fontWeight: 600 }}>{f.flock_number || f.name}</td>
                      <td style={{ color: '#94a3b8' }}>{f.grower_name || '-'}</td>
                      <td style={{ textAlign: 'right' }}>{(f.bird_count || 0).toLocaleString()}</td>
                      <td style={{ textAlign: 'right' }}>
                        {method === 'custom' && checked ? (
                          <input className="glass-input text-sm" type="number" step="0.01" min="0" max="100"
                            value={customPcts[flockId] || ''}
                            onChange={e => updateCustomPct(flockId, e.target.value)}
                            style={{ textAlign: 'right', width: 80 }}
                            placeholder="0" />
                        ) : (
                          <span style={{ fontSize: '10pt' }}>{pct.toFixed(1)}%</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {method === 'custom' && checked ? (
                          <input className="glass-input text-sm" type="number" step="0.01" min="0"
                            value={customAmounts[flockId] || ''}
                            onChange={e => updateCustomAmount(flockId, e.target.value)}
                            style={{ textAlign: 'right', width: 100 }}
                            placeholder="0.00" />
                        ) : (
                          <span style={{ fontSize: '10pt', fontWeight: 600 }}>${allocAmt.toFixed(2)}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot><tr>
                <td colSpan={4} style={{ border: 'none' }}></td>
                <td style={{ border: 'none', textAlign: 'right', paddingTop: 6, fontSize: '8pt', color: '#94a3b8' }}>Total</td>
                <td style={{ border: 'none', textAlign: 'right', fontWeight: 700, paddingTop: 6 }}>
                  ${allocatedTotal.toFixed(2)}
                </td>
              </tr></tfoot>
            </table>
          </div>
        )}

        {/* Preview: Journal Entries */}
        {totalAmount > 0 && checkedFlocks.length > 0 && (
          <div className="glass-card" style={{ padding: 12, marginBottom: 14 }}>
            <div style={{ fontSize: '9pt', fontWeight: 600, color: '#e2e8f0', marginBottom: 8 }}>
              Preview &mdash; Journal Entries to be Created
            </div>
            <table style={{ width: '100%', fontSize: '9pt', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={{ textAlign: 'left', padding: '3px 6px', color: '#94a3b8', fontWeight: 600 }}>Flock</th>
                  <th style={{ textAlign: 'left', padding: '3px 6px', color: '#94a3b8', fontWeight: 600 }}>Description</th>
                  <th style={{ textAlign: 'right', padding: '3px 6px', color: '#94a3b8', fontWeight: 600 }}>Debit</th>
                  <th style={{ textAlign: 'right', padding: '3px 6px', color: '#94a3b8', fontWeight: 600 }}>Credit</th>
                </tr>
              </thead>
              <tbody>
                {allocations.map(a => (
                  <tr key={a.flock_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '3px 6px', fontWeight: 600 }}>
                      {a.flock.flock_number || a.flock.name}
                    </td>
                    <td style={{ padding: '3px 6px', color: '#94a3b8' }}>
                      {description || 'Shared expense'} ({a.percentage.toFixed(1)}%)
                    </td>
                    <td style={{ padding: '3px 6px', textAlign: 'right' }}>${a.amount.toFixed(2)}</td>
                    <td style={{ padding: '3px 6px', textAlign: 'right', color: '#94a3b8' }}>-</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid rgba(255,255,255,0.15)' }}>
                  <td style={{ padding: '3px 6px' }}></td>
                  <td style={{ padding: '3px 6px', color: '#94a3b8' }}>Cash / AP</td>
                  <td style={{ padding: '3px 6px', textAlign: 'right', color: '#94a3b8' }}>-</td>
                  <td style={{ padding: '3px 6px', textAlign: 'right' }}>${allocatedTotal.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>

            {method === 'custom' && Math.abs(unallocated) > 0.01 && (
              <div style={{ marginTop: 8, fontSize: '8pt', color: '#f87171', fontWeight: 600 }}>
                Unallocated: ${unallocated.toFixed(2)} &mdash; custom amounts must sum to ${totalAmount.toFixed(2)}
              </div>
            )}
          </div>
        )}

        {/* Footer Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8 }}>
          <button type="button" className="glass-button-primary text-sm" disabled={submitting}
            onClick={handleAllocate}>
            {submitting ? 'Allocating...' : 'Allocate'}
          </button>
        </div>
      </div>
    </div>
  )
}
