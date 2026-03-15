import Modal from './Modal'

export default function ConfirmDialog({ isOpen, onClose, onConfirm, title, message }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title || 'Confirm'} size="sm">
      <p className="text-lvf-muted mb-6">{message}</p>
      <div className="flex gap-3 justify-end">
        <button onClick={onClose} className="glass-button-secondary">Cancel</button>
        <button onClick={onConfirm} className="glass-button-danger">Delete</button>
      </div>
    </Modal>
  )
}
