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
