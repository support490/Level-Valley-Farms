import api from './client'

export const getFlocks = (params = {}) =>
  api.get('/flocks', { params })

export const getFlock = (id) => api.get(`/flocks/${id}`)
export const createFlock = (data) => api.post('/flocks', data)
export const updateFlock = (id, data) => api.put(`/flocks/${id}`, data)

export const transferFlock = (id, data) => api.post(`/flocks/${id}/transfer`, data)
export const getFlockPlacements = (id) => api.get(`/flocks/${id}/placements`)

export const recordMortality = (data) => api.post('/flocks/mortality', data)
export const getMortalityRecords = (flockId = null) =>
  api.get('/flocks/mortality/records', { params: flockId ? { flock_id: flockId } : {} })
