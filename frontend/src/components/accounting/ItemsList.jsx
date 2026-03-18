import { useState, useEffect } from 'react'
import { getItems, createItem, updateItem, deleteItem, getAccounts } from '../../api/accounting'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'

const ITEM_TYPES = ['Service', 'Inventory Part', 'Non-inventory Part', 'Other Charge']

const ACCOUNT_OPTIONS = [
  'Sales',
  'Sales - Eggs',
  'Sales - Poultry',
  'Sales - Feed',
  'Services Revenue',
  'Other Income',
  'Cost of Goods Sold',
  'Cost of Goods Sold - Eggs',
  'Cost of Goods Sold - Feed',
  'Feed Expense',
  'Supplies Expense',
  'Delivery Expense',
  'Utilities Expense',
]

const emptyItem = () => ({
  id: null,
  name: '',
  description: '',
  item_type: 'Service',
  income_account: '',
  expense_account: '',
  price: '',
  cost: '',
})

export default function ItemsList() {
  const [items, setItems] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [form, setForm] = useState(emptyItem())
  const [loading, setLoading] = useState(true)
  const { toast, showToast, hideToast } = useToast()

  const loadItems = async () => {
    try {
      const res = await getItems()
      setItems(res.data || [])
    } catch {
      // keep existing items on error
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadItems() }, [])

  const updateField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const openNew = () => {
    setEditingItem(null)
    setForm(emptyItem())
    setShowModal(true)
  }

  const openEdit = (item) => {
    setEditingItem(item.id)
    setForm({
      id: item.id,
      name: item.name,
      description: item.description,
      item_type: item.item_type,
      income_account: item.income_account,
      expense_account: item.expense_account,
      price: item.price || '',
      cost: item.cost || '',
    })
    setShowModal(true)
  }

  const handleDelete = async (id) => {
    try {
      await deleteItem(id)
      showToast('Item deleted')
      loadItems()
    } catch {
      showToast('Error deleting item', 'error')
    }
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      showToast('Item name is required', 'error')
      return
    }
    if (!form.item_type) {
      showToast('Select an item type', 'error')
      return
    }

    const payload = {
      name: form.name,
      description: form.description,
      item_type: form.item_type,
      income_account: form.income_account,
      expense_account: form.expense_account,
      price: parseFloat(form.price) || 0,
      cost: parseFloat(form.cost) || 0,
    }

    try {
      if (editingItem) {
        await updateItem(editingItem, payload)
        showToast('Item updated')
      } else {
        await createItem(payload)
        showToast('Item created')
      }
      loadItems()
    } catch {
      showToast('Error saving item', 'error')
    }

    setShowModal(false)
    setForm(emptyItem())
    setEditingItem(null)
  }

  const handleCancel = () => {
    setShowModal(false)
    setForm(emptyItem())
    setEditingItem(null)
  }

  const formatCurrency = (val) => {
    const num = parseFloat(val)
    if (isNaN(num) || num === 0) return '-'
    return '$' + num.toFixed(2)
  }

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      {/* Header */}
      <div
        className="bg-lvf-dark/30 border-b border-lvf-border"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 16px',
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#336699', margin: 0 }}>
          Item List
        </h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="glass-button-primary text-sm" onClick={openNew}>
            New Item
          </button>
        </div>
      </div>

      {/* Items Table */}
      <div style={{ padding: '0 12px' }}>
        <table className="glass-table w-full">
          <thead>
            <tr>
              <th style={{ width: '22%' }}>Name</th>
              <th style={{ width: '25%' }}>Description</th>
              <th style={{ width: '14%' }}>Type</th>
              <th style={{ width: '14%' }}>Account</th>
              <th style={{ width: '9%', textAlign: 'right' }}>Price</th>
              <th style={{ width: '9%', textAlign: 'right' }}>Cost</th>
              <th style={{ width: '7%', textAlign: 'center' }}></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    textAlign: 'center',
                    padding: '24px 0',
                    color: '#999',
                    fontSize: 13,
                  }}
                >
                  No items. Click "New Item" to add one.
                </td>
              </tr>
            ) : (
              items.map(item => (
                <tr key={item.id}>
                  <td style={{ fontWeight: 600 }}>{item.name}</td>
                  <td>{item.description}</td>
                  <td>{item.item_type}</td>
                  <td style={{ fontSize: 11 }}>{item.income_account}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                    {formatCurrency(item.price)}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                    {formatCurrency(item.cost)}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      onClick={() => openEdit(item)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#336699',
                        cursor: 'pointer',
                        fontSize: 11,
                        textDecoration: 'underline',
                        marginRight: 6,
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        fontSize: 11,
                        textDecoration: 'underline',
                      }}
                    >
                      Del
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Footer count */}
        <div
          style={{
            fontSize: 11,
            color: '#999',
            padding: '6px 0',
            borderTop: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          {items.length} item{items.length !== 1 ? 's' : ''} listed
        </div>
      </div>

      {/* ── Modal ── */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/50 z-[1000] flex items-center justify-center backdrop-blur-sm"
          onClick={handleCancel}
        >
          <div
            className="glass-card rounded-xl min-w-[320px] max-w-[480px] overflow-hidden"
            style={{
              width: 520,
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal title bar */}
            <div
              className="px-4 py-2 border-b border-lvf-border font-semibold text-sm text-lvf-accent"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>{editingItem ? 'Edit Item' : 'New Item'}</span>
              <button
                onClick={handleCancel}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'white',
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
              >
                &times;
              </button>
            </div>

            {/* Modal body */}
            <div className="glass-card p-4 m-2" style={{ padding: 16 }}>
              {/* Type */}
              <div style={{ marginBottom: 10 }}>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#666',
                    display: 'block',
                    marginBottom: 2,
                  }}
                >
                  Type
                </label>
                <select
                  className="glass-input text-sm"
                  value={form.item_type}
                  onChange={e => updateField('item_type', e.target.value)}
                >
                  {ITEM_TYPES.map(t => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* Name */}
              <div style={{ marginBottom: 10 }}>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#666',
                    display: 'block',
                    marginBottom: 2,
                  }}
                >
                  Item Name / Number
                </label>
                <input
                  className="glass-input text-sm"
                  value={form.name}
                  onChange={e => updateField('name', e.target.value)}
                  placeholder="Enter item name..."
                />
              </div>

              {/* Description */}
              <div style={{ marginBottom: 10 }}>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#666',
                    display: 'block',
                    marginBottom: 2,
                  }}
                >
                  Description
                </label>
                <textarea
                  className="glass-input text-sm"
                  rows={2}
                  value={form.description}
                  onChange={e => updateField('description', e.target.value)}
                  placeholder="Description of the item or service..."
                  style={{ resize: 'vertical' }}
                />
              </div>

              {/* Rate/Price and Cost */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                  marginBottom: 10,
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
                    Rate / Price
                  </label>
                  <input
                    className="glass-input text-sm"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.price}
                    onChange={e => updateField('price', e.target.value)}
                    placeholder="0.00"
                    style={{ textAlign: 'right' }}
                  />
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
                    Cost
                  </label>
                  <input
                    className="glass-input text-sm"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.cost}
                    onChange={e => updateField('cost', e.target.value)}
                    placeholder="0.00"
                    style={{ textAlign: 'right' }}
                  />
                </div>
              </div>

              {/* Income Account */}
              <div style={{ marginBottom: 10 }}>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#666',
                    display: 'block',
                    marginBottom: 2,
                  }}
                >
                  Income Account
                </label>
                <select
                  className="glass-input text-sm"
                  value={form.income_account}
                  onChange={e => updateField('income_account', e.target.value)}
                >
                  <option value="">-- Select Account --</option>
                  {ACCOUNT_OPTIONS.filter(
                    a =>
                      a.startsWith('Sales') ||
                      a.includes('Revenue') ||
                      a.includes('Income'),
                  ).map(a => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>

              {/* Expense Account */}
              <div style={{ marginBottom: 10 }}>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#666',
                    display: 'block',
                    marginBottom: 2,
                  }}
                >
                  Expense Account (COGS)
                </label>
                <select
                  className="glass-input text-sm"
                  value={form.expense_account}
                  onChange={e => updateField('expense_account', e.target.value)}
                >
                  <option value="">-- Select Account --</option>
                  {ACCOUNT_OPTIONS.filter(
                    a => a.includes('Cost') || a.includes('Expense'),
                  ).map(a => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>

              {/* Modal buttons */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 8,
                  marginTop: 16,
                  borderTop: '1px solid rgba(255,255,255,0.1)',
                  paddingTop: 12,
                }}
              >
                <button className="glass-button-secondary text-sm" onClick={handleCancel}>
                  Cancel
                </button>
                <button className="glass-button-primary text-sm" onClick={handleSave}>
                  {editingItem ? 'Save Changes' : 'OK'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
