import { useState, useEffect, useMemo } from 'react'
import { getBuyers, getInvoices, createBuyer, updateBuyer, deleteBuyer } from '../../api/accounting'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'
import AddressAutocomplete from '../common/AddressAutocomplete'

const termsOptions = [
  'Due on Receipt',
  'Net 15',
  'Net 30',
  'Net 45',
  'Net 60',
  'Net 90',
]

const emptyCustomerForm = {
  name: '',
  company: '',
  bill_to_address: '',
  ship_to_address: '',
  phone: '',
  email: '',
  terms: 'Net 30',
  credit_limit: '',
}

export default function CustomerCenter({ onNavigate }) {
  const { toast, showToast, hideToast } = useToast()

  const [customers, setCustomers] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('transactions')

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState('new') // 'new' | 'edit'
  const [modalForm, setModalForm] = useState({ ...emptyCustomerForm })
  const [saving, setSaving] = useState(false)

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [buyerRes, invRes] = await Promise.all([
        getBuyers(),
        getInvoices(),
      ])
      setCustomers(buyerRes.data || [])
      setInvoices(invRes.data || [])
    } catch {
      try {
        const buyerRes = await getBuyers()
        setCustomers(buyerRes.data || [])
      } catch {
        showToast('Error loading customer data', 'error')
      }
    } finally {
      setLoading(false)
    }
  }

  // Build a balance map: customer id/name -> total outstanding
  const balanceMap = useMemo(() => {
    const map = {}
    for (const inv of invoices) {
      const key = inv.buyer_id || inv.buyer || inv.buyer_name || ''
      const nameKey = (inv.buyer || inv.buyer_name || '').toLowerCase()
      const due = inv.balance_due ?? (inv.amount - (inv.amount_paid || 0))
      if (inv.status !== 'paid' && inv.status !== 'void' && due > 0) {
        if (inv.buyer_id) {
          map[inv.buyer_id] = (map[inv.buyer_id] || 0) + due
        }
        if (nameKey) {
          map[nameKey] = (map[nameKey] || 0) + due
        }
      }
    }
    return map
  }, [invoices])

  const getCustomerBalance = (customer) => {
    const byId = balanceMap[customer.id] || 0
    const byName = balanceMap[(customer.name || '').toLowerCase()] || 0
    return Math.max(byId, byName)
  }

  // Filtered and sorted customer list
  const filteredCustomers = useMemo(() => {
    const term = search.toLowerCase().trim()
    let list = customers
    if (term) {
      list = customers.filter(c =>
        (c.name || '').toLowerCase().includes(term) ||
        (c.company || '').toLowerCase().includes(term) ||
        (c.contact_name || '').toLowerCase().includes(term)
      )
    }
    return [...list].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '')
    )
  }, [customers, search])

  // Selected customer object
  const selectedCustomer = useMemo(() => {
    if (!selectedId) return null
    return customers.find(c => c.id === selectedId) || null
  }, [customers, selectedId])

  // Invoices for selected customer
  const customerInvoices = useMemo(() => {
    if (!selectedCustomer) return []
    return invoices
      .filter(inv => {
        if (inv.buyer_id && inv.buyer_id === selectedCustomer.id) return true
        const invName = (inv.buyer || inv.buyer_name || '').toLowerCase()
        const custName = (selectedCustomer.name || '').toLowerCase()
        return invName === custName
      })
      .sort((a, b) => new Date(b.invoice_date || b.created_at) - new Date(a.invoice_date || a.created_at))
  }, [invoices, selectedCustomer])

  // Open modal for new customer
  const handleNewCustomer = () => {
    setModalMode('new')
    setModalForm({ ...emptyCustomerForm })
    setModalOpen(true)
  }

  // Open modal for editing
  const handleEditCustomer = () => {
    if (!selectedCustomer) return
    setModalMode('edit')
    setModalForm({
      name: selectedCustomer.name || '',
      company: selectedCustomer.company || selectedCustomer.contact_name || '',
      bill_to_address: selectedCustomer.bill_to_address || selectedCustomer.address || '',
      ship_to_address: selectedCustomer.ship_to_address || '',
      phone: selectedCustomer.phone || '',
      email: selectedCustomer.email || '',
      terms: selectedCustomer.terms || 'Net 30',
      credit_limit: selectedCustomer.credit_limit != null ? String(selectedCustomer.credit_limit) : '',
    })
    setModalOpen(true)
  }

  // Save customer (create or update)
  const handleSaveCustomer = async () => {
    if (!modalForm.name.trim()) {
      showToast('Customer name is required', 'error')
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: modalForm.name.trim(),
        contact_name: modalForm.company.trim() || undefined,
        company: modalForm.company.trim() || undefined,
        bill_to_address: modalForm.bill_to_address.trim() || undefined,
        address: modalForm.bill_to_address.trim() || undefined,
        ship_to_address: modalForm.ship_to_address.trim() || undefined,
        phone: modalForm.phone.trim() || undefined,
        email: modalForm.email.trim() || undefined,
        terms: modalForm.terms || undefined,
        credit_limit: modalForm.credit_limit ? parseFloat(modalForm.credit_limit) : undefined,
      }

      if (modalMode === 'edit' && selectedCustomer) {
        await updateBuyer(selectedCustomer.id, payload)
        showToast('Customer updated successfully')
      } else {
        const res = await createBuyer(payload)
        showToast('Customer created successfully')
        if (res.data?.id) {
          setSelectedId(res.data.id)
        }
      }

      setModalOpen(false)
      await loadData()
    } catch (err) {
      const detail = err.response?.data?.detail || (modalMode === 'edit' ? 'Error updating customer' : 'Error creating customer')
      showToast(detail, 'error')
    } finally {
      setSaving(false)
    }
  }

  // Delete customer
  const handleDeleteCustomer = async () => {
    if (!selectedCustomer) return
    setDeleting(true)
    try {
      await deleteBuyer(selectedCustomer.id)
      showToast('Customer deleted')
      setSelectedId(null)
      setDeleteConfirm(false)
      await loadData()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error deleting customer', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const formatCurrency = (val) => {
    const num = parseFloat(val) || 0
    return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    return dateStr.split('T')[0]
  }

  const getStatusStyle = (status) => {
    switch (status) {
      case 'paid':
        return { color: '#2e7d32', fontWeight: 600 }
      case 'sent':
      case 'draft':
        return { color: '#1565c0', fontWeight: 600 }
      case 'partial':
        return { color: '#e65100', fontWeight: 600 }
      case 'overdue':
        return { color: '#c62828', fontWeight: 600 }
      case 'void':
        return { color: '#999', fontWeight: 600 }
      default:
        return { fontWeight: 600 }
    }
  }

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#336699' }}>Customer Center</h3>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#999', fontSize: 13 }}>
          Loading customers...
        </div>
      ) : (
        <div className="flex h-[calc(100vh-140px)] glass-card m-2 overflow-hidden rounded-xl">
          {/* ── Left Panel: Customer List ── */}
          <div className="w-72 border-r border-lvf-border flex flex-col bg-lvf-dark/40">
            {/* New Customer Button + Search */}
            <div style={{ padding: '6px 4px', borderBottom: '1px solid #c0c0c0' }}>
              <button
                type="button"
                className="glass-button-primary text-sm"
                onClick={handleNewCustomer}
                style={{ width: '100%', marginBottom: 4, fontSize: '8pt' }}
              >
                New Customer
              </button>
            </div>

            <div className="search-box">
              <input
                className="glass-input text-sm"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search customers..."
              />
            </div>

            {/* Customer list */}
            <div className="entity-list">
              {filteredCustomers.length === 0 ? (
                <div style={{ padding: '16px 8px', textAlign: 'center', color: '#999', fontSize: '8pt' }}>
                  {search ? 'No customers match your search' : 'No customers found'}
                </div>
              ) : (
                filteredCustomers.map(c => {
                  const balance = getCustomerBalance(c)
                  return (
                    <div
                      key={c.id}
                      className={`entity-item${selectedId === c.id ? ' selected' : ''}`}
                      onClick={() => {
                        setSelectedId(c.id)
                        setActiveTab('transactions')
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {c.name || '(unnamed)'}
                      </span>
                      {balance > 0 && (
                        <span style={{ marginLeft: 8, fontFamily: 'monospace', fontSize: '8pt', whiteSpace: 'nowrap' }}>
                          {formatCurrency(balance)}
                        </span>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            {/* Count footer */}
            <div style={{
              padding: '3px 8px',
              borderTop: '1px solid #c0c0c0',
              fontSize: '7pt',
              color: '#666',
              background: '#e8e4d8',
            }}>
              {filteredCustomers.length} customer{filteredCustomers.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* ── Right Panel: Customer Detail ── */}
          <div className="flex-1 flex flex-col">
            {!selectedCustomer ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 13 }}>
                Select a customer from the list
              </div>
            ) : (
              <>
                {/* Header: Customer name + Edit/Delete buttons */}
                <div className="entity-header">
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#222' }}>
                    {selectedCustomer.name}
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      type="button"
                      className="glass-button-secondary text-sm"
                      onClick={handleEditCustomer}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="glass-button-secondary text-sm"
                      onClick={() => setDeleteConfirm(true)}
                      style={{ color: '#c62828' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 px-2 mb-0" style={{ paddingLeft: 8 }}>
                  <button
                    className={activeTab === 'transactions' ? 'bg-lvf-dark/60 text-lvf-accent font-semibold px-3 py-1.5 text-sm rounded-t-lg border border-lvf-border border-b-0' : 'px-3 py-1.5 text-sm text-lvf-muted hover:text-lvf-text cursor-pointer'}
                    onClick={() => setActiveTab('transactions')}
                  >
                    Transactions
                  </button>
                  <button
                    className={activeTab === 'information' ? 'bg-lvf-dark/60 text-lvf-accent font-semibold px-3 py-1.5 text-sm rounded-t-lg border border-lvf-border border-b-0' : 'px-3 py-1.5 text-sm text-lvf-muted hover:text-lvf-text cursor-pointer'}
                    onClick={() => setActiveTab('information')}
                  >
                    Information
                  </button>
                </div>

                {/* Tab content */}
                <div className="entity-detail" style={{ borderTop: '1px solid #c0c0c0' }}>
                  {activeTab === 'transactions' && (
                    <div>
                      {customerInvoices.length === 0 ? (
                        <div style={{ padding: '24px 0', textAlign: 'center', color: '#999', fontSize: '8pt' }}>
                          No transactions found for this customer
                        </div>
                      ) : (
                        <table className="glass-table w-full">
                          <thead>
                            <tr>
                              <th>Type</th>
                              <th>Date</th>
                              <th>Number</th>
                              <th>Status</th>
                              <th style={{ textAlign: 'right' }}>Amount</th>
                              <th style={{ textAlign: 'right' }}>Balance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {customerInvoices.map(inv => {
                              const balanceDue = inv.balance_due ?? (inv.amount - (inv.amount_paid || 0))
                              return (
                                <tr key={inv.id}>
                                  <td>Invoice</td>
                                  <td>{formatDate(inv.invoice_date || inv.created_at)}</td>
                                  <td style={{ fontWeight: 600 }}>{inv.invoice_number || inv.id?.slice(0, 8)}</td>
                                  <td>
                                    <span style={getStatusStyle(inv.status)}>
                                      {(inv.status || 'draft').charAt(0).toUpperCase() + (inv.status || 'draft').slice(1)}
                                    </span>
                                  </td>
                                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                                    {formatCurrency(inv.amount)}
                                  </td>
                                  <td style={{
                                    textAlign: 'right',
                                    fontFamily: 'monospace',
                                    fontWeight: balanceDue > 0 ? 700 : 400,
                                    color: balanceDue > 0 ? '#c62828' : '#2e7d32',
                                  }}>
                                    {formatCurrency(balanceDue)}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                          <tfoot>
                            <tr>
                              <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700, background: '#f0f4f8' }}>
                                Totals:
                              </td>
                              <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, background: '#f0f4f8' }}>
                                {formatCurrency(customerInvoices.reduce((s, inv) => s + (inv.amount || 0), 0))}
                              </td>
                              <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, background: '#f0f4f8', color: '#c62828' }}>
                                {formatCurrency(customerInvoices.reduce((s, inv) => {
                                  const due = inv.balance_due ?? (inv.amount - (inv.amount_paid || 0))
                                  return s + (due > 0 ? due : 0)
                                }, 0))}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      )}
                    </div>
                  )}

                  {activeTab === 'information' && (
                    <div style={{ maxWidth: 600 }}>
                      <table style={{ width: '100%', fontSize: '8pt', borderCollapse: 'collapse' }}>
                        <tbody>
                          <tr>
                            <td style={{ padding: '5px 10px 5px 0', fontWeight: 600, color: '#555', width: 140, verticalAlign: 'top' }}>
                              Name
                            </td>
                            <td style={{ padding: '5px 0' }}>
                              {selectedCustomer.name || '-'}
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: '5px 10px 5px 0', fontWeight: 600, color: '#555', verticalAlign: 'top' }}>
                              Company / Contact
                            </td>
                            <td style={{ padding: '5px 0' }}>
                              {selectedCustomer.company || selectedCustomer.contact_name || '-'}
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: '5px 10px 5px 0', fontWeight: 600, color: '#555', verticalAlign: 'top' }}>
                              Bill To Address
                            </td>
                            <td style={{ padding: '5px 0', whiteSpace: 'pre-line' }}>
                              {selectedCustomer.bill_to_address || selectedCustomer.address || '-'}
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: '5px 10px 5px 0', fontWeight: 600, color: '#555', verticalAlign: 'top' }}>
                              Ship To Address
                            </td>
                            <td style={{ padding: '5px 0', whiteSpace: 'pre-line' }}>
                              {selectedCustomer.ship_to_address || '-'}
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: '5px 10px 5px 0', fontWeight: 600, color: '#555', verticalAlign: 'top' }}>
                              Phone
                            </td>
                            <td style={{ padding: '5px 0' }}>
                              {selectedCustomer.phone || '-'}
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: '5px 10px 5px 0', fontWeight: 600, color: '#555', verticalAlign: 'top' }}>
                              Email
                            </td>
                            <td style={{ padding: '5px 0' }}>
                              {selectedCustomer.email ? (
                                <a
                                  href={`mailto:${selectedCustomer.email}`}
                                  style={{ color: '#0066cc', textDecoration: 'underline' }}
                                >
                                  {selectedCustomer.email}
                                </a>
                              ) : '-'}
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: '5px 10px 5px 0', fontWeight: 600, color: '#555', verticalAlign: 'top' }}>
                              Terms
                            </td>
                            <td style={{ padding: '5px 0' }}>
                              {selectedCustomer.terms || '-'}
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: '5px 10px 5px 0', fontWeight: 600, color: '#555', verticalAlign: 'top' }}>
                              Credit Limit
                            </td>
                            <td style={{ padding: '5px 0' }}>
                              {selectedCustomer.credit_limit != null
                                ? formatCurrency(selectedCustomer.credit_limit)
                                : '-'}
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: '5px 10px 5px 0', fontWeight: 600, color: '#555', verticalAlign: 'top' }}>
                              Balance
                            </td>
                            <td style={{ padding: '5px 0', fontWeight: 700, color: getCustomerBalance(selectedCustomer) > 0 ? '#c62828' : '#2e7d32' }}>
                              {formatCurrency(getCustomerBalance(selectedCustomer))}
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: '5px 10px 5px 0', fontWeight: 600, color: '#555', verticalAlign: 'top' }}>
                              Status
                            </td>
                            <td style={{ padding: '5px 0' }}>
                              {selectedCustomer.is_active === false
                                ? <span style={{ color: '#c62828' }}>Inactive</span>
                                : <span style={{ color: '#2e7d32' }}>Active</span>}
                            </td>
                          </tr>
                          {selectedCustomer.notes && (
                            <tr>
                              <td style={{ padding: '5px 10px 5px 0', fontWeight: 600, color: '#555', verticalAlign: 'top' }}>
                                Notes
                              </td>
                              <td style={{ padding: '5px 0', whiteSpace: 'pre-line' }}>
                                {selectedCustomer.notes}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── New / Edit Customer Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-[1000] flex items-center justify-center backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <div className="glass-card rounded-xl min-w-[320px] max-w-[480px] overflow-hidden" style={{ minWidth: 480, maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="px-4 py-2 border-b border-lvf-border font-semibold text-sm text-lvf-accent">
              {modalMode === 'edit' ? 'Edit Customer' : 'New Customer'}
            </div>
            <div className="p-4 text-sm" style={{ padding: '12px 16px' }}>
              <div className="glass-card p-4 m-2" style={{ margin: 0, border: 'none', background: 'transparent', padding: 0 }}>
                {/* Name */}
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 2 }}>
                    Name *
                  </label>
                  <input
                    className="glass-input text-sm"
                    value={modalForm.name}
                    onChange={e => setModalForm({ ...modalForm, name: e.target.value })}
                    placeholder="Customer name..."
                    autoFocus
                  />
                </div>

                {/* Company */}
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 2 }}>
                    Company
                  </label>
                  <input
                    className="glass-input text-sm"
                    value={modalForm.company}
                    onChange={e => setModalForm({ ...modalForm, company: e.target.value })}
                    placeholder="Company / Contact name..."
                  />
                </div>

                {/* Bill To / Ship To */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 2 }}>
                      Bill To Address
                    </label>
                    <AddressAutocomplete
                      className="glass-input text-sm"
                      value={modalForm.bill_to_address}
                      onChange={val => setModalForm({ ...modalForm, bill_to_address: val })}
                      placeholder="Billing address..."
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 2 }}>
                      Ship To Address
                    </label>
                    <AddressAutocomplete
                      className="glass-input text-sm"
                      value={modalForm.ship_to_address}
                      onChange={val => setModalForm({ ...modalForm, ship_to_address: val })}
                      placeholder="Shipping address..."
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                {/* Phone / Email */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 2 }}>
                      Phone
                    </label>
                    <input
                      className="glass-input text-sm"
                      value={modalForm.phone}
                      onChange={e => setModalForm({ ...modalForm, phone: e.target.value })}
                      placeholder="(555) 555-1234"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 2 }}>
                      Email
                    </label>
                    <input
                      className="glass-input text-sm"
                      type="email"
                      value={modalForm.email}
                      onChange={e => setModalForm({ ...modalForm, email: e.target.value })}
                      placeholder="email@example.com"
                    />
                  </div>
                </div>

                {/* Terms / Credit Limit */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 2 }}>
                      Terms
                    </label>
                    <select
                      className="glass-input text-sm"
                      value={modalForm.terms}
                      onChange={e => setModalForm({ ...modalForm, terms: e.target.value })}
                    >
                      {termsOptions.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#666', display: 'block', marginBottom: 2 }}>
                      Credit Limit
                    </label>
                    <input
                      className="glass-input text-sm"
                      type="number"
                      step="0.01"
                      min="0"
                      value={modalForm.credit_limit}
                      onChange={e => setModalForm({ ...modalForm, credit_limit: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="px-4 py-3 flex justify-end gap-2 border-t border-lvf-border/30">
              <button
                type="button"
                className="glass-button-secondary text-sm"
                onClick={() => setModalOpen(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="glass-button-primary text-sm"
                onClick={handleSaveCustomer}
                disabled={saving}
              >
                {saving ? 'Saving...' : (modalMode === 'edit' ? 'Save Changes' : 'Save Customer')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Dialog ── */}
      {deleteConfirm && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 z-[1000] flex items-center justify-center backdrop-blur-sm" onClick={() => setDeleteConfirm(false)}>
          <div className="glass-card rounded-xl min-w-[320px] max-w-[480px] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-2 border-b border-lvf-border font-semibold text-sm text-lvf-accent">Confirm Delete</div>
            <div className="p-4 text-sm">
              <p style={{ marginBottom: 8 }}>
                Are you sure you want to delete customer <strong>{selectedCustomer.name}</strong>?
              </p>
              {customerInvoices.length > 0 && (
                <p style={{ color: '#c62828', fontSize: '8pt' }}>
                  This customer has {customerInvoices.length} invoice{customerInvoices.length !== 1 ? 's' : ''} on record.
                  Deleting may affect those records.
                </p>
              )}
            </div>
            <div className="px-4 py-3 flex justify-end gap-2 border-t border-lvf-border/30">
              <button
                type="button"
                className="glass-button-secondary text-sm"
                onClick={() => setDeleteConfirm(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="glass-button-primary text-sm"
                onClick={handleDeleteCustomer}
                disabled={deleting}
                style={{ background: 'linear-gradient(180deg, #ef5350 0%, #c62828 100%)' }}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
