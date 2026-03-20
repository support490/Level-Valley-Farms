import { useState, useEffect } from 'react'
import { Save, Mail, Eye, EyeOff } from 'lucide-react'
import { getSettings, updateSettings } from '../../api/settings'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'

const smtpKeys = [
  'smtp_host',
  'smtp_port',
  'smtp_username',
  'smtp_password',
  'smtp_from_email',
  'smtp_use_tls',
]

export default function SmtpSettings() {
  const { toast, showToast, hideToast } = useToast()
  const [form, setForm] = useState({
    smtp_host: '',
    smtp_port: '587',
    smtp_username: '',
    smtp_password: '',
    smtp_from_email: '',
    smtp_use_tls: 'true',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const res = await getSettings()
      const data = res.data || {}
      const formData = {}
      for (const key of smtpKeys) {
        if (data[key]) {
          formData[key] = data[key].value || ''
        }
      }
      setForm(prev => ({ ...prev, ...formData }))
      setLoaded(true)
    } catch {
      showToast('Failed to load SMTP settings', 'error')
    }
  }

  const handleSave = async () => {
    if (!form.smtp_host) {
      showToast('SMTP Host is required', 'error')
      return
    }
    setSaving(true)
    try {
      await updateSettings(form)
      showToast('SMTP settings saved')
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to save SMTP settings', 'error')
    } finally {
      setSaving(false)
    }
  }

  const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <Mail size={16} /> Email / SMTP Configuration
      </h3>
      <p className="text-xs text-lvf-muted mb-4">
        Configure outgoing email for sending invoices. Common providers: Gmail (smtp.gmail.com:587), Outlook (smtp.office365.com:587).
      </p>

      <div className="space-y-4">
        {/* Host + Port */}
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className="block text-sm text-lvf-muted mb-1">SMTP Host</label>
            <input
              className="glass-input w-full"
              type="text"
              placeholder="smtp.gmail.com"
              value={form.smtp_host}
              onChange={e => setField('smtp_host', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Port</label>
            <input
              className="glass-input w-full"
              type="number"
              placeholder="587"
              value={form.smtp_port}
              onChange={e => setField('smtp_port', e.target.value)}
            />
          </div>
        </div>

        {/* Username */}
        <div>
          <label className="block text-sm text-lvf-muted mb-1">Username (email address)</label>
          <input
            className="glass-input w-full"
            type="email"
            placeholder="accounting@yourfarm.com"
            value={form.smtp_username}
            onChange={e => setField('smtp_username', e.target.value)}
          />
        </div>

        {/* Password */}
        <div>
          <label className="block text-sm text-lvf-muted mb-1">Password / App Password</label>
          <div className="relative">
            <input
              className="glass-input w-full pr-10"
              type={showPassword ? 'text' : 'password'}
              placeholder={loaded && form.smtp_password ? '********' : 'Enter password...'}
              value={form.smtp_password}
              onChange={e => setField('smtp_password', e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-lvf-muted hover:text-lvf-text"
            >
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <p className="text-[11px] text-lvf-muted mt-1">
            For Gmail, use an App Password (not your regular password). Go to Google Account &gt; Security &gt; App Passwords.
          </p>
        </div>

        {/* From Email */}
        <div>
          <label className="block text-sm text-lvf-muted mb-1">From Email</label>
          <input
            className="glass-input w-full"
            type="email"
            placeholder="invoices@yourfarm.com"
            value={form.smtp_from_email}
            onChange={e => setField('smtp_from_email', e.target.value)}
          />
          <p className="text-[11px] text-lvf-muted mt-1">
            The email address that appears in the "From" field. Usually the same as the username.
          </p>
        </div>

        {/* TLS Toggle */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <label className="text-sm font-medium">Use TLS Encryption</label>
            <p className="text-[11px] text-lvf-muted">Required by most email providers (Gmail, Outlook, etc.)</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={form.smtp_use_tls === 'true'}
              onChange={e => setField('smtp_use_tls', e.target.checked ? 'true' : 'false')}
            />
            <div className="w-9 h-5 bg-lvf-dark/60 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-lvf-accent"></div>
          </label>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="glass-button-primary flex items-center gap-2"
          >
            <Save size={14} />
            {saving ? 'Saving...' : 'Save SMTP Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
