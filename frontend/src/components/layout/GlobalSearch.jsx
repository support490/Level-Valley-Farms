import { useState, useRef, useEffect } from 'react'
import { Search, Building2, Warehouse, Bird, Receipt, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { globalSearch } from '../../api/dashboard'

const typeIcons = {
  grower: Building2,
  barn: Warehouse,
  flock: Bird,
  transaction: Receipt,
}

const typeColors = {
  grower: 'text-blue-400',
  barn: 'text-amber-400',
  flock: 'text-green-400',
  transaction: 'text-purple-400',
}

export default function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)
  const containerRef = useRef(null)
  const navigate = useNavigate()
  const debounceRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Keyboard shortcut: Ctrl+K to focus
  useEffect(() => {
    const handleKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === 'Escape') {
        setOpen(false)
        inputRef.current?.blur()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  const handleSearch = (value) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (value.length < 2) {
      setResults([])
      setOpen(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await globalSearch(value)
        setResults(res.data)
        setOpen(true)
      } finally {
        setLoading(false)
      }
    }, 250)
  }

  const handleSelect = (result) => {
    navigate(result.url)
    setOpen(false)
    setQuery('')
    setResults([])
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-lvf-muted/50" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search... (Ctrl+K)"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          className="glass-input pl-9 pr-8 w-72 text-sm py-2"
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]); setOpen(false) }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-white/10">
            <X size={12} className="text-lvf-muted" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute top-full mt-1 w-full glass-card overflow-hidden z-50 max-h-80 overflow-y-auto">
          {results.length > 0 ? (
            results.map((r, i) => {
              const Icon = typeIcons[r.type] || Search
              return (
                <button
                  key={`${r.type}-${r.id}-${i}`}
                  onClick={() => handleSelect(r)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-lvf-glow transition-colors text-left"
                >
                  <Icon size={14} className={typeColors[r.type] || 'text-lvf-muted'} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.title}</p>
                    <p className="text-[11px] text-lvf-muted truncate">{r.subtitle}</p>
                  </div>
                  <span className="text-[10px] text-lvf-muted uppercase">{r.type}</span>
                </button>
              )
            })
          ) : (
            <div className="px-4 py-6 text-center text-sm text-lvf-muted">
              {loading ? 'Searching...' : 'No results found'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
