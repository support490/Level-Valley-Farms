import { useState, useEffect } from 'react'
import {
  getFixedAssets, createFixedAsset, getFixedAsset, updateFixedAsset,
  disposeFixedAsset, depreciateFixedAsset, depreciateAllFixedAssets,
  getFixedAssetsSummary, getActiveFlocks, getVendors,
} from '../../api/accounting'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'

const today = () => new Date().toISOString().split('T')[0]

const CATEGORIES = [
  { value: 'machinery', label: 'Machinery' },
  { value: 'vehicles', label: 'Vehicles' },
  { value: 'buildings', label: 'Buildings' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'land_improvements', label: 'Land Improvements' },
  { value: 'other', label: 'Other' },
]

const DEPR_METHODS = [
  { value: 'straight_line', label: 'Straight-Line' },
  { value: 'declining_balance', label: 'Declining Balance (DDB)' },
  { value: 'macrs_3', label: 'MACRS 3-Year' },
  { value: 'macrs_5', label: 'MACRS 5-Year' },
  { value: 'macrs_7', label: 'MACRS 7-Year' },
  { value: 'macrs_10', label: 'MACRS 10-Year' },
  { value: 'macrs_15', label: 'MACRS 15-Year' },
]

const DISPOSAL_METHODS = [
  { value: 'sold', label: 'Sold' },
  { value: 'scrapped', label: 'Scrapped' },
  { value: 'traded', label: 'Traded In' },
]

const categoryLabel = (val) => CATEGORIES.find(c => c.value === val)?.label || val
const deprMethodLabel = (val) => DEPR_METHODS.find(m => m.value === val)?.label || val

const statusConfig = {
  active:   { label: 'Active',   bg: 'bg-green-500/20',  text: 'text-green-300', border: 'border-green-500/40' },
  disposed: { label: 'Disposed', bg: 'bg-red-500/20',    text: 'text-red-300',   border: 'border-red-500/40' },
}

function StatusBadge({ disposed }) {
  const cfg = disposed ? statusConfig.disposed : statusConfig.active
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.label}
    </span>
  )
}

const fmt = (n) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const initialForm = () => ({
  asset_number: '',
  name: '',
  description: '',
  category: 'equipment',
  acquisition_date: today(),
  acquisition_cost: '',
  salvage_value: '0',
  useful_life_years: '7',
  depreciation_method: 'straight_line',
  location: '',
  flock_id: '',
  serial_number: '',
  vendor_name: '',
  notes: '',
})

export default function FixedAssets() {
  const [mode, setMode] = useState('list')    // list | create | edit | detail
  const [filterTab, setFilterTab] = useState('all')

  // List state
  const [assets, setAssets] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)

  // Form state
  const [form, setForm] = useState(initialForm())
  const [editId, setEditId] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // Detail state
  const [detail, setDetail] = useState(null)

  // Disposal modal
  const [disposeTarget, setDisposeTarget] = useState(null)
  const [disposeForm, setDisposeForm] = useState({ disposal_date: today(), disposal_amount: '0', disposal_method: 'sold' })

  // Reference data
  const [flocks, setFlocks] = useState([])
  const [vendors, setVendors] = useState([])

  const { toast, showToast, hideToast } = useToast()

  // ── Load list & summary ──
  const loadAssets = async () => {
    setLoading(true)
    try {
      const params = {}
      if (filterTab === 'disposed') {
        params.is_disposed = true
        params.active_only = false
      } else if (filterTab !== 'all') {
        params.category = filterTab
        params.active_only = true
      } else {
        params.active_only = false
      }
      const [assetsRes, summaryRes] = await Promise.all([
        getFixedAssets(params),
        getFixedAssetsSummary(),
      ])
      setAssets(assetsRes.data || [])
      setSummary(summaryRes.data || null)
    } catch {
      setAssets([])
    } finally { setLoading(false) }
  }

  useEffect(() => { loadAssets() }, [filterTab])

  // ── Load form ref data ──
  const loadRefData = async () => {
    try {
      const [flockRes, vendorRes] = await Promise.all([getActiveFlocks(), getVendors()])
      setFlocks(flockRes.data || [])
      setVendors(vendorRes.data || [])
    } catch { /* noop */ }
  }

  const openCreate = () => {
    setForm(initialForm())
    setEditId(null)
    loadRefData()
    setMode('create')
  }

  const openEdit = (asset) => {
    setForm({
      asset_number: asset.asset_number || '',
      name: asset.name || '',
      description: asset.description || '',
      category: asset.category || 'equipment',
      acquisition_date: asset.acquisition_date || today(),
      acquisition_cost: String(asset.acquisition_cost || ''),
      salvage_value: String(asset.salvage_value || '0'),
      useful_life_years: String(asset.useful_life_years || '7'),
      depreciation_method: asset.depreciation_method || 'straight_line',
      location: asset.location || '',
      flock_id: asset.flock_id || '',
      serial_number: asset.serial_number || '',
      vendor_name: asset.vendor_name || '',
      notes: asset.notes || '',
    })
    setEditId(asset.id)
    loadRefData()
    setMode('edit')
  }

  const openDetail = async (asset) => {
    try {
      const res = await getFixedAsset(asset.id)
      setDetail(res.data)
      setMode('detail')
    } catch {
      showToast('Failed to load asset detail', 'error')
    }
  }

  const goBackToList = () => {
    setMode('list')
    setDetail(null)
    setEditId(null)
    loadAssets()
  }

  // ── Form helpers ──
  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  // ── Save ──
  const handleSave = async () => {
    if (submitting) return
    if (!form.name) { showToast('Name is required', 'error'); return }
    if (!form.acquisition_cost || parseFloat(form.acquisition_cost) <= 0) { showToast('Cost must be greater than zero', 'error'); return }
    setSubmitting(true)
    try {
      const payload = {
        ...form,
        acquisition_cost: parseFloat(form.acquisition_cost),
        salvage_value: parseFloat(form.salvage_value || '0'),
        useful_life_years: parseInt(form.useful_life_years, 10),
        asset_number: form.asset_number || undefined,
        flock_id: form.flock_id || undefined,
      }
      if (editId) {
        await updateFixedAsset(editId, payload)
        showToast('Asset updated successfully')
      } else {
        await createFixedAsset(payload)
        showToast('Asset created successfully')
      }
      goBackToList()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error saving asset', 'error')
    } finally { setSubmitting(false) }
  }

  // ── Depreciate single ──
  const handleDepreciateSingle = async (asset) => {
    try {
      const res = await depreciateFixedAsset(asset.id)
      showToast(`Depreciated $${fmt(res.data.depreciation_amount)} for ${asset.name}`)
      loadAssets()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error running depreciation', 'error')
    }
  }

  // ── Run monthly for all ──
  const handleDepreciateAll = async () => {
    if (!confirm('Run monthly depreciation for all active assets?')) return
    try {
      const res = await depreciateAllFixedAssets()
      const d = res.data
      showToast(`Depreciated ${d.assets_depreciated} assets for $${fmt(d.total_amount)} (${d.period})`)
      loadAssets()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error running bulk depreciation', 'error')
    }
  }

  // ── Dispose ──
  const openDisposeModal = (asset) => {
    setDisposeTarget(asset)
    setDisposeForm({ disposal_date: today(), disposal_amount: '0', disposal_method: 'sold' })
  }

  const handleDispose = async () => {
    if (!disposeTarget) return
    setSubmitting(true)
    try {
      await disposeFixedAsset(disposeTarget.id, {
        disposal_date: disposeForm.disposal_date,
        disposal_amount: parseFloat(disposeForm.disposal_amount || '0'),
        disposal_method: disposeForm.disposal_method,
      })
      showToast(`Asset "${disposeTarget.name}" disposed`)
      setDisposeTarget(null)
      loadAssets()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error disposing asset', 'error')
    } finally { setSubmitting(false) }
  }

  // ════════════════════════════════════════
  // DETAIL VIEW
  // ════════════════════════════════════════
  if (mode === 'detail' && detail) {
    const schedule = detail.depreciation_schedule || []
    return (
      <div>
        {toast && <Toast {...toast} onClose={hideToast} />}

        {/* Header strip */}
        <div className="bg-lvf-dark/30 border-b border-lvf-border" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 8px',
        }}>
          <button className="glass-button-secondary text-sm" style={{ padding: '2px 8px' }} onClick={goBackToList}>
            &#9664; Back to List
          </button>
          <span style={{ fontSize: '9pt', fontWeight: 600 }}>Asset Detail</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {!detail.is_disposed && (
              <>
                <button className="glass-button-primary text-sm" style={{ padding: '2px 8px', fontSize: '8pt' }}
                  onClick={() => openEdit(detail)}>Edit</button>
                <button className="glass-button-primary text-sm" style={{ padding: '2px 8px', fontSize: '8pt' }}
                  onClick={() => handleDepreciateSingle(detail)}>Depreciate</button>
                <button className="glass-button-danger text-sm" style={{ padding: '2px 8px', fontSize: '8pt' }}
                  onClick={() => openDisposeModal(detail)}>Dispose</button>
              </>
            )}
          </div>
        </div>

        {/* Asset Info Card */}
        <div className="glass-card p-4 m-2">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <h2 style={{ fontSize: '14pt', fontWeight: 700, margin: '0 0 4px 0' }}>{detail.name}</h2>
              <div style={{ fontSize: '9pt', color: '#94a3b8' }}>
                {detail.asset_number} | {categoryLabel(detail.category)}
                {detail.location && ` | ${detail.location}`}
                {detail.serial_number && ` | S/N: ${detail.serial_number}`}
              </div>
            </div>
            <StatusBadge disposed={detail.is_disposed} />
          </div>

          {detail.description && (
            <p style={{ fontSize: '9pt', color: '#94a3b8', marginBottom: 12 }}>{detail.description}</p>
          )}

          {/* Summary Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 16 }}>
            <InfoBox label="Acquisition Date" value={detail.acquisition_date} />
            <InfoBox label="Cost" value={`$${fmt(detail.acquisition_cost)}`} />
            <InfoBox label="Salvage Value" value={`$${fmt(detail.salvage_value)}`} />
            <InfoBox label="Useful Life" value={`${detail.useful_life_years} years`} />
            <InfoBox label="Method" value={deprMethodLabel(detail.depreciation_method)} />
            <InfoBox label="Accum. Depreciation" value={`$${fmt(detail.accumulated_depreciation)}`} highlight />
            <InfoBox label="Book Value" value={`$${fmt(detail.book_value)}`} highlight />
            {detail.vendor_name && <InfoBox label="Vendor" value={detail.vendor_name} />}
          </div>

          {/* Disposal Info */}
          {detail.is_disposed && (
            <div className="border border-red-500/30 rounded-lg p-3 mb-4 bg-red-500/5">
              <div style={{ fontSize: '9pt', fontWeight: 600, color: '#f87171', marginBottom: 4 }}>DISPOSED</div>
              <div style={{ display: 'flex', gap: 16, fontSize: '9pt' }}>
                <span>Date: {detail.disposal_date}</span>
                <span>Amount: ${fmt(detail.disposal_amount)}</span>
                <span>Method: {detail.disposal_method}</span>
              </div>
            </div>
          )}

          {/* Depreciation Schedule */}
          <div style={{ marginTop: 8 }}>
            <h3 style={{ fontSize: '10pt', fontWeight: 700, marginBottom: 8 }}>Depreciation Schedule</h3>
            {schedule.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: '9pt', textAlign: 'center', padding: 16 }}>
                No depreciation recorded yet. Click "Depreciate" to run the first period.
              </p>
            ) : (
              <table className="glass-table w-full">
                <thead><tr>
                  <th>Period</th>
                  <th style={{ textAlign: 'right' }}>Depreciation</th>
                  <th style={{ textAlign: 'right' }}>Accumulated</th>
                  <th style={{ textAlign: 'right' }}>Book Value</th>
                  <th style={{ textAlign: 'center' }}>Posted</th>
                </tr></thead>
                <tbody>
                  {schedule.map(rec => (
                    <tr key={rec.id}>
                      <td>{rec.period_date}</td>
                      <td style={{ textAlign: 'right' }}>${fmt(rec.depreciation_amount)}</td>
                      <td style={{ textAlign: 'right' }}>${fmt(rec.accumulated_depreciation)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>${fmt(rec.book_value)}</td>
                      <td style={{ textAlign: 'center' }}>
                        {rec.is_posted
                          ? <span style={{ color: '#4ade80', fontSize: '9pt' }}>Yes</span>
                          : <span style={{ color: '#94a3b8', fontSize: '9pt' }}>No</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Dispose modal (also accessible from detail) */}
        {disposeTarget && <DisposeModal
          target={disposeTarget} form={disposeForm} setForm={setDisposeForm}
          submitting={submitting} onDispose={handleDispose} onClose={() => setDisposeTarget(null)} />}
      </div>
    )
  }

  // ════════════════════════════════════════
  // CREATE / EDIT VIEW
  // ════════════════════════════════════════
  if (mode === 'create' || mode === 'edit') {
    return (
      <div>
        {toast && <Toast {...toast} onClose={hideToast} />}

        {/* Header strip */}
        <div className="bg-lvf-dark/30 border-b border-lvf-border" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 8px',
        }}>
          <button className="glass-button-secondary text-sm" style={{ padding: '2px 8px' }} onClick={goBackToList}>
            &#9664; Back to List
          </button>
          <span style={{ fontSize: '9pt', fontWeight: 600 }}>{editId ? 'Edit Fixed Asset' : 'New Fixed Asset'}</span>
        </div>

        <div className="glass-card p-4 m-2">
          {/* Top row: Name + Asset # */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: '8pt', fontWeight: 600, display: 'block', marginBottom: 2 }}>ASSET NAME</label>
              <input className="glass-input text-sm" value={form.name}
                onChange={e => updateField('name', e.target.value)}
                placeholder="e.g. Moba Omnia egg grader, John Deere 6120M..." style={{ fontSize: '10pt', fontWeight: 600 }} />
            </div>
            <div>
              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Asset # (auto if blank)</label>
              <input className="glass-input text-sm" value={form.asset_number}
                onChange={e => updateField('asset_number', e.target.value)} placeholder="FA-00001" />
            </div>
          </div>

          {/* Description */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Description</label>
            <input className="glass-input text-sm" value={form.description}
              onChange={e => updateField('description', e.target.value)}
              placeholder="Details about this asset..." />
          </div>

          {/* Category + Method row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Category</label>
              <select className="glass-input text-sm" value={form.category}
                onChange={e => updateField('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Depreciation Method</label>
              <select className="glass-input text-sm" value={form.depreciation_method}
                onChange={e => updateField('depreciation_method', e.target.value)}>
                {DEPR_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>

          {/* Financial row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Acquisition Date</label>
              <input className="glass-input text-sm" type="date" value={form.acquisition_date}
                onChange={e => updateField('acquisition_date', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Cost ($)</label>
              <input className="glass-input text-sm" type="number" step="0.01" min="0" value={form.acquisition_cost}
                onChange={e => updateField('acquisition_cost', e.target.value)} style={{ textAlign: 'right' }}
                placeholder="0.00" />
            </div>
            <div>
              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Salvage Value ($)</label>
              <input className="glass-input text-sm" type="number" step="0.01" min="0" value={form.salvage_value}
                onChange={e => updateField('salvage_value', e.target.value)} style={{ textAlign: 'right' }}
                placeholder="0.00" />
            </div>
            <div>
              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Useful Life (years)</label>
              <input className="glass-input text-sm" type="number" min="1" value={form.useful_life_years}
                onChange={e => updateField('useful_life_years', e.target.value)} style={{ textAlign: 'right' }} />
            </div>
          </div>

          {/* Location / Serial / Vendor row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Location</label>
              <input className="glass-input text-sm" value={form.location}
                onChange={e => updateField('location', e.target.value)}
                placeholder="e.g. Barn 3, Main Farm, Egg Room..." />
            </div>
            <div>
              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Serial Number</label>
              <input className="glass-input text-sm" value={form.serial_number}
                onChange={e => updateField('serial_number', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Vendor</label>
              <input className="glass-input text-sm" list="fa-vendor-list" value={form.vendor_name}
                onChange={e => updateField('vendor_name', e.target.value)}
                placeholder="Equipment supplier..." />
              <datalist id="fa-vendor-list">
                {vendors.map((v, i) => <option key={i} value={v.name || v.vendor_name} />)}
              </datalist>
            </div>
          </div>

          {/* Flock assignment */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Assign to Flock (optional)</label>
              <select className="glass-input text-sm" value={form.flock_id}
                onChange={e => updateField('flock_id', e.target.value)}>
                <option value="">-- No Flock --</option>
                {flocks.map(f => (
                  <option key={f.id || f.flock_id} value={f.id || f.flock_id}>
                    {f.flock_number || f.name} {f.grower_name ? `- ${f.grower_name}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Notes</label>
            <textarea className="glass-input text-sm" rows={2} value={form.notes}
              onChange={e => updateField('notes', e.target.value)}
              placeholder="Maintenance history, warranty info, etc." />
          </div>

          {/* Footer Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8 }}>
            <button type="button" onClick={() => setForm(initialForm())} className="glass-button-secondary text-sm">Revert</button>
            <button type="button" onClick={handleSave} disabled={submitting} className="glass-button-primary text-sm">
              {submitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════
  // LIST VIEW
  // ════════════════════════════════════════
  const filterTabs = [
    { key: 'all', label: 'All' },
    { key: 'machinery', label: 'Machinery' },
    { key: 'vehicles', label: 'Vehicles' },
    { key: 'buildings', label: 'Buildings' },
    { key: 'equipment', label: 'Equipment' },
    { key: 'disposed', label: 'Disposed' },
  ]

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      <div className="glass-card p-4 m-2">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: '14pt', fontWeight: 700, margin: 0 }}>Fixed Assets — Farm Equipment & Property</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="glass-button-secondary text-sm" onClick={handleDepreciateAll}>
              Run Monthly Depreciation
            </button>
            <button className="glass-button-primary text-sm" onClick={openCreate}>+ New Asset</button>
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
            <SummaryCard label="Total Cost" value={`$${fmt(summary.total_cost)}`} color="#60a5fa" />
            <SummaryCard label="Accum. Depreciation" value={`$${fmt(summary.total_accumulated_depreciation)}`} color="#f59e0b" />
            <SummaryCard label="Total Book Value" value={`$${fmt(summary.total_book_value)}`} color="#4ade80" />
            <SummaryCard label="Asset Count" value={`${summary.active_count} active / ${summary.disposed_count} disposed`} color="#a78bfa" />
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-1 px-2 mb-3">
          {filterTabs.map(tab => (
            <button key={tab.key}
              className={filterTab === tab.key
                ? 'bg-lvf-dark/60 text-lvf-accent font-semibold px-3 py-1.5 text-sm rounded-t-lg border border-lvf-border border-b-0'
                : 'px-3 py-1.5 text-sm text-lvf-muted hover:text-lvf-text cursor-pointer'}
              onClick={() => setFilterTab(tab.key)}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <p style={{ textAlign: 'center', padding: 20, color: '#999' }}>Loading fixed assets...</p>
        ) : assets.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 20, color: '#999' }}>
            No fixed assets found. Click "New Asset" to add farm equipment, vehicles, or buildings.
          </p>
        ) : (
          <table className="glass-table w-full">
            <thead>
              <tr>
                <th>Asset #</th>
                <th>Name</th>
                <th>Category</th>
                <th>Acq. Date</th>
                <th style={{ textAlign: 'right' }}>Cost</th>
                <th style={{ textAlign: 'right' }}>Accum. Depr.</th>
                <th style={{ textAlign: 'right' }}>Book Value</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {assets.map(a => (
                <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(a)}>
                  <td style={{ fontWeight: 600 }}>{a.asset_number}</td>
                  <td>{a.name}</td>
                  <td style={{ color: '#94a3b8' }}>{categoryLabel(a.category)}</td>
                  <td style={{ color: '#94a3b8' }}>{a.acquisition_date}</td>
                  <td style={{ textAlign: 'right' }}>${fmt(a.acquisition_cost)}</td>
                  <td style={{ textAlign: 'right', color: '#f59e0b' }}>${fmt(a.accumulated_depreciation)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>${fmt(a.book_value)}</td>
                  <td style={{ textAlign: 'center' }}><StatusBadge disposed={a.is_disposed} /></td>
                  <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'inline-flex', gap: 4 }}>
                      {!a.is_disposed && (
                        <>
                          <button className="glass-button-primary text-sm"
                            style={{ padding: '2px 6px', fontSize: '8pt' }}
                            onClick={() => openEdit(a)}>Edit</button>
                          <button className="glass-button-secondary text-sm"
                            style={{ padding: '2px 6px', fontSize: '8pt' }}
                            onClick={() => handleDepreciateSingle(a)}>Depr.</button>
                          <button className="glass-button-danger text-sm"
                            style={{ padding: '2px 6px', fontSize: '8pt' }}
                            onClick={() => openDisposeModal(a)}>Dispose</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Dispose Modal ── */}
      {disposeTarget && <DisposeModal
        target={disposeTarget} form={disposeForm} setForm={setDisposeForm}
        submitting={submitting} onDispose={handleDispose} onClose={() => setDisposeTarget(null)} />}
    </div>
  )
}


/* ── Helper Components ── */

function SummaryCard({ label, value, color }) {
  return (
    <div className="glass-card rounded-lg p-3" style={{ borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: '8pt', color: '#94a3b8', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: '12pt', fontWeight: 700, color }}>{value}</div>
    </div>
  )
}

function InfoBox({ label, value, highlight }) {
  return (
    <div className="glass-card rounded-lg p-2" style={highlight ? { borderLeft: '3px solid #60a5fa' } : {}}>
      <div style={{ fontSize: '7pt', color: '#94a3b8', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '10pt', fontWeight: highlight ? 700 : 500 }}>{value}</div>
    </div>
  )
}

function DisposeModal({ target, form, setForm, submitting, onDispose, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="glass-card p-4 m-2" style={{ minWidth: 400, maxWidth: 480 }}>
        <h4 className="text-sm font-semibold mb-3">
          Dispose Asset: {target.name}
        </h4>
        <p className="text-xs text-lvf-muted mb-3">
          Asset # {target.asset_number} | Book Value: <span className="font-bold text-lvf-text">${(target.book_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
        </p>

        <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Disposal Date</label>
        <input className="glass-input text-sm" type="date" style={{ width: '100%', marginBottom: 8 }}
          value={form.disposal_date} onChange={e => setForm(prev => ({ ...prev, disposal_date: e.target.value }))} />

        <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Proceeds / Sale Amount ($)</label>
        <input className="glass-input text-sm" type="number" step="0.01" min="0"
          style={{ width: '100%', marginBottom: 8, textAlign: 'right' }}
          value={form.disposal_amount} onChange={e => setForm(prev => ({ ...prev, disposal_amount: e.target.value }))} />

        <label style={{ fontSize: '8pt', color: '#999', display: 'block', marginBottom: 2 }}>Disposal Method</label>
        <select className="glass-input text-sm" style={{ width: '100%', marginBottom: 12 }}
          value={form.disposal_method} onChange={e => setForm(prev => ({ ...prev, disposal_method: e.target.value }))}>
          {DISPOSAL_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>

        <div className="flex gap-3 justify-end">
          <button className="glass-button-secondary text-sm" onClick={onClose}>Cancel</button>
          <button className="glass-button-danger text-sm" disabled={submitting} onClick={onDispose}>
            {submitting ? 'Disposing...' : 'Record Disposal'}
          </button>
        </div>
      </div>
    </div>
  )
}
