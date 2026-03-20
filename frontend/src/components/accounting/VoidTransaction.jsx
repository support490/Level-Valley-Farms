import { useState } from 'react'
import { voidCheck, voidSalesReceipt, voidRefundReceipt, voidCCCharge, voidInventoryAdjustment } from '../../api/accounting'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'

const typeLabels = {
  invoice: 'Invoice',
  bill: 'Bill',
  check: 'Check',
  'sales-receipt': 'Sales Receipt',
  'refund-receipt': 'Refund Receipt',
  'cc-charge': 'Credit Card Charge',
  'inventory-adjustment': 'Inventory Adjustment',
}

export default function VoidTransaction({ transactionType, transactionId, transactionNumber, onVoided, children }) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  const label = typeLabels[transactionType] || transactionType

  const handleVoid = async () => {
    if (!transactionId || voiding) return
    setVoiding(true)
    try {
      switch (transactionType) {
        case 'invoice':
          // For invoices/bills, void by marking status as cancelled via a generic status update.
          // The backend copyTransaction pattern uses POST; here we use a direct approach.
          await fetch(`/api/accounting/invoices/${transactionId}/void`, { method: 'POST' })
          break
        case 'bill':
          await fetch(`/api/accounting/bills/${transactionId}/void`, { method: 'POST' })
          break
        case 'check':
          await voidCheck(transactionId)
          break
        case 'sales-receipt':
          await voidSalesReceipt(transactionId)
          break
        case 'refund-receipt':
          await voidRefundReceipt(transactionId)
          break
        case 'cc-charge':
          await voidCCCharge(transactionId)
          break
        case 'inventory-adjustment':
          await voidInventoryAdjustment(transactionId)
          break
        default:
          throw new Error(`Unsupported transaction type: ${transactionType}`)
      }
      showToast(`${label} #${transactionNumber || transactionId} voided successfully`)
      setShowConfirm(false)
      if (onVoided) onVoided()
    } catch (err) {
      showToast(err.response?.data?.detail || err.message || `Error voiding ${label}`, 'error')
    } finally {
      setVoiding(false)
    }
  }

  return (
    <>
      {toast && <Toast {...toast} onClose={hideToast} />}

      {/* Trigger element — render children and attach click handler */}
      <span onClick={() => setShowConfirm(true)} style={{ display: 'inline-block' }}>
        {children}
      </span>

      {/* Confirmation modal */}
      {showConfirm && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => !voiding && setShowConfirm(false)}
        >
          <div
            className="glass-card"
            style={{ minWidth: 380, maxWidth: 440, padding: 24 }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '12pt', fontWeight: 700, marginBottom: 8, color: '#ef4444' }}>
              Void {label}
            </h3>
            <p style={{ fontSize: '9pt', color: '#cbd5e1', marginBottom: 16, lineHeight: 1.5 }}>
              Void {label} <strong>#{transactionNumber || transactionId}</strong>?
              <br />
              <span style={{ color: '#f87171' }}>This cannot be undone.</span> The transaction will be marked as void
              and its amounts will be zeroed out.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                className="glass-button-secondary text-sm"
                onClick={() => setShowConfirm(false)}
                disabled={voiding}
              >
                Cancel
              </button>
              <button
                className="glass-button-primary text-sm"
                style={{ background: 'rgba(239,68,68,0.2)', borderColor: 'rgba(239,68,68,0.4)' }}
                onClick={handleVoid}
                disabled={voiding}
              >
                {voiding ? 'Voiding...' : 'Void Transaction'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
