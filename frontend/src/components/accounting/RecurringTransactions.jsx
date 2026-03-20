import { useState, useEffect } from 'react'
import { Plus, RefreshCw, Edit3, Trash2, XCircle, ChevronLeft } from 'lucide-react'
import {
  getRecurringTransactions, createRecurringTransaction, updateRecurringTransaction,
  deleteRecurringTransaction, generateRecurringTransactions,
  getBuyers, getVendors, getAccounts, getBankAccounts, getActiveFlocks,
} from '../../api/accounting'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'

const FREQUENCIES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually', label: 'Annually' },
]

const TRANSACTION_TYPES = [
  { value: 'invoice', label: 'Invoice' },
  { value: 'bill', label: 'Bill' },
  { value: 'check', label: 'Check' },
]

const labelStyle = { fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }

const today = () => new Date().toISOString().split('T')[0]

const emptyForm = () => ({
  name: '',
  transaction_type: 'invoice',
  frequency: 'weekly',
  customer_vendor_name: '',
  customer_vendor_id: '',
  amount: '',
  flock_id: '',
  start_date: today(),
  end_date: '',
  next_due_date: today(),
  notes: '',
  is_active: true,
  template_data: {
    description: '',
    line_items: [{ description: '', amount: '' }],
    expense_account: '',
    payee: '',
    bank_account_id: '',
    memo: '',
  },
})

const fmt = (val) => {
  const n = parseFloat(val) || 0
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}

export default function RecurringTransactions() {
  const [items, setItems] = useState([])
  const [view, setView] = useState('list') // list | form
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [buyers, setBuyers] = useState([])
  const [vendors, setVendors] = useState([])
  const [accounts, setAccounts] = useState([])
  const [bankAccounts, setBankAccounts] = useState([])
  const [flocks, setFlocks] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const [txRes, buyerRes, vendorRes, acctRes, bankRes, flockRes] = await Promise.all([
        getRecurringTransactions(),
        getBuyers(),
        getVendors(),
        getAccounts(),
        getBankAccounts(),
        getActiveFlocks(),
      ])
      setItems(txRes.data || [])
      setBuyers(buyerRes.data || [])
      setVendors(vendorRes.data || [])
      setAccounts(acctRes.data || [])
      setBankAccounts(bankRes.data || [])
      setFlocks(flockRes.data || [])
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error loading recurring transactions', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const freqLabel = (v) => FREQUENCIES.find(f => f.value === v)?.label || v
  const typeLabel = (v) => TRANSACTION_TYPES.find(t => t.value === v)?.label || v

  const typeBadge = (type) => {
    const colors = {
      invoice: 'bg-blue-500/20 text-blue-400',
      bill: 'bg-orange-500/20 text-orange-400',
      check: 'bg-green-500/20 text-green-400',
    }
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[type] || 'bg-lvf-muted/20 text-lvf-muted'}`}>
        {typeLabel(type)}
      </span>
    )
  }

  const customerVendorList = () => {
    if (form.transaction_type === 'invoice') return buyers
    return vendors
  }

  const customerVendorLabel = () => {
    if (form.transaction_type === 'invoice') return 'Egg Buyer'
    if (form.transaction_type === 'bill') return 'Vendor / Feed Mill'
    return 'Payee'
  }

  const handleNew = () => {
    setEditingId(null)
    setForm(emptyForm())
    setView('form')
  }

  const handleEdit = (item) => {
    setEditingId(item.id)
    setForm({
      name: item.name || '',
      transaction_type: item.transaction_type || 'invoice',
      frequency: item.frequency || 'weekly',
      customer_vendor_name: item.customer_vendor_name || '',
      customer_vendor_id: item.customer_vendor_id || '',
      amount: item.amount || '',
      flock_id: item.flock_id || '',
      start_date: item.start_date || today(),
      end_date: item.end_date || '',
      next_due_date: item.next_due_date || today(),
      notes: item.notes || '',
      is_active: item.is_active !== false,
      template_data: item.template_data || emptyForm().template_data,
    })
    setView('form')
  }

  const handleDeactivate = async (id) => {
    try {
      await updateRecurringTransaction(id, { is_active: false })
      showToast('Recurring transaction deactivated')
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error deactivating', 'error')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this recurring transaction? This cannot be undone.')) return
    try {
      await deleteRecurringTransaction(id)
      showToast('Recurring transaction deleted')
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error deleting', 'error')
    }
  }

  const handleGenerate = async () => {
    setSubmitting(true)
    try {
      const res = await generateRecurringTransactions()
      const count = res.data?.count || res.data?.generated || 0
      if (count > 0) {
        showToast(`Generated ${count} transactions`)
      } else {
        showToast('No transactions due for generation')
      }
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error generating transactions', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.name) { showToast('Enter a name for this recurring transaction', 'error'); return }
    if (!form.amount || parseFloat(form.amount) <= 0) { showToast('Enter a valid amount', 'error'); return }

    setSubmitting(true)
    try {
      const payload = {
        ...form,
        amount: parseFloat(form.amount),
        flock_id: form.flock_id || null,
        end_date: form.end_date || null,
        template_data: form.template_data,
      }

      if (editingId) {
        await updateRecurringTransaction(editingId, payload)
        showToast('Recurring transaction updated')
      } else {
        await createRecurringTransaction(payload)
        showToast('Recurring transaction created')
      }
      setView('list')
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error saving', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const updateTemplateData = (field, value) => {
    setForm(prev => ({
      ...prev,
      template_data: { ...prev.template_data, [field]: value },
    }))
  }

  const updateLineItem = (idx, field, value) => {
    setForm(prev => {
      const lines = [...(prev.template_data.line_items || [])]
      lines[idx] = { ...lines[idx], [field]: value }
      return { ...prev, template_data: { ...prev.template_data, line_items: lines } }
    })
  }

  const addLineItem = () => {
    setForm(prev => ({
      ...prev,
      template_data: {
        ...prev.template_data,
        line_items: [...(prev.template_data.line_items || []), { description: '', amount: '' }],
      },
    }))
  }

  const removeLineItem = (idx) => {
    setForm(prev => ({
      ...prev,
      template_data: {
        ...prev.template_data,
        line_items: prev.template_data.line_items.filter((_, i) => i !== idx),
      },
    }))
  }

  // -- LIST VIEW --
  if (view === 'list') {
    return (
      <div>
        {toast && <Toast {...toast} onClose={hideToast} />}

        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-lvf-muted">
            Manage recurring invoices, bills, and checks — weekly egg invoices, monthly grower payments, rent checks
          </p>
          <div className="flex gap-2">
            <button onClick={handleGenerate} disabled={submitting}
              className="glass-button-primary flex items-center gap-2 text-sm">
              <RefreshCw size={14} className={submitting ? 'animate-spin' : ''} />
              Generate Due Now
            </button>
            <button onClick={handleNew}
              className="glass-button-secondary flex items-center gap-2 text-sm">
              <Plus size={14} /> New Recurring
            </button>
          </div>
        </div>

        <div className="glass-card overflow-hidden">
          <table className="w-full glass-table">
            <thead>
              <tr>
                <th className="text-left p-3 text-xs font-semibold text-lvf-muted">Name</th>
                <th className="text-left p-3 text-xs font-semibold text-lvf-muted">Type</th>
                <th className="text-left p-3 text-xs font-semibold text-lvf-muted">Frequency</th>
                <th className="text-left p-3 text-xs font-semibold text-lvf-muted">Customer / Vendor</th>
                <th className="text-right p-3 text-xs font-semibold text-lvf-muted">Amount</th>
                <th className="text-left p-3 text-xs font-semibold text-lvf-muted">Next Due</th>
                <th className="text-center p-3 text-xs font-semibold text-lvf-muted">Status</th>
                <th className="text-right p-3 text-xs font-semibold text-lvf-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className={`border-t border-lvf-border hover:bg-white/5 ${!item.is_active ? 'opacity-50' : ''}`}>
                  <td className="p-3 text-sm font-medium">{item.name}</td>
                  <td className="p-3">{typeBadge(item.transaction_type)}</td>
                  <td className="p-3 text-sm">{freqLabel(item.frequency)}</td>
                  <td className="p-3 text-sm">{item.customer_vendor_name || '—'}</td>
                  <td className="p-3 text-sm text-right font-mono">{fmt(item.amount)}</td>
                  <td className="p-3 text-sm">
                    <span className={item.next_due_date && item.next_due_date <= today() ? 'text-lvf-warning font-semibold' : ''}>
                      {item.next_due_date || '—'}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    {item.is_active ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-lvf-success/20 text-lvf-success">Active</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-lvf-muted/20 text-lvf-muted">Inactive</span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => handleEdit(item)}
                        className="p-1.5 rounded-lg hover:bg-white/10" title="Edit">
                        <Edit3 size={13} />
                      </button>
                      {item.is_active && (
                        <button onClick={() => handleDeactivate(item.id)}
                          className="p-1.5 rounded-lg hover:bg-white/10" title="Deactivate">
                          <XCircle size={13} className="text-lvf-warning" />
                        </button>
                      )}
                      <button onClick={() => handleDelete(item.id)}
                        className="p-1.5 rounded-lg hover:bg-white/10" title="Delete">
                        <Trash2 size={13} className="text-lvf-danger" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-lvf-muted">
                    No recurring transactions. Click "New Recurring" to set up weekly egg invoices, monthly grower payments, or rent checks.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // -- CREATE / EDIT FORM VIEW --
  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      <button onClick={() => setView('list')}
        className="glass-button-secondary flex items-center gap-2 text-sm mb-4">
        <ChevronLeft size={14} /> Back to List
      </button>

      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold mb-4">
          {editingId ? 'Edit Recurring Transaction' : 'New Recurring Transaction'}
        </h3>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Name */}
          <div>
            <label style={labelStyle}>Name</label>
            <input className="glass-input w-full" required value={form.name}
              placeholder="e.g. Weekly Egg Invoice - Farm Fresh Foods"
              onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>

          {/* Type + Frequency */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Transaction Type</label>
              <div className="flex gap-4 mt-1">
                {TRANSACTION_TYPES.map(t => (
                  <label key={t.value} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" name="txn_type" value={t.value}
                      checked={form.transaction_type === t.value}
                      onChange={() => setForm({ ...form, transaction_type: t.value, customer_vendor_name: '', customer_vendor_id: '' })} />
                    {t.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label style={labelStyle}>Frequency</label>
              <select className="glass-input w-full" value={form.frequency}
                onChange={e => setForm({ ...form, frequency: e.target.value })}>
                {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
          </div>

          {/* Customer/Vendor + Amount */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>{customerVendorLabel()}</label>
              <input className="glass-input w-full" list="cv-list" value={form.customer_vendor_name}
                placeholder={form.transaction_type === 'invoice' ? 'Select egg buyer...' : 'Select vendor / feed mill...'}
                onChange={e => {
                  const name = e.target.value
                  setForm(prev => ({ ...prev, customer_vendor_name: name }))
                  const list = customerVendorList()
                  const match = list.find(x => (x.name || '').toLowerCase() === name.toLowerCase())
                  if (match) setForm(prev => ({ ...prev, customer_vendor_id: match.id }))
                }} />
              <datalist id="cv-list">
                {customerVendorList().map(x => (
                  <option key={x.id} value={x.name} />
                ))}
              </datalist>
            </div>
            <div>
              <label style={labelStyle}>Amount</label>
              <input className="glass-input w-full" type="number" step="0.01" min="0.01" required
                value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
            </div>
          </div>

          {/* Flock */}
          <div>
            <label style={labelStyle}>Flock (optional)</label>
            <select className="glass-input w-full" value={form.flock_id}
              onChange={e => setForm({ ...form, flock_id: e.target.value })}>
              <option value="">— No specific flock —</option>
              {flocks.map(f => (
                <option key={f.id} value={f.id}>{f.flock_number || f.name || f.id}</option>
              ))}
            </select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label style={labelStyle}>Start Date</label>
              <input className="glass-input w-full" type="date" required value={form.start_date}
                onChange={e => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>End Date (optional)</label>
              <input className="glass-input w-full" type="date" value={form.end_date}
                onChange={e => setForm({ ...form, end_date: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Next Due Date</label>
              <input className="glass-input w-full" type="date" required value={form.next_due_date}
                onChange={e => setForm({ ...form, next_due_date: e.target.value })} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea className="glass-input w-full" rows={2} value={form.notes}
              placeholder="e.g. Weekly delivery every Tuesday"
              onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>

          {/* Template Data Section */}
          <div className="border-t border-lvf-border pt-4 mt-4">
            <h4 className="text-sm font-semibold mb-3">Template Data</h4>

            {/* Invoice template */}
            {form.transaction_type === 'invoice' && (
              <div className="space-y-3">
                <div>
                  <label style={labelStyle}>Description</label>
                  <input className="glass-input w-full" value={form.template_data.description || ''}
                    placeholder="e.g. Weekly Egg Delivery"
                    onChange={e => updateTemplateData('description', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Line Items</label>
                  {(form.template_data.line_items || []).map((line, idx) => (
                    <div key={idx} className="flex gap-2 mb-2">
                      <input className="glass-input flex-1" placeholder="Description (e.g. Large Grade A Eggs)"
                        value={line.description || ''}
                        onChange={e => updateLineItem(idx, 'description', e.target.value)} />
                      <input className="glass-input w-32" type="number" step="0.01" placeholder="Amount"
                        value={line.amount || ''}
                        onChange={e => updateLineItem(idx, 'amount', e.target.value)} />
                      {(form.template_data.line_items || []).length > 1 && (
                        <button type="button" onClick={() => removeLineItem(idx)}
                          className="p-2 rounded-lg hover:bg-white/10">
                          <Trash2 size={13} className="text-lvf-danger" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={addLineItem}
                    className="text-xs text-lvf-accent hover:underline flex items-center gap-1 mt-1">
                    <Plus size={12} /> Add Line
                  </button>
                </div>
              </div>
            )}

            {/* Bill template */}
            {form.transaction_type === 'bill' && (
              <div className="space-y-3">
                <div>
                  <label style={labelStyle}>Description</label>
                  <input className="glass-input w-full" value={form.template_data.description || ''}
                    placeholder="e.g. Monthly Feed Delivery"
                    onChange={e => updateTemplateData('description', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Expense Account</label>
                  <select className="glass-input w-full" value={form.template_data.expense_account || ''}
                    onChange={e => updateTemplateData('expense_account', e.target.value)}>
                    <option value="">— Select expense account —</option>
                    {accounts
                      .filter(a => a.account_type === 'expense' || a.account_type === 'cost_of_goods_sold')
                      .map(a => (
                        <option key={a.id} value={a.id}>
                          {a.account_number ? `${a.account_number} — ` : ''}{a.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Amount</label>
                  <input className="glass-input w-full" type="number" step="0.01"
                    value={form.template_data.amount || ''}
                    placeholder="Bill amount"
                    onChange={e => updateTemplateData('amount', e.target.value)} />
                </div>
              </div>
            )}

            {/* Check template */}
            {form.transaction_type === 'check' && (
              <div className="space-y-3">
                <div>
                  <label style={labelStyle}>Payee</label>
                  <input className="glass-input w-full" value={form.template_data.payee || ''}
                    placeholder="e.g. Landlord Name"
                    onChange={e => updateTemplateData('payee', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Bank Account</label>
                  <select className="glass-input w-full" value={form.template_data.bank_account_id || ''}
                    onChange={e => updateTemplateData('bank_account_id', e.target.value)}>
                    <option value="">— Select bank account —</option>
                    {bankAccounts.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Memo</label>
                  <input className="glass-input w-full" value={form.template_data.memo || ''}
                    placeholder="e.g. Monthly rent payment"
                    onChange={e => updateTemplateData('memo', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Amount</label>
                  <input className="glass-input w-full" type="number" step="0.01"
                    value={form.template_data.amount || ''}
                    placeholder="Check amount"
                    onChange={e => updateTemplateData('amount', e.target.value)} />
                </div>
              </div>
            )}
          </div>

          {/* Save */}
          <div className="flex gap-3 justify-end pt-4 border-t border-lvf-border">
            <button type="button" onClick={() => setView('list')} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">
              {submitting ? 'Saving...' : editingId ? 'Update Recurring Transaction' : 'Save Recurring Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
