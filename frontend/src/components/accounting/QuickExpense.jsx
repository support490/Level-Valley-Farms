import { useState, useEffect } from 'react'
import { DollarSign } from 'lucide-react'
import { getAccounts, createQuickExpense } from '../../api/accounting'
import { getFlocks } from '../../api/flocks'
import SearchSelect from '../common/SearchSelect'
import Toast from '../common/Toast'
import useToast from '../../hooks/useToast'

const categoryOptions = [
  { value: 'feed', label: 'Feed Costs' },
  { value: 'grower_payment', label: 'Grower Payment' },
  { value: 'flock_cost', label: 'Flock Cost' },
  { value: 'veterinary', label: 'Veterinary / Service' },
  { value: 'chick_purchase', label: 'Chick Purchase' },
  { value: 'transport', label: 'Transport' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'service', label: 'Service' },
  { value: 'other', label: 'Other' },
]

const defaultCategoryAccounts = {
  feed: '5010',
  grower_payment: '5020',
  chick_purchase: '5030',
  veterinary: '5040',
  service: '5040',
  transport: '5050',
  utilities: '5060',
  flock_cost: '5070',
  other: '5100',
}

export default function QuickExpense() {
  const [accounts, setAccounts] = useState([])
  const [flocks, setFlocks] = useState([])
  const [form, setForm] = useState({
    entry_date: new Date().toISOString().split('T')[0],
    description: '',
    amount: '',
    expense_category: '',
    flock_id: '',
    reference: '',
    notes: '',
    expense_account_id: '',
    payment_account_id: '',
  })
  const [recentEntries, setRecentEntries] = useState([])
  const { toast, showToast, hideToast } = useToast()

  const load = async () => {
    try {
      const [accountsRes, flocksRes] = await Promise.all([getAccounts(), getFlocks()])
      setAccounts(accountsRes.data || [])
      setFlocks(flocksRes.data || [])

      // Default payment account to Cash (1010)
      const cashAccount = (accountsRes.data || []).find(a => a.account_number === '1010')
      if (cashAccount) {
        setForm(prev => ({ ...prev, payment_account_id: cashAccount.id }))
      }
    } catch {}
  }

  useEffect(() => { load() }, [])

  const flockOptions = flocks.map(f => ({ value: f.id, label: `${f.flock_number} — ${f.current_bird_count} birds` }))
  const expenseAccounts = accounts.filter(a => a.account_type === 'expense' && a.parent_id)
  const expenseAccountOptions = expenseAccounts.map(a => ({ value: a.id, label: `${a.account_number} - ${a.name}` }))
  const paymentAccounts = accounts.filter(a => a.account_type === 'asset' && a.parent_id)
  const paymentAccountOptions = paymentAccounts.map(a => ({ value: a.id, label: `${a.account_number} - ${a.name}` }))

  const handleCategoryChange = (opt) => {
    const category = opt?.value || ''
    const defaultAcctNum = defaultCategoryAccounts[category]
    const defaultAcct = defaultAcctNum ? accounts.find(a => a.account_number === defaultAcctNum) : null

    setForm(prev => ({
      ...prev,
      expense_category: category,
      expense_account_id: defaultAcct ? defaultAcct.id : prev.expense_account_id,
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.expense_account_id || !form.payment_account_id) {
      showToast('Select both expense and payment accounts', 'error')
      return
    }
    try {
      const result = await createQuickExpense({
        ...form,
        amount: parseFloat(form.amount),
      })
      setRecentEntries(prev => [result.data, ...prev].slice(0, 5))
      showToast(`Expense recorded: ${result.data.entry_number}`)
      setForm(prev => ({
        ...prev,
        description: '',
        amount: '',
        reference: '',
        notes: '',
        flock_id: '',
        expense_category: '',
        expense_account_id: '',
      }))
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error creating expense', 'error')
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {toast && <Toast {...toast} onClose={hideToast} />}

      <div className="lg:col-span-2">
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 rounded-xl bg-lvf-accent/15">
              <DollarSign size={20} className="text-lvf-accent" />
            </div>
            <div>
              <h3 className="font-semibold">Quick Expense Entry</h3>
              <p className="text-xs text-lvf-muted">Creates a balanced journal entry automatically</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-lvf-muted mb-1">Date *</label>
                <input className="glass-input w-full" type="date" required value={form.entry_date}
                  onChange={e => setForm({ ...form, entry_date: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm text-lvf-muted mb-1">Amount *</label>
                <input className="glass-input w-full" type="number" step="0.01" min="0.01" required
                  placeholder="0.00" value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })} />
              </div>
            </div>

            <div>
              <label className="block text-sm text-lvf-muted mb-1">Expense Category *</label>
              <SearchSelect
                options={categoryOptions}
                value={categoryOptions.find(o => o.value === form.expense_category) || null}
                onChange={handleCategoryChange}
                placeholder="Select category..."
              />
            </div>

            <div>
              <label className="block text-sm text-lvf-muted mb-1">Assign to Flock</label>
              <SearchSelect
                options={flockOptions}
                value={flockOptions.find(o => o.value === form.flock_id) || null}
                onChange={(opt) => setForm({ ...form, flock_id: opt?.value || '' })}
                placeholder="Select flock (optional)..."
                isClearable
              />
            </div>

            <div>
              <label className="block text-sm text-lvf-muted mb-1">Description *</label>
              <input className="glass-input w-full" required value={form.description}
                placeholder="e.g., Feed delivery from Wenger's"
                onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-lvf-muted mb-1">Debit Account (Expense)</label>
                <SearchSelect
                  options={expenseAccountOptions}
                  value={expenseAccountOptions.find(o => o.value === form.expense_account_id) || null}
                  onChange={(opt) => setForm({ ...form, expense_account_id: opt?.value || '' })}
                  placeholder="Select expense account..."
                />
              </div>
              <div>
                <label className="block text-sm text-lvf-muted mb-1">Credit Account (Payment)</label>
                <SearchSelect
                  options={paymentAccountOptions}
                  value={paymentAccountOptions.find(o => o.value === form.payment_account_id) || null}
                  onChange={(opt) => setForm({ ...form, payment_account_id: opt?.value || '' })}
                  placeholder="Select payment account..."
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-lvf-muted mb-1">Reference #</label>
              <input className="glass-input w-full" value={form.reference}
                placeholder="Invoice #, PO #, etc."
                onChange={e => setForm({ ...form, reference: e.target.value })} />
            </div>

            <div>
              <label className="block text-sm text-lvf-muted mb-1">Notes</label>
              <textarea className="glass-input w-full" rows={2} value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>

            <div className="flex justify-end pt-2">
              <button type="submit" className="glass-button-primary px-8">Record Expense</button>
            </div>
          </form>
        </div>
      </div>

      <div>
        <div className="glass-card p-5">
          <h4 className="font-semibold mb-4">Recent Entries</h4>
          {recentEntries.length === 0 ? (
            <p className="text-sm text-lvf-muted">No entries yet this session</p>
          ) : (
            <div className="space-y-3">
              {recentEntries.map(entry => (
                <div key={entry.id} className="p-3 rounded-xl bg-lvf-dark/40 border border-lvf-border/30">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs text-lvf-accent font-mono">{entry.entry_number}</span>
                    <span className="text-xs text-lvf-muted">{entry.entry_date}</span>
                  </div>
                  <p className="text-sm mb-1">{entry.description}</p>
                  <div className="flex justify-between text-xs">
                    <span className="text-lvf-muted">{entry.flock_number || 'No flock'}</span>
                    <span className="text-lvf-success font-medium">${entry.total_debit.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card p-5 mt-4">
          <h4 className="font-semibold mb-3">How it Works</h4>
          <div className="space-y-2 text-xs text-lvf-muted">
            <p>This form creates a proper double-entry journal entry:</p>
            <div className="p-2 rounded-lg bg-lvf-dark/40 font-mono">
              <p className="text-lvf-danger">DR Expense Account ... $X</p>
              <p className="text-lvf-success">CR Payment Account ... $X</p>
            </div>
            <p>The expense is automatically linked to the selected flock for reporting.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
