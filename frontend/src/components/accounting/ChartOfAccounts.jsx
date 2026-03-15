import { useState, useEffect } from 'react'
import { Plus, Pencil, ChevronRight, ChevronDown } from 'lucide-react'
import { getAccounts, createAccount, updateAccount } from '../../api/accounting'
import Modal from '../common/Modal'
import SearchSelect from '../common/SearchSelect'
import Toast from '../common/Toast'
import useToast from '../../hooks/useToast'

const typeColors = {
  asset: 'text-blue-400',
  liability: 'text-orange-400',
  equity: 'text-purple-400',
  revenue: 'text-green-400',
  expense: 'text-red-400',
}

const typeOptions = [
  { value: 'asset', label: 'Asset' },
  { value: 'liability', label: 'Liability' },
  { value: 'equity', label: 'Equity' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'expense', label: 'Expense' },
]

export default function ChartOfAccounts() {
  const [accounts, setAccounts] = useState([])
  const [expanded, setExpanded] = useState({})
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ account_number: '', name: '', account_type: 'expense', parent_id: '', description: '' })
  const { toast, showToast, hideToast } = useToast()

  const load = async () => {
    const res = await getAccounts()
    setAccounts(res.data)
    // Auto-expand parent accounts
    const exp = {}
    res.data.forEach(a => { if (!a.parent_id) exp[a.id] = true })
    setExpanded(exp)
  }

  useEffect(() => { load() }, [])

  const parentAccounts = accounts.filter(a => !a.parent_id)
  const childAccounts = (parentId) => accounts.filter(a => a.parent_id === parentId)
  const parentOptions = accounts.filter(a => !a.parent_id).map(a => ({ value: a.id, label: `${a.account_number} - ${a.name}` }))

  const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  const openCreate = () => {
    setEditing(null)
    setForm({ account_number: '', name: '', account_type: 'expense', parent_id: '', description: '' })
    setModalOpen(true)
  }

  const openEdit = (a) => {
    setEditing(a)
    setForm({ account_number: a.account_number, name: a.name, account_type: a.account_type, parent_id: a.parent_id || '', description: a.description || '' })
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const payload = { ...form, parent_id: form.parent_id || null }
      if (editing) {
        await updateAccount(editing.id, { name: payload.name, description: payload.description, parent_id: payload.parent_id })
        showToast('Account updated')
      } else {
        await createAccount(payload)
        showToast('Account created')
      }
      setModalOpen(false)
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    }
  }

  const formatBalance = (bal) => {
    const abs = Math.abs(bal)
    const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return bal < 0 ? `(${formatted})` : `$${formatted}`
  }

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}
      <div className="flex justify-end mb-4">
        <button onClick={openCreate} className="glass-button-primary flex items-center gap-2">
          <Plus size={16} /> Add Account
        </button>
      </div>

      <div className="glass-card overflow-hidden">
        <table className="w-full glass-table">
          <thead>
            <tr>
              <th className="w-10"></th>
              <th>Account #</th>
              <th>Name</th>
              <th>Type</th>
              <th className="text-right">Balance</th>
              <th className="w-16"></th>
            </tr>
          </thead>
          <tbody>
            {parentAccounts.map(parent => {
              const children = childAccounts(parent.id)
              const isExpanded = expanded[parent.id]
              return (
                <>{/* Fragment key on parent */}
                  <tr key={parent.id} className="bg-lvf-dark/30">
                    <td>
                      {children.length > 0 && (
                        <button onClick={() => toggleExpand(parent.id)} className="p-1 hover:bg-white/10 rounded">
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      )}
                    </td>
                    <td className="font-semibold">{parent.account_number}</td>
                    <td className="font-semibold">{parent.name}</td>
                    <td><span className={`text-xs font-medium uppercase ${typeColors[parent.account_type]}`}>{parent.account_type}</span></td>
                    <td className="text-right font-mono">{formatBalance(parent.balance)}</td>
                    <td>
                      <button onClick={() => openEdit(parent)} className="p-1.5 rounded-lg hover:bg-white/10">
                        <Pencil size={13} className="text-lvf-muted" />
                      </button>
                    </td>
                  </tr>
                  {isExpanded && children.map(child => (
                    <tr key={child.id}>
                      <td></td>
                      <td className="pl-8 text-lvf-muted">{child.account_number}</td>
                      <td className="pl-4">{child.name}</td>
                      <td><span className={`text-xs font-medium uppercase ${typeColors[child.account_type]}`}>{child.account_type}</span></td>
                      <td className="text-right font-mono">{formatBalance(child.balance)}</td>
                      <td>
                        <button onClick={() => openEdit(child)} className="p-1.5 rounded-lg hover:bg-white/10">
                          <Pencil size={13} className="text-lvf-muted" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </>
              )
            })}
          </tbody>
        </table>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Account' : 'Add Account'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Account Number *</label>
              <input className="glass-input w-full" required value={form.account_number}
                disabled={!!editing}
                onChange={e => setForm({ ...form, account_number: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Account Type *</label>
              <SearchSelect
                options={typeOptions}
                value={typeOptions.find(o => o.value === form.account_type)}
                onChange={(opt) => setForm({ ...form, account_type: opt?.value || 'expense' })}
                isDisabled={!!editing}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Name *</label>
            <input className="glass-input w-full" required value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Parent Account</label>
            <SearchSelect
              options={parentOptions}
              value={parentOptions.find(o => o.value === form.parent_id) || null}
              onChange={(opt) => setForm({ ...form, parent_id: opt?.value || '' })}
              placeholder="None (top-level)"
              isClearable
            />
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Description</label>
            <textarea className="glass-input w-full" rows={2} value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" className="glass-button-primary">{editing ? 'Update' : 'Create'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
