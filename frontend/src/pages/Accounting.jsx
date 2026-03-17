import { useState } from 'react'
import ChartOfAccounts from '../components/accounting/ChartOfAccounts'
import JournalEntries from '../components/accounting/JournalEntries'
import QuickExpense from '../components/accounting/QuickExpense'
import TrialBalance from '../components/accounting/TrialBalance'
import RecurringEntries from '../components/accounting/RecurringEntries'
import FiscalPeriods from '../components/accounting/FiscalPeriods'
import ApAr from '../components/accounting/ApAr'
import BudgetAnalysis from '../components/accounting/BudgetAnalysis'
import Compliance from '../components/accounting/Compliance'

const tabs = [
  { id: 'quick', label: 'Quick Expense' },
  { id: 'journal', label: 'Journal Entries' },
  { id: 'bills', label: 'Bills (AP)' },
  { id: 'invoices', label: 'Invoices (AR)' },
  { id: 'aging', label: 'Aging' },
  { id: 'bank', label: 'Bank' },
  { id: 'grower', label: 'Grower Pay' },
  { id: 'budgets', label: 'Budgets' },
  { id: 'variance', label: 'Variance' },
  { id: 'costcenters', label: 'Cost Centers' },
  { id: 'depreciation', label: 'Depreciation' },
  { id: 'breakeven', label: 'Break-Even' },
  { id: 'margins', label: 'Margins' },
  { id: 'cashflow', label: 'Cash Flow' },
  { id: 'kpis', label: 'KPIs' },
  { id: 'schedulef', label: 'Schedule F' },
  { id: '1099', label: '1099' },
  { id: 'retained', label: 'Retained Earnings' },
  { id: 'yearend', label: 'Year-End Close' },
  { id: 'comparison', label: 'Compare Periods' },
  { id: 'ratios', label: 'Ratios' },
  { id: 'qbexport', label: 'QB Export' },
  { id: 'recurring', label: 'Recurring' },
  { id: 'accounts', label: 'Chart of Accounts' },
  { id: 'trial', label: 'Trial Balance' },
  { id: 'fiscal', label: 'Fiscal Periods' },
]

const apArTabs = ['bills', 'invoices', 'aging', 'bank', 'grower']
const budgetTabs = ['budgets', 'variance', 'costcenters', 'depreciation', 'breakeven', 'margins', 'cashflow', 'kpis']
const complianceTabs = ['schedulef', '1099', 'retained', 'yearend', 'comparison', 'ratios', 'qbexport']

export default function Accounting() {
  const [activeTab, setActiveTab] = useState('quick')

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Accounting</h2>

      <div className="flex gap-1 mb-6 p-1 glass-card w-fit flex-wrap">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition-all duration-200 ${
              activeTab === tab.id
                ? 'bg-lvf-accent/20 text-lvf-accent'
                : 'text-lvf-muted hover:text-lvf-text hover:bg-white/5'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'quick' && <QuickExpense />}
      {activeTab === 'journal' && <JournalEntries />}
      {activeTab === 'recurring' && <RecurringEntries />}
      {activeTab === 'accounts' && <ChartOfAccounts />}
      {activeTab === 'trial' && <TrialBalance />}
      {activeTab === 'fiscal' && <FiscalPeriods />}
      {apArTabs.includes(activeTab) && <ApAr subTab={activeTab} />}
      {budgetTabs.includes(activeTab) && <BudgetAnalysis subTab={activeTab} />}
      {complianceTabs.includes(activeTab) && <Compliance subTab={activeTab} />}
    </div>
  )
}
