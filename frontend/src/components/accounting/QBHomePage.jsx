import TransactionHistory from './TransactionHistory'

export default function QBHomePage({ onNavigate }) {
  return (
    <div className="p-3">
      {/* Vendors Section */}
      <div style={{ marginBottom: 16 }}>
        <div className="glass-card rounded-xl mb-2 px-4 py-2 border-l-4 border-l-lvf-accent font-semibold text-sm">VENDORS</div>
        <div className="glass-card p-4 rounded-xl">
          <FlowRow>
            <Node icon="📦" label="Purchase Orders" color="#336699" onClick={() => onNavigate('purchase-orders')} />
            <SvgArrow />
            <Node icon="📋" label="Enter Bills" color="#336699" onClick={() => onNavigate('enter-bills')} />
            <SvgArrow />
            <Node icon="💵" label="Pay Bills" color="#336699" onClick={() => onNavigate('pay-bills')} />
          </FlowRow>
          <div style={{ marginTop: 8, display: 'flex', gap: 12, marginLeft: 4 }}>
            <SmallLink label="Vendor Center" onClick={() => onNavigate('vendor-center')} />
            <SmallLink label="Bill List" onClick={() => onNavigate('bills')} />
          </div>
        </div>
      </div>

      {/* Customers Section */}
      <div style={{ marginBottom: 16 }}>
        <div className="glass-card rounded-xl mb-2 px-4 py-2 border-l-4 border-l-lvf-success font-semibold text-sm">CUSTOMERS</div>
        <div className="glass-card p-4 rounded-xl">
          <FlowRow>
            <Node icon="📝" label="Estimates" color="#2e7d32" onClick={() => onNavigate('estimates')} />
            <SvgArrow />
            <Node icon="📄" label="Create Invoices" color="#2e7d32" onClick={() => onNavigate('create-invoices')} />
            <SvgArrow />
            <Node icon="💰" label="Receive Payments" color="#2e7d32" onClick={() => onNavigate('receive-payments')} />
            <SvgArrow />
            <Node icon="🏦" label="Make Deposits" color="#2e7d32" onClick={() => onNavigate('make-deposits')} />
          </FlowRow>
          <div style={{ marginTop: 8, display: 'flex', gap: 12, marginLeft: 4 }}>
            <SmallLink label="Customer Center" onClick={() => onNavigate('customer-center')} />
            <SmallLink label="Invoice List" onClick={() => onNavigate('invoices')} />
            <SmallLink label="Credit Memos" onClick={() => onNavigate('credit-memos')} />
          </div>
        </div>
      </div>

      {/* Banking Section */}
      <div style={{ marginBottom: 16 }}>
        <div className="glass-card rounded-xl mb-2 px-4 py-2 border-l-4 border-l-lvf-danger font-semibold text-sm">BANKING</div>
        <div className="glass-card p-4 rounded-xl">
          <FlowRow>
            <Node icon="✏️" label="Write Checks" color="#c62828" onClick={() => onNavigate('write-checks')} />
            <Node icon="📒" label="Bank Register" color="#c62828" onClick={() => onNavigate('bank-register')} />
            <Node icon="🏦" label="Make Deposits" color="#c62828" onClick={() => onNavigate('make-deposits')} />
            <Node icon="🔄" label="Transfer Funds" color="#c62828" onClick={() => onNavigate('transfer-funds')} />
          </FlowRow>
          <div style={{ marginTop: 8, display: 'flex', gap: 12, marginLeft: 4 }}>
            <SmallLink label="Bank Accounts" onClick={() => onNavigate('bank')} />
            <SmallLink label="Reconcile" onClick={() => onNavigate('reconcile')} />
          </div>
        </div>
      </div>

      {/* Company Section */}
      <div style={{ marginBottom: 16 }}>
        <div className="glass-card rounded-xl mb-2 px-4 py-2 border-l-4 border-l-lvf-muted font-semibold text-sm">COMPANY</div>
        <div className="glass-card p-4 rounded-xl">
          <FlowRow>
            <Node icon="📊" label="Chart of Accounts" color="#555555" onClick={() => onNavigate('accounts')} />
            <Node icon="📑" label="Items & Services" color="#555555" onClick={() => onNavigate('items-services')} />
            <Node icon="📓" label="Journal Entries" color="#555555" onClick={() => onNavigate('journal')} />
            <Node icon="⚡" label="Quick Expense" color="#555555" onClick={() => onNavigate('quick')} />
            <Node icon="🚜" label="Fixed Assets" color="#555555" onClick={() => onNavigate('fixed-assets')} />
          </FlowRow>
        </div>
      </div>

      {/* Recent Transactions */}
      <div style={{ marginBottom: 16 }}>
        <div className="glass-card rounded-xl mb-2 px-4 py-2 border-l-4 border-l-purple-500/60 font-semibold text-sm">RECENT ACTIVITY</div>
        <TransactionHistory onNavigate={onNavigate} />
      </div>
    </div>
  )
}

/* ── Helper Components ── */

function FlowRow({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {children}
    </div>
  )
}

function Node({ icon, label, color, onClick }) {
  return (
    <div className="glass-card p-3 flex flex-col items-center justify-center min-w-[72px] min-h-[72px] cursor-pointer hover:border-lvf-accent/30 transition text-xs rounded-xl" onClick={onClick}>
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center mb-1"
        style={{ background: color + '18' }}
      >
        <span>{icon}</span>
      </div>
      <span>{label}</span>
    </div>
  )
}

function SvgArrow() {
  return (
    <svg width="24" height="16" viewBox="0 0 24 16" style={{ flexShrink: 0 }}>
      <path d="M2 8 L18 8" stroke="rgba(100,160,255,0.3)" strokeWidth="1.5" fill="none" />
      <path d="M15 4 L20 8 L15 12" stroke="rgba(100,160,255,0.3)" strokeWidth="1.5" fill="none" />
    </svg>
  )
}

function SmallLink({ label, onClick }) {
  return (
    <span
      onClick={onClick}
      className="text-xs text-lvf-accent cursor-pointer hover:text-lvf-accent/80 transition"
    >
      {label}
    </span>
  )
}
