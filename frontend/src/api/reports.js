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

// CSV Export
export const exportCsv = (reportType, params = {}) =>
  api.get(`/reports/export/csv/${reportType}`, { params, responseType: 'blob' })
