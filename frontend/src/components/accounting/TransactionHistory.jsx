import { useState, useEffect } from 'react'
import { getInvoices, getBills, getChecks } from '../../api/accounting'

const typeBadge = {
  invoice: { label: 'INV', bg: 'bg-green-500/20', text: 'text-green-300' },
  bill:    { label: 'BILL', bg: 'bg-blue-500/20', text: 'text-blue-300' },
  check:   { label: 'CHK', bg: 'bg-red-500/20', text: 'text-red-300' },
}

const filterTabs = [
  { key: 'all', label: 'All' },
  { key: 'invoice', label: 'Invoices' },
  { key: 'bill', label: 'Bills' },
  { key: 'check', label: 'Checks' },
]

export default function TransactionHistory({ onNavigate }) {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => { loadTransactions() }, [])

  const loadTransactions = async () => {
    setLoading(true)
    try {
      const [invRes, billRes, checkRes] = await Promise.all([
        getInvoices({ limit: 20 }),
        getBills({ limit: 20 }),
        getChecks({ limit: 20 }),
      ])

      const invoices = (invRes.data || []).map(inv => ({
        id: inv.id,
        type: 'invoice',
        number: inv.invoice_number || inv.id,
        date: inv.invoice_date || inv.created_at,
        name: inv.buyer || inv.customer || '-',
        amount: inv.amount || 0,
        navigateTo: 'create-invoices',
      }))

      const bills = (billRes.data || []).map(b => ({
        id: b.id,
        type: 'bill',
        number: b.bill_number || b.id,
        date: b.bill_date || b.created_at,
        name: b.vendor_name || b.vendor || '-',
        amount: b.amount || 0,
        navigateTo: 'enter-bills',
      }))

      const checks = (checkRes.data || []).map(c => ({
        id: c.id,
        type: 'check',
        number: c.check_number || c.id,
        date: c.check_date || c.created_at,
        name: c.payee_name || c.payee || '-',
        amount: c.amount || 0,
        navigateTo: 'write-checks',
      }))

      const merged = [...invoices, ...bills, ...checks]
        .sort((a, b) => {
          const da = a.date ? new Date(a.date) : new Date(0)
          const db = b.date ? new Date(b.date) : new Date(0)
          return db - da
        })
        .slice(0, 60)

      setTransactions(merged)
    } catch {
      setTransactions([])
    } finally {
      setLoading(false)
    }
  }

  const filtered = transactions.filter(t => {
    if (activeFilter !== 'all' && t.type !== activeFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const matchNum = String(t.number).toLowerCase().includes(q)
      const matchName = String(t.name).toLowerCase().includes(q)
      if (!matchNum && !matchName) return false
    }
    return true
  })

  const handleClick = (tx) => {
    if (onNavigate) onNavigate(tx.navigateTo)
  }

  return (
    <div className="glass-card p-4 rounded-xl">
      <h3 style={{ fontSize: '11pt', fontWeight: 700, marginBottom: 10 }}>Recent Transactions</h3>

      {/* Search */}
      <input
        className="glass-input text-sm w-full"
        placeholder="Search by number or name..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ marginBottom: 8 }}
      />

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {filterTabs.map(tab => (
          <button
            key={tab.key}
            className={activeFilter === tab.key
              ? 'bg-lvf-accent/20 text-lvf-accent font-semibold px-3 py-1 text-xs rounded-lg border border-lvf-accent/30'
              : 'px-3 py-1 text-xs text-lvf-muted hover:text-lvf-text hover:bg-white/5 rounded-lg cursor-pointer'
            }
            onClick={() => setActiveFilter(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Transaction list */}
      {loading ? (
        <p style={{ textAlign: 'center', padding: 16, color: '#999', fontSize: '9pt' }}>Loading transactions...</p>
      ) : filtered.length === 0 ? (
        <p style={{ textAlign: 'center', padding: 16, color: '#999', fontSize: '9pt' }}>No transactions found.</p>
      ) : (
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          <table className="glass-table w-full" style={{ fontSize: '8pt' }}>
            <thead>
              <tr>
                <th style={{ width: '14%' }}>Type</th>
                <th style={{ width: '18%' }}>#</th>
                <th style={{ width: '18%' }}>Date</th>
                <th style={{ width: '28%' }}>Name</th>
                <th style={{ width: '22%', textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tx, idx) => {
                const badge = typeBadge[tx.type] || typeBadge.invoice
                return (
                  <tr key={`${tx.type}-${tx.id}-${idx}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleClick(tx)}
                    className="hover:bg-lvf-accent/5"
                  >
                    <td>
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[7pt] font-semibold ${badge.bg} ${badge.text}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{tx.number}</td>
                    <td style={{ color: '#999' }}>{tx.date || '-'}</td>
                    <td style={{
                      maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{tx.name}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      ${Number(tx.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
