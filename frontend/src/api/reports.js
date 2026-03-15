import api from './client'

export const getFlockReport = (flockId) => api.get(`/reports/flock/${flockId}`)

export const getIncomeStatement = (dateFrom, dateTo) =>
  api.get('/reports/income-statement', { params: { date_from: dateFrom, date_to: dateTo } })

export const getBalanceSheet = (asOfDate = null) =>
  api.get('/reports/balance-sheet', { params: asOfDate ? { as_of_date: asOfDate } : {} })
