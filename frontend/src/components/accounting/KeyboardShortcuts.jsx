import { useState, useEffect, useCallback } from 'react'

const shortcuts = [
  { keys: 'Ctrl+N', description: 'New Invoice', target: 'create-invoices' },
  { keys: 'Ctrl+B', description: 'Enter Bills', target: 'enter-bills' },
  { keys: 'Ctrl+W', description: 'Write Checks', target: 'write-checks' },
  { keys: 'Ctrl+D', description: 'Make Deposits', target: 'make-deposits' },
  { keys: 'Ctrl+H', description: 'Home', target: 'home' },
  { keys: '?', description: 'Show Shortcuts Help', target: null },
]

export default function KeyboardShortcuts({ onNavigate }) {
  const [showHelp, setShowHelp] = useState(false)

  const handleKeyDown = useCallback((e) => {
    // Don't fire when user is focused on an input, textarea, or select
    const tag = e.target.tagName.toLowerCase()
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return
    if (e.target.isContentEditable) return

    // ? key — show help overlay
    if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      setShowHelp(prev => !prev)
      return
    }

    // Ctrl shortcuts (also handle Cmd on Mac)
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'n':
          e.preventDefault()
          onNavigate('create-invoices')
          break
        case 'b':
          e.preventDefault()
          onNavigate('enter-bills')
          break
        case 'w':
          e.preventDefault()
          onNavigate('write-checks')
          break
        case 'd':
          e.preventDefault()
          onNavigate('make-deposits')
          break
        case 'h':
          e.preventDefault()
          onNavigate('home')
          break
        default:
          break
      }
    }
  }, [onNavigate])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (!showHelp) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={() => setShowHelp(false)}
    >
      <div
        className="glass-card"
        style={{ minWidth: 360, maxWidth: 440, padding: 24 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: '12pt', fontWeight: 700, color: '#60a5fa', margin: 0 }}>
            Keyboard Shortcuts
          </h3>
          <button
            onClick={() => setShowHelp(false)}
            style={{
              background: 'none', border: 'none', color: '#999', cursor: 'pointer',
              fontSize: '14pt', lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>

        <table style={{ width: '100%', fontSize: '9pt' }}>
          <tbody>
            {shortcuts.map((s, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <td style={{ padding: '8px 8px 8px 0', width: 100 }}>
                  <kbd style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 6,
                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                    fontFamily: 'monospace', fontSize: '8pt', fontWeight: 600, color: '#e2e8f0',
                  }}>
                    {s.keys}
                  </kbd>
                </td>
                <td style={{ padding: '8px 0', color: '#cbd5e1' }}>
                  {s.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p style={{ fontSize: '7pt', color: '#666', marginTop: 12, textAlign: 'center' }}>
          Press <kbd style={{
            padding: '1px 5px', borderRadius: 4,
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
            fontFamily: 'monospace', fontSize: '7pt',
          }}>?</kbd> or <kbd style={{
            padding: '1px 5px', borderRadius: 4,
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
            fontFamily: 'monospace', fontSize: '7pt',
          }}>Esc</kbd> to close
        </p>
      </div>
    </div>
  )
}
