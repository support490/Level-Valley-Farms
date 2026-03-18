import { useState, useEffect } from 'react'
import { getBankAccounts, getAccounts, createCheck, getVendors } from '../../api/accounting'
import numberToWords from '../../utils/numberToWords'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'
import CheckPrint from './CheckPrint'
import AddressAutocomplete from '../common/AddressAutocomplete'


const emptyForm = () => ({
  check_number: '',
  check_date: new Date().toISOString().split('T')[0],
  payee_name: '',
  payee_vendor_id: '',
  amount: '',
  address: '',
  memo: '',
  to_be_printed: true,
})

const emptyExpenseLine = () => ({ account_id: '', amount: '', memo: '', flock_id: '' })
const emptyItemLine = () => ({ item_description: '', quantity: '', cost: '', amount: '' })

export default function WriteChecks() {
  const [bankAccounts, setBankAccounts] = useState([])
  const [selectedBankId, setSelectedBankId] = useState('')
  const [accounts, setAccounts] = useState([])
  const [vendors, setVendors] = useState([])
  const [checkForm, setCheckForm] = useState(emptyForm())
  const [expenseLines, setExpenseLines] = useState([emptyExpenseLine()])
  const [itemLines, setItemLines] = useState([emptyItemLine()])
  const [activeTab, setActiveTab] = useState('expenses')
  const [showPrint, setShowPrint] = useState(false)
  const [savedCheck, setSavedCheck] = useState(null)
  const { toast, showToast, hideToast } = useToast()

  useEffect(() => {
    const load = async () => {
      const [bankRes, acctRes, vendorRes] = await Promise.all([
        getBankAccounts(), getAccounts(), getVendors(),
      ])
      const banks = bankRes.data || []
      setBankAccounts(banks)
      if (banks.length > 0) setSelectedBankId(banks[0].id)
      setAccounts(acctRes.data || [])
      setVendors(vendorRes.data || [])
    }
    load()
  }, [])

  const selectedBank = bankAccounts.find(b => b.id === selectedBankId)
  const expenseAccounts = accounts.filter(
    a => a.account_type === 'expense' || a.account_type === 'cost_of_goods_sold',
  )

  const expenseTotal = expenseLines.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0)
  const itemTotal = itemLines.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0)
  const linesTotal = expenseTotal + itemTotal
  const parsedAmount = parseFloat(checkForm.amount) || 0

  let amountWords = ''
  try { amountWords = parsedAmount > 0 ? numberToWords(parsedAmount) : '' } catch { amountWords = '' }

  useEffect(() => {
    if (linesTotal > 0) {
      setCheckForm(prev => ({ ...prev, amount: linesTotal.toFixed(2) }))
    }
  }, [linesTotal])

  const handlePayeeChange = (name) => {
    setCheckForm(prev => ({ ...prev, payee_name: name }))
    const match = vendors.find(v => v.name && v.name.toLowerCase() === name.toLowerCase())
    if (match) {
      setCheckForm(prev => ({ ...prev, payee_vendor_id: match.id, address: match.address || '' }))
    } else {
      setCheckForm(prev => ({ ...prev, payee_vendor_id: '' }))
    }
  }

  const updateExpenseLine = (idx, field, value) => {
    setExpenseLines(prev => { const c = [...prev]; c[idx] = { ...c[idx], [field]: value }; return c })
  }
  const removeExpenseLine = (idx) => setExpenseLines(prev => prev.filter((_, i) => i !== idx))

  const updateItemLine = (idx, field, value) => {
    setItemLines(prev => {
      const c = [...prev]; c[idx] = { ...c[idx], [field]: value }
      if (field === 'quantity' || field === 'cost') {
        const qty = parseFloat(field === 'quantity' ? value : c[idx].quantity) || 0
        const cost = parseFloat(field === 'cost' ? value : c[idx].cost) || 0
        c[idx].amount = (qty * cost).toFixed(2)
      }
      return c
    })
  }
  const removeItemLine = (idx) => setItemLines(prev => prev.filter((_, i) => i !== idx))

  const handleSave = async (action = 'close') => {
    if (!checkForm.payee_name) { showToast('Enter a payee name', 'error'); return }
    if (parsedAmount <= 0) { showToast('Check amount must be greater than zero', 'error'); return }

    const filledExpenses = expenseLines.filter(l => l.account_id && parseFloat(l.amount))
    const filledItems = itemLines.filter(l => l.item_description && parseFloat(l.amount))
    const lineSum = filledExpenses.reduce((s, l) => s + parseFloat(l.amount), 0) + filledItems.reduce((s, l) => s + parseFloat(l.amount), 0)

    if (Math.abs(lineSum - parsedAmount) > 0.01) {
      showToast(`Line items total ($${lineSum.toFixed(2)}) does not match check amount ($${parsedAmount.toFixed(2)})`, 'error')
      return
    }

    const payload = {
      ...checkForm, amount: parsedAmount, bank_account_id: selectedBankId,
      expense_lines: filledExpenses.map(l => ({ account_id: l.account_id, amount: parseFloat(l.amount), memo: l.memo, flock_id: l.flock_id || null })),
      item_lines: filledItems.map(l => ({ item_description: l.item_description, quantity: parseFloat(l.quantity) || 0, cost: parseFloat(l.cost) || 0, amount: parseFloat(l.amount) })),
    }

    try {
      const result = await createCheck(payload)
      const saved = result.data || payload
      saved.expense_lines = (saved.expense_lines || payload.expense_lines).map(l => ({
        ...l, account_name: accounts.find(a => a.id === l.account_id)?.name || `Account ${l.account_id}`,
      }))
      setSavedCheck(saved)
      showToast(`Check saved: ${saved.check_number || 'To Print'}`)
      if (action === 'new') handleClear()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error saving check', 'error')
    }
  }

  const handlePrint = () => {
    if (!savedCheck) { showToast('Save the check before printing', 'error'); return }
    setShowPrint(true)
  }

  const handleClear = () => {
    setCheckForm(emptyForm())
    setExpenseLines([emptyExpenseLine()])
    setItemLines([emptyItemLine()])
    setSavedCheck(null)
  }

  if (showPrint && savedCheck) {
    return <CheckPrint check={savedCheck} onClose={() => setShowPrint(false)} />
  }

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      {/* ── Top strip: Bank Account | Balance | To be printed | No. | Date ── */}
      <div className="bg-lvf-dark/30 border-b border-lvf-border" style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <label style={{ fontSize: '8pt', fontWeight: 600 }}>Bank Account:</label>
          <select className="glass-input text-sm" style={{ width: 200 }} value={selectedBankId}
            onChange={e => setSelectedBankId(e.target.value)}>
            {bankAccounts.map(b => (
              <option key={b.id} value={b.id}>
                {b.name} {b.account_number_last4 ? `(...${b.account_number_last4})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div style={{ fontSize: '8pt' }}>
          Ending Balance:{' '}
          <strong>${selectedBank ? Number(selectedBank.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}</strong>
        </div>

        <label style={{ fontSize: '8pt', display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
          <input type="checkbox" checked={checkForm.to_be_printed}
            onChange={e => setCheckForm(prev => ({ ...prev, to_be_printed: e.target.checked }))} />
          To be printed
        </label>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <label style={{ fontSize: '8pt', fontWeight: 600 }}>No.</label>
          <input className="glass-input text-sm" style={{ width: 80 }} type="text" placeholder="To Print"
            value={checkForm.check_number}
            onChange={e => setCheckForm(prev => ({ ...prev, check_number: e.target.value }))} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <label style={{ fontSize: '8pt', fontWeight: 600 }}>Date:</label>
          <input className="glass-input text-sm" style={{ width: 110 }} type="date" value={checkForm.check_date}
            onChange={e => setCheckForm(prev => ({ ...prev, check_date: e.target.value }))} />
        </div>
      </div>

      {/* ── Check image area — green-tinted ── */}
      <div className="glass-card p-4 m-2 border-l-4 border-l-lvf-success/30">
        {/* Company name + check number */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontStyle: 'italic', fontSize: '9pt', fontWeight: 600, color: '#555' }}>
            Level Valley Farms
          </span>
          <span style={{ fontSize: '8pt', color: '#666' }}>
            #{checkForm.check_number || 'To Print'}
          </span>
        </div>

        {/* PAY TO THE ORDER OF */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <label style={{ fontSize: '7pt', fontWeight: 700, color: '#444', whiteSpace: 'nowrap', letterSpacing: '0.5px' }}>
            PAY TO THE ORDER OF
          </label>
          <div style={{ flex: 1, position: 'relative' }}>
            <input className="glass-input text-sm" list="vendor-list" placeholder="Vendor / Payee name"
              value={checkForm.payee_name} onChange={e => handlePayeeChange(e.target.value)}
              style={{ fontSize: '10pt', fontWeight: 600 }} />
            <datalist id="vendor-list">
              {vendors.map(v => <option key={v.id} value={v.name} />)}
            </datalist>
          </div>
          <div style={{
            border: '2px solid #555', padding: '2px 8px', fontWeight: 700, fontSize: '11pt',
            minWidth: 110, textAlign: 'right', display: 'flex', alignItems: 'center', gap: 2,
          }}>
            <span style={{ fontSize: '10pt' }}>$</span>
            <input className="glass-input text-sm" type="number" step="0.01" min="0" placeholder="0.00"
              value={checkForm.amount}
              onChange={e => setCheckForm(prev => ({ ...prev, amount: e.target.value }))}
              style={{ border: 'none', textAlign: 'right', fontWeight: 700, fontSize: '11pt', width: 90, padding: 0, background: 'transparent', boxShadow: 'none' }} />
          </div>
        </div>

        {/* Amount in words */}
        <div style={{
          borderBottom: '1px solid #888', padding: '2px 0', marginBottom: 8,
          fontSize: '8pt', minHeight: 16, letterSpacing: 0.3,
        }}>
          {amountWords ? `${amountWords} *****` : ''}
        </div>

        {/* Address */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
          <AddressAutocomplete
            className="glass-input text-sm"
            value={checkForm.address}
            onChange={val => setCheckForm(prev => ({ ...prev, address: val }))}
            placeholder="Address"
            style={{ flex: 1, maxWidth: 300, fontSize: '8pt' }}
          />
        </div>

        {/* Memo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontSize: '8pt', fontWeight: 600, color: '#444' }}>Memo:</label>
          <input className="glass-input text-sm" placeholder="Memo" value={checkForm.memo}
            onChange={e => setCheckForm(prev => ({ ...prev, memo: e.target.value }))}
            style={{ flex: 1, maxWidth: 350 }} />
        </div>
      </div>

      {/* ── Tabs: Expenses | Items ── */}
      <div style={{ padding: '0 8px' }}>
        <div className="flex gap-1 px-2 mb-0">
          <button className={activeTab === 'expenses' ? 'bg-lvf-dark/60 text-lvf-accent font-semibold px-3 py-1.5 text-sm rounded-t-lg border border-lvf-border border-b-0' : 'px-3 py-1.5 text-sm text-lvf-muted hover:text-lvf-text cursor-pointer'} onClick={() => setActiveTab('expenses')}>Expenses</button>
          <button className={activeTab === 'items' ? 'bg-lvf-dark/60 text-lvf-accent font-semibold px-3 py-1.5 text-sm rounded-t-lg border border-lvf-border border-b-0' : 'px-3 py-1.5 text-sm text-lvf-muted hover:text-lvf-text cursor-pointer'} onClick={() => setActiveTab('items')}>Items</button>
        </div>

        <div className="border border-lvf-border rounded-b-xl p-3 bg-lvf-dark/20">
          {activeTab === 'expenses' && (
            <div>
              <table className="glass-table w-full">
                <thead>
                  <tr>
                    <th style={{ width: '35%' }}>Account</th>
                    <th style={{ width: '18%' }}>Amount</th>
                    <th style={{ width: '28%' }}>Memo</th>
                    <th style={{ width: '14%' }}>Flock</th>
                    <th style={{ width: '5%' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {expenseLines.map((line, idx) => (
                    <tr key={idx}>
                      <td>
                        <select className="glass-input text-sm" value={line.account_id}
                          onChange={e => updateExpenseLine(idx, 'account_id', e.target.value)}>
                          <option value="">-- Select Account --</option>
                          {expenseAccounts.map(a => (
                            <option key={a.id} value={a.id}>{a.account_number} - {a.name}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input className="glass-input text-sm" type="number" step="0.01" min="0" placeholder="0.00"
                          value={line.amount} onChange={e => updateExpenseLine(idx, 'amount', e.target.value)}
                          style={{ textAlign: 'right' }} />
                      </td>
                      <td>
                        <input className="glass-input text-sm" value={line.memo}
                          onChange={e => updateExpenseLine(idx, 'memo', e.target.value)} />
                      </td>
                      <td>
                        <input className="glass-input text-sm" placeholder="Optional" value={line.flock_id}
                          onChange={e => updateExpenseLine(idx, 'flock_id', e.target.value)} />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {expenseLines.length > 1 && (
                          <button onClick={() => removeExpenseLine(idx)}
                            className="text-red-500" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '10pt', fontWeight: 700 }}
                            title="Remove line">&times;</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <button className="glass-button-secondary text-sm" onClick={() => setExpenseLines(prev => [...prev, emptyExpenseLine()])}>
                  + Add Row
                </button>
                <div style={{ fontSize: '8pt', fontWeight: 600 }}>Expenses Total: ${expenseTotal.toFixed(2)}</div>
              </div>
            </div>
          )}

          {activeTab === 'items' && (
            <div>
              <table className="glass-table w-full">
                <thead>
                  <tr>
                    <th style={{ width: '40%' }}>Description</th>
                    <th style={{ width: '15%' }}>Qty</th>
                    <th style={{ width: '15%' }}>Cost</th>
                    <th style={{ width: '20%' }}>Amount</th>
                    <th style={{ width: '10%' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {itemLines.map((line, idx) => (
                    <tr key={idx}>
                      <td>
                        <input className="glass-input text-sm" value={line.item_description}
                          onChange={e => updateItemLine(idx, 'item_description', e.target.value)} placeholder="Item description" />
                      </td>
                      <td>
                        <input className="glass-input text-sm" type="number" step="1" min="0" value={line.quantity}
                          onChange={e => updateItemLine(idx, 'quantity', e.target.value)} style={{ textAlign: 'right' }} />
                      </td>
                      <td>
                        <input className="glass-input text-sm" type="number" step="0.01" min="0" value={line.cost}
                          onChange={e => updateItemLine(idx, 'cost', e.target.value)} style={{ textAlign: 'right' }} />
                      </td>
                      <td>
                        <input className="glass-input text-sm" type="number" step="0.01" value={line.amount} readOnly
                          style={{ textAlign: 'right', background: '#f5f5f0' }} />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {itemLines.length > 1 && (
                          <button onClick={() => removeItemLine(idx)}
                            className="text-red-500" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '10pt', fontWeight: 700 }}
                            title="Remove line">&times;</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <button className="glass-button-secondary text-sm" onClick={() => setItemLines(prev => [...prev, emptyItemLine()])}>
                  + Add Row
                </button>
                <div style={{ fontSize: '8pt', fontWeight: 600 }}>Items Total: ${itemTotal.toFixed(2)}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Footer: Save & Close | Save & New | Revert ── */}
      <div style={{
        display: 'flex', justifyContent: 'flex-end', gap: 6, padding: '8px',
        borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 6,
      }}>
        <button className="glass-button-secondary text-sm" onClick={handleClear}>Revert</button>
        <button className="glass-button-secondary text-sm" onClick={handlePrint}>Print</button>
        <button className="glass-button-primary text-sm" onClick={() => handleSave('new')}>Save &amp; New</button>
        <button className="glass-button-primary text-sm" onClick={() => handleSave('close')}>Save &amp; Close</button>
      </div>
    </div>
  )
}
