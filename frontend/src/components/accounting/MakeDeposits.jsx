import { useState, useEffect } from 'react'
import { getBankAccounts, getAccounts, makeDeposit } from '../../api/accounting'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'

const today = () => new Date().toISOString().split('T')[0]

const emptyDepositLine = () => ({
  received_from: '',
  from_account_id: '',
  memo: '',
  check_no: '',
  amount: '',
})

export default function MakeDeposits({ onSaved }) {
  const [bankAccounts, setBankAccounts] = useState([])
  const [accounts, setAccounts] = useState([])
  const [depositTo, setDepositTo] = useState('')
  const [depositDate, setDepositDate] = useState(today())
  const [depositLines, setDepositLines] = useState([emptyDepositLine()])
  const [cashBackAccount, setCashBackAccount] = useState('')
  const [cashBackAmount, setCashBackAmount] = useState('')
  const [depositMemo, setDepositMemo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  useEffect(() => {
    const load = async () => {
      try {
        const [bankRes, acctRes] = await Promise.all([
          getBankAccounts(),
          getAccounts(),
        ])
        const banks = bankRes.data || []
        setBankAccounts(banks)
        if (banks.length > 0) setDepositTo(banks[0].id)
        setAccounts(acctRes.data || [])
      } catch {
        try {
          const bankRes = await getBankAccounts()
          const banks = bankRes.data || []
          setBankAccounts(banks)
          if (banks.length > 0) setDepositTo(banks[0].id)
        } catch { /* noop */ }
      }
    }
    load()
  }, [])

  const selectedBank = bankAccounts.find(b => b.id === depositTo)

  // Income/revenue accounts for "From Account" dropdown
  const fromAccountOptions = accounts.filter(
    a =>
      a.account_type === 'income' ||
      a.account_type === 'other_income' ||
      a.account_type === 'equity' ||
      a.account_type === 'other_current_liability' ||
      a.account_type === 'expense' ||
      a.account_type === 'other_current_asset',
  )

  // Expense accounts for cash back
  const cashBackAccountOptions = accounts.filter(
    a => a.account_type === 'expense' || a.account_type === 'other_current_asset',
  )

  // Line helpers
  const updateLine = (idx, field, value) => {
    setDepositLines(prev =>
      prev.map((line, i) => (i === idx ? { ...line, [field]: value } : line)),
    )
  }

  const addLine = () => {
    setDepositLines(prev => [...prev, emptyDepositLine()])
  }

  const removeLine = (idx) => {
    setDepositLines(prev => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev))
  }

  // Totals
  const linesTotal = depositLines.reduce(
    (sum, l) => sum + (parseFloat(l.amount) || 0),
    0,
  )
  const cashBack = parseFloat(cashBackAmount) || 0
  const depositTotal = linesTotal - cashBack

  const clearForm = () => {
    setDepositDate(today())
    setDepositLines([emptyDepositLine()])
    setCashBackAccount('')
    setCashBackAmount('')
    setDepositMemo('')
  }

  const handleSave = async (andNew = false) => {
    if (!depositTo) {
      showToast('Select a bank account to deposit to', 'error')
      return
    }

    const filledLines = depositLines.filter(l => parseFloat(l.amount) > 0)
    if (filledLines.length === 0) {
      showToast('Add at least one deposit line with an amount', 'error')
      return
    }

    if (cashBack > 0 && !cashBackAccount) {
      showToast('Select a cash back account', 'error')
      return
    }

    if (depositTotal <= 0) {
      showToast('Deposit total must be greater than zero', 'error')
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        deposit_date: depositDate,
        memo: depositMemo,
        deposit_lines: filledLines.map(l => ({
          received_from: l.received_from,
          from_account_id: l.from_account_id || null,
          memo: l.memo,
          check_no: l.check_no,
          amount: parseFloat(l.amount),
        })),
        cash_back_account_id: cashBack > 0 ? cashBackAccount : null,
        cash_back_amount: cashBack > 0 ? cashBack : 0,
        total: depositTotal,
      }

      await makeDeposit(depositTo, payload)
      showToast('Deposit saved successfully')
      if (onSaved) onSaved()

      if (andNew) {
        clearForm()
      }
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error saving deposit', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      {/* ── Header strip ── */}
      <div
        className="bg-lvf-dark/30 border-b border-lvf-border"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '10px 16px',
          flexWrap: 'wrap',
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#336699', margin: 0 }}>
          Make Deposits
        </h3>
      </div>

      {/* ── Top form ── */}
      <div className="glass-card p-4 m-2" style={{ padding: 16 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 180px',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div>
            <label
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#666',
                display: 'block',
                marginBottom: 2,
              }}
            >
              Deposit To
            </label>
            <select
              className="glass-input text-sm"
              value={depositTo}
              onChange={e => setDepositTo(e.target.value)}
            >
              <option value="">-- Select Bank Account --</option>
              {bankAccounts.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.account_number_last4 ? ` (...${b.account_number_last4})` : ''}
                </option>
              ))}
            </select>
            {selectedBank && (
              <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                Current Balance: $
                {Number(selectedBank.balance || 0).toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                })}
              </div>
            )}
          </div>
          <div>
            <label
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#666',
                display: 'block',
                marginBottom: 2,
              }}
            >
              Date
            </label>
            <input
              className="glass-input text-sm"
              type="date"
              value={depositDate}
              onChange={e => setDepositDate(e.target.value)}
            />
          </div>
        </div>

        {/* Memo */}
        <div style={{ marginBottom: 12 }}>
          <label
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: '#666',
              display: 'block',
              marginBottom: 2,
            }}
          >
            Memo
          </label>
          <input
            className="glass-input text-sm"
            value={depositMemo}
            onChange={e => setDepositMemo(e.target.value)}
            placeholder="Deposit memo..."
          />
        </div>
      </div>

      {/* ── Payments to Deposit Section ── */}
      <div style={{ padding: '0 12px', marginBottom: 16 }}>
        <div
          style={{
            background: '#f0f4f8',
            border: '1px solid #ccc',
            padding: '12px 16px',
          }}
        >
          <h4
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#336699',
              margin: '0 0 6px 0',
            }}
          >
            Select Payments to Deposit
          </h4>
          <div
            style={{
              fontSize: 12,
              color: '#999',
              fontStyle: 'italic',
              padding: '8px 0',
            }}
          >
            No undeposited funds available
          </div>
        </div>
      </div>

      {/* ── Manual Deposit Entry ── */}
      <div style={{ padding: '0 12px' }}>
        <h4
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: '#336699',
            margin: '0 0 6px 0',
          }}
        >
          Deposit Detail
        </h4>

        <table className="glass-table w-full">
          <thead>
            <tr>
              <th style={{ width: '22%' }}>Received From</th>
              <th style={{ width: '22%' }}>From Account</th>
              <th style={{ width: '20%' }}>Memo</th>
              <th style={{ width: '12%' }}>Check No.</th>
              <th style={{ width: '14%', textAlign: 'right' }}>Amount</th>
              <th style={{ width: '10%', textAlign: 'center' }}></th>
            </tr>
          </thead>
          <tbody>
            {depositLines.map((line, idx) => (
              <tr key={idx}>
                <td>
                  <input
                    className="glass-input text-sm"
                    value={line.received_from}
                    onChange={e => updateLine(idx, 'received_from', e.target.value)}
                    placeholder="Name..."
                  />
                </td>
                <td>
                  <select
                    className="glass-input text-sm"
                    value={line.from_account_id}
                    onChange={e => updateLine(idx, 'from_account_id', e.target.value)}
                  >
                    <option value="">-- Account --</option>
                    {fromAccountOptions.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.account_number ? `${a.account_number} - ` : ''}
                        {a.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    className="glass-input text-sm"
                    value={line.memo}
                    onChange={e => updateLine(idx, 'memo', e.target.value)}
                    placeholder="Memo..."
                  />
                </td>
                <td>
                  <input
                    className="glass-input text-sm"
                    value={line.check_no}
                    onChange={e => updateLine(idx, 'check_no', e.target.value)}
                    placeholder="Chk #"
                  />
                </td>
                <td>
                  <input
                    className="glass-input text-sm"
                    type="number"
                    step="0.01"
                    min="0"
                    value={line.amount}
                    onChange={e => updateLine(idx, 'amount', e.target.value)}
                    placeholder="0.00"
                    style={{ textAlign: 'right' }}
                  />
                </td>
                <td style={{ textAlign: 'center' }}>
                  {depositLines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      style={{
                        color: '#ef4444',
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        fontSize: 14,
                        fontWeight: 700,
                      }}
                      title="Remove line"
                    >
                      &times;
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 6, marginBottom: 12 }}>
          <button className="glass-button-secondary text-sm" onClick={addLine} style={{ fontSize: 11 }}>
            + Add Row
          </button>
        </div>
      </div>

      {/* ── Footer: Totals & Cash Back ── */}
      <div
        style={{
          margin: '0 12px',
          padding: '12px 16px',
          background: '#f0f4f8',
          border: '1px solid #ccc',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 16,
            alignItems: 'start',
          }}
        >
          {/* Cash back section */}
          <div>
            <h4
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#336699',
                margin: '0 0 8px 0',
              }}
            >
              Cash Back
            </h4>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#666',
                    display: 'block',
                    marginBottom: 2,
                  }}
                >
                  Cash Back Goes To
                </label>
                <select
                  className="glass-input text-sm"
                  style={{ width: 220 }}
                  value={cashBackAccount}
                  onChange={e => setCashBackAccount(e.target.value)}
                >
                  <option value="">-- None --</option>
                  {cashBackAccountOptions.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.account_number ? `${a.account_number} - ` : ''}
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#666',
                    display: 'block',
                    marginBottom: 2,
                  }}
                >
                  Cash Back Amount
                </label>
                <input
                  className="glass-input text-sm"
                  type="number"
                  step="0.01"
                  min="0"
                  style={{ width: 120, textAlign: 'right' }}
                  value={cashBackAmount}
                  onChange={e => setCashBackAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          {/* Totals */}
          <div style={{ textAlign: 'right', minWidth: 200 }}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
              Subtotal:{' '}
              <span style={{ fontWeight: 600, color: '#e0e0e0' }}>
                ${linesTotal.toFixed(2)}
              </span>
            </div>
            {cashBack > 0 && (
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                Cash Back:{' '}
                <span style={{ fontWeight: 600, color: '#ef4444' }}>
                  -${cashBack.toFixed(2)}
                </span>
              </div>
            )}
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: '#60a5fa',
                borderTop: '2px solid #336699',
                paddingTop: 6,
                marginTop: 4,
              }}
            >
              Deposit Total: ${depositTotal.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* ── Action Buttons ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          padding: '12px 16px',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          marginTop: 12,
        }}
      >
        <button type="button" className="glass-button-secondary text-sm" onClick={clearForm}>
          Clear
        </button>
        <button
          type="button"
          className="glass-button-primary text-sm"
          disabled={submitting}
          onClick={() => handleSave(true)}
        >
          {submitting ? 'Saving...' : 'Save & New'}
        </button>
        <button
          type="button"
          className="glass-button-primary text-sm"
          disabled={submitting}
          onClick={() => handleSave(false)}
        >
          {submitting ? 'Saving...' : 'Save & Close'}
        </button>
      </div>
    </div>
  )
}
