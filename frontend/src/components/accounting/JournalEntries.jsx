import { useState, useEffect } from 'react'
import { Plus, Check, Undo2, Trash2, Eye, X } from 'lucide-react'
import {
  getJournalEntries, createJournalEntry, postJournalEntry,
  unpostJournalEntry, deleteJournalEntry, getAccounts,
} from '../../api/accounting'
import { getFlocks } from '../../api/flocks'
import SearchSelect from '../common/SearchSelect'
import Modal from '../common/Modal'
import ConfirmDialog from '../common/ConfirmDialog'
import Toast from '../common/Toast'
import useToast from '../../hooks/useToast'

const categoryOptions = [
  { value: '', label: 'All Categories' },
  { value: 'feed', label: 'Feed' },
  { value: 'grower_payment', label: 'Grower Payment' },
  { value: 'flock_cost', label: 'Flock Cost' },
  { value: 'veterinary', label: 'Veterinary' },
  { value: 'service', label: 'Service' },
  { value: 'chick_purchase', label: 'Chick Purchase' },
  { value: 'transport', label: 'Transport' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'other', label: 'Other' },
]

export default function JournalEntries() {
  const [entries, setEntries] = useState([])
  const [accounts, setAccounts] = useState([])
  const [flocks, setFlocks] = useState([])
  const [filters, setFilters] = useState({ flock_id: '', category: '', posted_only: false, date_from: '', date_to: '' })
  const [modalOpen, setModalOpen] = useState(false)
  const [detailEntry, setDetailEntry] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const { toast, showToast, hideToast } = useToast()

  // Journal entry creation form
  const [form, setForm] = useState({
    entry_date: new Date().toISOString().split('T')[0],
    description: '', flock_id: '', expense_category: '', reference: '', notes: '',
    lines: [
      { account_id: '', debit: '', credit: '', description: '' },
      { account_id: '', debit: '', credit: '', description: '' },
    ],
  })

  const load = async () => {
    try {
      const params = {}
      if (filters.flock_id) params.flock_id = filters.flock_id
      if (filters.category) params.category = filters.category
      if (filters.posted_only) params.posted_only = true
      if (filters.date_from) params.date_from = filters.date_from
      if (filters.date_to) params.date_to = filters.date_to

      const [entriesRes, accountsRes, flocksRes] = await Promise.all([
        getJournalEntries(params), getAccounts(), getFlocks()
      ])
      setEntries(entriesRes.data || [])
      setAccounts(accountsRes.data || [])
      setFlocks(flocksRes.data || [])
    } catch {}
  }

  useEffect(() => { load() }, [filters])

  const flockOptions = [
    { value: '', label: 'All Flocks' },
    ...flocks.map(f => ({ value: f.id, label: f.flock_number })),
  ]
  const accountOptions = accounts.filter(a => a.parent_id).map(a => ({
    value: a.id, label: `${a.account_number} - ${a.name}`
  }))

  const addLine = () => {
    setForm(prev => ({
      ...prev,
      lines: [...prev.lines, { account_id: '', debit: '', credit: '', description: '' }],
    }))
  }

  const removeLine = (idx) => {
    setForm(prev => ({
      ...prev,
      lines: prev.lines.filter((_, i) => i !== idx),
    }))
  }

  const updateLine = (idx, field, value) => {
    setForm(prev => ({
      ...prev,
      lines: prev.lines.map((l, i) => i === idx ? { ...l, [field]: value } : l),
    }))
  }

  const totalDebit = form.lines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0)
  const totalCredit = form.lines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0)
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01

  const handleSubmit = async (e) => {
    e.preventDefault()
    const lines = form.lines.filter(l => l.account_id).map(l => ({
      account_id: l.account_id,
      debit: parseFloat(l.debit) || 0,
      credit: parseFloat(l.credit) || 0,
      description: l.description || null,
    }))

    try {
      await createJournalEntry({
        ...form,
        flock_id: form.flock_id || null,
        expense_category: form.expense_category || null,
        lines,
      })
      showToast('Journal entry created')
      setModalOpen(false)
      setForm({
        entry_date: new Date().toISOString().split('T')[0],
        description: '', flock_id: '', expense_category: '', reference: '', notes: '',
        lines: [
          { account_id: '', debit: '', credit: '', description: '' },
          { account_id: '', debit: '', credit: '', description: '' },
        ],
      })
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    }
  }

  const handlePost = async (id) => {
    try { await postJournalEntry(id); showToast('Entry posted'); load() }
    catch (err) { showToast(err.response?.data?.detail || 'Error posting', 'error') }
  }

  const handleUnpost = async (id) => {
    try { await unpostJournalEntry(id); showToast('Entry unposted'); load() }
    catch (err) { showToast(err.response?.data?.detail || 'Error', 'error') }
  }

  const handleDelete = async () => {
    try {
      await deleteJournalEntry(deleteTarget.id)
      showToast('Entry deleted')
      setDeleteTarget(null)
      load()
    } catch (err) { showToast(err.response?.data?.detail || 'Error', 'error') }
  }

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap gap-3">
          <input type="date" className="glass-input" value={filters.date_from}
            onChange={e => setFilters({ ...filters, date_from: e.target.value })} />
          <input type="date" className="glass-input" value={filters.date_to}
            onChange={e => setFilters({ ...filters, date_to: e.target.value })} />
          <div className="w-48">
            <SearchSelect options={flockOptions}
              value={flockOptions.find(o => o.value === filters.flock_id)}
              onChange={(opt) => setFilters({ ...filters, flock_id: opt?.value || '' })}
            />
          </div>
          <div className="w-48">
            <SearchSelect options={categoryOptions}
              value={categoryOptions.find(o => o.value === filters.category)}
              onChange={(opt) => setFilters({ ...filters, category: opt?.value || '' })}
            />
          </div>
        </div>
        <button onClick={() => setModalOpen(true)} className="glass-button-primary flex items-center gap-2">
          <Plus size={16} /> New Journal Entry
        </button>
      </div>

      <div className="glass-card overflow-hidden">
        <table className="w-full glass-table">
          <thead>
            <tr>
              <th>Entry #</th>
              <th>Date</th>
              <th>Description</th>
              <th>Flock</th>
              <th>Category</th>
              <th className="text-right">Debit</th>
              <th className="text-right">Credit</th>
              <th>Status</th>
              <th className="w-28"></th>
            </tr>
          </thead>
          <tbody>
            {entries.map(entry => (
              <tr key={entry.id}>
                <td className="font-mono text-lvf-accent">{entry.entry_number}</td>
                <td className="text-lvf-muted">{entry.entry_date}</td>
                <td>{entry.description}</td>
                <td className="text-lvf-muted">{entry.flock_number || '—'}</td>
                <td className="text-lvf-muted text-xs">{entry.expense_category || '—'}</td>
                <td className="text-right font-mono">${entry.total_debit.toFixed(2)}</td>
                <td className="text-right font-mono">${entry.total_credit.toFixed(2)}</td>
                <td>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    entry.is_posted ? 'bg-lvf-success/20 text-lvf-success' : 'bg-lvf-warning/20 text-lvf-warning'
                  }`}>
                    {entry.is_posted ? 'Posted' : 'Draft'}
                  </span>
                </td>
                <td>
                  <div className="flex gap-1">
                    <button onClick={() => setDetailEntry(entry)} title="View" className="p-1.5 rounded-lg hover:bg-white/10">
                      <Eye size={13} className="text-lvf-muted" />
                    </button>
                    {!entry.is_posted ? (
                      <>
                        <button onClick={() => handlePost(entry.id)} title="Post" className="p-1.5 rounded-lg hover:bg-white/10">
                          <Check size={13} className="text-lvf-success" />
                        </button>
                        <button onClick={() => setDeleteTarget(entry)} title="Delete" className="p-1.5 rounded-lg hover:bg-white/10">
                          <Trash2 size={13} className="text-lvf-danger" />
                        </button>
                      </>
                    ) : (
                      <button onClick={() => handleUnpost(entry.id)} title="Unpost" className="p-1.5 rounded-lg hover:bg-white/10">
                        <Undo2 size={13} className="text-lvf-warning" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr><td colSpan={9} className="text-center py-8 text-lvf-muted">No journal entries found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create Journal Entry Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="New Journal Entry" size="xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Date *</label>
              <input className="glass-input w-full" type="date" required value={form.entry_date}
                onChange={e => setForm({ ...form, entry_date: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Flock</label>
              <SearchSelect
                options={flocks.map(f => ({ value: f.id, label: f.flock_number }))}
                value={flocks.map(f => ({ value: f.id, label: f.flock_number })).find(o => o.value === form.flock_id) || null}
                onChange={(opt) => setForm({ ...form, flock_id: opt?.value || '' })}
                isClearable placeholder="Optional..."
              />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Reference</label>
              <input className="glass-input w-full" value={form.reference}
                onChange={e => setForm({ ...form, reference: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Description *</label>
            <input className="glass-input w-full" required value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>

          {/* Journal Lines */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-semibold">Lines</label>
              <button type="button" onClick={addLine} className="text-xs text-lvf-accent hover:underline">+ Add Line</button>
            </div>
            <div className="space-y-2">
              {form.lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_100px_100px_1fr_32px] gap-2 items-end">
                  <div>
                    {idx === 0 && <label className="block text-xs text-lvf-muted mb-1">Account</label>}
                    <SearchSelect
                      options={accountOptions}
                      value={accountOptions.find(o => o.value === line.account_id) || null}
                      onChange={(opt) => updateLine(idx, 'account_id', opt?.value || '')}
                      placeholder="Account..."
                    />
                  </div>
                  <div>
                    {idx === 0 && <label className="block text-xs text-lvf-muted mb-1">Debit</label>}
                    <input className="glass-input w-full" type="number" step="0.01" min="0"
                      placeholder="0.00" value={line.debit}
                      onChange={e => updateLine(idx, 'debit', e.target.value)} />
                  </div>
                  <div>
                    {idx === 0 && <label className="block text-xs text-lvf-muted mb-1">Credit</label>}
                    <input className="glass-input w-full" type="number" step="0.01" min="0"
                      placeholder="0.00" value={line.credit}
                      onChange={e => updateLine(idx, 'credit', e.target.value)} />
                  </div>
                  <div>
                    {idx === 0 && <label className="block text-xs text-lvf-muted mb-1">Memo</label>}
                    <input className="glass-input w-full" placeholder="Optional"
                      value={line.description}
                      onChange={e => updateLine(idx, 'description', e.target.value)} />
                  </div>
                  <div>
                    {idx === 0 && <label className="block text-xs text-lvf-muted mb-1">&nbsp;</label>}
                    {form.lines.length > 2 && (
                      <button type="button" onClick={() => removeLine(idx)} className="p-2 rounded-lg hover:bg-white/10">
                        <X size={14} className="text-lvf-danger" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-8 mt-3 pt-3 border-t border-lvf-border/50">
              <div className="text-sm">
                <span className="text-lvf-muted">Total Debits:</span>{' '}
                <span className="font-mono font-medium">${totalDebit.toFixed(2)}</span>
              </div>
              <div className="text-sm">
                <span className="text-lvf-muted">Total Credits:</span>{' '}
                <span className="font-mono font-medium">${totalCredit.toFixed(2)}</span>
              </div>
              <div className={`text-sm font-medium ${isBalanced ? 'text-lvf-success' : 'text-lvf-danger'}`}>
                {isBalanced ? 'Balanced' : `Out of balance: $${Math.abs(totalDebit - totalCredit).toFixed(2)}`}
              </div>
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" className="glass-button-primary" disabled={!isBalanced}>Create Entry</button>
          </div>
        </form>
      </Modal>

      {/* Detail Modal */}
      <Modal isOpen={!!detailEntry} onClose={() => setDetailEntry(null)} title={`Journal Entry ${detailEntry?.entry_number || ''}`} size="lg">
        {detailEntry && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><span className="text-lvf-muted">Date:</span> {detailEntry.entry_date}</div>
              <div><span className="text-lvf-muted">Flock:</span> {detailEntry.flock_number || '—'}</div>
              <div><span className="text-lvf-muted">Category:</span> {detailEntry.expense_category || '—'}</div>
              <div><span className="text-lvf-muted">Reference:</span> {detailEntry.reference || '—'}</div>
            </div>
            <p className="text-sm">{detailEntry.description}</p>

            <table className="w-full glass-table">
              <thead>
                <tr><th>Account</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th>Memo</th></tr>
              </thead>
              <tbody>
                {detailEntry.lines.map(line => (
                  <tr key={line.id}>
                    <td>{line.account_number} - {line.account_name}</td>
                    <td className="text-right font-mono">{line.debit > 0 ? `$${line.debit.toFixed(2)}` : ''}</td>
                    <td className="text-right font-mono">{line.credit > 0 ? `$${line.credit.toFixed(2)}` : ''}</td>
                    <td className="text-lvf-muted">{line.description || ''}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-lvf-border">
                  <td className="font-semibold">Totals</td>
                  <td className="text-right font-mono font-semibold">${detailEntry.total_debit.toFixed(2)}</td>
                  <td className="text-right font-mono font-semibold">${detailEntry.total_credit.toFixed(2)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      <ConfirmDialog isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title="Delete Entry" message={`Delete journal entry ${deleteTarget?.entry_number}? This cannot be undone.`} />
    </div>
  )
}
