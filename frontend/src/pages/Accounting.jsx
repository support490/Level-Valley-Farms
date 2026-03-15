import { useState } from 'react'
import ChartOfAccounts from '../components/accounting/ChartOfAccounts'
import JournalEntries from '../components/accounting/JournalEntries'
import QuickExpense from '../components/accounting/QuickExpense'
import TrialBalance from '../components/accounting/TrialBalance'

const tabs = [
  { id: 'quick', label: 'Quick Expense' },
  { id: 'journal', label: 'Journal Entries' },
  { id: 'accounts', label: 'Chart of Accounts' },
  { id: 'trial', label: 'Trial Balance' },
]

export default function Accounting() {
  const [activeTab, setActiveTab] = useState('quick')

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Accounting</h2>

      <div className="flex gap-1 mb-6 p-1 glass-card w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
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
      {activeTab === 'accounts' && <ChartOfAccounts />}
      {activeTab === 'trial' && <TrialBalance />}
    </div>
  )
}
