import { useState, useEffect, useRef } from 'react'

const menuStructure = [
  { id: 'home', label: 'Home' },
  {
    id: 'vendors', label: 'Vendors', children: [
      { id: 'vendor-center', label: 'Vendor Center' },
      'separator',
      { id: 'purchase-orders', label: 'Purchase Orders' },
      { id: 'enter-bills', label: 'Enter Bills' },
      { id: 'pay-bills', label: 'Pay Bills' },
      'separator',
      { id: 'bills', label: 'Bill List' },
    ],
  },
  {
    id: 'customers', label: 'Customers', children: [
      { id: 'customer-center', label: 'Customer Center' },
      'separator',
      { id: 'estimates', label: 'Estimates' },
      { id: 'create-invoices', label: 'Create Invoices' },
      { id: 'receive-payments', label: 'Receive Payments' },
      { id: 'credit-memos', label: 'Credit Memos' },
      'separator',
      { id: 'invoices', label: 'Invoice List' },
    ],
  },
  {
    id: 'banking', label: 'Banking', children: [
      { id: 'write-checks', label: 'Write Checks' },
      { id: 'make-deposits', label: 'Make Deposits' },
      { id: 'transfer-funds', label: 'Transfer Funds' },
      'separator',
      { id: 'bank-register', label: 'Register' },
      { id: 'reconcile', label: 'Reconcile' },
      { id: 'bank', label: 'Bank Accounts' },
    ],
  },
  {
    id: 'reports', label: 'Reports', children: [
      { id: 'trial', label: 'Trial Balance' },
      { id: 'budgets', label: 'Budget & Analysis' },
      { id: 'aging-ap', label: 'AP Aging' },
      { id: 'aging-ar', label: 'AR Aging' },
      { id: 'grower', label: 'Grower Payments' },
      'separator',
      { id: 'compliance', label: 'Tax & Compliance' },
    ],
  },
  {
    id: 'accounting', label: 'Accounts', children: [
      { id: 'accounts', label: 'Chart of Accounts' },
      { id: 'journal', label: 'Journal Entries' },
      { id: 'quick', label: 'Quick Expense' },
      'separator',
      { id: 'recurring', label: 'Recurring Entries' },
      { id: 'fiscal', label: 'Fiscal Periods' },
    ],
  },
  {
    id: 'lists', label: 'Lists', children: [
      { id: 'vendor-center', label: 'Vendor List' },
      { id: 'customer-center', label: 'Customer List' },
      'separator',
      { id: 'items-services', label: 'Items & Services' },
      { id: 'accounts', label: 'Chart of Accounts' },
    ],
  },
]

const iconToolbarItems = [
  { id: 'home', label: 'Home', icon: '🏠' },
  { id: 'vendor-center', label: 'Vendors', icon: '🏭' },
  { id: 'customer-center', label: 'Customers', icon: '👥' },
  { id: 'enter-bills', label: 'Enter Bills', icon: '📋' },
  { id: 'create-invoices', label: 'Invoices', icon: '📄' },
  { id: 'write-checks', label: 'Checks', icon: '✏️' },
  { id: 'bank-register', label: 'Register', icon: '📒' },
  { id: 'accounts', label: 'Accounts', icon: '📊' },
]

export default function QBToolbar({ activeView, onNavigate }) {
  const [openMenu, setOpenMenu] = useState(null)
  const barRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (barRef.current && !barRef.current.contains(e.target)) {
        setOpenMenu(null)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  function handleMenuClick(item) {
    if (!item.children) {
      onNavigate(item.id)
      setOpenMenu(null)
    } else {
      setOpenMenu(openMenu === item.id ? null : item.id)
    }
  }

  function handleChildClick(childId) {
    onNavigate(childId)
    setOpenMenu(null)
  }

  function handleMenuEnter(itemId) {
    if (openMenu !== null) {
      setOpenMenu(itemId)
    }
  }

  return (
    <>
      {/* Title bar */}
      <div className="glass-card px-4 py-2 rounded-none border-x-0 border-t-0 flex items-center justify-between">
        <span>Level Valley Farms — QuickBooks Accounting</span>
        <span style={{ fontSize: '7pt', opacity: 0.8 }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      </div>

      {/* Menu bar */}
      <div className="flex items-stretch bg-lvf-dark/40 border-b border-lvf-border px-1 h-8 text-sm" ref={barRef}>
        {menuStructure.map(item => (
          <div key={item.id + item.label} onMouseEnter={() => handleMenuEnter(item.id)}>
            <div
              className={`px-3 flex items-center cursor-pointer text-lvf-muted hover:text-lvf-accent hover:bg-lvf-accent/10 transition relative${openMenu === item.id ? ' text-lvf-accent bg-lvf-accent/10' : ''}`}
              onClick={() => handleMenuClick(item)}
            >
              {item.label}
            </div>

            {item.children && openMenu === item.id && (
              <div className="absolute top-full left-0 glass-card rounded-xl border border-lvf-border shadow-2xl z-50 min-w-[180px] py-1 mt-1">
                {item.children.map((child, idx) =>
                  child === 'separator' ? (
                    <div key={`sep-${idx}`} className="h-px bg-lvf-border/30 my-1 mx-2" />
                  ) : (
                    <div
                      key={child.id}
                      className="px-4 py-1.5 cursor-pointer text-sm text-lvf-text hover:bg-lvf-accent/10 hover:text-lvf-accent transition"
                      onClick={() => handleChildClick(child.id)}
                    >
                      {child.label}
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Icon toolbar */}
      <div className="flex items-stretch gap-1 px-2 py-1.5 bg-lvf-dark/20 border-b border-lvf-border">
        {iconToolbarItems.map(item => (
          <button
            key={item.id}
            className={`flex flex-col items-center justify-center px-3 py-1 cursor-pointer rounded-lg text-lvf-muted hover:bg-lvf-accent/10 hover:text-lvf-accent transition min-w-[52px] gap-0.5 text-[10px]${activeView === item.id ? ' bg-lvf-accent/15 text-lvf-accent' : ''}`}
            onClick={() => { onNavigate(item.id); setOpenMenu(null) }}
          >
            <span style={{ fontSize: 20 }}>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </>
  )
}
