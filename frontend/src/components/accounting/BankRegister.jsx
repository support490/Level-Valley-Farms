import { useState, useEffect } from 'react'
import { getBankAccounts, getBankRegister } from '../../api/accounting'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'

const TYPE_BADGES = {
  CHK:        { label: 'CHK',      bg: '#d0e4f7', color: '#2a6496' },
  DEP:        { label: 'DEP',      bg: '#d4edda', color: '#276738' },
  'BILL PMT': { label: 'BILL PMT', bg: '#ffecd2', color: '#a05a00' },
  JE:         { label: 'JE',       bg: '#e2e2e2', color: '#555555' },
  PMT:        { label: 'PMT',      bg: '#d4edda', color: '#276738' },
}

function formatAmount(value) {
  if (value == null) return ''
  const num = Number(value)
  if (isNaN(num)) return ''
  if (num < 0) return `(${Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function BankRegister({ onNavigate }) {
  const [bankAccounts, setBankAccounts] = useState([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [register, setRegister] = useState([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(false)
  const [highlightedRow, setHighlightedRow] = useState(null)
  const { toast, showToast, hideToast } = useToast()

  useEffect(() => {
    async function loadAccounts() {
      try {
        const res = await getBankAccounts()
        const accounts = res.data || []
        setBankAccounts(accounts)
        if (accounts.length > 0 && !selectedAccountId) setSelectedAccountId(accounts[0].id)
      } catch (err) { showToast(err.response?.data?.detail || 'Failed to load bank accounts', 'error') }
    }
    loadAccounts()
  }, [])

  useEffect(() => {
    if (!selectedAccountId) return
    async function loadRegister() {
      setLoading(true)
      try {
        const res = await getBankRegister(selectedAccountId)
        setRegister(res.data || [])
      } catch (err) { showToast(err.response?.data?.detail || 'Failed to load register', 'error'); setRegister([]) }
      finally { setLoading(false) }
    }
    loadRegister()
  }, [selectedAccountId])

  const filteredRegister = register.filter(txn => {
    if (dateFrom && txn.date < dateFrom) return false
    if (dateTo && txn.date > dateTo) return false
    return true
  })

  const totalPayments = filteredRegister.reduce((sum, txn) => sum + (Number(txn.payment) || 0), 0)
  const totalDeposits = filteredRegister.reduce((sum, txn) => sum + (Number(txn.deposit) || 0), 0)
  const selectedAccount = bankAccounts.find(a => a.id === selectedAccountId)
  const balance = selectedAccount?.current_balance ?? selectedAccount?.balance ?? 0

  return (
    <div style={{ padding: '6px 8px' }}>
      {toast && <Toast {...toast} onClose={hideToast} />}

      {/* Header: Account selector + balance + date range */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap',
        gap: 8, marginBottom: 6, padding: '4px 0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: '8pt', fontWeight: 600 }}>Account:</label>
          <select className="glass-input text-sm" style={{ width: 200 }} value={selectedAccountId}
            onChange={e => setSelectedAccountId(e.target.value)}>
            {bankAccounts.map(acct => (
              <option key={acct.id} value={acct.id}>
                {acct.account_number ? `${acct.account_number} - ` : ''}{acct.name}
              </option>
            ))}
          </select>
          <span style={{
            fontSize: '10pt', fontWeight: 700, fontFamily: 'Tahoma, monospace',
            color: balance < 0 ? '#c0392b' : '#2a6496',
          }}>
            Balance: {formatAmount(balance)}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: '8pt' }}>From:</label>
          <input type="date" className="glass-input text-sm" style={{ width: 110 }} value={dateFrom}
            onChange={e => setDateFrom(e.target.value)} />
          <label style={{ fontSize: '8pt' }}>To:</label>
          <input type="date" className="glass-input text-sm" style={{ width: 110 }} value={dateTo}
            onChange={e => setDateTo(e.target.value)} />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo('') }}
              style={{ fontSize: '7pt', color: '#888', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Register Table — checkbook-style */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 30, color: '#888', fontSize: '8pt' }}>Loading register...</div>
      ) : (
        <table className="glass-table w-full" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: 72 }}>Date</th>
              <th style={{ width: 60 }}>Number</th>
              <th style={{ width: 60 }}>Type</th>
              <th>Payee / Description</th>
              <th style={{ width: 120 }}>Account</th>
              <th style={{ width: 90, textAlign: 'right' }}>Payment (-)</th>
              <th style={{ width: 90, textAlign: 'right' }}>Deposit (+)</th>
              <th style={{ width: 95, textAlign: 'right' }}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {filteredRegister.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: 24, color: '#888' }}>
                  {register.length === 0 ? 'No transactions found for this account.' : 'No transactions match the selected date range.'}
                </td>
              </tr>
            ) : (
              filteredRegister.map((txn, idx) => {
                const badge = TYPE_BADGES[txn.type] || TYPE_BADGES.JE
                const isHighlighted = highlightedRow === txn.id
                const runBal = Number(txn.running_balance)
                const isNegativeBalance = !isNaN(runBal) && runBal < 0
                const rowBg = isHighlighted ? 'rgba(96,165,250,0.15)' : idx % 2 === 1 ? 'rgba(0,0,0,0.1)' : 'transparent'

                return (
                  <tr key={txn.id || idx} onClick={() => setHighlightedRow(txn.id === highlightedRow ? null : txn.id)}
                    style={{ cursor: 'pointer' }}>
                    <td style={{ background: rowBg }}>{txn.date}</td>
                    <td style={{ background: rowBg, fontFamily: 'Tahoma, monospace', color: '#555' }}>
                      {txn.check_number || txn.reference || ''}
                    </td>
                    <td style={{ background: rowBg }}>
                      <span style={{
                        display: 'inline-block', padding: '0 4px', fontSize: '7pt', fontWeight: 700,
                        letterSpacing: 0.3, background: badge.bg, color: badge.color,
                      }}>{badge.label}</span>
                    </td>
                    <td style={{ background: rowBg }}>{txn.payee || txn.description || ''}</td>
                    <td style={{ background: rowBg, fontSize: '7pt', color: '#666' }}>{txn.account_name || txn.account || ''}</td>
                    <td style={{
                      background: rowBg, textAlign: 'right', fontFamily: 'Tahoma, monospace',
                      color: txn.payment ? '#c0392b' : 'transparent',
                    }}>
                      {txn.payment ? formatAmount(-Math.abs(Number(txn.payment))) : ''}
                    </td>
                    <td style={{
                      background: rowBg, textAlign: 'right', fontFamily: 'Tahoma, monospace',
                      color: txn.deposit ? '#276738' : 'transparent',
                    }}>
                      {txn.deposit ? formatAmount(Number(txn.deposit)) : ''}
                    </td>
                    <td style={{
                      background: rowBg, textAlign: 'right', fontFamily: 'Tahoma, monospace',
                      fontWeight: 600, color: isNegativeBalance ? '#c0392b' : '#222',
                    }}>
                      {txn.running_balance != null ? formatAmount(Number(txn.running_balance)) : ''}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>

          {filteredRegister.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={5} style={{
                  textAlign: 'right', fontWeight: 700, fontSize: '7pt',
                  color: '#555', background: 'rgba(0,0,0,0.2)', borderTop: '2px solid #bbb',
                }}>Totals</td>
                <td style={{
                  textAlign: 'right', fontFamily: 'Tahoma, monospace', fontWeight: 700,
                  color: '#c0392b', background: 'rgba(0,0,0,0.2)', borderTop: '2px solid #bbb',
                }}>{formatAmount(-totalPayments)}</td>
                <td style={{
                  textAlign: 'right', fontFamily: 'Tahoma, monospace', fontWeight: 700,
                  color: '#276738', background: 'rgba(0,0,0,0.2)', borderTop: '2px solid #bbb',
                }}>{formatAmount(totalDeposits)}</td>
                <td style={{ background: 'rgba(0,0,0,0.2)', borderTop: '2px solid #bbb' }} />
              </tr>
            </tfoot>
          )}
        </table>
      )}

      <div style={{ marginTop: 4, fontSize: '7pt', color: '#888', textAlign: 'right' }}>
        Showing {filteredRegister.length} transaction{filteredRegister.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}
