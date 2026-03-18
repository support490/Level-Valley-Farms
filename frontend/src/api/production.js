import api from './client'

export const recordProduction = (data) => api.post('/production', data)

export const recordBulkProduction = (data) => api.post('/production/bulk', data)

export const getProduction = (params = {}) =>
  api.get('/production', { params })

export const getProductionChart = (flockIds, params = {}) =>
  api.get('/production/chart', { params: { flock_ids: flockIds.join(','), ...params } })

export const getProductionSummary = (flockId) =>
  api.get(`/production/summary/${flockId}`)

export const getProductionAlerts = () => api.get('/production/alerts')

export const getBreedCurves = () => api.get('/production/breed-curves')

export const getBreedCurve = (breed) => api.get(`/production/breed-curve/${encodeURIComponent(breed)}`)

// Weekly Records
export const createWeeklyRecord = (data) => api.post('/production/weekly-record', data)
export const getWeeklyRecords = (params = {}) => api.get('/production/weekly-records', { params })
export const getWeeklyRecord = (id) => api.get(`/production/weekly-records/${id}`)
export const updateWeeklyRecord = (id, data) => api.put(`/production/weekly-records/${id}`, data)
export const deleteWeeklyRecord = (id) => api.delete(`/production/weekly-records/${id}`)
