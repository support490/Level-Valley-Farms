import api from './client'

export const getFlockReport = (flockId) => api.get(`/reports/flock/${flockId}`)

export const getIncomeStatement = (dateFrom, dateTo) =>
  api.get('/reports/income-statement', { params: { date_from: dateFrom, date_to: dateTo } })

export const getBalanceSheet = (asOfDate = null) =>
  api.get('/reports/balance-sheet', { params: asOfDate ? { as_of_date: asOfDate } : {} })

// Analytics
export const getGrowerScorecard = () => api.get('/reports/grower-scorecard')
export const getFarmPnl = (params = {}) => api.get('/reports/farm-pnl', { params })
export const getCostPerDozen = (months = 12) => api.get('/reports/cost-per-dozen', { params: { months } })
export const getFlockComparison = () => api.get('/reports/flock-comparison')

// Tier 1 Reports
export const getGeneralLedger = (dateFrom, dateTo) =>
  api.get('/reports/general-ledger', { params: { date_from: dateFrom, date_to: dateTo } })
export const getAuditTrail = (params = {}) => api.get('/reports/audit-trail', { params })
export const getArAgingDetail = () => api.get('/reports/ar-aging-detail')
export const getApAgingDetail = () => api.get('/reports/ap-aging-detail')
export const getCustomerBalances = () => api.get('/reports/customer-balances')
export const getVendorBalances = () => api.get('/reports/vendor-balances')
export const getFlockPnl = (flockId) => api.get(`/reports/flock-pnl/${flockId}`)
export const getFlockCostDashboard = () => api.get('/reports/flock-cost-dashboard')

// Customer & Vendor Statements
export const getCustomerStatement = (customerName, dateFrom, dateTo) =>
  api.get(`/reports/customer-statement/${encodeURIComponent(customerName)}`, {
    params: { date_from: dateFrom, date_to: dateTo }
  })
export const getBatchCustomerStatements = (dateFrom, dateTo) =>
  api.get('/reports/customer-statements/batch', { params: { date_from: dateFrom, date_to: dateTo } })
export const getCustomerStatementPrintView = (customerName, dateFrom, dateTo) =>
  api.get(`/reports/customer-statement/${encodeURIComponent(customerName)}/print-view`, {
    params: { date_from: dateFrom, date_to: dateTo }
  })
export const emailBatchStatements = (dateFrom, dateTo) =>
  api.post('/reports/customer-statements/email-batch', null, {
    params: { date_from: dateFrom, date_to: dateTo }
  })
export const getVendorStatement = (vendorName, dateFrom, dateTo) =>
  api.get(`/reports/vendor-statement/${encodeURIComponent(vendorName)}`, {
    params: { date_from: dateFrom, date_to: dateTo }
  })

// CSV Export
export const exportCsv = (reportType, params = {}) =>
  api.get(`/reports/export/csv/${reportType}`, { params, responseType: 'blob' })
