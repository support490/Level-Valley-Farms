import { useState, useEffect } from 'react'
import { Plus, Play, Trash2, RefreshCw } from 'lucide-react'
import {
  getRecurringEntries, createRecurringEntry, deleteRecurringEntry, generateRecurringEntries
} from '../../api/accounting'
import { getAccounts } from '../../api/accounting'
import { getFlocks } from '../../api/flocks'
import SearchSelect from '../common/SearchSelect'
import Modal from '../common/Modal'
import Toast from '../common/Toast'
import useToast from '../../hooks/useToast'

const FREQUENCIES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually', label: 'Annually' },
]

const CATEGORIES = [
  { value: 'feed', label: 'Feed' },
  { value: 'grower_payment', label: 'Grower Payment' },
  { value: 'flock_cost', label: 'Flock Cost' },
  { value: 'veterinary', label: 'Veterinary' },
  { value: 'service', label: 'Service' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'transport', label: 'Transport' },
  { value: 'other', label: 'Other' },
]

export default function RecurringEntries() {
  const [entries, setEntries] = useState([])
  const [accounts, setAccounts] = useState([])
  const [flocks, setFlocks] = useState([])
  const [createOpen, setCreateOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  const [form, setForm] = useState({
    name: '', description: '', frequency: 'monthly', amount: '',
    expense_account_id: '', payment_account_id: '', flock_id: '',
    expense_category: '', start_date: new Date().toISOString().split('T')[0],
    end_date: '', auto_post: false, notes: ''
  })

  const load = async () => {
    try {
      const [entriesRes, accountsRes, flocksRes] = await Promise.all([
        getRecurringEntries({ active_only: false }),
        getAccounts(),
        getFlocks({ status: 'active' }),
      ])
      setEntries(entriesRes.data || [])
      setAccounts(accountsRes.data || [])
      setFlocks(flocksRes.data || [])
    } catch {}
  }

  useEffect(() => { load() }, [])

  const expenseAccounts = accounts.filter(a => a.account_type === 'expense' && a.parent_id)
    .map(a => ({ value: a.id, label: `${a.account_number} — ${a.name}` }))
  const paymentAccounts = accounts.filter(a => ['asset', 'liability'].includes(a.account_type) && a.parent_id)
    .map(a => ({ value: a.id, label: `${a.account_number} — ${a.name}` }))
  const flockOptions = flocks.map(f => ({ value: f.id, label: f.flock_number }))

  const handleCreate = async (e) => {
    e.preventDefault()
    if (submitting) return
    if (!form.name || !form.amount || !form.expense_account_id || !form.payment_account_id) {
      showToast('Fill in all required fields', 'error')
      return
    }
    setSubmitting(true)
    try {
      await createRecurringEntry({
        ...form,
        amount: parseFloat(form.amount),
        flock_id: form.flock_id || null,
        expense_category: form.expense_category || null,
        end_date: form.end_date || null,
      })
      showToast('Recurring entry created')
      setCreateOpen(false)
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    } finally { setSubmitting(false) }
  }

  const handleDelete = async (id) => {
    try {
      await deleteRecurringEntry(id)
      showToast('Recurring entry deactivated')
      load()
    } catch (err) {
      showToast('Error', 'error')
    }
  }

  const handleGenerate = async () => {
    setSubmitting(true)
    try {
      const res = await generateRecurringEntries()
      if (res.data.count > 0) {
        showToast(`Generated ${res.data.count} journal entries`)
      } else {
        showToast('No entries due for generation')
      }
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error generating', 'error')
    } finally { setSubmitting(false) }
  }

  const freqLabel = (v) => FREQUENCIES.find(f => f.value === v)?.label || v

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-lvf-muted">Set up recurring expenses that auto-generate journal entries</p>
        <div className="flex gap-2">
          <button onClick={handleGenerate} disabled={submitting}
            className="glass-button-secondary flex items-center gap-2 text-sm">
            <RefreshCw size={14} /> Generate Due Entries
          </button>
          <button onClick={() => setCreateOpen(true)}
            className="glass-button-primary flex items-center gap-2 text-sm">
            <Plus size={14} /> New Recurring
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {entries.map(r => (
          <div key={r.id} className={`glass-card p-4 ${!r.is_active ? 'opacity-50' : ''}`}>
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-semibold">{r.name}</h4>
                <p className="text-sm text-lvf-muted">{r.description}</p>
              </div>
              <div className="flex items-center gap-2">
                {!r.is_active && <span className="text-xs px-2 py-0.5 rounded-full bg-lvf-muted/20 text-lvf-muted">Inactive</span>}
                {r.is_active && (
                  <button onClick={() => handleDelete(r.id)} className="p-1.5 rounded-lg hover:bg-white/10">
                    <Trash2 size={13} className="text-lvf-danger" />
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mt-3 text-sm">
              <div>
                <p className="text-[10px] text-lvf-muted">Frequency</p>
                <p className="font-medium">{freqLabel(r.frequency)}</p>
              </div>
              <div>
                <p className="text-[10px] text-lvf-muted">Amount</p>
                <p className="font-mono font-medium">${parseFloat(r.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-[10px] text-lvf-muted">Expense Account</p>
                <p className="truncate">{r.expense_account_name}</p>
              </div>
              <div>
                <p className="text-[10px] text-lvf-muted">Payment From</p>
                <p className="truncate">{r.payment_account_name}</p>
              </div>
              <div>
                <p className="text-[10px] text-lvf-muted">Next Due</p>
                <p className={r.next_due_date && r.next_due_date <= new Date().toISOString().split('T')[0] ? 'text-lvf-warning font-semibold' : ''}>
                  {r.next_due_date || '—'}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-lvf-muted">Flock</p>
                <p className="text-lvf-accent">{r.flock_number || 'All'}</p>
              </div>
            </div>
          </div>
        ))}
        {entries.length === 0 && (
          <div className="glass-card p-12 text-center text-lvf-muted">
            No recurring entries. Click "New Recurring" to set up automatic expense generation.
          </div>
        )}
      </div>

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="New Recurring Entry" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Name *</label>
              <input className="glass-input w-full" required value={form.name}
                placeholder="e.g. Monthly Grower Payment"
                onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Frequency *</label>
              <select className="glass-input w-full" value={form.frequency}
                onChange={e => setForm({ ...form, frequency: e.target.value })}>
                {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Description *</label>
            <input className="glass-input w-full" required value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Amount *</label>
              <input className="glass-input w-full" type="number" step="0.01" min="0.01" required
                value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Start Date *</label>
              <input className="glass-input w-full" type="date" required value={form.start_date}
                onChange={e => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">End Date</label>
              <input className="glass-input w-full" type="date" value={form.end_date}
                onChange={e => setForm({ ...form, end_date: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Expense Account *</label>
              <SearchSelect options={expenseAccounts}
                value={expenseAccounts.find(o => o.value === form.expense_account_id) || null}
                onChange={(opt) => setForm({ ...form, expense_account_id: opt?.value || '' })}
                placeholder="Select expense account..." />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Payment From *</label>
              <SearchSelect options={paymentAccounts}
                value={paymentAccounts.find(o => o.value === form.payment_account_id) || null}
                onChange={(opt) => setForm({ ...form, payment_account_id: opt?.value || '' })}
                placeholder="Select payment account..." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Category</label>
              <select className="glass-input w-full" value={form.expense_category}
                onChange={e => setForm({ ...form, expense_category: e.target.value })}>
                <option value="">— None —</option>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Flock</label>
              <SearchSelect options={flockOptions}
                value={flockOptions.find(o => o.value === form.flock_id) || null}
                onChange={(opt) => setForm({ ...form, flock_id: opt?.value || '' })}
                placeholder="All flocks" isClearable />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-lvf-muted cursor-pointer">
            <input type="checkbox" checked={form.auto_post}
              onChange={e => setForm({ ...form, auto_post: e.target.checked })} />
            Auto-post generated entries (skip review)
          </label>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">{submitting ? 'Creating...' : 'Create'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
