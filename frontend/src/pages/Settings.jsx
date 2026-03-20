import { useState, useEffect, useRef } from 'react'
import { Save, Database, Download, History, Sliders, Upload, Users, Plus, Edit2, Trash2, Eye, EyeOff, MapPin, Calculator, FileText } from 'lucide-react'
import { getSettings, updateSettings, getAuditLog, getDbStats, exportData, downloadBackup, importCsv } from '../api/settings'
import { getUsers, register, updateUser } from '../api/auth'
import { getAccounts } from '../api/accounting'
import Toast from '../components/common/Toast'
import Modal from '../components/common/Modal'
import ConfirmDialog from '../components/common/ConfirmDialog'
import useToast from '../hooks/useToast'
import AddressAutocomplete from '../components/common/AddressAutocomplete'
import { useGoogleMaps } from '../components/common/GoogleMapsProvider'
import { GoogleMap, Marker } from '@react-google-maps/api'

export default function Settings() {
  const [tab, setTab] = useState('general')
  const [settings, setSettings] = useState({})
  const [auditLogs, setAuditLogs] = useState({ total: 0, logs: [] })
  const [dbStats, setDbStats] = useState({})
  const [form, setForm] = useState({})
  const [users, setUsers] = useState([])
  const [createUserOpen, setCreateUserOpen] = useState(false)
  const [editUserTarget, setEditUserTarget] = useState(null)
  const [deactivateTarget, setDeactivateTarget] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [userForm, setUserForm] = useState({ username: '', password: '', full_name: '', email: '', role: 'manager' })
  const [editForm, setEditForm] = useState({ full_name: '', email: '', role: '', password: '' })
  const [glAccounts, setGlAccounts] = useState([])
  const { toast, showToast, hideToast } = useToast()
  const { isLoaded: mapsLoaded } = useGoogleMaps()

  const load = async () => {
    try {
      const [settingsRes, dbRes] = await Promise.all([getSettings(), getDbStats()])
      setSettings(settingsRes.data)
      setDbStats(dbRes.data)

      const formData = {}
      for (const [key, val] of Object.entries(settingsRes.data)) {
        formData[key] = val.value
      }
      setForm(formData)
    } catch (err) {
      showToast('Error loading settings', 'error')
    }
  }

  const loadAudit = async () => {
    const res = await getAuditLog({ limit: 50 })
    setAuditLogs(res.data || { total: 0, logs: [] })
  }

  const loadUsers = async () => {
    try {
      const res = await getUsers()
      setUsers(res.data || [])
    } catch {}
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    if (tab === 'accounting') {
      getAccounts().then(res => setGlAccounts(res.data || [])).catch(() => {})
    }
  }, [tab])
  useEffect(() => { if (tab === 'audit') loadAudit() }, [tab])
  useEffect(() => { if (tab === 'users') loadUsers() }, [tab])

  const handleSave = async () => {
    try {
      await updateSettings(form)
      showToast('Settings saved')
      load()
    } catch (err) {
      showToast('Error saving settings', 'error')
    }
  }

  const handleExport = async () => {
    try {
      const res = await exportData()
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `level-valley-backup-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
      showToast('Export downloaded')
    } catch (err) {
      showToast('Export failed', 'error')
    }
  }

  const [importType, setImportType] = useState('growers')
  const [importResult, setImportResult] = useState(null)
  const fileRef = useRef(null)

  const handleImport = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) { showToast('Select a CSV file', 'error'); return }
    try {
      const res = await importCsv(file, importType)
      setImportResult(res.data)
      showToast(`Imported ${res.data.imported} records`)
      fileRef.current.value = ''
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Import failed', 'error')
    }
  }

  const handleCreateUser = async (e) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      await register(userForm)
      showToast('User created')
      setCreateUserOpen(false)
      setUserForm({ username: '', password: '', full_name: '', email: '', role: 'manager' })
      loadUsers()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error creating user', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const openEditUser = (user) => {
    setEditForm({ full_name: user.full_name, email: user.email || '', role: user.role, password: '' })
    setEditUserTarget(user)
    setShowPassword(false)
  }

  const handleEditUser = async (e) => {
    e.preventDefault()
    if (submitting || !editUserTarget) return
    setSubmitting(true)
    try {
      const data = { full_name: editForm.full_name, email: editForm.email || null, role: editForm.role }
      if (editForm.password) data.password = editForm.password
      await updateUser(editUserTarget.id, data)
      showToast('User updated')
      setEditUserTarget(null)
      loadUsers()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error updating user', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggleActive = async () => {
    if (!deactivateTarget) return
    try {
      await updateUser(deactivateTarget.id, { is_active: !deactivateTarget.is_active })
      showToast(deactivateTarget.is_active ? 'User deactivated' : 'User activated')
      setDeactivateTarget(null)
      loadUsers()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    }
  }

  const handleBackupDownload = async () => {
    try {
      const res = await downloadBackup()
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      const disposition = res.headers['content-disposition']
      a.download = disposition ? disposition.split('filename=')[1] : 'lvf-backup.json'
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      showToast('Backup downloaded')
    } catch { showToast('Backup failed', 'error') }
  }

  const tabs = [
    { id: 'general', label: 'General', icon: Sliders },
    { id: 'accounting', label: 'Accounting', icon: Calculator },
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'import', label: 'Import Data', icon: Upload },
    { id: 'database', label: 'Database', icon: Database },
    { id: 'audit', label: 'Audit Log', icon: History },
  ]

  const roleColors = {
    owner: 'bg-lvf-accent/20 text-lvf-accent',
    manager: 'bg-lvf-success/20 text-lvf-success',
    driver: 'bg-lvf-warning/20 text-lvf-warning',
    grower: 'bg-purple-500/20 text-purple-400',
  }

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}
      <h2 className="text-2xl font-bold mb-6">Settings</h2>

      <div className="flex gap-1 mb-6 p-1 glass-card w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              tab === t.id ? 'bg-lvf-accent/20 text-lvf-accent' : 'text-lvf-muted hover:text-lvf-text hover:bg-white/5'
            }`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* General Settings */}
      {tab === 'general' && (
        <div className="max-w-2xl space-y-6">
          <div className="glass-card p-6">
            <h3 className="font-semibold mb-4">Farm Settings</h3>
            <div className="space-y-4">
              {[
                { key: 'farm_name', label: 'Farm Name', type: 'text' },
                { key: 'fiscal_year_start', label: 'Fiscal Year Start (MM-DD)', type: 'text' },
                { key: 'production_target', label: 'Production Target (%)', type: 'number' },
                { key: 'default_eggs_per_case', label: 'Default Eggs per Case', type: 'number' },
                { key: 'mortality_alert_threshold', label: 'Mortality Alert Threshold (%)', type: 'number' },
                { key: 'capacity_alert_threshold', label: 'Capacity Alert Threshold (%)', type: 'number' },
              ].map(field => (
                <div key={field.key} className="flex items-center justify-between gap-4">
                  <div>
                    <label className="text-sm font-medium">{field.label}</label>
                    {settings[field.key]?.description && (
                      <p className="text-[11px] text-lvf-muted">{settings[field.key].description}</p>
                    )}
                  </div>
                  <input
                    className="glass-input w-48 text-right"
                    type={field.type}
                    value={form[field.key] || ''}
                    onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-6">
              <button onClick={handleSave} className="glass-button-primary flex items-center gap-2">
                <Save size={14} /> Save Settings
              </button>
            </div>
          </div>

          <div className="glass-card p-6">
            <h3 className="font-semibold mb-2">Expense Categories</h3>
            <p className="text-xs text-lvf-muted mb-4">Available categories for expense tracking (click x to remove, + to add)</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {(() => {
                let cats = []
                try { cats = JSON.parse(form.expense_categories || '[]') } catch { cats = ['Feed', 'Grower Payment', 'Flock Cost', 'Veterinary', 'Service', 'Chick Purchase', 'Transport', 'Utilities', 'Other'] }
                return cats.map((cat, i) => (
                  <span key={i} className="px-3 py-1.5 rounded-full text-xs font-medium bg-lvf-accent/10 text-lvf-accent border border-lvf-accent/20 flex items-center gap-1.5">
                    {cat}
                    <button type="button" onClick={() => {
                      const updated = cats.filter((_, j) => j !== i)
                      setForm({ ...form, expense_categories: JSON.stringify(updated) })
                    }} className="text-lvf-danger hover:text-red-400" style={{ lineHeight: 1 }}>&times;</button>
                  </span>
                ))
              })()}
            </div>
            <div className="flex gap-2">
              <input
                className="glass-input text-sm w-48"
                placeholder="New category..."
                onKeyDown={e => {
                  if (e.key === 'Enter' && e.target.value.trim()) {
                    let cats = []
                    try { cats = JSON.parse(form.expense_categories || '[]') } catch {}
                    const newCat = e.target.value.trim()
                    if (!cats.includes(newCat)) {
                      setForm({ ...form, expense_categories: JSON.stringify([...cats, newCat]) })
                    }
                    e.target.value = ''
                  }
                }}
              />
              <button type="button" className="glass-button-secondary text-sm" onClick={() => {
                const input = document.querySelector('input[placeholder="New category..."]')
                if (input?.value.trim()) {
                  let cats = []
                  try { cats = JSON.parse(form.expense_categories || '[]') } catch {}
                  const newCat = input.value.trim()
                  if (!cats.includes(newCat)) {
                    setForm({ ...form, expense_categories: JSON.stringify([...cats, newCat]) })
                  }
                  input.value = ''
                }
              }}>+ Add</button>
            </div>
          </div>

          <div className="glass-card p-6">
            <h3 className="font-semibold mb-2 flex items-center gap-2"><MapPin size={16} /> Warehouse Location</h3>
            <p className="text-xs text-lvf-muted mb-4">Set warehouse address for display on the Maps page</p>
            <div className="space-y-3">
              <AddressAutocomplete
                value={form.warehouse_address || ''}
                onChange={val => setForm({ ...form, warehouse_address: val })}
                onSelect={(address, lat, lng) => setForm({
                  ...form,
                  warehouse_address: address,
                  warehouse_latitude: String(lat),
                  warehouse_longitude: String(lng),
                })}
                placeholder="Search warehouse address..."
                className="glass-input w-full"
              />
              {mapsLoaded && form.warehouse_latitude && form.warehouse_longitude && (
                <div className="relative">
                  <GoogleMap
                    mapContainerStyle={{ width: '100%', height: '180px', borderRadius: '12px' }}
                    center={{ lat: parseFloat(form.warehouse_latitude), lng: parseFloat(form.warehouse_longitude) }}
                    zoom={15}
                    options={{ mapTypeId: 'satellite', streetViewControl: false, mapTypeControl: false, fullscreenControl: false }}
                    onLoad={(m) => { window._warehousePinMap = m }}
                  >
                    <Marker position={{ lat: parseFloat(form.warehouse_latitude), lng: parseFloat(form.warehouse_longitude) }} />
                  </GoogleMap>
                  <button
                    type="button"
                    title="Zoom to my location"
                    className="absolute top-2 right-2 bg-white/90 hover:bg-white text-gray-700 p-1.5 rounded shadow text-xs"
                    onClick={() => {
                      navigator.geolocation?.getCurrentPosition((pos) => {
                        const m = window._warehousePinMap
                        if (m) { m.panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude }); m.setZoom(16) }
                      })
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Users Management */}
      {tab === 'users' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-lvf-muted">Manage user accounts and access</p>
            <button onClick={() => { setCreateUserOpen(true); setShowPassword(false) }} className="glass-button-primary flex items-center gap-2">
              <Plus size={14} /> Add User
            </button>
          </div>
          <div className="glass-card overflow-hidden">
            <table className="w-full glass-table">
              <thead>
                <tr><th>Name</th><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th className="w-28">Actions</th></tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td className="font-medium">{u.full_name}</td>
                    <td className="font-mono text-sm text-lvf-muted">{u.username}</td>
                    <td className="text-lvf-muted text-sm">{u.email || '—'}</td>
                    <td>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${roleColors[u.role] || 'bg-lvf-muted/20 text-lvf-muted'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        u.is_active ? 'bg-lvf-success/20 text-lvf-success' : 'bg-lvf-danger/20 text-lvf-danger'
                      }`}>{u.is_active ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td className="text-lvf-muted text-xs">{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                    <td>
                      <div className="flex gap-1">
                        <button onClick={() => openEditUser(u)} className="p-1.5 rounded-lg hover:bg-white/10" title="Edit user">
                          <Edit2 size={13} className="text-lvf-muted" />
                        </button>
                        <button onClick={() => setDeactivateTarget(u)} className="p-1.5 rounded-lg hover:bg-white/10" title={u.is_active ? 'Deactivate' : 'Activate'}>
                          <Trash2 size={13} className={u.is_active ? 'text-lvf-danger' : 'text-lvf-success'} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-8 text-lvf-muted">No users found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      <Modal isOpen={createUserOpen} onClose={() => setCreateUserOpen(false)} title="Add User">
        <form onSubmit={handleCreateUser} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Full Name *</label>
              <input className="glass-input w-full" required value={userForm.full_name}
                onChange={e => setUserForm({ ...userForm, full_name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Username *</label>
              <input className="glass-input w-full" required minLength={3} value={userForm.username}
                onChange={e => setUserForm({ ...userForm, username: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Password *</label>
              <div className="relative">
                <input className="glass-input w-full pr-10" type={showPassword ? 'text' : 'password'} required minLength={4}
                  value={userForm.password} onChange={e => setUserForm({ ...userForm, password: e.target.value })} />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-lvf-muted hover:text-lvf-text">
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Role *</label>
              <select className="glass-input w-full" value={userForm.role}
                onChange={e => setUserForm({ ...userForm, role: e.target.value })}>
                <option value="owner">Owner</option>
                <option value="manager">Manager</option>
                <option value="driver">Driver</option>
                <option value="grower">Grower</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Email</label>
            <input className="glass-input w-full" type="email" value={userForm.email}
              onChange={e => setUserForm({ ...userForm, email: e.target.value })} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setCreateUserOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">{submitting ? 'Creating...' : 'Create User'}</button>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal isOpen={!!editUserTarget} onClose={() => setEditUserTarget(null)} title={`Edit User — ${editUserTarget?.username}`}>
        <form onSubmit={handleEditUser} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Full Name *</label>
              <input className="glass-input w-full" required value={editForm.full_name}
                onChange={e => setEditForm({ ...editForm, full_name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Role *</label>
              <select className="glass-input w-full" value={editForm.role}
                onChange={e => setEditForm({ ...editForm, role: e.target.value })}>
                <option value="owner">Owner</option>
                <option value="manager">Manager</option>
                <option value="driver">Driver</option>
                <option value="grower">Grower</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Email</label>
            <input className="glass-input w-full" type="email" value={editForm.email}
              onChange={e => setEditForm({ ...editForm, email: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">New Password <span className="text-lvf-muted text-xs">(leave blank to keep current)</span></label>
            <div className="relative">
              <input className="glass-input w-full pr-10" type={showPassword ? 'text' : 'password'} minLength={4}
                value={editForm.password} placeholder="Enter new password..."
                onChange={e => setEditForm({ ...editForm, password: e.target.value })} />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-lvf-muted hover:text-lvf-text">
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setEditUserTarget(null)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">{submitting ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      {/* Deactivate/Activate User Confirm */}
      <ConfirmDialog
        isOpen={!!deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={handleToggleActive}
        title={deactivateTarget?.is_active ? 'Deactivate User' : 'Activate User'}
        message={deactivateTarget?.is_active
          ? `Deactivate "${deactivateTarget?.full_name}"? They will no longer be able to log in.`
          : `Reactivate "${deactivateTarget?.full_name}"? They will be able to log in again.`
        }
      />

      {/* Accounting Settings */}
      {tab === 'accounting' && (
        <div className="max-w-2xl space-y-6">
          {/* Company Information */}
          <div className="glass-card p-6">
            <h3 className="font-semibold mb-4">Company Information</h3>
            <div className="space-y-4">
              {[
                { key: 'company_legal_name', label: 'Legal Business Name', type: 'text' },
                { key: 'company_ein', label: 'EIN / Tax ID', type: 'text' },
                { key: 'company_address', label: 'Business Address', type: 'text' },
                { key: 'company_phone', label: 'Business Phone', type: 'text' },
              ].map(field => (
                <div key={field.key} className="flex items-center justify-between gap-4">
                  <label className="text-sm font-medium">{field.label}</label>
                  <input className="glass-input w-64 text-right" type={field.type} value={form[field.key] || ''}
                    onChange={e => setForm({ ...form, [field.key]: e.target.value })} />
                </div>
              ))}
              <div className="flex items-center justify-between gap-4">
                <label className="text-sm font-medium">Business Type</label>
                <select className="glass-input w-64" value={form.company_type || ''}
                  onChange={e => setForm({ ...form, company_type: e.target.value })}>
                  <option value="">-- Select --</option>
                  <option value="LLC">LLC</option>
                  <option value="S-Corp">S-Corp</option>
                  <option value="C-Corp">C-Corp</option>
                  <option value="Sole Proprietorship">Sole Proprietorship</option>
                  <option value="Partnership">Partnership</option>
                </select>
              </div>
            </div>
          </div>

          {/* Numbering Sequences */}
          <div className="glass-card p-6">
            <h3 className="font-semibold mb-4">Numbering Sequences</h3>
            <div className="space-y-3">
              {[
                { prefix: 'invoice_prefix', number: 'invoice_next_number', label: 'Invoice' },
                { prefix: 'bill_prefix', number: 'bill_next_number', label: 'Bill' },
                { prefix: 'check_prefix', number: 'check_next_number', label: 'Check' },
                { prefix: 'estimate_prefix', number: 'estimate_next_number', label: 'Estimate' },
                { prefix: 'journal_prefix', number: null, label: 'Journal Entry' },
                { prefix: 'po_prefix', number: null, label: 'Purchase Order' },
              ].map(seq => (
                <div key={seq.prefix} className="flex items-center gap-3">
                  <label className="text-sm font-medium w-32">{seq.label}</label>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-lvf-muted">Prefix:</span>
                    <input className="glass-input w-24 text-sm" value={form[seq.prefix] || ''}
                      onChange={e => setForm({ ...form, [seq.prefix]: e.target.value })} />
                  </div>
                  {seq.number && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-lvf-muted">Next #:</span>
                      <input className="glass-input w-24 text-sm" type="number" value={form[seq.number] || ''}
                        onChange={e => setForm({ ...form, [seq.number]: e.target.value })} />
                    </div>
                  )}
                  <span className="text-xs text-lvf-muted">
                    Preview: {(form[seq.prefix] || '') + (seq.number ? (form[seq.number] || '') : '...')}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Payment Terms */}
          <div className="glass-card p-6">
            <h3 className="font-semibold mb-2">Payment Terms</h3>
            <p className="text-xs text-lvf-muted mb-4">Available payment terms for invoices and bills</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {(() => {
                let terms = []
                try { terms = JSON.parse(form.payment_terms || '[]') } catch {}
                return terms.map((term, i) => (
                  <span key={i} className="px-3 py-1.5 rounded-full text-xs font-medium bg-lvf-accent/10 text-lvf-accent border border-lvf-accent/20 flex items-center gap-1.5">
                    {term}
                    <button type="button" onClick={() => {
                      const updated = terms.filter((_, j) => j !== i)
                      setForm({ ...form, payment_terms: JSON.stringify(updated) })
                    }} className="text-lvf-danger hover:text-red-400" style={{ lineHeight: 1 }}>&times;</button>
                  </span>
                ))
              })()}
            </div>
            <div className="flex gap-2">
              <input className="glass-input text-sm w-48" placeholder="New term (e.g. Net 90)..."
                onKeyDown={e => {
                  if (e.key === 'Enter' && e.target.value.trim()) {
                    let terms = []
                    try { terms = JSON.parse(form.payment_terms || '[]') } catch {}
                    const newTerm = e.target.value.trim()
                    if (!terms.includes(newTerm)) {
                      setForm({ ...form, payment_terms: JSON.stringify([...terms, newTerm]) })
                    }
                    e.target.value = ''
                  }
                }} />
              <button type="button" className="glass-button-secondary text-sm" onClick={() => {
                const input = document.querySelector('input[placeholder="New term (e.g. Net 90)..."]')
                if (input?.value.trim()) {
                  let terms = []
                  try { terms = JSON.parse(form.payment_terms || '[]') } catch {}
                  const newTerm = input.value.trim()
                  if (!terms.includes(newTerm)) {
                    setForm({ ...form, payment_terms: JSON.stringify([...terms, newTerm]) })
                  }
                  input.value = ''
                }
              }}>+ Add</button>
            </div>
          </div>

          {/* Default Accounts */}
          <div className="glass-card p-6">
            <h3 className="font-semibold mb-4">Default Accounts</h3>
            <div className="space-y-4">
              {[
                { key: 'default_ar_account', label: 'Accounts Receivable' },
                { key: 'default_ap_account', label: 'Accounts Payable' },
                { key: 'default_undeposited_funds_account', label: 'Undeposited Funds' },
                { key: 'default_revenue_account', label: 'Default Revenue' },
                { key: 'default_expense_account', label: 'Default Expense' },
              ].map(field => (
                <div key={field.key} className="flex items-center justify-between gap-4">
                  <label className="text-sm font-medium">{field.label}</label>
                  <select className="glass-input w-72" value={form[field.key] || ''}
                    onChange={e => setForm({ ...form, [field.key]: e.target.value })}>
                    <option value="">-- Select Account --</option>
                    {glAccounts.map(a => (
                      <option key={a.id} value={a.account_number}>
                        {a.account_number} - {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Accounting Preferences */}
          <div className="glass-card p-6">
            <h3 className="font-semibold mb-4">Accounting Preferences</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <label className="text-sm font-medium">Accounting Basis</label>
                  <p className="text-[11px] text-lvf-muted">Display only — cannot be changed after transactions are entered</p>
                </div>
                <select className="glass-input w-48" value={form.accounting_basis || 'Accrual'}
                  onChange={e => setForm({ ...form, accounting_basis: e.target.value })}>
                  <option value="Accrual">Accrual</option>
                  <option value="Cash">Cash</option>
                </select>
              </div>
              <div className="flex items-center justify-between gap-4">
                <label className="text-sm font-medium">Close Books Date</label>
                <input className="glass-input w-48" type="date" value={form.close_books_date || ''}
                  onChange={e => setForm({ ...form, close_books_date: e.target.value })} />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <label className="text-sm font-medium">Require Invoice Approval</label>
                  <p className="text-[11px] text-lvf-muted">Require approval before invoices can be sent</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer"
                    checked={form.require_approval === 'true'}
                    onChange={e => setForm({ ...form, require_approval: e.target.checked ? 'true' : 'false' })} />
                  <div className="w-9 h-5 bg-lvf-dark/60 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-lvf-accent"></div>
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={handleSave} className="glass-button-primary flex items-center gap-2">
              <Save size={14} /> Save Accounting Settings
            </button>
          </div>
        </div>
      )}

      {/* Documents Settings */}
      {tab === 'documents' && (
        <div className="max-w-2xl space-y-6">
          <div className="glass-card p-6">
            <h3 className="font-semibold mb-4">Invoice & Bill Defaults</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <label className="text-sm font-medium">Default Invoice Terms</label>
                <select className="glass-input w-48" value={form.default_invoice_terms || ''}
                  onChange={e => setForm({ ...form, default_invoice_terms: e.target.value })}>
                  {(() => {
                    let terms = []
                    try { terms = JSON.parse(form.payment_terms || '[]') } catch {}
                    if (terms.length === 0) terms = ['Due on Receipt', 'Net 15', 'Net 30', 'Net 45', 'Net 60']
                    return terms.map(t => <option key={t} value={t}>{t}</option>)
                  })()}
                </select>
              </div>
              <div className="flex items-center justify-between gap-4">
                <label className="text-sm font-medium">Default Bill Terms</label>
                <select className="glass-input w-48" value={form.default_bill_terms || ''}
                  onChange={e => setForm({ ...form, default_bill_terms: e.target.value })}>
                  {(() => {
                    let terms = []
                    try { terms = JSON.parse(form.payment_terms || '[]') } catch {}
                    if (terms.length === 0) terms = ['Due on Receipt', 'Net 15', 'Net 30', 'Net 45', 'Net 60']
                    return terms.map(t => <option key={t} value={t}>{t}</option>)
                  })()}
                </select>
              </div>
            </div>
          </div>

          <div className="glass-card p-6">
            <h3 className="font-semibold mb-4">Invoice Footer & Payment Instructions</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">Invoice Footer Message</label>
                <textarea className="glass-input w-full text-sm" rows={3}
                  value={form.invoice_footer_message || ''}
                  onChange={e => setForm({ ...form, invoice_footer_message: e.target.value })}
                  placeholder="e.g. Thank you for your business!" style={{ resize: 'vertical' }} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Payment Instructions</label>
                <textarea className="glass-input w-full text-sm" rows={3}
                  value={form.invoice_payment_instructions || ''}
                  onChange={e => setForm({ ...form, invoice_payment_instructions: e.target.value })}
                  placeholder="e.g. Make checks payable to Level Valley Farms. Mail to..." style={{ resize: 'vertical' }} />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={handleSave} className="glass-button-primary flex items-center gap-2">
              <Save size={14} /> Save Document Settings
            </button>
          </div>
        </div>
      )}

      {/* Import Data */}
      {tab === 'import' && (
        <div className="max-w-2xl space-y-6">
          <div className="glass-card p-6">
            <h3 className="font-semibold mb-2">Import from CSV</h3>
            <p className="text-xs text-lvf-muted mb-4">Upload a CSV file to import growers or production records</p>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div>
                  <label className="block text-sm text-lvf-muted mb-1">Data Type</label>
                  <select className="glass-input" value={importType} onChange={e => setImportType(e.target.value)}>
                    <option value="growers">Growers</option>
                    <option value="production">Production Records</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm text-lvf-muted mb-1">CSV File</label>
                  <input ref={fileRef} type="file" accept=".csv" className="glass-input w-full text-sm" />
                </div>
              </div>
              <div className="text-xs text-lvf-muted">
                {importType === 'growers' && <p>Columns: name, location, contact_name, contact_phone, contact_email, notes</p>}
                {importType === 'production' && <p>Columns: flock_number, record_date, bird_count, egg_count, cracked, floor_eggs</p>}
              </div>
              <button onClick={handleImport} className="glass-button-primary flex items-center gap-2">
                <Upload size={14} /> Import CSV
              </button>
              {importResult && (
                <div className="glass-card p-4 mt-3">
                  <p className="text-sm font-medium">Import Results</p>
                  <p className="text-xs text-lvf-muted mt-1">
                    {importResult.imported} of {importResult.total_rows} rows imported
                  </p>
                  {importResult.errors?.length > 0 && (
                    <div className="mt-2 text-xs text-lvf-danger space-y-1">
                      {importResult.errors.map((e, i) => <p key={i}>{e}</p>)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Database */}
      {tab === 'database' && (
        <div className="max-w-2xl space-y-6">
          <div className="glass-card p-6">
            <h3 className="font-semibold mb-4">Database Statistics</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.entries(dbStats).map(([key, count]) => (
                <div key={key} className="p-3 rounded-xl bg-lvf-dark/40 border border-lvf-border/20">
                  <p className="text-xs text-lvf-muted capitalize">{key.replace(/_/g, ' ')}</p>
                  <p className="text-lg font-bold mt-1">{count.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card p-6">
            <h3 className="font-semibold mb-2">Data Backup</h3>
            <p className="text-xs text-lvf-muted mb-4">Download a full JSON backup of all data</p>
            <div className="flex gap-3">
              <button onClick={handleBackupDownload} className="glass-button-primary flex items-center gap-2">
                <Download size={14} /> Download Backup
              </button>
              <button onClick={handleExport} className="glass-button-secondary flex items-center gap-2">
                <Download size={14} /> View Export JSON
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Log */}
      {tab === 'audit' && (
        <div className="glass-card overflow-hidden">
          <table className="w-full glass-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Description</th>
                <th>User</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.logs.length > 0 ? (
                auditLogs.logs.map(log => (
                  <tr key={log.id}>
                    <td className="text-lvf-muted text-xs whitespace-nowrap">{log.created_at ? new Date(log.created_at).toLocaleString() : '—'}</td>
                    <td>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        log.action === 'create' ? 'bg-lvf-success/20 text-lvf-success' :
                        log.action === 'update' ? 'bg-lvf-accent/20 text-lvf-accent' :
                        log.action === 'delete' ? 'bg-lvf-danger/20 text-lvf-danger' :
                        'bg-lvf-muted/20 text-lvf-muted'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="text-xs">{log.entity_type}</td>
                    <td className="text-sm">{log.description}</td>
                    <td className="text-lvf-muted text-xs">{log.user}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={5} className="text-center py-8 text-lvf-muted">No audit log entries yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
