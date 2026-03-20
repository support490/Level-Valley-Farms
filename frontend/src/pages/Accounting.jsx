import { useState } from 'react'
import KeyboardShortcuts from '../components/accounting/KeyboardShortcuts'
import QBToolbar from '../components/accounting/QBToolbar'
import QBHomePage from '../components/accounting/QBHomePage'
import WriteChecks from '../components/accounting/WriteChecks'
import EnterBills from '../components/accounting/EnterBills'
import PayBills from '../components/accounting/PayBills'
import CreateInvoices from '../components/accounting/CreateInvoices'
import ReceivePayments from '../components/accounting/ReceivePayments'
import BankRegister from '../components/accounting/BankRegister'
import ChartOfAccounts from '../components/accounting/ChartOfAccounts'
import JournalEntries from '../components/accounting/JournalEntries'
import QuickExpense from '../components/accounting/QuickExpense'
import TrialBalance from '../components/accounting/TrialBalance'
import RecurringEntries from '../components/accounting/RecurringEntries'
import FiscalPeriods from '../components/accounting/FiscalPeriods'
import ApAr from '../components/accounting/ApAr'
import BudgetAnalysis from '../components/accounting/BudgetAnalysis'
import Compliance from '../components/accounting/Compliance'
import VendorCenter from '../components/accounting/VendorCenter'
import CustomerCenter from '../components/accounting/CustomerCenter'
import ItemsList from '../components/accounting/ItemsList'
import MakeDeposits from '../components/accounting/MakeDeposits'
import TransferFunds from '../components/accounting/TransferFunds'
import Estimates from '../components/accounting/Estimates'
import PurchaseOrders from '../components/accounting/PurchaseOrders'
import CreditMemos from '../components/accounting/CreditMemos'
import BankReconciliation from '../components/accounting/BankReconciliation'

// Tier 1 — Reports
import GeneralLedger from '../components/accounting/GeneralLedger'
import AuditTrailReport from '../components/accounting/AuditTrailReport'
import ArAgingDetail from '../components/accounting/ArAgingDetail'
import ApAgingDetail from '../components/accounting/ApAgingDetail'
import CustomerBalances from '../components/accounting/CustomerBalances'
import VendorBalances from '../components/accounting/VendorBalances'
import FlockPnl from '../components/accounting/FlockPnl'

// Tier 1 — Flock Integration & Dashboard
import FlockCostDashboard from '../components/accounting/FlockCostDashboard'
import AllocateExpense from '../components/accounting/AllocateExpense'
import FlockCloseout from '../components/accounting/FlockCloseout'
import GrowerSettlement from '../components/accounting/GrowerSettlement'
import FlockBudget from '../components/accounting/FlockBudget'

// Tier 1 — Transaction Forms
import VendorCredits from '../components/accounting/VendorCredits'
import ItemReceipts from '../components/accounting/ItemReceipts'
import FixedAssets from '../components/accounting/FixedAssets'

// Tier 1 — Grower Payment Formula
import GrowerPaymentFormulaEditor from '../components/accounting/GrowerPaymentFormulaEditor'

// Tier 2 — Transaction Types
import SalesReceipts from '../components/accounting/SalesReceipts'
import RefundReceipts from '../components/accounting/RefundReceipts'
import CreditCardCharges from '../components/accounting/CreditCardCharges'
import CreditCardCredits from '../components/accounting/CreditCardCredits'
import CustomerDeposits from '../components/accounting/CustomerDeposits'
import FinanceCharges from '../components/accounting/FinanceCharges'
import InventoryAdjustments from '../components/accounting/InventoryAdjustments'

// Tier 2 — Automation & Batch
import RecurringTransactions from '../components/accounting/RecurringTransactions'
import MemoizedTransactions from '../components/accounting/MemoizedTransactions'
import BatchInvoicing from '../components/accounting/BatchInvoicing'
import BatchVoid from '../components/accounting/BatchVoid'

// Tier 3
import CustomerStatements from '../components/accounting/CustomerStatements'

const apArActions = { bills: 'bills', invoices: 'invoices', 'aging-ap': 'aging-ap', 'aging-ar': 'aging-ar', bank: 'bank', grower: 'grower' }
const budgetActions = { budgets: 'budgets', variance: 'variance', costcenters: 'costcenters', depreciation: 'depreciation', breakeven: 'breakeven', margins: 'margins', cashflow: 'cashflow', kpis: 'kpis' }
const complianceActions = { compliance: 'schedulef', schedulef: 'schedulef', '1099': '1099', retained: 'retained', yearend: 'yearend', comparison: 'comparison', ratios: 'ratios', qbexport: 'qbexport' }

export default function Accounting() {
  const [view, setView] = useState('home')

  return (
    <div style={{ minHeight: 'calc(100vh - 64px)' }}>
      <KeyboardShortcuts onNavigate={setView} />
      <QBToolbar activeView={view} onNavigate={setView} />

      <div style={{ padding: '0' }}>
        {/* QB Home Page */}
        {view === 'home' && <QBHomePage onNavigate={setView} />}

        {/* Banking */}
        {view === 'write-checks' && <WriteChecks />}
        {view === 'bank-register' && <BankRegister onNavigate={setView} />}
        {view === 'make-deposits' && <MakeDeposits />}
        {view === 'transfer-funds' && <TransferFunds />}

        {/* Vendors / AP */}
        {view === 'vendor-center' && <VendorCenter onNavigate={setView} />}
        {view === 'enter-bills' && <EnterBills onSaved={() => setView('bills')} />}
        {view === 'pay-bills' && <PayBills onPaid={() => setView('bills')} />}
        {view === 'vendor-credits' && <VendorCredits />}
        {view === 'item-receipts' && <ItemReceipts />}

        {/* Customers / AR */}
        {view === 'customer-center' && <CustomerCenter onNavigate={setView} />}
        {view === 'create-invoices' && <CreateInvoices onSaved={() => setView('invoices')} />}
        {view === 'receive-payments' && <ReceivePayments onSaved={() => setView('invoices')} />}
        {view === 'estimates' && <Estimates />}
        {view === 'credit-memos' && <CreditMemos />}

        {/* Vendors / POs */}
        {view === 'purchase-orders' && <PurchaseOrders />}

        {/* Banking */}
        {view === 'reconcile' && <BankReconciliation />}

        {/* Lists */}
        {view === 'items-services' && <ItemsList />}

        {/* Existing components — AP/AR lists, aging, bank accounts, grower payments */}
        {apArActions[view] && <ApAr subTab={apArActions[view]} />}

        {/* Core Ledger */}
        {view === 'accounts' && <ChartOfAccounts />}
        {view === 'journal' && <JournalEntries />}
        {view === 'quick' && <QuickExpense />}
        {view === 'trial' && <TrialBalance />}

        {/* Period End */}
        {view === 'recurring' && <RecurringEntries />}
        {view === 'fiscal' && <FiscalPeriods />}

        {/* Budget & Analysis */}
        {budgetActions[view] && <BudgetAnalysis subTab={budgetActions[view]} />}

        {/* Compliance */}
        {complianceActions[view] && <Compliance subTab={complianceActions[view]} />}

        {/* ── Tier 1 Reports ── */}
        {view === 'general-ledger' && <GeneralLedger />}
        {view === 'audit-trail' && <AuditTrailReport />}
        {view === 'ar-aging-detail' && <ArAgingDetail />}
        {view === 'ap-aging-detail' && <ApAgingDetail />}
        {view === 'customer-balances' && <CustomerBalances />}
        {view === 'vendor-balances' && <VendorBalances />}
        {view === 'flock-pnl' && <FlockPnl />}

        {/* ── Tier 1 Flock Integration ── */}
        {view === 'flock-cost-dashboard' && <FlockCostDashboard />}
        {view === 'allocate-expense' && <AllocateExpense />}
        {view === 'flock-closeout' && <FlockCloseout />}
        {view === 'grower-settlement' && <GrowerSettlement />}
        {view === 'flock-budget' && <FlockBudget />}
        {view === 'grower-payment-formula' && <GrowerPaymentFormulaEditor />}

        {/* ── Tier 2 Transaction Types ── */}
        {view === 'sales-receipts' && <SalesReceipts />}
        {view === 'refund-receipts' && <RefundReceipts />}
        {view === 'cc-charges' && <CreditCardCharges />}
        {view === 'cc-credits' && <CreditCardCredits />}
        {view === 'customer-deposits' && <CustomerDeposits />}
        {view === 'finance-charges' && <FinanceCharges />}
        {view === 'inventory-adjustments' && <InventoryAdjustments />}

        {/* ── Fixed Assets ── */}
        {view === 'fixed-assets' && <FixedAssets />}

        {/* ── Tier 2 Automation & Batch ── */}
        {view === 'recurring-transactions' && <RecurringTransactions />}
        {view === 'memorized-transactions' && <MemoizedTransactions />}
        {view === 'batch-invoicing' && <BatchInvoicing />}
        {view === 'batch-void' && <BatchVoid />}

        {/* ── Tier 3 ── */}
        {view === 'customer-statements' && <CustomerStatements />}
      </div>

    </div>
  )
}
