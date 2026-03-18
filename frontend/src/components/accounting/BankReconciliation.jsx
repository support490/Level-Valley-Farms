import { useState, useEffect } from 'react'
import {
  getBankAccounts,
  startReconciliation,
  getReconciliation,
  toggleReconciliationItem,
  finishReconciliation,
  getReconciliationHistory,
} from '../../api/accounting'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'

function formatDollars(value) {
  if (value == null) return '$0.00'
  const num = Number(value)
  if (isNaN(num)) return '$0.00'
  const abs = Math.abs(num)
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return num < 0 ? `-$${formatted}` : `$${formatted}`
}

// ── Screen 1: Start ─────────────────────────────────────────────────────────
function StartScreen({ bankAccounts, onBegin, showToast }) {
  const [bankAccountId, setBankAccountId] = useState('')
  const [statementDate, setStatementDate] = useState('')
  const [statementEndingBalance, setStatementEndingBalance] = useState('')
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (bankAccounts.length > 0 && !bankAccountId) {
      setBankAccountId(bankAccounts[0].id)
    }
  }, [bankAccounts])

  useEffect(() => {
    if (!bankAccountId) { setHistory([]); return }
    async function loadHistory() {
      setLoadingHistory(true)
      try {
        const res = await getReconciliationHistory(bankAccountId)
        setHistory(res.data || [])
      } catch {
        setHistory([])
      } finally {
        setLoadingHistory(false)
      }
    }
    loadHistory()
  }, [bankAccountId])

  async function handleBegin() {
    if (!bankAccountId || !statementDate || statementEndingBalance === '') {
      showToast('Please fill in all fields', 'error')
      return
    }
    setSubmitting(true)
    try {
      const res = await startReconciliation({
        bank_account_id: bankAccountId,
        statement_date: statementDate,
        statement_ending_balance: Number(statementEndingBalance),
      })
      const reconcId = res.data?.id
      if (reconcId) {
        onBegin(reconcId)
      } else {
        showToast('Unexpected response — no reconciliation ID', 'error')
      }
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to start reconciliation', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedAccountName = bankAccounts.find(a => a.id == bankAccountId)?.name || ''

  return (
    <div>
      <div className="glass-card p-4 m-2">
        <h3 style={{ fontSize: '11pt', fontWeight: 700, marginBottom: 12 }}>Begin Reconciliation</h3>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '8pt', fontWeight: 600 }}>Bank Account</label>
            <select
              className="glass-input text-sm"
              style={{ width: 240 }}
              value={bankAccountId}
              onChange={e => setBankAccountId(e.target.value)}
            >
              {bankAccounts.map(acct => (
                <option key={acct.id} value={acct.id}>
                  {acct.account_number ? `${acct.account_number} - ` : ''}{acct.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '8pt', fontWeight: 600 }}>Statement Date</label>
            <input
              type="date"
              className="glass-input text-sm"
              style={{ width: 160 }}
              value={statementDate}
              onChange={e => setStatementDate(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '8pt', fontWeight: 600 }}>Statement Ending Balance</label>
            <input
              type="number"
              step="0.01"
              className="glass-input text-sm"
              style={{ width: 160 }}
              placeholder="0.00"
              value={statementEndingBalance}
              onChange={e => setStatementEndingBalance(e.target.value)}
            />
          </div>

          <button
            className="glass-button-primary text-sm"
            disabled={submitting}
            onClick={handleBegin}
          >
            {submitting ? 'Starting...' : 'Begin Reconciliation'}
          </button>
        </div>
      </div>

      {/* Reconciliation History */}
      <div className="glass-card p-4 m-2" style={{ marginTop: 8 }}>
        <h3 style={{ fontSize: '10pt', fontWeight: 700, marginBottom: 8 }}>
          Reconciliation History{selectedAccountName ? ` — ${selectedAccountName}` : ''}
        </h3>

        {loadingHistory ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#888', fontSize: '8pt' }}>Loading history...</div>
        ) : history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#888', fontSize: '8pt' }}>
            No previous reconciliations for this account.
          </div>
        ) : (
          <table className="glass-table w-full">
            <thead>
              <tr>
                <th>Statement Date</th>
                <th style={{ textAlign: 'right' }}>Statement Ending Balance</th>
                <th style={{ textAlign: 'right' }}>Cleared Balance</th>
                <th style={{ textAlign: 'right' }}>Difference</th>
                <th>Status</th>
                <th>Completed</th>
              </tr>
            </thead>
            <tbody>
              {history.map((rec, idx) => (
                <tr key={rec.id || idx}>
                  <td>{rec.statement_date}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'Tahoma, monospace' }}>
                    {formatDollars(rec.statement_ending_balance)}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'Tahoma, monospace' }}>
                    {formatDollars(rec.cleared_balance)}
                  </td>
                  <td style={{
                    textAlign: 'right', fontFamily: 'Tahoma, monospace',
                    color: Number(rec.difference) === 0 ? '#276738' : '#c0392b',
                  }}>
                    {formatDollars(rec.difference)}
                  </td>
                  <td>
                    <span style={{
                      fontSize: '7pt', fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                      background: rec.status === 'completed' ? '#d4edda' : '#ffecd2',
                      color: rec.status === 'completed' ? '#276738' : '#a05a00',
                    }}>
                      {rec.status?.toUpperCase() || 'UNKNOWN'}
                    </span>
                  </td>
                  <td style={{ fontSize: '8pt', color: '#888' }}>{rec.completed_at || rec.created_at || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Screen 2: Reconcile ─────────────────────────────────────────────────────
function ReconcileScreen({ reconcId, onCancel, onComplete, showToast }) {
  const [reconciliation, setReconciliation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(null)
  const [finishing, setFinishing] = useState(false)

  async function loadReconciliation() {
    setLoading(true)
    try {
      const res = await getReconciliation(reconcId)
      setReconciliation(res.data)
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to load reconciliation', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadReconciliation() }, [reconcId])

  async function handleToggle(itemId) {
    setToggling(itemId)
    try {
      await toggleReconciliationItem(reconcId, itemId)
      await loadReconciliation()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to toggle item', 'error')
    } finally {
      setToggling(null)
    }
  }

  async function handleFinish() {
    setFinishing(true)
    try {
      await finishReconciliation(reconcId)
      showToast('Reconciliation completed successfully!', 'success')
      onComplete()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to complete reconciliation', 'error')
    } finally {
      setFinishing(false)
    }
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40, color: '#888', fontSize: '9pt' }}>Loading reconciliation...</div>
  }

  if (!reconciliation) {
    return <div style={{ textAlign: 'center', padding: 40, color: '#c0392b', fontSize: '9pt' }}>Reconciliation data unavailable.</div>
  }

  const items = reconciliation.items || []
  const checksAndPayments = items.filter(item => Number(item.amount) < 0)
  const depositsAndCredits = items.filter(item => Number(item.amount) >= 0)

  const clearedDeposits = depositsAndCredits
    .filter(item => item.cleared)
    .reduce((sum, item) => sum + Number(item.amount), 0)

  const clearedChecks = checksAndPayments
    .filter(item => item.cleared)
    .reduce((sum, item) => sum + Math.abs(Number(item.amount)), 0)

  const beginningBalance = Number(reconciliation.beginning_balance || 0)
  const statementEndingBalance = Number(reconciliation.statement_ending_balance || 0)
  const clearedBalance = beginningBalance + clearedDeposits - clearedChecks
  const difference = Math.round((statementEndingBalance - clearedBalance) * 100) / 100

  return (
    <div>
      {/* Header */}
      <div className="glass-card p-4 m-2">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontSize: '7pt', fontWeight: 600, color: '#888' }}>STATEMENT DATE</span>
              <div style={{ fontSize: '10pt', fontWeight: 700 }}>{reconciliation.statement_date}</div>
            </div>
            <div>
              <span style={{ fontSize: '7pt', fontWeight: 600, color: '#888' }}>STATEMENT ENDING BALANCE</span>
              <div style={{ fontSize: '10pt', fontWeight: 700, fontFamily: 'Tahoma, monospace' }}>
                {formatDollars(reconciliation.statement_ending_balance)}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '7pt', fontWeight: 600, color: '#888' }}>BEGINNING BALANCE</span>
              <div style={{ fontSize: '10pt', fontWeight: 700, fontFamily: 'Tahoma, monospace' }}>
                {formatDollars(beginningBalance)}
              </div>
            </div>
          </div>
          <button className="glass-button-secondary text-sm" onClick={onCancel}>Cancel</button>
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
        {/* Left: Checks and Payments */}
        <div className="glass-card p-4 m-2">
          <h4 style={{ fontSize: '9pt', fontWeight: 700, marginBottom: 8 }}>
            Checks and Payments ({checksAndPayments.length})
          </h4>
          {checksAndPayments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 16, color: '#888', fontSize: '8pt' }}>No checks or payments.</div>
          ) : (
            <table className="glass-table w-full">
              <thead>
                <tr>
                  <th style={{ width: 30 }}></th>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Ref / Description</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {checksAndPayments.map((item, idx) => (
                  <tr key={item.id || idx}>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!item.cleared}
                        disabled={toggling === item.id}
                        onChange={() => handleToggle(item.id)}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ fontSize: '8pt' }}>{item.date}</td>
                    <td style={{ fontSize: '8pt' }}>{item.type || ''}</td>
                    <td style={{ fontSize: '8pt' }}>{item.reference || item.description || ''}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'Tahoma, monospace', fontSize: '8pt', color: '#c0392b' }}>
                      {formatDollars(item.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Right: Deposits and Credits */}
        <div className="glass-card p-4 m-2">
          <h4 style={{ fontSize: '9pt', fontWeight: 700, marginBottom: 8 }}>
            Deposits and Credits ({depositsAndCredits.length})
          </h4>
          {depositsAndCredits.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 16, color: '#888', fontSize: '8pt' }}>No deposits or credits.</div>
          ) : (
            <table className="glass-table w-full">
              <thead>
                <tr>
                  <th style={{ width: 30 }}></th>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Ref / Description</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {depositsAndCredits.map((item, idx) => (
                  <tr key={item.id || idx}>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!item.cleared}
                        disabled={toggling === item.id}
                        onChange={() => handleToggle(item.id)}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ fontSize: '8pt' }}>{item.date}</td>
                    <td style={{ fontSize: '8pt' }}>{item.type || ''}</td>
                    <td style={{ fontSize: '8pt' }}>{item.reference || item.description || ''}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'Tahoma, monospace', fontSize: '8pt', color: '#276738' }}>
                      {formatDollars(item.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Footer totals */}
      <div className="glass-card p-4 m-2">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontSize: '7pt', fontWeight: 600, color: '#888' }}>CLEARED DEPOSITS</span>
              <div style={{ fontSize: '10pt', fontWeight: 700, fontFamily: 'Tahoma, monospace', color: '#276738' }}>
                {formatDollars(clearedDeposits)}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '7pt', fontWeight: 600, color: '#888' }}>CLEARED CHECKS/PAYMENTS</span>
              <div style={{ fontSize: '10pt', fontWeight: 700, fontFamily: 'Tahoma, monospace', color: '#c0392b' }}>
                {formatDollars(-clearedChecks)}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '7pt', fontWeight: 600, color: '#888' }}>CLEARED BALANCE</span>
              <div style={{ fontSize: '10pt', fontWeight: 700, fontFamily: 'Tahoma, monospace' }}>
                {formatDollars(clearedBalance)}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '7pt', fontWeight: 600, color: '#888' }}>STATEMENT ENDING BAL</span>
              <div style={{ fontSize: '10pt', fontWeight: 700, fontFamily: 'Tahoma, monospace' }}>
                {formatDollars(statementEndingBalance)}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '7pt', fontWeight: 600, color: '#888' }}>DIFFERENCE</span>
              <div style={{
                fontSize: '11pt', fontWeight: 700, fontFamily: 'Tahoma, monospace',
                color: difference === 0 ? '#276738' : '#c0392b',
              }}>
                {formatDollars(difference)}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="glass-button-secondary text-sm" onClick={onCancel}>Cancel</button>
            <button
              className="glass-button-primary text-sm"
              disabled={difference !== 0 || finishing}
              onClick={handleFinish}
              title={difference !== 0 ? 'Difference must be $0.00 to reconcile' : ''}
            >
              {finishing ? 'Finishing...' : 'Reconcile Now'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Screen 3: Complete ──────────────────────────────────────────────────────
function CompleteScreen({ onReturn }) {
  return (
    <div className="glass-card p-4 m-2" style={{ textAlign: 'center', padding: 48 }}>
      <div style={{ fontSize: '14pt', fontWeight: 700, color: '#276738', marginBottom: 12 }}>
        Reconciliation Complete
      </div>
      <p style={{ fontSize: '9pt', color: '#888', marginBottom: 20 }}>
        Your bank account has been successfully reconciled. All cleared items have been recorded.
      </p>
      <button className="glass-button-primary text-sm" onClick={onReturn}>
        Return to Start
      </button>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function BankReconciliation() {
  const [screen, setScreen] = useState('start') // 'start' | 'reconcile' | 'complete'
  const [reconcId, setReconcId] = useState(null)
  const [bankAccounts, setBankAccounts] = useState([])
  const { toast, showToast, hideToast } = useToast()

  useEffect(() => {
    async function loadAccounts() {
      try {
        const res = await getBankAccounts()
        setBankAccounts(res.data || [])
      } catch (err) {
        showToast(err.response?.data?.detail || 'Failed to load bank accounts', 'error')
      }
    }
    loadAccounts()
  }, [])

  function handleBegin(id) {
    setReconcId(id)
    setScreen('reconcile')
  }

  function handleCancel() {
    setReconcId(null)
    setScreen('start')
  }

  function handleComplete() {
    setScreen('complete')
  }

  function handleReturn() {
    setReconcId(null)
    setScreen('start')
  }

  return (
    <div style={{ padding: '6px 8px' }}>
      {toast && <Toast {...toast} onClose={hideToast} />}

      {screen === 'start' && (
        <StartScreen
          bankAccounts={bankAccounts}
          onBegin={handleBegin}
          showToast={showToast}
        />
      )}

      {screen === 'reconcile' && reconcId && (
        <ReconcileScreen
          reconcId={reconcId}
          onCancel={handleCancel}
          onComplete={handleComplete}
          showToast={showToast}
        />
      )}

      {screen === 'complete' && (
        <CompleteScreen onReturn={handleReturn} />
      )}
    </div>
  )
}
