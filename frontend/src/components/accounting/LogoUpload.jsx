import { useState, useEffect, useRef } from 'react'
import { Upload, Trash2, Image } from 'lucide-react'
import { uploadLogo, getLogoUrl } from '../../api/settings'
import useToast from '../../hooks/useToast'
import Toast from '../common/Toast'

export default function LogoUpload() {
  const { toast, showToast, hideToast } = useToast()
  const [logoExists, setLogoExists] = useState(false)
  const [preview, setPreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [logoKey, setLogoKey] = useState(Date.now())
  const fileRef = useRef(null)

  useEffect(() => {
    checkLogo()
  }, [])

  const checkLogo = () => {
    const img = new Image()
    img.onload = () => setLogoExists(true)
    img.onerror = () => setLogoExists(false)
    img.src = `${getLogoUrl()}?t=${logoKey}`
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) {
      setPreview(null)
      return
    }
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file', 'error')
      e.target.value = ''
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('File size must be under 5MB', 'error')
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => setPreview(ev.target.result)
    reader.readAsDataURL(file)
  }

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) {
      showToast('Select an image first', 'error')
      return
    }
    setUploading(true)
    try {
      await uploadLogo(file)
      setLogoKey(Date.now())
      setLogoExists(true)
      setPreview(null)
      if (fileRef.current) fileRef.current.value = ''
      showToast('Logo uploaded successfully')
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to upload logo', 'error')
    } finally {
      setUploading(false)
    }
  }

  const clearPreview = () => {
    setPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <Image size={16} /> Company Logo
      </h3>

      {/* Current Logo */}
      {logoExists && !preview && (
        <div className="mb-4">
          <p className="text-xs text-lvf-muted mb-2">Current Logo</p>
          <div className="inline-block p-3 rounded-xl bg-white/5 border border-lvf-border/20">
            <img
              src={`${getLogoUrl()}?t=${logoKey}`}
              alt="Company Logo"
              style={{ maxWidth: 160, maxHeight: 100, objectFit: 'contain' }}
            />
          </div>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="mb-4">
          <p className="text-xs text-lvf-muted mb-2">Preview</p>
          <div className="inline-block p-3 rounded-xl bg-white/5 border border-lvf-accent/30 relative">
            <img
              src={preview}
              alt="Logo Preview"
              style={{ maxWidth: 160, maxHeight: 100, objectFit: 'contain' }}
            />
            <button
              type="button"
              onClick={clearPreview}
              className="absolute -top-2 -right-2 p-1 rounded-full bg-lvf-danger/80 text-white hover:bg-lvf-danger"
              title="Remove"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      )}

      {!logoExists && !preview && (
        <div className="mb-4 p-6 rounded-xl border-2 border-dashed border-lvf-border/30 text-center">
          <Image size={32} className="mx-auto text-lvf-muted mb-2" />
          <p className="text-sm text-lvf-muted">No logo uploaded yet</p>
        </div>
      )}

      {/* File Input & Upload */}
      <div className="flex items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="glass-input text-sm flex-1"
        />
        <button
          onClick={handleUpload}
          disabled={uploading || !preview}
          className="glass-button-primary flex items-center gap-2"
          style={{ opacity: uploading || !preview ? 0.5 : 1 }}
        >
          <Upload size={14} />
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
      </div>
      <p className="text-[11px] text-lvf-muted mt-2">
        Accepts PNG, JPG, SVG. Max 5MB. Displayed on printed invoices and estimates.
      </p>
    </div>
  )
}
