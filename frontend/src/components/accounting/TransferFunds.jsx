import { useState, useEffect } from 'react'
import { getBankAccounts, transferFunds as transferFundsApi } from '../../api/accounting'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'

const today = () => new Date().toISOString().split('T')[0]

export default function TransferFunds({ onSaved }) {
  const [bankAccounts, setBankAccounts] = useState([])
  const [form, setForm] = useState({
    from_account_id: '',
    to_account_id: '',
    amount: '',
    transfer_date: today(),
    memo: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  useEffect(() => {
    const load = async () => {
      try {
        const res = await getBankAccounts()
        const banks = res.data || []
        setBankAccounts(banks)
        if (banks.length >= 2) {
          setForm(prev => ({
            ...prev,
            from_account_id: banks[0].id,
            to_account_id: banks[1].id,
          }))
        } else if (banks.length === 1) {
          setForm(prev => ({
            ...prev,
            from_account_id: banks[0].id,
          }))
        }
      } catch { /* noop */ }
    }
    load()
  }, [])

  const updateField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const fromBank = bankAccounts.find(b => b.id === form.from_account_id)
  const toBank = bankAccounts.find(b => b.id === form.to_account_id)

  const formatBalance = (bank) => {
    if (!bank) return ''
    return '$' + Number(bank.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })
  }

  const clearForm = () => {
    setForm(prev => ({
      from_account_id: prev.from_account_id,
      to_account_id: prev.to_account_id,
      amount: '',
      transfer_date: today(),
      memo: '',
    }))
  }

  const handleSave = async (andNew = false) => {
    if (!form.from_account_id) {
      showToast('Select a "Transfer From" account', 'error')
      return
    }
    if (!form.to_account_id) {
      showToast('Select a "Transfer To" account', 'error')
      return
    }
    if (form.from_account_id === form.to_account_id) {
      showToast('Transfer From and Transfer To accounts must be different', 'error')
      return
    }
    const amount = parseFloat(form.amount)
    if (!amount || amount <= 0) {
      showToast('Enter a transfer amount greater than zero', 'error')
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        from_account_id: form.from_account_id,
        to_account_id: form.to_account_id,
        amount,
        transfer_date: form.transfer_date,
        memo: form.memo,
      }

      await transferFundsApi(payload)
      showToast('Transfer saved successfully')
      if (onSaved) onSaved()

      if (andNew) {
        clearForm()
      }
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error saving transfer', 'error')
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
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#336699', margin: 0 }}>
          Transfer Funds Between Accounts
        </h3>
      </div>

      {/* ── Form body ── */}
      <div className="glass-card p-4 m-2" style={{ padding: 16, maxWidth: 540 }}>
        {/* Transfer Funds From */}
        <div style={{ marginBottom: 14 }}>
          <label
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#336699',
              display: 'block',
              marginBottom: 4,
            }}
          >
            Transfer Funds From
          </label>
          <select
            className="glass-input text-sm"
            value={form.from_account_id}
            onChange={e => updateField('from_account_id', e.target.value)}
          >
            <option value="">-- Select Account --</option>
            {bankAccounts.map(b => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.account_number_last4 ? ` (...${b.account_number_last4})` : ''}
              </option>
            ))}
          </select>
          {fromBank && (
            <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
              Current Balance: {formatBalance(fromBank)}
            </div>
          )}
        </div>

        {/* Transfer Funds To */}
        <div style={{ marginBottom: 14 }}>
          <label
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#336699',
              display: 'block',
              marginBottom: 4,
            }}
          >
            Transfer Funds To
          </label>
          <select
            className="glass-input text-sm"
            value={form.to_account_id}
            onChange={e => updateField('to_account_id', e.target.value)}
          >
            <option value="">-- Select Account --</option>
            {bankAccounts.map(b => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.account_number_last4 ? ` (...${b.account_number_last4})` : ''}
              </option>
            ))}
          </select>
          {toBank && (
            <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
              Current Balance: {formatBalance(toBank)}
            </div>
          )}
        </div>

        {/* Transfer Amount */}
        <div style={{ marginBottom: 14 }}>
          <label
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#336699',
              display: 'block',
              marginBottom: 4,
            }}
          >
            Transfer Amount
          </label>
          <input
            className="glass-input text-sm"
            type="number"
            step="0.01"
            min="0"
            value={form.amount}
            onChange={e => updateField('amount', e.target.value)}
            placeholder="0.00"
            style={{ fontWeight: 700, fontSize: 15, textAlign: 'right', maxWidth: 200 }}
          />
        </div>

        {/* Date */}
        <div style={{ marginBottom: 14 }}>
          <label
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#336699',
              display: 'block',
              marginBottom: 4,
            }}
          >
            Date
          </label>
          <input
            className="glass-input text-sm"
            type="date"
            value={form.transfer_date}
            onChange={e => updateField('transfer_date', e.target.value)}
            style={{ maxWidth: 200 }}
          />
        </div>

        {/* Memo */}
        <div style={{ marginBottom: 14 }}>
          <label
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#336699',
              display: 'block',
              marginBottom: 4,
            }}
          >
            Memo
          </label>
          <input
            className="glass-input text-sm"
            value={form.memo}
            onChange={e => updateField('memo', e.target.value)}
            placeholder="Transfer memo..."
          />
        </div>

        {/* Summary */}
        {form.amount && parseFloat(form.amount) > 0 && fromBank && toBank && (
          <div
            style={{
              background: '#f0f4f8',
              border: '1px solid #ccc',
              padding: '10px 14px',
              marginBottom: 14,
              fontSize: 12,
              lineHeight: 1.6,
            }}
          >
            <div style={{ fontWeight: 700, color: '#336699', marginBottom: 4 }}>
              Transfer Summary
            </div>
            <div>
              <span style={{ color: '#666' }}>From: </span>
              <span style={{ fontWeight: 600 }}>{fromBank.name}</span>
              <span style={{ color: '#999', marginLeft: 8 }}>
                (Balance: {formatBalance(fromBank)})
              </span>
            </div>
            <div>
              <span style={{ color: '#666' }}>To: </span>
              <span style={{ fontWeight: 600 }}>{toBank.name}</span>
              <span style={{ color: '#999', marginLeft: 8 }}>
                (Balance: {formatBalance(toBank)})
              </span>
            </div>
            <div style={{ marginTop: 4 }}>
              <span style={{ color: '#666' }}>Amount: </span>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#60a5fa' }}>
                ${parseFloat(form.amount).toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            borderTop: '1px solid rgba(255,255,255,0.1)',
            paddingTop: 12,
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
    </div>
  )
}
