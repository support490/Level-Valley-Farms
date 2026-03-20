import { useState, useEffect, Fragment } from 'react'
import { RefreshCw, Printer, Mail, ChevronDown, ChevronRight, FileText, Users } from 'lucide-react'
import {
  getCustomerStatement,
  getBatchCustomerStatements,
  emailBatchStatements,
} from '../../api/reports'
import { getBuyers } from '../../api/accounting'
import Toast from '../common/Toast'
import useToast from '../../hooks/useToast'

const TYPE_BADGES = {
  Invoice: { color: 'text-blue-400', bg: 'bg-blue-400/15 border-blue-400/30' },
  Payment: { color: 'text-lvf-success', bg: 'bg-lvf-success/15 border-lvf-success/30' },
  Credit: { color: 'text-purple-400', bg: 'bg-purple-400/15 border-purple-400/30' },
  Deposit: { color: 'text-lvf-accent', bg: 'bg-lvf-accent/15 border-lvf-accent/30' },
}

const AGING_BUCKETS = [
  { key: 'current', label: 'Current', color: 'text-lvf-success', bg: 'bg-lvf-success/10 border-lvf-success/20' },
  { key: 'over_30', label: '1-30 Days', color: 'text-lvf-accent', bg: 'bg-lvf-accent/10 border-lvf-accent/20' },
  { key: 'over_60', label: '31-60 Days', color: 'text-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/20' },
  { key: 'over_90', label: '61-90 Days', color: 'text-orange-400', bg: 'bg-orange-400/10 border-orange-400/20' },
]

function getDefaultDateFrom() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function getDefaultDateTo() {
  return new Date().toISOString().slice(0, 10)
}

export default function CustomerStatements() {
  const [mode, setMode] = useState('single')
  const [dateFrom, setDateFrom] = useState(getDefaultDateFrom)
  const [dateTo, setDateTo] = useState(getDefaultDateTo)
  const [buyers, setBuyers] = useState([])
  const [selectedBuyer, setSelectedBuyer] = useState('')
  const [statement, setStatement] = useState(null)
  const [batchData, setBatchData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [emailing, setEmailing] = useState(false)
  const [expandedCustomers, setExpandedCustomers] = useState({})
  const { toast, showToast, hideToast } = useToast()

  const fmt = (val) => {
    if (val == null || val === 0) return '$0.00'
    if (val < 0) return `($${Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2 })})`
    return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
  }

  useEffect(() => {
    loadBuyers()
  }, [])

  const loadBuyers = async () => {
    try {
      const res = await getBuyers()
      setBuyers(res.data || [])
    } catch {
      // Buyers list may not be available
    }
  }

  const generateSingle = async () => {
    if (!selectedBuyer) {
      showToast('Select an egg buyer first', 'error')
      return
    }
    setLoading(true)
    setStatement(null)
    try {
      const res = await getCustomerStatement(selectedBuyer, dateFrom, dateTo)
      setStatement(res.data)
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error generating statement', 'error')
    } finally {
      setLoading(false)
    }
  }

  const generateBatch = async () => {
    setLoading(true)
    setBatchData(null)
    setExpandedCustomers({})
    try {
      const res = await getBatchCustomerStatements(dateFrom, dateTo)
      setBatchData(res.data)
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error generating batch statements', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleEmailAll = async () => {
    setEmailing(true)
    try {
      const res = await emailBatchStatements(dateFrom, dateTo)
      const d = res.data
      showToast(
        `Emailed ${d.sent} statement${d.sent !== 1 ? 's' : ''}. ` +
        `${d.skipped} skipped (no email). ${d.failed} failed.`,
        d.failed > 0 ? 'error' : 'success'
      )
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error emailing statements', 'error')
    } finally {
      setEmailing(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const toggleExpanded = (name) => {
    setExpandedCustomers(prev => ({ ...prev, [name]: !prev[name] }))
  }

  const expandAll = () => {
    if (!batchData) return
    const all = {}
    batchData.statements.forEach(s => { all[s.customer_name] = true })
    setExpandedCustomers(all)
  }

  const collapseAll = () => {
    setExpandedCustomers({})
  }

  // ── Render a single statement table ──
  const renderStatementTable = (stmt) => (
    <div className="space-y-4">
      {/* Statement Header */}
      <div className="glass-card p-4 bg-lvf-dark/30">
        <h3 className="font-semibold text-center text-lg">Level Valley Farms</h3>
        <p className="text-center text-sm text-lvf-muted">Statement of Account</p>
        <p className="text-center text-lvf-accent font-medium mt-1">{stmt.customer_name}</p>
        <div className="flex justify-center gap-6 mt-2 text-xs text-lvf-muted">
          <span>Statement Date: {stmt.statement_date}</span>
          <span>Period: {stmt.date_from} to {stmt.date_to}</span>
        </div>
      </div>

      {/* Beginning Balance */}
      <div className="glass-card p-3 flex justify-between items-center">
        <span className="text-sm text-lvf-muted">Beginning Balance</span>
        <span className="font-mono font-semibold text-lg">{fmt(stmt.beginning_balance)}</span>
      </div>

      {/* Transaction Table */}
      <div className="glass-card overflow-hidden">
        <table className="w-full glass-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Number</th>
              <th>Description</th>
              <th className="text-right">Charges</th>
              <th className="text-right">Payments</th>
              <th className="text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {(stmt.transactions || []).map((txn, idx) => {
              const badge = TYPE_BADGES[txn.type] || TYPE_BADGES.Invoice
              return (
                <tr key={idx}>
                  <td className="text-lvf-muted">{txn.date}</td>
                  <td>
                    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded border ${badge.bg} ${badge.color}`}>
                      {txn.type}
                    </span>
                  </td>
                  <td className="font-mono text-xs">{txn.number}</td>
                  <td className="text-sm">{txn.description}</td>
                  <td className="text-right font-mono">
                    {txn.charges ? fmt(txn.charges) : ''}
                  </td>
                  <td className="text-right font-mono text-lvf-success">
                    {txn.payments ? fmt(txn.payments) : ''}
                  </td>
                  <td className="text-right font-mono font-medium">{fmt(txn.balance)}</td>
                </tr>
              )
            })}
            {(stmt.transactions || []).length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-lvf-muted">
                  No transactions in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Ending Balance */}
      <div className="glass-card p-4 flex justify-between items-center bg-lvf-dark/40">
        <span className="font-semibold text-lg">Balance Due</span>
        <span className={`font-mono font-bold text-2xl ${stmt.ending_balance > 0 ? 'text-lvf-danger' : 'text-lvf-success'}`}>
          {fmt(stmt.ending_balance)}
        </span>
      </div>

      {/* Aging Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {AGING_BUCKETS.map(b => (
          <div key={b.key} className={`glass-card p-3 text-center border ${b.bg}`}>
            <p className="text-xs text-lvf-muted mb-1">{b.label}</p>
            <p className={`text-lg font-bold font-mono ${b.color}`}>
              {fmt(stmt.aging?.[b.key] || 0)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      {/* Page Header */}
      <div className="glass-card p-4 mb-4 bg-lvf-dark/30">
        <h3 className="font-semibold text-center text-lg">Customer Statements</h3>
        <p className="text-center text-sm text-lvf-muted">Egg Buyer Account Activity</p>
      </div>

      {/* Controls Row */}
      <div className="glass-card p-4 mb-4 space-y-4">
        {/* Date Range */}
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs text-lvf-muted mb-1">From</label>
            <input
              type="date"
              className="glass-input"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-lvf-muted mb-1">To</label>
            <input
              type="date"
              className="glass-input"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
            />
          </div>
        </div>

        {/* Mode Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => { setMode('single'); setBatchData(null) }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              mode === 'single'
                ? 'bg-lvf-accent/20 text-lvf-accent border border-lvf-accent/40'
                : 'glass-button-secondary'
            }`}
          >
            <FileText size={14} />
            Single Egg Buyer
          </button>
          <button
            onClick={() => { setMode('batch'); setStatement(null) }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              mode === 'batch'
                ? 'bg-lvf-accent/20 text-lvf-accent border border-lvf-accent/40'
                : 'glass-button-secondary'
            }`}
          >
            <Users size={14} />
            All Egg Buyers (Batch)
          </button>
        </div>

        {/* Mode-specific controls */}
        {mode === 'single' && (
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-lvf-muted mb-1">Egg Buyer</label>
              <select
                className="glass-input w-full"
                value={selectedBuyer}
                onChange={e => setSelectedBuyer(e.target.value)}
              >
                <option value="">Select egg buyer...</option>
                {buyers.map(b => (
                  <option key={b.id} value={b.name}>{b.name}</option>
                ))}
              </select>
            </div>
            <button
              onClick={generateSingle}
              className="glass-button-primary flex items-center gap-2"
              disabled={loading || !selectedBuyer}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Generate Statement
            </button>
          </div>
        )}

        {mode === 'batch' && (
          <div className="flex flex-wrap gap-3">
            <button
              onClick={generateBatch}
              className="glass-button-primary flex items-center gap-2"
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Generate All Statements
            </button>
            {batchData && (
              <>
                <button
                  onClick={handleEmailAll}
                  className="glass-button-secondary flex items-center gap-2"
                  disabled={emailing}
                >
                  <Mail size={14} className={emailing ? 'animate-pulse' : ''} />
                  {emailing ? 'Sending...' : 'Email All Statements'}
                </button>
                <button
                  onClick={handlePrint}
                  className="glass-button-secondary flex items-center gap-2"
                >
                  <Printer size={14} />
                  Print All
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Single Customer Statement ── */}
      {mode === 'single' && statement && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={handlePrint} className="glass-button-secondary flex items-center gap-2">
              <Printer size={14} />
              Print
            </button>
          </div>
          {renderStatementTable(statement)}
        </div>
      )}

      {/* ── Batch Statements ── */}
      {mode === 'batch' && batchData && (
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="glass-card p-4 text-center border bg-lvf-accent/10 border-lvf-accent/20">
              <p className="text-xs text-lvf-muted mb-1">Total Egg Buyers</p>
              <p className="text-2xl font-bold font-mono text-lvf-accent">
                {batchData.summary?.total_customers || 0}
              </p>
            </div>
            <div className="glass-card p-4 text-center border bg-lvf-danger/10 border-lvf-danger/20">
              <p className="text-xs text-lvf-muted mb-1">Total Balance Owed</p>
              <p className="text-2xl font-bold font-mono text-lvf-danger">
                {fmt(batchData.summary?.total_balance || 0)}
              </p>
            </div>
          </div>

          {/* Expand/Collapse controls */}
          <div className="flex gap-2 justify-end">
            <button onClick={expandAll} className="text-xs text-lvf-accent hover:underline">
              Expand All
            </button>
            <span className="text-lvf-muted">|</span>
            <button onClick={collapseAll} className="text-xs text-lvf-accent hover:underline">
              Collapse All
            </button>
          </div>

          {/* Accordion list */}
          {(batchData.statements || []).map(stmt => {
            const isExpanded = expandedCustomers[stmt.customer_name]
            return (
              <div key={stmt.customer_name} className="glass-card overflow-hidden">
                {/* Accordion Header */}
                <button
                  onClick={() => toggleExpanded(stmt.customer_name)}
                  className="w-full flex items-center justify-between p-4 hover:bg-lvf-dark/20 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded
                      ? <ChevronDown size={16} className="text-lvf-accent" />
                      : <ChevronRight size={16} className="text-lvf-muted" />
                    }
                    <span className="font-semibold">{stmt.customer_name}</span>
                    <span className="text-xs text-lvf-muted">
                      {stmt.transactions?.length || 0} transaction{(stmt.transactions?.length || 0) !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <span className={`font-mono font-bold ${stmt.ending_balance > 0 ? 'text-lvf-danger' : 'text-lvf-success'}`}>
                    {fmt(stmt.ending_balance)}
                  </span>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="p-4 pt-0 border-t border-lvf-border">
                    {renderStatementTable(stmt)}
                  </div>
                )}
              </div>
            )
          })}

          {(batchData.statements || []).length === 0 && (
            <div className="glass-card p-8 text-center text-lvf-muted">
              No egg buyers with balances or activity in this period.
            </div>
          )}
        </div>
      )}

      {/* Loading / Empty state */}
      {loading && (
        <div className="glass-card p-8 text-center text-lvf-muted">
          <RefreshCw size={20} className="animate-spin inline-block mr-2" />
          Generating statements...
        </div>
      )}

      {!loading && !statement && !batchData && (
        <div className="glass-card p-8 text-center text-lvf-muted">
          Select a date range and generate a statement to view egg buyer account activity.
        </div>
      )}
    </div>
  )
}
