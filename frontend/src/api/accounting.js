import api from './client'

export const getAccounts = (params = {}) =>
  api.get('/accounting/accounts', { params })

export const getAccount = (id) => api.get(`/accounting/accounts/${id}`)
export const createAccount = (data) => api.post('/accounting/accounts', data)
export const updateAccount = (id, data) => api.put(`/accounting/accounts/${id}`, data)
export const seedAccounts = () => api.post('/accounting/accounts/seed')

export const getJournalEntries = (params = {}) =>
  api.get('/accounting/journal-entries', { params })

export const getJournalEntry = (id) => api.get(`/accounting/journal-entries/${id}`)
export const createJournalEntry = (data) => api.post('/accounting/journal-entries', data)
export const postJournalEntry = (id) => api.post(`/accounting/journal-entries/${id}/post`)
export const unpostJournalEntry = (id) => api.post(`/accounting/journal-entries/${id}/unpost`)
export const deleteJournalEntry = (id) => api.delete(`/accounting/journal-entries/${id}`)

export const createQuickExpense = (data) => api.post('/accounting/expenses', data)

export const getTrialBalance = (params = {}) =>
  api.get('/accounting/trial-balance', { params })

export const getAccountLedger = (id, params = {}) =>
  api.get(`/accounting/accounts/${id}/ledger`, { params })

// Recurring entries
export const getRecurringEntries = (params = {}) =>
  api.get('/accounting/recurring', { params })
export const createRecurringEntry = (data) => api.post('/accounting/recurring', data)
export const updateRecurringEntry = (id, data) => api.put(`/accounting/recurring/${id}`, data)
export const deleteRecurringEntry = (id) => api.delete(`/accounting/recurring/${id}`)
export const generateRecurringEntries = () => api.post('/accounting/recurring/generate')

// Fiscal periods
export const getFiscalPeriods = () => api.get('/accounting/fiscal-periods')
export const createFiscalPeriod = (data) => api.post('/accounting/fiscal-periods', data)
export const closeFiscalPeriod = (id) => api.post(`/accounting/fiscal-periods/${id}/close`)
export const reopenFiscalPeriod = (id) => api.post(`/accounting/fiscal-periods/${id}/reopen`)
export const generateFiscalPeriods = (year, startMonth = 1) =>
  api.post(`/accounting/fiscal-periods/generate?year=${year}&start_month=${startMonth}`)

// AP - Bills
export const getBills = (params = {}) => api.get('/accounting/bills', { params })
export const createBill = (data) => api.post('/accounting/bills', data)
export const payBill = (id, data) => api.post(`/accounting/bills/${id}/pay`, data)

// AR - Invoices
export const getInvoices = (params = {}) => api.get('/accounting/invoices', { params })
export const createInvoice = (data) => api.post('/accounting/invoices', data)
export const invoiceFromShipment = (shipmentId, dueDays = 30) =>
  api.post(`/accounting/invoices/from-shipment/${shipmentId}?due_days=${dueDays}`)
export const payInvoice = (id, data) => api.post(`/accounting/invoices/${id}/pay`, data)

// Aging
export const getAPAging = () => api.get('/accounting/aging/ap')
export const getARAging = () => api.get('/accounting/aging/ar')

// Bank Accounts
export const getBankAccounts = () => api.get('/accounting/bank-accounts')
export const createBankAccount = (data) => api.post('/accounting/bank-accounts', data)
export const updateBankAccount = (id, data) => api.put(`/accounting/bank-accounts/${id}`, data)

// Grower Payments
export const getGrowerPayments = () => api.get('/accounting/grower-payments')

// Budgets
export const getBudgets = (params = {}) => api.get('/accounting/budgets', { params })
export const createBudget = (data) => api.post('/accounting/budgets', data)
export const getBudgetVariance = (year) => api.get('/accounting/budget-variance', { params: { year } })

// Cost Analysis
export const getCostCenters = () => api.get('/accounting/cost-centers')
export const getDepreciation = () => api.get('/accounting/depreciation')
export const createDepreciation = (data) => api.post('/accounting/depreciation', data)
export const getBreakEven = () => api.get('/accounting/break-even')
export const getMarginAnalysis = () => api.get('/accounting/margin-analysis')
export const getCashFlow = (params = {}) => api.get('/accounting/cash-flow', { params })
export const getFinancialKPIs = () => api.get('/accounting/financial-kpis')

// Compliance
export const getYearEndClose = (year) => api.get('/accounting/year-end-close', { params: { year } })
export const getRetainedEarnings = () => api.get('/accounting/retained-earnings')
export const getScheduleF = (year) => api.get('/accounting/schedule-f', { params: { year } })
export const get1099Report = (year) => api.get('/accounting/1099-report', { params: { year } })
export const getPeriodComparison = (p1Start, p1End, p2Start, p2End) =>
  api.get('/accounting/period-comparison', { params: { p1_start: p1Start, p1_end: p1End, p2_start: p2Start, p2_end: p2End } })
export const getRatioAnalysis = () => api.get('/accounting/ratio-analysis')
export const getAuditExport = (year) => api.get('/accounting/audit-export', { params: { year } })
export const exportQuickBooks = (year) => api.get('/accounting/export/quickbooks', { params: { year }, responseType: 'blob' })

// QB Checks
export const getChecks = (params = {}) => api.get('/accounting/checks', { params })
export const createCheck = (data) => api.post('/accounting/checks', data)
export const voidCheck = (id) => api.post(`/accounting/checks/${id}/void`)
export const printCheck = (id, checkNumber) =>
  api.post(`/accounting/checks/${id}/print${checkNumber ? `?check_number=${checkNumber}` : ''}`)

// QB Batch Pay Bills
export const payBillsBatch = (data) => api.post('/accounting/bills/pay-batch', data)

// QB Receive Payments
export const receivePayment = (data) => api.post('/accounting/payments/receive', data)

// QB Bank Register
export const getBankRegister = (bankAccountId) => api.get(`/accounting/bank-register/${bankAccountId}`)

// QB Deposits
export const makeDeposit = (bankAccountId, data) => api.post(`/accounting/bank-accounts/${bankAccountId}/deposit`, data)
export const getUndepositedFunds = () => api.get('/accounting/undeposited-funds')

// QB Transfers
export const transferFunds = (data) => api.post('/accounting/transfers', data)

// Items CRUD
export const getItems = () => api.get('/accounting/items')
export const createItem = (data) => api.post('/accounting/items', data)
export const updateItem = (id, data) => api.put(`/accounting/items/${id}`, data)
export const deleteItem = (id) => api.delete(`/accounting/items/${id}`)

// Vendors CRUD
export const getVendors = () => api.get('/accounting/vendors')
export const createVendor = (data) => api.post('/accounting/vendors', data)
export const updateVendor = (id, data) => api.put(`/accounting/vendors/${id}`, data)
export const deleteVendor = (id) => api.delete(`/accounting/vendors/${id}`)

// Buyers/Customers CRUD
export const getBuyers = () => api.get('/accounting/buyers')
export const createBuyer = (data) => api.post('/accounting/buyers', data)
export const updateBuyer = (id, data) => api.put(`/accounting/buyers/${id}`, data)
export const deleteBuyer = (id) => api.delete(`/accounting/buyers/${id}`)

// Estimates
export const getEstimates = () => api.get('/accounting/estimates')
export const createEstimate = (data) => api.post('/accounting/estimates', data)
export const updateEstimateStatus = (id, status) => api.put(`/accounting/estimates/${id}/status`, { status })
export const convertEstimateToInvoice = (id) => api.post(`/accounting/estimates/${id}/convert`)

// Purchase Orders
export const getPurchaseOrders = () => api.get('/accounting/purchase-orders')
export const convertPOToBill = (poId) => api.post(`/accounting/purchase-orders/${poId}/convert-to-bill`)

// Credit Memos
export const getCreditMemos = () => api.get('/accounting/credit-memos')
export const createCreditMemo = (data) => api.post('/accounting/credit-memos', data)
export const applyCreditMemo = (id, invoiceId) => api.post(`/accounting/credit-memos/${id}/apply/${invoiceId}`)
export const voidCreditMemo = (id) => api.post(`/accounting/credit-memos/${id}/void`)

// Vendor Credits
export const getVendorCredits = (params = {}) => api.get('/accounting/vendor-credits', { params })
export const createVendorCredit = (data) => api.post('/accounting/vendor-credits', data)
export const applyVendorCredit = (creditId, billId, data) => api.post(`/accounting/vendor-credits/${creditId}/apply/${billId}`, data)
export const voidVendorCredit = (id) => api.post(`/accounting/vendor-credits/${id}/void`)

// Bank Reconciliation
export const startReconciliation = (data) => api.post('/accounting/reconciliation/start', data)
export const getReconciliation = (id) => api.get(`/accounting/reconciliation/${id}`)
export const toggleReconciliationItem = (id, itemId) => api.put(`/accounting/reconciliation/${id}/toggle/${itemId}`)
export const finishReconciliation = (id) => api.post(`/accounting/reconciliation/${id}/finish`)
export const getReconciliationHistory = (bankAccountId) => api.get(`/accounting/reconciliation/history/${bankAccountId}`)

// Item Receipts
export const getItemReceipts = (params = {}) => api.get('/accounting/item-receipts', { params })
export const createItemReceipt = (data) => api.post('/accounting/item-receipts', data)
export const convertReceiptToBill = (receiptId, data = {}) => api.post(`/accounting/item-receipts/${receiptId}/convert-to-bill`, data)

// Flock Closeout
export const executeFlockCloseout = (flockId, data) => api.post(`/accounting/flock-closeout/${flockId}`, data)

// Flock-Accounting Integration
export const suggestFlockForVendor = (vendorId) => api.get(`/accounting/suggest-flock?vendor_id=${vendorId}`)
export const getActiveFlocks = () => api.get('/accounting/active-flocks')
export const createBillFromFeedDelivery = (deliveryId) => api.post(`/accounting/bills/from-feed-delivery/${deliveryId}`)
export const getFlockBudget = (flockId) => api.get(`/accounting/flock-budget/${flockId}`)
export const createFlockBudget = (flockId, data) => api.post(`/accounting/flock-budget/${flockId}`, data)
export const getFlockBudgetVariance = (flockId) => api.get(`/accounting/flock-budget-variance/${flockId}`)
export const allocateExpense = (data) => api.post('/accounting/allocate-expense', data)
export const getGrowerSettlement = (flockId) => api.get(`/accounting/grower-settlement/${flockId}`)
export const executeGrowerSettlement = (flockId) => api.post(`/accounting/grower-settlement/${flockId}`)

// Print Views & Email
export const getInvoicePrintView = (invoiceId) => api.get(`/accounting/invoices/${invoiceId}/print-view`)
export const getEstimatePrintView = (estimateId) => api.get(`/accounting/estimates/${estimateId}/print-view`)
export const getCheckPrintView = (checkId) => api.get(`/accounting/checks/${checkId}/print-view`)
export const emailInvoice = (invoiceId) => api.post(`/accounting/invoices/${invoiceId}/email`)

// ── Tier 2: Sales Receipts ──
export const getSalesReceipts = (params = {}) => api.get('/accounting/sales-receipts', { params })
export const createSalesReceipt = (data) => api.post('/accounting/sales-receipts', data)
export const voidSalesReceipt = (id) => api.post(`/accounting/sales-receipts/${id}/void`)

// ── Tier 2: Refund Receipts ──
export const getRefundReceipts = (params = {}) => api.get('/accounting/refund-receipts', { params })
export const createRefundReceipt = (data) => api.post('/accounting/refund-receipts', data)
export const voidRefundReceipt = (id) => api.post(`/accounting/refund-receipts/${id}/void`)

// ── Tier 2: Credit Card Charges ──
export const getCCCharges = (params = {}) => api.get('/accounting/cc-charges', { params })
export const createCCCharge = (data) => api.post('/accounting/cc-charges', data)
export const voidCCCharge = (id) => api.post(`/accounting/cc-charges/${id}/void`)

// ── Tier 2: Credit Card Credits ──
export const getCCCredits = (params = {}) => api.get('/accounting/cc-credits', { params })
export const createCCCredit = (data) => api.post('/accounting/cc-credits', data)

// ── Tier 2: Customer Deposits ──
export const getCustomerDeposits = (params = {}) => api.get('/accounting/customer-deposits', { params })
export const createCustomerDeposit = (data) => api.post('/accounting/customer-deposits', data)
export const applyCustomerDeposit = (id, invoiceId) => api.post(`/accounting/customer-deposits/${id}/apply/${invoiceId}`)

// ── Tier 2: Finance Charges ──
export const getFinanceCharges = (params = {}) => api.get('/accounting/finance-charges', { params })
export const assessFinanceCharges = (rate, graceDays) => api.post(`/accounting/finance-charges/assess?rate=${rate}&grace_days=${graceDays}`)
export const waiveFinanceCharge = (id) => api.post(`/accounting/finance-charges/${id}/waive`)

// ── Tier 2: Inventory Adjustments ──
export const getInventoryAdjustments = (params = {}) => api.get('/accounting/inventory-adjustments', { params })
export const createInventoryAdjustment = (data) => api.post('/accounting/inventory-adjustments', data)
export const voidInventoryAdjustment = (id) => api.post(`/accounting/inventory-adjustments/${id}/void`)

// ── Tier 2: Recurring Transactions ──
export const getRecurringTransactions = (params = {}) => api.get('/accounting/recurring-transactions', { params })
export const createRecurringTransaction = (data) => api.post('/accounting/recurring-transactions', data)
export const updateRecurringTransaction = (id, data) => api.put(`/accounting/recurring-transactions/${id}`, data)
export const deleteRecurringTransaction = (id) => api.delete(`/accounting/recurring-transactions/${id}`)
export const generateRecurringTransactions = () => api.post('/accounting/recurring-transactions/generate')

// ── Tier 2: Memorized Transactions ──
export const getMemoizedTransactions = (params = {}) => api.get('/accounting/memorized-transactions', { params })
export const createMemoizedTransaction = (data) => api.post('/accounting/memorized-transactions', data)
export const deleteMemoizedTransaction = (id) => api.delete(`/accounting/memorized-transactions/${id}`)
export const useMemoizedTransaction = (id) => api.post(`/accounting/memorized-transactions/${id}/use`)

// ── Tier 2: Batch Operations ──
export const batchCreateInvoices = (data) => api.post('/accounting/batch/invoices', data)
export const batchVoid = (data) => api.post('/accounting/batch/void', data)

// ── Tier 2: Copy Transaction ──
export const copyTransaction = (type, id) => api.post(`/accounting/copy/${type}/${id}`)

// ── Fixed Assets ──
export const getFixedAssets = (params = {}) => api.get('/accounting/fixed-assets', { params })
export const createFixedAsset = (data) => api.post('/accounting/fixed-assets', data)
export const getFixedAsset = (id) => api.get(`/accounting/fixed-assets/${id}`)
export const updateFixedAsset = (id, data) => api.put(`/accounting/fixed-assets/${id}`, data)
export const disposeFixedAsset = (id, data) => api.post(`/accounting/fixed-assets/${id}/dispose`, data)
export const depreciateFixedAsset = (id) => api.post(`/accounting/fixed-assets/${id}/depreciate`)
export const depreciateAllFixedAssets = () => api.post('/accounting/fixed-assets/depreciate-all')
export const getFixedAssetsSummary = () => api.get('/accounting/fixed-assets/summary')
