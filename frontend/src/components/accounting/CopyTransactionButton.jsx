import { useState } from 'react'
import { copyTransaction } from '../../api/accounting'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'

const typeLabels = {
  invoice: 'invoice',
  bill: 'bill',
  check: 'check',
  estimate: 'estimate',
}

export default function CopyTransactionButton({ transactionType, transactionId, onCopied }) {
  const [copying, setCopying] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  const handleCopy = async () => {
    if (!transactionId || copying) return
    setCopying(true)
    try {
      const res = await copyTransaction(transactionType, transactionId)
      const label = typeLabels[transactionType] || transactionType
      showToast(`Transaction copied — editing new ${label}`)
      if (onCopied) onCopied(res.data)
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error copying transaction', 'error')
    } finally {
      setCopying(false)
    }
  }

  return (
    <>
      {toast && <Toast {...toast} onClose={hideToast} />}
      <button
        className="glass-button-secondary text-sm"
        style={{ padding: '2px 8px' }}
        onClick={handleCopy}
        disabled={copying}
        title={`Copy this ${typeLabels[transactionType] || 'transaction'}`}
      >
        {copying ? 'Copying...' : 'Copy'}
      </button>
    </>
  )
}
