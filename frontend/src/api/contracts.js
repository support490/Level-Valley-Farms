import api from './client'

export const getContracts = (params = {}) => api.get('/contracts', { params })
export const getContract = (id) => api.get(`/contracts/${id}`)
export const createContract = (data) => api.post('/contracts', data)
export const updateContract = (id, data) => api.put(`/contracts/${id}`, data)
export const deleteContract = (id) => api.delete(`/contracts/${id}`)

export const assignFlockToContract = (data) => api.post('/contracts/assign', data)
export const unassignFlockFromContract = (contractId, flockId) =>
  api.delete(`/contracts/${contractId}/flocks/${flockId}`)
export const getFlockContracts = (flockId) => api.get(`/contracts/flock/${flockId}`)
