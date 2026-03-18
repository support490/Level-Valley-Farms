import { useState, useEffect } from 'react'
import {
  Package, Truck, FileText, Calendar, Users, Building2,
  RotateCcw, LayoutGrid, ArrowDownToLine, DollarSign, Tags,
} from 'lucide-react'
import { getInventorySummary, getInventoryValue } from '../api/inventory'
import Toast from '../components/common/Toast'
import useToast from '../hooks/useToast'
import WarehouseTab from '../components/inventory/WarehouseTab'
import BarnInventoryTab from '../components/inventory/BarnInventoryTab'
import Logistics from './Logistics'

const tabs = [
  { id: 'floor', label: 'Floor', icon: LayoutGrid },
  { id: 'receiving', label: 'Receiving', icon: ArrowDownToLine },
  { id: 'shipments', label: 'Shipments', icon: FileText },
  { id: 'pickups', label: 'Pickups', icon: Truck },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'drivers', label: 'Drivers', icon: Users },
  { id: 'carriers', label: 'Carriers', icon: Building2 },
  { id: 'returns', label: 'Returns', icon: RotateCcw },
  { id: 'sales', label: 'Sales', icon: DollarSign },
  { id: 'grades', label: 'Grades', icon: Tags },
]

const logisticsTabs = ['shipments', 'pickups', 'calendar', 'drivers', 'carriers', 'returns']
const warehouseTabs = ['floor', 'receiving', 'sales', 'grades']

export default function WarehouseShipping() {
  const [tab, setTab] = useState('floor')
  const [summary, setSummary] = useState([])
  const [invValue, setInvValue] = useState(null)
  const { toast, showToast, hideToast } = useToast()

  const loadSummary = async () => {
    try {
      const [summaryRes, valueRes] = await Promise.all([
        getInventorySummary(),
        getInventoryValue().catch(() => ({ data: null })),
      ])
      setSummary(summaryRes.data)
      setInvValue(valueRes.data)
    } catch {}
  }

  useEffect(() => { loadSummary() }, [])

  const totalSkids = summary.reduce((sum, s) => sum + s.total_skids_on_hand, 0)
  const totalDozens = summary.reduce((sum, s) => sum + s.total_dozens, 0)

  const isLogisticsTab = logisticsTabs.includes(tab)
  const isWarehouseTab = warehouseTabs.includes(tab)

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      {/* Header with summary stats */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Warehouse & Shipping</h2>
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

      {/* Unified Tabs */}
      <div className="flex gap-1 mb-4 p-1 glass-card w-fit flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
              tab === t.id ? 'bg-lvf-accent/20 text-lvf-accent' : 'text-lvf-muted hover:text-lvf-text hover:bg-white/5'
            }`}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {/* Warehouse tabs — rendered by WarehouseTab with forced sub-tab */}
      {isWarehouseTab && (
        <WarehouseTab showToast={showToast} forceSubTab={tab} />
      )}

      {/* Logistics tabs — rendered by Logistics in embedded mode */}
      {isLogisticsTab && (
        <Logistics embedded activeTab={tab} showToast={showToast} />
      )}
    </div>
  )
}
