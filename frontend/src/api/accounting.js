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

// Bank Reconciliation
export const startReconciliation = (data) => api.post('/accounting/reconciliation/start', data)
export const getReconciliation = (id) => api.get(`/accounting/reconciliation/${id}`)
export const toggleReconciliationItem = (id, itemId) => api.put(`/accounting/reconciliation/${id}/toggle/${itemId}`)
export const finishReconciliation = (id) => api.post(`/accounting/reconciliation/${id}/finish`)
export const getReconciliationHistory = (bankAccountId) => api.get(`/accounting/reconciliation/history/${bankAccountId}`)
