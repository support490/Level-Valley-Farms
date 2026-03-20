import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { getAuditTrail } from '../../api/reports'
import Toast from '../common/Toast'
import useToast from '../../hooks/useToast'

const ENTITY_TYPES = [
  { value: '', label: 'All' },
  { value: 'Bill', label: 'Bill' },
  { value: 'Invoice', label: 'Invoice' },
  { value: 'Check', label: 'Check' },
  { value: 'JournalEntry', label: 'Journal Entry' },
  { value: 'Account', label: 'Account' },
  { value: 'Payment', label: 'Payment' },
]

const ACTION_COLORS = {
  created: 'text-lvf-success',
  updated: 'text-lvf-accent',
  deleted: 'text-lvf-danger',
}

const ACTION_BG = {
  created: 'bg-lvf-success/10 border-lvf-success/30',
  updated: 'bg-lvf-accent/10 border-lvf-accent/30',
  deleted: 'bg-lvf-danger/10 border-lvf-danger/30',
}

export default function AuditTrailReport() {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [entityType, setEntityType] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  const generate = async () => {
    setLoading(true)
    try {
      const params = {}
      if (dateFrom) params.date_from = dateFrom
      if (dateTo) params.date_to = dateTo
      if (entityType) params.entity_type = entityType
      const res = await getAuditTrail(params)
      setData(res.data)
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error loading audit trail', 'error')
    } finally {
      setLoading(false)
    }
  }

  const formatChanges = (changes) => {
    if (!changes) return '—'
    try {
      const obj = typeof changes === 'string' ? JSON.parse(changes) : changes
      return JSON.stringify(obj, null, 2)
    } catch {
      return String(changes)
    }
  }

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div>
          <label style={{ fontSize: '8pt', color: '#999' }}>From</label>
          <input type="date" className="glass-input block" value={dateFrom}
            onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: '8pt', color: '#999' }}>To</label>
          <input type="date" className="glass-input block" value={dateTo}
            onChange={e => setDateTo(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: '8pt', color: '#999' }}>Entity Type</label>
          <select className="glass-input block" value={entityType}
            onChange={e => setEntityType(e.target.value)}>
            {ENTITY_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <button onClick={generate} className="glass-button-primary flex items-center gap-2 self-end" disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Generate
        </button>
      </div>

      {/* Empty state */}
      {!data && (
        <div className="glass-card p-8 text-center text-lvf-muted">
          Set filters and click Generate to view the audit trail
        </div>
      )}

      {/* Report */}
      {data && (
        <div className="glass-card overflow-hidden">
          <div className="p-4 border-b border-lvf-border bg-lvf-dark/30">
            <h3 className="font-semibold text-center text-lg">Level Valley Farms</h3>
            <p className="text-center text-sm text-lvf-muted">Audit Trail</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full glass-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Entity Type</th>
                  <th>Entity ID</th>
                  <th>Action</th>
                  <th>Changes</th>
                  <th>User</th>
                </tr>
              </thead>
              <tbody>
                {(data.entries || []).map((entry, idx) => (
                  <tr key={idx}>
                    <td className="text-lvf-muted text-xs whitespace-nowrap">{entry.timestamp}</td>
                    <td className="font-medium">{entry.entity_type}</td>
                    <td className="font-mono text-xs">{entry.entity_id}</td>
                    <td>
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold border ${ACTION_BG[entry.action] || ''} ${ACTION_COLORS[entry.action] || 'text-lvf-text'}`}>
                        {entry.action}
                      </span>
                    </td>
                    <td>
                      <pre className="text-xs text-lvf-muted max-w-md overflow-auto whitespace-pre-wrap font-mono">
                        {formatChanges(entry.changes)}
                      </pre>
                    </td>
                    <td className="text-sm">{entry.user || '—'}</td>
                  </tr>
                ))}
                {(data.entries || []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-lvf-muted">
                      No audit trail entries found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
