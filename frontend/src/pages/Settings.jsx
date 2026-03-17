import { useState, useEffect, useRef } from 'react'
import { Save, Database, Download, History, Sliders, Upload } from 'lucide-react'
import { getSettings, updateSettings, getAuditLog, getDbStats, exportData, downloadBackup, importCsv } from '../api/settings'
import Toast from '../components/common/Toast'
import useToast from '../hooks/useToast'

export default function Settings() {
  const [tab, setTab] = useState('general')
  const [settings, setSettings] = useState({})
  const [auditLogs, setAuditLogs] = useState({ total: 0, logs: [] })
  const [dbStats, setDbStats] = useState({})
  const [form, setForm] = useState({})
  const { toast, showToast, hideToast } = useToast()

  const load = async () => {
    const [settingsRes, dbRes] = await Promise.all([getSettings(), getDbStats()])
    setSettings(settingsRes.data)
    setDbStats(dbRes.data)

    const formData = {}
    for (const [key, val] of Object.entries(settingsRes.data)) {
      formData[key] = val.value
    }
    setForm(formData)
  }

  const loadAudit = async () => {
    const res = await getAuditLog({ limit: 50 })
    setAuditLogs(res.data)
  }

  useEffect(() => { load() }, [])
  useEffect(() => { if (tab === 'audit') loadAudit() }, [tab])

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
    { id: 'import', label: 'Import Data', icon: Upload },
    { id: 'database', label: 'Database', icon: Database },
    { id: 'audit', label: 'Audit Log', icon: History },
  ]

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
            <p className="text-xs text-lvf-muted mb-4">Available categories for expense tracking</p>
            <div className="flex flex-wrap gap-2">
              {['Feed', 'Grower Payment', 'Flock Cost', 'Veterinary', 'Service', 'Chick Purchase', 'Transport', 'Utilities', 'Other'].map(cat => (
                <span key={cat} className="px-3 py-1.5 rounded-full text-xs font-medium bg-lvf-accent/10 text-lvf-accent border border-lvf-accent/20">
                  {cat}
                </span>
              ))}
            </div>
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
