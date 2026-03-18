import { useState } from 'react'
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

const apArActions = { bills: 'bills', invoices: 'invoices', 'aging-ap': 'aging-ap', 'aging-ar': 'aging-ar', bank: 'bank', grower: 'grower' }
const budgetActions = { budgets: 'budgets', variance: 'variance', costcenters: 'costcenters', depreciation: 'depreciation', breakeven: 'breakeven', margins: 'margins', cashflow: 'cashflow', kpis: 'kpis' }
const complianceActions = { compliance: 'schedulef', schedulef: 'schedulef', '1099': '1099', retained: 'retained', yearend: 'yearend', comparison: 'comparison', ratios: 'ratios', qbexport: 'qbexport' }

export default function Accounting() {
  const [view, setView] = useState('home')

  return (
    <div style={{ minHeight: 'calc(100vh - 64px)' }}>
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
      </div>

    </div>
  )
}
