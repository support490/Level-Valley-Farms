import { useState } from 'react'
import {
  BookOpen, FileText, CreditCard, Building2, PieChart, Landmark, CalendarCheck,
  ShieldCheck, BarChart3, Plus, List, DollarSign, TrendingUp, Clock, Download,
  Receipt, Scale, Calculator, Briefcase, ArrowRightLeft, ChevronRight,
} from 'lucide-react'
import ChartOfAccounts from '../components/accounting/ChartOfAccounts'
import JournalEntries from '../components/accounting/JournalEntries'
import QuickExpense from '../components/accounting/QuickExpense'
import TrialBalance from '../components/accounting/TrialBalance'
import RecurringEntries from '../components/accounting/RecurringEntries'
import FiscalPeriods from '../components/accounting/FiscalPeriods'
import ApAr from '../components/accounting/ApAr'
import BudgetAnalysis from '../components/accounting/BudgetAnalysis'
import Compliance from '../components/accounting/Compliance'

const modules = [
  {
    id: 'ledger', label: 'General Ledger', icon: BookOpen,
    color: 'from-blue-500/20 to-blue-600/10 border-blue-500/30',
    accent: 'text-blue-400',
    desc: 'Journal entries, chart of accounts, trial balance',
    actions: [
      { id: 'quick', label: 'Quick Expense', icon: Plus, desc: 'Record an expense fast' },
      { id: 'journal', label: 'Journal Entries', icon: List, desc: 'View & create entries' },
      { id: 'accounts', label: 'Chart of Accounts', icon: BookOpen, desc: 'Account hierarchy' },
      { id: 'trial', label: 'Trial Balance', icon: Scale, desc: 'Verify debits = credits' },
    ],
  },
  {
    id: 'payables', label: 'Payables', icon: CreditCard,
    color: 'from-red-500/20 to-red-600/10 border-red-500/30',
    accent: 'text-red-400',
    desc: 'Bills, vendor payments, AP aging',
    actions: [
      { id: 'bills', label: 'Bills', icon: FileText, desc: 'Create & manage bills' },
      { id: 'aging-ap', label: 'AP Aging Report', icon: Clock, desc: '30/60/90/120 day buckets' },
      { id: 'grower', label: 'Grower Payments', icon: DollarSign, desc: 'What you owe growers' },
    ],
  },
  {
    id: 'receivables', label: 'Receivables', icon: Receipt,
    color: 'from-green-500/20 to-green-600/10 border-green-500/30',
    accent: 'text-green-400',
    desc: 'Customer invoices, AR aging',
    actions: [
      { id: 'invoices', label: 'Invoices', icon: FileText, desc: 'Create & manage invoices' },
      { id: 'aging-ar', label: 'AR Aging Report', icon: Clock, desc: '30/60/90/120 day buckets' },
    ],
  },
  {
    id: 'banking', label: 'Banking', icon: Building2,
    color: 'from-cyan-500/20 to-cyan-600/10 border-cyan-500/30',
    accent: 'text-cyan-400',
    desc: 'Bank accounts, cash flow',
    actions: [
      { id: 'bank', label: 'Bank Accounts', icon: Building2, desc: 'Track account balances' },
      { id: 'cashflow', label: 'Cash Flow Statement', icon: ArrowRightLeft, desc: 'Receipts vs disbursements' },
    ],
  },
  {
    id: 'budget', label: 'Budgets & Analysis', icon: PieChart,
    color: 'from-amber-500/20 to-amber-600/10 border-amber-500/30',
    accent: 'text-amber-400',
    desc: 'Budgets, variance, cost analysis, margins',
    actions: [
      { id: 'budgets', label: 'Budgets', icon: PieChart, desc: 'Create & view budgets' },
      { id: 'variance', label: 'Budget vs Actual', icon: BarChart3, desc: 'Variance by category' },
      { id: 'costcenters', label: 'Cost Centers', icon: Briefcase, desc: 'Expenses by flock & grower' },
      { id: 'breakeven', label: 'Break-Even Analysis', icon: TrendingUp, desc: 'Cost vs revenue per dozen' },
      { id: 'margins', label: 'Margin Analysis', icon: Calculator, desc: 'Margin per contract' },
      { id: 'kpis', label: 'Financial KPIs', icon: BarChart3, desc: 'Key performance indicators' },
    ],
  },
  {
    id: 'assets', label: 'Fixed Assets', icon: Landmark,
    color: 'from-violet-500/20 to-violet-600/10 border-violet-500/30',
    accent: 'text-violet-400',
    desc: 'Depreciation schedules',
    actions: [
      { id: 'depreciation', label: 'Depreciation Schedules', icon: Landmark, desc: 'Track asset depreciation' },
    ],
  },
  {
    id: 'periodend', label: 'Period End', icon: CalendarCheck,
    color: 'from-indigo-500/20 to-indigo-600/10 border-indigo-500/30',
    accent: 'text-indigo-400',
    desc: 'Recurring entries, fiscal periods, year-end close',
    actions: [
      { id: 'recurring', label: 'Recurring Entries', icon: Clock, desc: 'Manage recurring templates' },
      { id: 'fiscal', label: 'Fiscal Periods', icon: CalendarCheck, desc: 'Open & close periods' },
      { id: 'yearend', label: 'Year-End Close', icon: CalendarCheck, desc: 'Close annual books' },
      { id: 'retained', label: 'Retained Earnings', icon: DollarSign, desc: 'Cumulative earnings' },
    ],
  },
  {
    id: 'compliance', label: 'Tax & Compliance', icon: ShieldCheck,
    color: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30',
    accent: 'text-emerald-400',
    desc: 'Schedule F, 1099, ratios, exports',
    actions: [
      { id: 'schedulef', label: 'Schedule F', icon: FileText, desc: 'Farm income tax prep' },
      { id: '1099', label: '1099 Tracking', icon: FileText, desc: 'Vendor payment thresholds' },
      { id: 'ratios', label: 'Ratio Analysis', icon: BarChart3, desc: 'Financial health ratios' },
      { id: 'comparison', label: 'Period Comparison', icon: ArrowRightLeft, desc: 'Compare two periods' },
      { id: 'qbexport', label: 'QuickBooks Export', icon: Download, desc: 'Download QB-compatible CSV' },
    ],
  },
]

// Map action IDs to the component sub-tab props
const apArActions = { bills: 'bills', invoices: 'invoices', 'aging-ap': 'aging', 'aging-ar': 'aging', bank: 'bank', grower: 'grower' }
const budgetActions = { budgets: 'budgets', variance: 'variance', costcenters: 'costcenters', depreciation: 'depreciation', breakeven: 'breakeven', margins: 'margins', cashflow: 'cashflow', kpis: 'kpis' }
const complianceActions = { schedulef: 'schedulef', '1099': '1099', retained: 'retained', yearend: 'yearend', comparison: 'comparison', ratios: 'ratios', qbexport: 'qbexport' }

export default function Accounting() {
  const [activeModule, setActiveModule] = useState(null)
  const [activeAction, setActiveAction] = useState(null)

  const handleModuleClick = (moduleId) => {
    if (activeModule === moduleId) {
      setActiveModule(null)
      setActiveAction(null)
    } else {
      setActiveModule(moduleId)
      setActiveAction(null)
    }
  }

  const handleActionClick = (actionId) => {
    setActiveAction(actionId)
  }

  const currentModule = modules.find(m => m.id === activeModule)

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Accounting</h2>

      {/* ═══════════ MODULE GRID ═══════════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {modules.map(mod => {
          const Icon = mod.icon
          const isActive = activeModule === mod.id
          return (
            <button
              key={mod.id}
              onClick={() => handleModuleClick(mod.id)}
              className={`relative p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer group
                ${isActive
                  ? `bg-gradient-to-br ${mod.color} border-opacity-100 shadow-lg scale-[1.02]`
                  : 'glass-card hover:scale-[1.01]'
                }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className={`p-2 rounded-xl ${isActive ? 'bg-white/10' : 'bg-lvf-dark/40'}`}>
                  <Icon size={20} className={isActive ? mod.accent : 'text-lvf-muted'} />
                </div>
                <ChevronRight size={14}
                  className={`text-lvf-muted transition-transform duration-200 ${isActive ? 'rotate-90 ' + mod.accent : 'group-hover:translate-x-0.5'}`} />
              </div>
              <h3 className={`text-sm font-semibold mb-0.5 ${isActive ? 'text-lvf-text' : 'text-lvf-text'}`}>
                {mod.label}
              </h3>
              <p className="text-[10px] text-lvf-muted leading-snug">{mod.desc}</p>
            </button>
          )
        })}
      </div>

      {/* ═══════════ ACTION MENU ═══════════ */}
      {currentModule && (
        <div className="mb-6 fade-in">
          <div className={`glass-card p-4 border bg-gradient-to-r ${currentModule.color}`}>
            <div className="flex items-center gap-2 mb-3">
              <currentModule.icon size={16} className={currentModule.accent} />
              <h3 className="text-sm font-semibold">{currentModule.label}</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
              {currentModule.actions.map(action => {
                const ActionIcon = action.icon
                const isActive = activeAction === action.id
                return (
                  <button
                    key={action.id}
                    onClick={() => handleActionClick(action.id)}
                    className={`flex items-start gap-3 p-3 rounded-xl text-left transition-all duration-150 ${
                      isActive
                        ? 'bg-white/15 border border-white/20 shadow-sm'
                        : 'hover:bg-white/10 border border-transparent'
                    }`}
                  >
                    <ActionIcon size={16} className={isActive ? currentModule.accent : 'text-lvf-muted'} />
                    <div className="min-w-0">
                      <p className={`text-xs font-medium ${isActive ? 'text-lvf-text' : 'text-lvf-muted'}`}>{action.label}</p>
                      <p className="text-[9px] text-lvf-muted/70 leading-tight mt-0.5">{action.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ ACTIVE VIEW ═══════════ */}
      {activeAction && (
        <div className="slide-up">
          {/* Core Ledger */}
          {activeAction === 'quick' && <QuickExpense />}
          {activeAction === 'journal' && <JournalEntries />}
          {activeAction === 'accounts' && <ChartOfAccounts />}
          {activeAction === 'trial' && <TrialBalance />}

          {/* AP/AR */}
          {apArActions[activeAction] && <ApAr subTab={apArActions[activeAction]} />}

          {/* Budget & Analysis */}
          {budgetActions[activeAction] && <BudgetAnalysis subTab={budgetActions[activeAction]} />}

          {/* Period End */}
          {activeAction === 'recurring' && <RecurringEntries />}
          {activeAction === 'fiscal' && <FiscalPeriods />}

          {/* Compliance */}
          {complianceActions[activeAction] && <Compliance subTab={complianceActions[activeAction]} />}
        </div>
      )}

      {/* ═══════════ EMPTY STATE ═══════════ */}
      {!activeAction && !activeModule && (
        <div className="glass-card p-12 text-center">
          <BookOpen size={40} className="text-lvf-muted/30 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-lvf-muted mb-1">Accounting Command Center</h3>
          <p className="text-sm text-lvf-muted/70">Select a module above to get started</p>
        </div>
      )}

      {activeModule && !activeAction && (
        <div className="glass-card p-8 text-center">
          <currentModule.icon size={32} className={`${currentModule.accent} mx-auto mb-3 opacity-50`} />
          <p className="text-sm text-lvf-muted">Select an action from <span className="font-semibold text-lvf-text">{currentModule.label}</span> above</p>
        </div>
      )}
    </div>
  )
}
