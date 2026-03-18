import { useState, useEffect } from 'react'
import { getVendors, getBills, createVendor, updateVendor, deleteVendor } from '../../api/accounting'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'
import AddressAutocomplete from '../common/AddressAutocomplete'

const TERMS_OPTIONS = ['Net 15', 'Net 30', 'Net 45', 'Net 60', 'Due on Receipt']

const emptyVendorForm = () => ({
  name: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  phone: '',
  fax: '',
  email: '',
  website: '',
  terms: 'Net 30',
  tax_id: '',
  is_1099: false,
})

export default function VendorCenter({ onNavigate }) {
  const [vendors, setVendors] = useState([])
  const [bills, setBills] = useState([])
  const [selectedVendorId, setSelectedVendorId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState('transactions')
  const [showModal, setShowModal] = useState(false)
  const [editingVendor, setEditingVendor] = useState(null)
  const [vendorForm, setVendorForm] = useState(emptyVendorForm())
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const { toast, showToast, hideToast } = useToast()

  const loadData = async () => {
    setLoading(true)
    try {
      const [vendorRes, billRes] = await Promise.all([
        getVendors(),
        getBills(),
      ])
      const vendorData = vendorRes.data || []
      setVendors(vendorData)
      setBills(billRes.data || [])
      if (vendorData.length > 0 && !selectedVendorId) {
        setSelectedVendorId(vendorData[0].id)
      }
    } catch {
      showToast('Error loading vendor data', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  // Derive selected vendor
  const selectedVendor = vendors.find(v => v.id === selectedVendorId) || null

  // Filter and sort vendors alphabetically
  const filteredVendors = vendors
    .filter(v => {
      const name = (v.name || v.vendor_name || '').toLowerCase()
      return name.includes(searchTerm.toLowerCase())
    })
    .sort((a, b) => {
      const nameA = (a.name || a.vendor_name || '').toLowerCase()
      const nameB = (b.name || b.vendor_name || '').toLowerCase()
      return nameA.localeCompare(nameB)
    })

  // Compute balance per vendor from bills
  const vendorBalances = {}
  bills.forEach(bill => {
    const vendorName = bill.vendor_name || ''
    const balance = parseFloat(bill.balance_due) || 0
    if (balance > 0) {
      vendorBalances[vendorName] = (vendorBalances[vendorName] || 0) + balance
    }
  })

  const getVendorBalance = (vendor) => {
    const name = vendor.name || vendor.vendor_name || ''
    return vendorBalances[name] || 0
  }

  // Bills for the selected vendor
  const selectedVendorName = selectedVendor
    ? (selectedVendor.name || selectedVendor.vendor_name || '')
    : ''

  const vendorBills = bills.filter(b => {
    const billVendor = (b.vendor_name || '').toLowerCase()
    return billVendor === selectedVendorName.toLowerCase()
  })

  // Open New Vendor modal
  const handleNewVendor = () => {
    setEditingVendor(null)
    setVendorForm(emptyVendorForm())
    setShowModal(true)
  }

  // Open Edit Vendor modal
  const handleEditVendor = () => {
    if (!selectedVendor) return
    setEditingVendor(selectedVendor)
    setVendorForm({
      name: selectedVendor.name || selectedVendor.vendor_name || '',
      address: selectedVendor.address || '',
      city: selectedVendor.city || '',
      state: selectedVendor.state || '',
      zip: selectedVendor.zip || '',
      phone: selectedVendor.phone || '',
      fax: selectedVendor.fax || '',
      email: selectedVendor.email || '',
      website: selectedVendor.website || '',
      terms: selectedVendor.terms || 'Net 30',
      tax_id: selectedVendor.tax_id || '',
      is_1099: selectedVendor.is_1099 || false,
    })
    setShowModal(true)
  }

  // Delete vendor
  const handleDeleteVendor = async () => {
    if (!selectedVendor) return
    const vendorName = selectedVendor.name || selectedVendor.vendor_name || 'this vendor'
    if (!window.confirm(`Delete vendor "${vendorName}"? This cannot be undone.`)) return
    try {
      await deleteVendor(selectedVendor.id)
      showToast(`Vendor "${vendorName}" deleted`)
      setSelectedVendorId(null)
      loadData()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error deleting vendor', 'error')
    }
  }

  // Save vendor (create or update)
  const handleSaveVendor = async () => {
    if (submitting) return
    if (!vendorForm.name.trim()) {
      showToast('Vendor name is required', 'error')
      return
    }
    setSubmitting(true)
    try {
      if (editingVendor) {
        await updateVendor(editingVendor.id, vendorForm)
        showToast(`Vendor "${vendorForm.name}" updated`)
      } else {
        await createVendor(vendorForm)
        showToast(`Vendor "${vendorForm.name}" created`)
      }
      setShowModal(false)
      setEditingVendor(null)
      setVendorForm(emptyVendorForm())
      loadData()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error saving vendor', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const updateFormField = (field, value) => {
    setVendorForm(prev => ({ ...prev, [field]: value }))
  }

  // Format currency
  const fmt = (val) => {
    const n = parseFloat(val) || 0
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      <div className="flex h-[calc(100vh-140px)] glass-card m-2 overflow-hidden rounded-xl">
        {/* ── Left Panel: Vendor List ── */}
        <div className="w-72 border-r border-lvf-border flex flex-col bg-lvf-dark/40">
          {/* Top bar with New Vendor button */}
          <div style={{
            padding: '4px 6px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 4,
          }}>
            <span style={{ fontSize: '8pt', fontWeight: 700, color: '#e0e0e0' }}>
              Vendors
            </span>
            <button className="glass-button-secondary text-sm" onClick={handleNewVendor} style={{ fontSize: '7pt', padding: '2px 8px' }}>
              New Vendor
            </button>
          </div>

          {/* Search box */}
          <div className="search-box">
            <input
              className="glass-input text-sm"
              placeholder="Search vendors..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          {/* Vendor list */}
          <div className="entity-list">
            {loading && (
              <div style={{ padding: 12, textAlign: 'center', fontSize: '8pt', color: '#999' }}>
                Loading...
              </div>
            )}
            {!loading && filteredVendors.length === 0 && (
              <div style={{ padding: 12, textAlign: 'center', fontSize: '8pt', color: '#999' }}>
                {searchTerm ? 'No vendors match search' : 'No vendors found'}
              </div>
            )}
            {filteredVendors.map(vendor => {
              const name = vendor.name || vendor.vendor_name || '(unnamed)'
              const balance = getVendorBalance(vendor)
              const isSelected = vendor.id === selectedVendorId
              return (
                <div
                  key={vendor.id}
                  className={`entity-item${isSelected ? ' selected' : ''}`}
                  onClick={() => {
                    setSelectedVendorId(vendor.id)
                    setActiveTab('transactions')
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: isSelected ? 600 : 400 }}>{name}</span>
                    {balance > 0 && (
                      <span style={{ fontFamily: 'monospace', fontSize: '7pt' }}>
                        ${fmt(balance)}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Right Panel: Vendor Detail ── */}
        <div className="flex-1 flex flex-col">
          {selectedVendor ? (
            <>
              {/* Header with vendor name and action buttons */}
              <div className="entity-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: '10pt' }}>
                    {selectedVendorName}
                  </span>
                  {getVendorBalance(selectedVendor) > 0 && (
                    <span style={{ fontSize: '8pt', color: '#999', fontFamily: 'monospace' }}>
                      Balance: ${fmt(getVendorBalance(selectedVendor))}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="glass-button-secondary text-sm" onClick={handleEditVendor} style={{ fontSize: '7pt', padding: '2px 8px' }}>
                    Edit
                  </button>
                  <button className="glass-button-secondary text-sm" onClick={handleDeleteVendor} style={{ fontSize: '7pt', padding: '2px 8px' }}>
                    Delete
                  </button>
                </div>
              </div>

              {/* Sub-tabs: Transactions | Information */}
              <div style={{ padding: '0 8px' }}>
                <div className="flex gap-1 px-2 mb-0">
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
              </div>

              {/* Tab content */}
              <div className="entity-detail">
                {activeTab === 'transactions' && (
                  <div>
                    {vendorBills.length === 0 ? (
                      <div style={{ padding: 24, textAlign: 'center', color: '#999', fontSize: '8pt' }}>
                        No transactions found for this vendor.
                      </div>
                    ) : (
                      <table className="glass-table w-full">
                        <thead>
                          <tr>
                            <th>Type</th>
                            <th>Date</th>
                            <th>Ref No.</th>
                            <th>Due Date</th>
                            <th style={{ textAlign: 'right' }}>Amount</th>
                            <th style={{ textAlign: 'right' }}>Balance</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {vendorBills
                            .sort((a, b) => (b.bill_date || '').localeCompare(a.bill_date || ''))
                            .map(bill => {
                              const balanceDue = parseFloat(bill.balance_due) || 0
                              const isPaid = balanceDue <= 0
                              return (
                                <tr key={bill.id}>
                                  <td>Bill</td>
                                  <td>{bill.bill_date || ''}</td>
                                  <td>{bill.ref_no || bill.bill_number || ''}</td>
                                  <td>{bill.due_date || ''}</td>
                                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                                    ${fmt(bill.amount)}
                                  </td>
                                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                                    ${fmt(bill.balance_due)}
                                  </td>
                                  <td>
                                    <span style={{
                                      fontSize: '7pt',
                                      padding: '1px 6px',
                                      background: isPaid ? '#d4edda' : '#fff3cd',
                                      color: isPaid ? '#155724' : '#856404',
                                      border: `1px solid ${isPaid ? '#c3e6cb' : '#ffeeba'}`,
                                    }}>
                                      {isPaid ? 'Paid' : 'Open'}
                                    </span>
                                  </td>
                                </tr>
                              )
                            })}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan={4} style={{ border: 'none', fontWeight: 700, fontSize: '8pt', textAlign: 'right', paddingTop: 6 }}>
                              Totals:
                            </td>
                            <td style={{ border: 'none', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', paddingTop: 6 }}>
                              ${fmt(vendorBills.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0))}
                            </td>
                            <td style={{ border: 'none', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', paddingTop: 6 }}>
                              ${fmt(vendorBills.reduce((s, b) => s + (parseFloat(b.balance_due) || 0), 0))}
                            </td>
                            <td style={{ border: 'none' }}></td>
                          </tr>
                        </tfoot>
                      </table>
                    )}

                    {/* Quick action links */}
                    <div style={{
                      marginTop: 12,
                      paddingTop: 8,
                      borderTop: '1px solid rgba(255,255,255,0.1)',
                      display: 'flex',
                      gap: 12,
                    }}>
                      <span
                        onClick={() => onNavigate && onNavigate('enter-bills')}
                        style={{ fontSize: '8pt', color: '#0066cc', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        Enter Bills
                      </span>
                      <span
                        onClick={() => onNavigate && onNavigate('pay-bills')}
                        style={{ fontSize: '8pt', color: '#0066cc', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        Pay Bills
                      </span>
                      <span
                        onClick={() => onNavigate && onNavigate('write-checks')}
                        style={{ fontSize: '8pt', color: '#0066cc', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        Write Checks
                      </span>
                    </div>
                  </div>
                )}

                {activeTab === 'information' && (
                  <div style={{ padding: '4px 0' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8pt' }}>
                      <tbody>
                        <InfoRow label="Company Name" value={selectedVendor.name || selectedVendor.vendor_name} />
                        <InfoRow label="Address" value={selectedVendor.address} />
                        <InfoRow
                          label="City / State / Zip"
                          value={[selectedVendor.city, selectedVendor.state, selectedVendor.zip].filter(Boolean).join(', ') || ''}
                        />
                        <InfoRow label="Phone" value={selectedVendor.phone} />
                        <InfoRow label="Fax" value={selectedVendor.fax} />
                        <InfoRow label="Email" value={selectedVendor.email} />
                        <InfoRow label="Website" value={selectedVendor.website} />
                        <InfoRow label="Terms" value={selectedVendor.terms} />
                        <InfoRow label="Tax ID" value={selectedVendor.tax_id} />
                        <InfoRow label="1099 Eligible" value={selectedVendor.is_1099 ? 'Yes' : 'No'} />
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#999',
              fontSize: '9pt',
            }}>
              {loading ? 'Loading...' : 'Select a vendor from the list or click "New Vendor" to get started.'}
            </div>
          )}
        </div>
      </div>

      {/* ── Vendor Modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-[1000] flex items-center justify-center backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div
            className="glass-card rounded-xl min-w-[320px] max-w-[480px] overflow-hidden"
            style={{ minWidth: 460, maxWidth: 540 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 py-2 border-b border-lvf-border font-semibold text-sm text-lvf-accent">
              {editingVendor ? 'Edit Vendor' : 'New Vendor'}
            </div>
            <div className="p-4 text-sm" style={{ padding: '12px' }}>
              <div className="glass-card p-4 m-2" style={{ border: 'none', padding: 0, margin: 0 }}>
                {/* Name */}
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: '7pt', color: '#999', display: 'block', marginBottom: 2 }}>
                    Vendor Name *
                  </label>
                  <input
                    className="glass-input text-sm"
                    value={vendorForm.name}
                    onChange={e => updateFormField('name', e.target.value)}
                    style={{ width: '100%' }}
                    autoFocus
                  />
                </div>

                {/* Address */}
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: '7pt', color: '#999', display: 'block', marginBottom: 2 }}>
                    Address
                  </label>
                  <AddressAutocomplete
                    className="glass-input text-sm"
                    value={vendorForm.address}
                    onChange={val => updateFormField('address', val)}
                    onSelect={(address, lat, lng, comps) => {
                      updateFormField('address', address)
                      if (comps) {
                        if (comps.locality_long) updateFormField('city', comps.locality_long)
                        if (comps.administrative_area_level_1) updateFormField('state', comps.administrative_area_level_1)
                        if (comps.postal_code) updateFormField('zip', comps.postal_code)
                      }
                    }}
                    style={{ width: '100%' }}
                  />
                </div>

                {/* City / State / Zip */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px', gap: 8, marginBottom: 8 }}>
                  <div>
                    <label style={{ fontSize: '7pt', color: '#999', display: 'block', marginBottom: 2 }}>
                      City
                    </label>
                    <input
                      className="glass-input text-sm"
                      value={vendorForm.city}
                      onChange={e => updateFormField('city', e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '7pt', color: '#999', display: 'block', marginBottom: 2 }}>
                      State
                    </label>
                    <input
                      className="glass-input text-sm"
                      value={vendorForm.state}
                      onChange={e => updateFormField('state', e.target.value)}
                      style={{ width: '100%' }}
                      maxLength={2}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '7pt', color: '#999', display: 'block', marginBottom: 2 }}>
                      Zip
                    </label>
                    <input
                      className="glass-input text-sm"
                      value={vendorForm.zip}
                      onChange={e => updateFormField('zip', e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                {/* Phone / Fax */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div>
                    <label style={{ fontSize: '7pt', color: '#999', display: 'block', marginBottom: 2 }}>
                      Phone
                    </label>
                    <input
                      className="glass-input text-sm"
                      value={vendorForm.phone}
                      onChange={e => updateFormField('phone', e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '7pt', color: '#999', display: 'block', marginBottom: 2 }}>
                      Fax
                    </label>
                    <input
                      className="glass-input text-sm"
                      value={vendorForm.fax}
                      onChange={e => updateFormField('fax', e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                {/* Email */}
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: '7pt', color: '#999', display: 'block', marginBottom: 2 }}>
                    Email
                  </label>
                  <input
                    className="glass-input text-sm"
                    type="email"
                    value={vendorForm.email}
                    onChange={e => updateFormField('email', e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>

                {/* Website */}
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: '7pt', color: '#999', display: 'block', marginBottom: 2 }}>
                    Website
                  </label>
                  <input
                    className="glass-input text-sm"
                    value={vendorForm.website}
                    onChange={e => updateFormField('website', e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>

                {/* Terms */}
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: '7pt', color: '#999', display: 'block', marginBottom: 2 }}>
                    Terms
                  </label>
                  <select
                    className="glass-input text-sm"
                    value={vendorForm.terms}
                    onChange={e => updateFormField('terms', e.target.value)}
                    style={{ width: '100%' }}
                  >
                    {TERMS_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                {/* Tax ID / 1099 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 8, alignItems: 'end' }}>
                  <div>
                    <label style={{ fontSize: '7pt', color: '#999', display: 'block', marginBottom: 2 }}>
                      Tax ID
                    </label>
                    <input
                      className="glass-input text-sm"
                      value={vendorForm.tax_id}
                      onChange={e => updateFormField('tax_id', e.target.value)}
                      style={{ width: '100%' }}
                      placeholder="XX-XXXXXXX"
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingBottom: 2 }}>
                    <input
                      type="checkbox"
                      id="is-1099"
                      checked={vendorForm.is_1099}
                      onChange={e => updateFormField('is_1099', e.target.checked)}
                    />
                    <label htmlFor="is-1099" style={{ fontSize: '7pt', color: '#e0e0e0', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      1099 Eligible
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-4 py-3 flex justify-end gap-2 border-t border-lvf-border/30">
              <button
                className="glass-button-secondary text-sm"
                onClick={() => {
                  setShowModal(false)
                  setEditingVendor(null)
                  setVendorForm(emptyVendorForm())
                }}
              >
                Cancel
              </button>
              <button
                className="glass-button-primary text-sm"
                onClick={handleSaveVendor}
                disabled={submitting}
              >
                {submitting ? 'Saving...' : (editingVendor ? 'Save Changes' : 'Save Vendor')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <tr>
      <td style={{
        padding: '4px 8px',
        fontWeight: 600,
        color: '#999',
        whiteSpace: 'nowrap',
        verticalAlign: 'top',
        width: 140,
        borderBottom: '1px solid #eee',
      }}>
        {label}
      </td>
      <td style={{
        padding: '4px 8px',
        color: '#e0e0e0',
        borderBottom: '1px solid #eee',
      }}>
        {value || '\u2014'}
      </td>
    </tr>
  )
}
