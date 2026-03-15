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
