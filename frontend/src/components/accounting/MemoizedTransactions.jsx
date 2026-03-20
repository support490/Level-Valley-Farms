import { useState, useEffect } from 'react'
import { Plus, Play, Trash2, ChevronLeft, Clock, FileText } from 'lucide-react'
import {
  getMemoizedTransactions, createMemoizedTransaction, deleteMemoizedTransaction,
  useMemoizedTransaction,
} from '../../api/accounting'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'

const TRANSACTION_TYPES = [
  { value: 'invoice', label: 'Invoice' },
  { value: 'bill', label: 'Bill' },
  { value: 'check', label: 'Check' },
  { value: 'journal_entry', label: 'Journal Entry' },
]

const labelStyle = { fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }

const fmt = (val) => {
  const n = parseFloat(val) || 0
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}

export default function MemoizedTransactions() {
  const [templates, setTemplates] = useState([])
  const [view, setView] = useState('list') // list | create
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [usingId, setUsingId] = useState(null)
  const { toast, showToast, hideToast } = useToast()

  const [form, setForm] = useState({
    name: '',
    transaction_type: 'invoice',
    notes: '',
    template_data: '',
    template_pairs: [{ key: '', value: '' }],
    use_json: false,
  })

  const load = async () => {
    setLoading(true)
    try {
      const res = await getMemoizedTransactions()
      setTemplates(res.data || [])
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error loading memorized transactions', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const typeLabel = (v) => TRANSACTION_TYPES.find(t => t.value === v)?.label || v

  const typeBadge = (type) => {
    const colors = {
      invoice: 'bg-blue-500/20 text-blue-400',
      bill: 'bg-orange-500/20 text-orange-400',
      check: 'bg-green-500/20 text-green-400',
      journal_entry: 'bg-purple-500/20 text-purple-400',
    }
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[type] || 'bg-lvf-muted/20 text-lvf-muted'}`}>
        {typeLabel(type)}
      </span>
    )
  }

  const handleUse = async (id, name) => {
    setUsingId(id)
    try {
      const res = await useMemoizedTransaction(id)
      const result = res.data
      if (result?.invoice_id) {
        showToast(`Created invoice from "${name}"`)
      } else if (result?.bill_id) {
        showToast(`Created bill from "${name}"`)
      } else if (result?.check_id) {
        showToast(`Created check from "${name}"`)
      } else {
        showToast(`Transaction created from "${name}"`)
      }
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error using template', 'error')
    } finally {
      setUsingId(null)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this memorized transaction template?')) return
    try {
      await deleteMemoizedTransaction(id)
      showToast('Memorized transaction deleted')
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error deleting', 'error')
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.name) { showToast('Enter a template name', 'error'); return }

    setSubmitting(true)
    try {
      let templateData = {}
      if (form.use_json) {
        try {
          templateData = JSON.parse(form.template_data || '{}')
        } catch {
          showToast('Invalid JSON in template data', 'error')
          setSubmitting(false)
          return
        }
      } else {
        form.template_pairs.forEach(pair => {
          if (pair.key.trim()) templateData[pair.key.trim()] = pair.value
        })
      }

      await createMemoizedTransaction({
        name: form.name,
        transaction_type: form.transaction_type,
        notes: form.notes,
        template_data: templateData,
      })
      showToast('Memorized transaction created')
      setView('list')
      setForm({
        name: '', transaction_type: 'invoice', notes: '', template_data: '',
        template_pairs: [{ key: '', value: '' }], use_json: false,
      })
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error creating template', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const updatePair = (idx, field, value) => {
    setForm(prev => {
      const pairs = [...prev.template_pairs]
      pairs[idx] = { ...pairs[idx], [field]: value }
      return { ...prev, template_pairs: pairs }
    })
  }

  const addPair = () => {
    setForm(prev => ({ ...prev, template_pairs: [...prev.template_pairs, { key: '', value: '' }] }))
  }

  const removePair = (idx) => {
    setForm(prev => ({ ...prev, template_pairs: prev.template_pairs.filter((_, i) => i !== idx) }))
  }

  // -- LIST VIEW --
  if (view === 'list') {
    return (
      <div>
        {toast && <Toast {...toast} onClose={hideToast} />}

        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-lvf-muted">
            Saved transaction templates — memorize an egg invoice or feed bill for one-click creation
          </p>
          <button onClick={() => setView('create')}
            className="glass-button-secondary flex items-center gap-2 text-sm">
            <Plus size={14} /> New Template
          </button>
        </div>

        {templates.length === 0 && (
          <div className="glass-card p-12 text-center text-lvf-muted">
            <FileText size={32} className="mx-auto mb-3 opacity-40" />
            <p>No memorized transactions yet.</p>
            <p className="text-xs mt-1">Use the "Memorize" button on invoices, bills, or checks to save templates here.</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map(tpl => {
            const templateAmount = tpl.template_data?.amount || tpl.template_data?.total || tpl.amount
            return (
              <div key={tpl.id} className="glass-card p-4 flex flex-col">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm truncate">{tpl.name}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      {typeBadge(tpl.transaction_type)}
                    </div>
                  </div>
                  {templateAmount && (
                    <span className="font-mono font-semibold text-sm ml-2">{fmt(templateAmount)}</span>
                  )}
                </div>

                {tpl.notes && (
                  <p className="text-xs text-lvf-muted mb-3 line-clamp-2">{tpl.notes}</p>
                )}

                {tpl.last_used_at && (
                  <div className="flex items-center gap-1 text-xs text-lvf-muted mb-3">
                    <Clock size={10} />
                    Last used: {new Date(tpl.last_used_at).toLocaleDateString()}
                  </div>
                )}

                {tpl.template_data?.customer_vendor_name && (
                  <p className="text-xs text-lvf-muted mb-3">
                    {tpl.transaction_type === 'invoice' ? 'Buyer' : 'Vendor'}: {tpl.template_data.customer_vendor_name}
                  </p>
                )}

                <div className="flex gap-2 mt-auto pt-3 border-t border-lvf-border">
                  <button
                    onClick={() => handleUse(tpl.id, tpl.name)}
                    disabled={usingId === tpl.id}
                    className="glass-button-primary flex-1 flex items-center justify-center gap-2 text-sm">
                    <Play size={13} />
                    {usingId === tpl.id ? 'Creating...' : 'Use'}
                  </button>
                  <button onClick={() => handleDelete(tpl.id)}
                    className="glass-button-secondary text-sm px-3" title="Delete template">
                    <Trash2 size={13} className="text-lvf-danger" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // -- CREATE VIEW --
  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      <button onClick={() => setView('list')}
        className="glass-button-secondary flex items-center gap-2 text-sm mb-4">
        <ChevronLeft size={14} /> Back to Templates
      </button>

      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold mb-1">New Memorized Transaction</h3>
        <p className="text-xs text-lvf-muted mb-4">
          Tip: The main way to memorize a transaction is from the "Memorize" button on invoice, bill, or check pages. This form is for creating templates manually.
        </p>

        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Template Name</label>
              <input className="glass-input w-full" required value={form.name}
                placeholder="e.g. Weekly Egg Invoice - Valley Foods"
                onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Transaction Type</label>
              <select className="glass-input w-full" value={form.transaction_type}
                onChange={e => setForm({ ...form, transaction_type: e.target.value })}>
                {TRANSACTION_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Notes</label>
            <textarea className="glass-input w-full" rows={2} value={form.notes}
              placeholder="Description of what this template does"
              onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>

          {/* Template Data */}
          <div className="border-t border-lvf-border pt-4">
            <div className="flex items-center justify-between mb-3">
              <label style={{ ...labelStyle, marginBottom: 0 }}>Template Data</label>
              <label className="flex items-center gap-2 text-xs text-lvf-muted cursor-pointer">
                <input type="checkbox" checked={form.use_json}
                  onChange={e => setForm({ ...form, use_json: e.target.checked })} />
                Advanced (JSON)
              </label>
            </div>

            {form.use_json ? (
              <textarea className="glass-input w-full font-mono text-xs" rows={8}
                value={form.template_data}
                placeholder='{"description": "Weekly Egg Delivery", "amount": 1500.00, "buyer_name": "Farm Fresh Foods"}'
                onChange={e => setForm({ ...form, template_data: e.target.value })} />
            ) : (
              <div className="space-y-2">
                {form.template_pairs.map((pair, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input className="glass-input w-40" placeholder="Field name"
                      value={pair.key}
                      onChange={e => updatePair(idx, 'key', e.target.value)} />
                    <input className="glass-input flex-1" placeholder="Value"
                      value={pair.value}
                      onChange={e => updatePair(idx, 'value', e.target.value)} />
                    {form.template_pairs.length > 1 && (
                      <button type="button" onClick={() => removePair(idx)}
                        className="p-2 rounded-lg hover:bg-white/10">
                        <Trash2 size={13} className="text-lvf-danger" />
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={addPair}
                  className="text-xs text-lvf-accent hover:underline flex items-center gap-1">
                  <Plus size={12} /> Add Field
                </button>
              </div>
            )}
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-lvf-border">
            <button type="button" onClick={() => setView('list')} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">
              {submitting ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
