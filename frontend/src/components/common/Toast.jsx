import { useEffect, useRef } from 'react'
import { CheckCircle, AlertCircle, X } from 'lucide-react'

export default function Toast({ message, type = 'success', onClose, duration = 3000 }) {
  const timerRef = useRef(null)

  useEffect(() => {
    // Clear any existing timer when message changes
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(onClose, duration)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [message, type, duration])

  if (!message) return null

  const styles = {
    success: 'border-lvf-success/30 bg-lvf-success/10 text-lvf-success',
    error: 'border-lvf-danger/30 bg-lvf-danger/10 text-lvf-danger',
  }

  return (
    <div className={`fixed top-4 right-4 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-xl ${styles[type]}`}
      role="alert">
      {type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} aria-label="Close notification"><X size={14} /></button>
    </div>
  )
}
