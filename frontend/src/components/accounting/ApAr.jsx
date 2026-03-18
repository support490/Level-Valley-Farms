import { useState, useEffect } from 'react'
import { Plus, DollarSign, CreditCard, Building2 } from 'lucide-react'
import {
  getBills, createBill, payBill,
  getInvoices, createInvoice, payInvoice,
  getAPAging, getARAging,
  getBankAccounts, createBankAccount,
  getGrowerPayments,
} from '../../api/accounting'
import { getShipments } from '../../api/logistics'
import Modal from '../common/Modal'
import SearchSelect from '../common/SearchSelect'
import Toast from '../common/Toast'
import useToast from '../../hooks/useToast'

export default function ApAr({ subTab = 'bills' }) {
  const [bills, setBills] = useState([])
  const [invoices, setInvoices] = useState([])
  const [apAging, setApAging] = useState(null)
  const [arAging, setArAging] = useState(null)
  const [bankAccounts, setBankAccounts] = useState([])
  const [growerPayments, setGrowerPayments] = useState([])

  const [billOpen, setBillOpen] = useState(false)
  const [payBillOpen, setPayBillOpen] = useState(false)
  const [payBillTarget, setPayBillTarget] = useState(null)
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [payInvOpen, setPayInvOpen] = useState(false)
  const [payInvTarget, setPayInvTarget] = useState(null)
  const [bankOpen, setBankOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  const [billForm, setBillForm] = useState({
    bill_number: '', vendor_name: '', bill_date: new Date().toISOString().split('T')[0],
    due_date: '', amount: '', description: '', notes: '',
  })
  const [payForm, setPayForm] = useState({
    payment_date: new Date().toISOString().split('T')[0], amount: '', payment_method: 'check', reference: '',
  })
  const [invForm, setInvForm] = useState({
    buyer: '', invoice_date: new Date().toISOString().split('T')[0], due_date: '', amount: '', description: '',
  })
  const [bankForm, setBankForm] = useState({
    name: '', account_number_last4: '', bank_name: '', account_type: 'checking', balance: '',
  })

  const load = async () => {
    try {
      const [billsRes, invsRes, apRes, arRes, bankRes, growerRes] = await Promise.all([
        getBills(), getInvoices(), getAPAging(), getARAging(), getBankAccounts(), getGrowerPayments(),
      ])
      setBills(billsRes.data || [])
      setInvoices(invsRes.data || [])
      setApAging(apRes.data)
      setArAging(arRes.data)
      setBankAccounts(bankRes.data || [])
      setGrowerPayments(growerRes.data || [])
    } catch { showToast('Error loading data', 'error') }
  }

  useEffect(() => { load() }, [])

  const handleCreateBill = async (e) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      await createBill({ ...billForm, amount: parseFloat(billForm.amount) })
      showToast('Bill created'); setBillOpen(false)
      setBillForm({ bill_number: '', vendor_name: '', bill_date: new Date().toISOString().split('T')[0], due_date: '', amount: '', description: '', notes: '' })
      load()
    } catch (err) { showToast(err.response?.data?.detail || 'Error', 'error') }
    finally { setSubmitting(false) }
  }

  const handlePayBill = async (e) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      await payBill(payBillTarget.id, { ...payForm, amount: parseFloat(payForm.amount) })
      showToast('Payment recorded'); setPayBillOpen(false); setPayBillTarget(null); load()
    } catch (err) { showToast(err.response?.data?.detail || 'Error', 'error') }
    finally { setSubmitting(false) }
  }

  const handleCreateInvoice = async (e) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      await createInvoice({ ...invForm, amount: parseFloat(invForm.amount) })
      showToast('Invoice created'); setInvoiceOpen(false)
      setInvForm({ buyer: '', invoice_date: new Date().toISOString().split('T')[0], due_date: '', amount: '', description: '' })
      load()
    } catch (err) { showToast(err.response?.data?.detail || 'Error', 'error') }
    finally { setSubmitting(false) }
  }

  const handlePayInvoice = async (e) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      await payInvoice(payInvTarget.id, { amount: parseFloat(payForm.amount) })
      showToast('Payment received'); setPayInvOpen(false); setPayInvTarget(null); load()
    } catch (err) { showToast(err.response?.data?.detail || 'Error', 'error') }
    finally { setSubmitting(false) }
  }

  const handleCreateBank = async (e) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      await createBankAccount({ ...bankForm, balance: parseFloat(bankForm.balance) || 0 })
      showToast('Bank account added'); setBankOpen(false)
      setBankForm({ name: '', account_number_last4: '', bank_name: '', account_type: 'checking', balance: '' })
      load()
    } catch (err) { showToast(err.response?.data?.detail || 'Error', 'error') }
    finally { setSubmitting(false) }
  }

  const statusColors = {
    draft: 'bg-lvf-muted/20 text-lvf-muted', received: 'bg-lvf-accent/20 text-lvf-accent',
    sent: 'bg-lvf-accent/20 text-lvf-accent', partial: 'bg-lvf-warning/20 text-lvf-warning',
    paid: 'bg-lvf-success/20 text-lvf-success', overdue: 'bg-lvf-danger/20 text-lvf-danger',
    cancelled: 'bg-lvf-danger/20 text-lvf-danger',
  }

  const AgingSection = ({ data, type }) => {
    if (!data) return null
    const labels = { current: 'Current', '30': '1-30 Days', '60': '31-60 Days', '90': '61-90 Days', '120_plus': '120+ Days' }
    const colors = { current: 'text-lvf-success', '30': 'text-lvf-accent', '60': 'text-lvf-warning', '90': 'text-lvf-danger', '120_plus': 'text-lvf-danger' }
    return (
      <div>
        <div className="grid grid-cols-5 gap-3 mb-4">
          {Object.entries(labels).map(([key, label]) => (
            <div key={key} className="glass-card p-3 text-center">
              <p className="text-[10px] text-lvf-muted">{label}</p>
              <p className={`text-lg font-bold ${colors[key]}`}>${(data.totals[key] || 0).toLocaleString()}</p>
              <p className="text-[10px] text-lvf-muted">{data.buckets[key]?.length || 0} items</p>
            </div>
          ))}
        </div>
        <div className="glass-card p-3 text-right">
          <span className="text-sm text-lvf-muted">Total Outstanding: </span>
          <span className="text-lg font-bold">${data.total_outstanding.toLocaleString()}</span>
        </div>
      </div>
    )
  }

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      {/* ═══════════ BILLS (AP) ═══════════ */}
      {subTab === 'bills' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setBillOpen(true)} className="glass-button-primary flex items-center gap-2"><Plus size={14} /> New Bill</button>
          </div>
          <div className="glass-card overflow-hidden">
            <table className="w-full glass-table">
              <thead><tr><th>Bill #</th><th>Vendor</th><th>Date</th><th>Due</th><th className="text-right">Amount</th><th className="text-right">Paid</th><th className="text-right">Balance</th><th>Status</th><th className="w-16"></th></tr></thead>
              <tbody>
                {bills.map(b => (
                  <tr key={b.id}>
                    <td className="font-semibold font-mono">{b.bill_number}</td>
                    <td>{b.vendor_name}</td>
                    <td className="text-lvf-muted">{b.bill_date}</td>
                    <td className="text-lvf-muted">{b.due_date}</td>
                    <td className="text-right font-mono">${b.amount.toFixed(2)}</td>
                    <td className="text-right font-mono text-lvf-success">${b.amount_paid.toFixed(2)}</td>
                    <td className="text-right font-mono font-medium">${b.balance_due.toFixed(2)}</td>
                    <td><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[b.status] || ''}`}>{b.status}</span></td>
                    <td>{b.balance_due > 0 && (
                      <button onClick={() => { setPayBillTarget(b); setPayForm({ ...payForm, amount: b.balance_due.toFixed(2) }); setPayBillOpen(true) }}
                        className="text-xs text-lvf-accent hover:underline">Pay</button>
                    )}</td>
                  </tr>
                ))}
                {bills.length === 0 && <tr><td colSpan={9} className="text-center py-8 text-lvf-muted">No bills.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════ INVOICES (AR) ═══════════ */}
      {subTab === 'invoices' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setInvoiceOpen(true)} className="glass-button-primary flex items-center gap-2"><Plus size={14} /> New Invoice</button>
          </div>
          <div className="glass-card overflow-hidden">
            <table className="w-full glass-table">
              <thead><tr><th>Invoice #</th><th>Buyer</th><th>Date</th><th>Due</th><th className="text-right">Amount</th><th className="text-right">Paid</th><th className="text-right">Balance</th><th>Status</th><th className="w-16"></th></tr></thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td className="font-semibold text-lvf-accent font-mono">{inv.invoice_number}</td>
                    <td>{inv.buyer}</td>
                    <td className="text-lvf-muted">{inv.invoice_date}</td>
                    <td className="text-lvf-muted">{inv.due_date}</td>
                    <td className="text-right font-mono">${inv.amount.toFixed(2)}</td>
                    <td className="text-right font-mono text-lvf-success">${inv.amount_paid.toFixed(2)}</td>
                    <td className="text-right font-mono font-medium">${inv.balance_due.toFixed(2)}</td>
                    <td><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[inv.status] || ''}`}>{inv.status}</span></td>
                    <td>{inv.balance_due > 0 && (
                      <button onClick={() => { setPayInvTarget(inv); setPayForm({ ...payForm, amount: inv.balance_due.toFixed(2) }); setPayInvOpen(true) }}
                        className="text-xs text-lvf-accent hover:underline">Record Payment</button>
                    )}</td>
                  </tr>
                ))}
                {invoices.length === 0 && <tr><td colSpan={9} className="text-center py-8 text-lvf-muted">No invoices.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════ AGING ═══════════ */}
      {(subTab === 'aging' || subTab === 'aging-ap' || subTab === 'aging-ar') && (
        <div className="space-y-6">
          {subTab !== 'aging-ar' && (
            <div>
              <h4 className="text-sm font-semibold text-lvf-muted mb-3">Accounts Payable Aging</h4>
              <AgingSection data={apAging} type="ap" />
            </div>
          )}
          {subTab !== 'aging-ap' && (
            <div>
              <h4 className="text-sm font-semibold text-lvf-muted mb-3">Accounts Receivable Aging</h4>
              <AgingSection data={arAging} type="ar" />
            </div>
          )}
        </div>
      )}

      {/* ═══════════ BANK ACCOUNTS ═══════════ */}
      {subTab === 'bank' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setBankOpen(true)} className="glass-button-primary flex items-center gap-2"><Plus size={14} /> Add Account</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bankAccounts.map(a => (
              <div key={a.id} className="glass-card p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 size={16} className="text-lvf-accent" />
                  <h4 className="font-semibold">{a.name}</h4>
                </div>
                {a.bank_name && <p className="text-xs text-lvf-muted">{a.bank_name}{a.account_number_last4 ? ` ••••${a.account_number_last4}` : ''}</p>}
                <p className="text-xs text-lvf-muted capitalize mt-1">{a.account_type}</p>
                <p className={`text-2xl font-bold mt-3 ${a.balance >= 0 ? 'text-lvf-success' : 'text-lvf-danger'}`}>
                  ${a.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            ))}
            {bankAccounts.length === 0 && <div className="col-span-full glass-card p-8 text-center text-lvf-muted">No bank accounts.</div>}
          </div>
        </div>
      )}

      {/* ═══════════ GROWER PAYMENTS ═══════════ */}
      {subTab === 'grower' && (
        <div className="glass-card overflow-hidden">
          <table className="w-full glass-table">
            <thead><tr><th>Grower</th><th className="text-right">Barns</th><th className="text-right">Birds</th><th className="text-right">Active Flocks</th><th className="text-right">Outstanding Bills</th></tr></thead>
            <tbody>
              {growerPayments.map(g => (
                <tr key={g.grower_id}>
                  <td className="font-semibold">{g.grower_name}</td>
                  <td className="text-right">{g.num_barns}</td>
                  <td className="text-right font-mono">{g.total_birds.toLocaleString()}</td>
                  <td className="text-right">{g.active_flocks}</td>
                  <td className={`text-right font-mono font-medium ${g.outstanding_bills > 0 ? 'text-lvf-danger' : 'text-lvf-success'}`}>
                    ${g.outstanding_bills.toLocaleString()}
                  </td>
                </tr>
              ))}
              {growerPayments.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-lvf-muted">No grower data.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══════════ MODALS ═══════════ */}

      <Modal isOpen={billOpen} onClose={() => setBillOpen(false)} title="New Bill" size="md">
        <form onSubmit={handleCreateBill} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm text-lvf-muted mb-1">Bill # *</label><input className="glass-input w-full" required value={billForm.bill_number} onChange={e => setBillForm({ ...billForm, bill_number: e.target.value })} /></div>
            <div><label className="block text-sm text-lvf-muted mb-1">Vendor *</label><input className="glass-input w-full" required value={billForm.vendor_name} onChange={e => setBillForm({ ...billForm, vendor_name: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><label className="block text-sm text-lvf-muted mb-1">Bill Date *</label><input className="glass-input w-full" type="date" required value={billForm.bill_date} onChange={e => setBillForm({ ...billForm, bill_date: e.target.value })} /></div>
            <div><label className="block text-sm text-lvf-muted mb-1">Due Date *</label><input className="glass-input w-full" type="date" required value={billForm.due_date} onChange={e => setBillForm({ ...billForm, due_date: e.target.value })} /></div>
            <div><label className="block text-sm text-lvf-muted mb-1">Amount *</label><input className="glass-input w-full" type="number" step="0.01" min="0" required value={billForm.amount} onChange={e => setBillForm({ ...billForm, amount: e.target.value })} /></div>
          </div>
          <div><label className="block text-sm text-lvf-muted mb-1">Description</label><input className="glass-input w-full" value={billForm.description} onChange={e => setBillForm({ ...billForm, description: e.target.value })} /></div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setBillOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">{submitting ? 'Creating...' : 'Create Bill'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={payBillOpen} onClose={() => { setPayBillOpen(false); setPayBillTarget(null) }}
        title={`Pay Bill ${payBillTarget?.bill_number || ''}`} size="sm">
        <form onSubmit={handlePayBill} className="space-y-4">
          <p className="text-sm text-lvf-muted">Balance due: <span className="font-bold text-lvf-text">${payBillTarget?.balance_due.toFixed(2)}</span></p>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm text-lvf-muted mb-1">Date *</label><input className="glass-input w-full" type="date" required value={payForm.payment_date} onChange={e => setPayForm({ ...payForm, payment_date: e.target.value })} /></div>
            <div><label className="block text-sm text-lvf-muted mb-1">Amount *</label><input className="glass-input w-full" type="number" step="0.01" min="0" required value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm text-lvf-muted mb-1">Method</label>
              <select className="glass-input w-full" value={payForm.payment_method} onChange={e => setPayForm({ ...payForm, payment_method: e.target.value })}>
                {['check', 'ach', 'wire', 'cash', 'credit_card', 'other'].map(m => <option key={m} value={m}>{m.replace('_', ' ').toUpperCase()}</option>)}
              </select>
            </div>
            <div><label className="block text-sm text-lvf-muted mb-1">Reference #</label><input className="glass-input w-full" value={payForm.reference} onChange={e => setPayForm({ ...payForm, reference: e.target.value })} /></div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => { setPayBillOpen(false); setPayBillTarget(null) }} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">{submitting ? 'Processing...' : 'Record Payment'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={invoiceOpen} onClose={() => setInvoiceOpen(false)} title="New Invoice" size="md">
        <form onSubmit={handleCreateInvoice} className="space-y-4">
          <div><label className="block text-sm text-lvf-muted mb-1">Buyer *</label><input className="glass-input w-full" required value={invForm.buyer} onChange={e => setInvForm({ ...invForm, buyer: e.target.value })} /></div>
          <div className="grid grid-cols-3 gap-4">
            <div><label className="block text-sm text-lvf-muted mb-1">Invoice Date *</label><input className="glass-input w-full" type="date" required value={invForm.invoice_date} onChange={e => setInvForm({ ...invForm, invoice_date: e.target.value })} /></div>
            <div><label className="block text-sm text-lvf-muted mb-1">Due Date *</label><input className="glass-input w-full" type="date" required value={invForm.due_date} onChange={e => setInvForm({ ...invForm, due_date: e.target.value })} /></div>
            <div><label className="block text-sm text-lvf-muted mb-1">Amount *</label><input className="glass-input w-full" type="number" step="0.01" min="0" required value={invForm.amount} onChange={e => setInvForm({ ...invForm, amount: e.target.value })} /></div>
          </div>
          <div><label className="block text-sm text-lvf-muted mb-1">Description</label><input className="glass-input w-full" value={invForm.description} onChange={e => setInvForm({ ...invForm, description: e.target.value })} /></div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setInvoiceOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">{submitting ? 'Creating...' : 'Create Invoice'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={payInvOpen} onClose={() => { setPayInvOpen(false); setPayInvTarget(null) }}
        title={`Record Payment — ${payInvTarget?.invoice_number || ''}`} size="sm">
        <form onSubmit={handlePayInvoice} className="space-y-4">
          <p className="text-sm text-lvf-muted">Balance due: <span className="font-bold text-lvf-text">${payInvTarget?.balance_due.toFixed(2)}</span></p>
          <div><label className="block text-sm text-lvf-muted mb-1">Amount Received *</label>
            <input className="glass-input w-full" type="number" step="0.01" min="0" required value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => { setPayInvOpen(false); setPayInvTarget(null) }} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">{submitting ? 'Processing...' : 'Record Payment'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={bankOpen} onClose={() => setBankOpen(false)} title="Add Bank Account" size="sm">
        <form onSubmit={handleCreateBank} className="space-y-4">
          <div><label className="block text-sm text-lvf-muted mb-1">Account Name *</label><input className="glass-input w-full" required value={bankForm.name} placeholder="e.g. Operating Account" onChange={e => setBankForm({ ...bankForm, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm text-lvf-muted mb-1">Bank Name</label><input className="glass-input w-full" value={bankForm.bank_name} onChange={e => setBankForm({ ...bankForm, bank_name: e.target.value })} /></div>
            <div><label className="block text-sm text-lvf-muted mb-1">Last 4 Digits</label><input className="glass-input w-full" maxLength={4} value={bankForm.account_number_last4} onChange={e => setBankForm({ ...bankForm, account_number_last4: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm text-lvf-muted mb-1">Type</label>
              <select className="glass-input w-full" value={bankForm.account_type} onChange={e => setBankForm({ ...bankForm, account_type: e.target.value })}>
                <option value="checking">Checking</option><option value="savings">Savings</option><option value="money_market">Money Market</option>
              </select>
            </div>
            <div><label className="block text-sm text-lvf-muted mb-1">Opening Balance</label><input className="glass-input w-full" type="number" step="0.01" value={bankForm.balance} onChange={e => setBankForm({ ...bankForm, balance: e.target.value })} /></div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setBankOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">{submitting ? 'Adding...' : 'Add Account'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
