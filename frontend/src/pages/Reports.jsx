import { useState } from 'react'
import FlockReport from '../components/reports/FlockReport'
import IncomeStatement from '../components/reports/IncomeStatement'
import BalanceSheet from '../components/reports/BalanceSheet'

const tabs = [
  { id: 'flock', label: 'Flock Report' },
  { id: 'income', label: 'Income Statement' },
  { id: 'balance', label: 'Balance Sheet' },
]

export default function Reports() {
  const [activeTab, setActiveTab] = useState('flock')

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Reports</h2>

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

      {activeTab === 'flock' && <FlockReport />}
      {activeTab === 'income' && <IncomeStatement />}
      {activeTab === 'balance' && <BalanceSheet />}
    </div>
  )
}
