import api from './client'

export const getGrowers = (includeInactive = false) =>
  api.get('/growers', { params: { include_inactive: includeInactive } })

export const getGrower = (id) => api.get(`/growers/${id}`)
export const createGrower = (data) => api.post('/growers', data)
export const updateGrower = (id, data) => api.put(`/growers/${id}`, data)
export const deleteGrower = (id) => api.delete(`/growers/${id}`)

// Grower Payment Formula
export const getPaymentFormula = (growerId) => api.get(`/growers/${growerId}/payment-formula`)
export const upsertPaymentFormula = (growerId, data) => api.put(`/growers/${growerId}/payment-formula`, data)
