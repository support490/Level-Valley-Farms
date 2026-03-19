import { useState, useEffect } from 'react'
import { Package, DollarSign } from 'lucide-react'
import { getInventorySummary, getInventoryValue } from '../api/inventory'
import Toast from '../components/common/Toast'
import useToast from '../hooks/useToast'
import BarnInventoryTab from '../components/inventory/BarnInventoryTab'
import WarehouseTab from '../components/inventory/WarehouseTab'

export default function Inventory() {
  const [tab, setTab] = useState('barn')
  const [summary, setSummary] = useState([])
  const [invValue, setInvValue] = useState(null)
  const { toast, showToast, hideToast } = useToast()

  const loadShared = async () => {
    try {
      const [summaryRes, valueRes] = await Promise.all([
        getInventorySummary(),
        getInventoryValue().catch(() => ({ data: null })),
      ])
      setSummary(summaryRes.data || [])
      setInvValue(valueRes.data)
    } catch {}
  }

  useEffect(() => { loadShared() }, [])

  const totalSkids = summary.reduce((sum, s) => sum + s.total_skids_on_hand, 0)
  const totalDozens = summary.reduce((sum, s) => sum + s.total_dozens, 0)

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      {/* Compact header row: title + stats inline */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Egg Inventory</h2>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <Package size={14} className="text-lvf-accent" />
            <span className="text-lvf-muted">Warehouse:</span>
            <span className="font-bold text-lvf-accent">{totalSkids}</span>
            <span className="text-lvf-muted text-xs">skids ({totalDozens.toLocaleString()} doz)</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <DollarSign size={14} className="text-lvf-success" />
            <span className="font-bold text-lvf-success">
              ${invValue?.total_estimated_value ? invValue.total_estimated_value.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="flex gap-1 mb-4 p-1 glass-card w-fit">
        {[
          { id: 'barn', label: 'Barn Inventory' },
          { id: 'warehouse', label: 'Warehouse' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              tab === t.id ? 'bg-lvf-accent/20 text-lvf-accent' : 'text-lvf-muted hover:text-lvf-text hover:bg-white/5'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'barn' && <BarnInventoryTab showToast={showToast} />}
      {tab === 'warehouse' && <WarehouseTab showToast={showToast} />}
    </div>
  )
}
