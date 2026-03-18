import { useState, useEffect } from 'react'
import { getPurchaseOrders, convertPOToBill } from '../../api/accounting'
import Toast from '../common/Toast'
import useToast from '../../hooks/useToast'

export default function PurchaseOrders() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [converting, setConverting] = useState(null)
  const { toast, showToast, hideToast } = useToast()

  const load = async () => {
    try {
      const res = await getPurchaseOrders()
      setOrders(res.data || [])
    } catch {
      showToast('Error loading purchase orders', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleConvert = async (po) => {
    if (converting) return
    setConverting(po.id)
    try {
      await convertPOToBill(po.id)
      showToast(`PO ${po.po_number} converted to bill`)
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error converting PO to bill', 'error')
    } finally {
      setConverting(null)
    }
  }

  const statusColors = {
    draft: 'bg-lvf-muted/20 text-lvf-muted',
    submitted: 'bg-lvf-accent/20 text-lvf-accent',
    received: 'bg-lvf-success/20 text-lvf-success',
    cancelled: 'bg-lvf-danger/20 text-lvf-danger',
  }

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      <div className="glass-card p-4 m-2 overflow-hidden">
        <table className="glass-table w-full">
          <thead>
            <tr>
              <th className="text-sm">PO #</th>
              <th className="text-sm">Vendor</th>
              <th className="text-sm">Order Date</th>
              <th className="text-sm">Expected Date</th>
              <th className="text-sm text-right">Total</th>
              <th className="text-sm">Status</th>
              <th className="text-sm w-48">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-lvf-muted text-sm">Loading...</td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-lvf-muted text-sm">No purchase orders.</td>
              </tr>
            ) : (
              orders.map(po => (
                <tr key={po.id}>
                  <td className="font-semibold font-mono text-sm">{po.po_number}</td>
                  <td className="text-sm">{po.vendor_name}</td>
                  <td className="text-lvf-muted text-sm">{po.order_date}</td>
                  <td className="text-lvf-muted text-sm">{po.expected_date}</td>
                  <td className="text-right font-mono text-sm">
                    ${(po.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[po.status] || ''}`}>
                      {po.status}
                    </span>
                  </td>
                  <td>
                    {po.status !== 'received' && po.status !== 'cancelled' && (
                      <button
                        onClick={() => handleConvert(po)}
                        disabled={converting === po.id}
                        className="glass-button-primary text-sm"
                      >
                        {converting === po.id ? 'Converting...' : 'Receive Items & Create Bill'}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
