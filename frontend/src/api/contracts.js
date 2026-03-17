import api from './client'

// Contracts
export const getContracts = (params = {}) => api.get('/contracts', { params })
export const getContract = (id) => api.get(`/contracts/${id}`)
export const createContract = (data) => api.post('/contracts', data)
export const updateContract = (id, data) => api.put(`/contracts/${id}`, data)
export const deleteContract = (id) => api.delete(`/contracts/${id}`)

export const assignFlockToContract = (data) => api.post('/contracts/assign', data)
export const unassignFlockFromContract = (contractId, flockId) =>
  api.delete(`/contracts/${contractId}/flocks/${flockId}`)
export const getFlockContracts = (flockId) => api.get(`/contracts/flock/${flockId}`)

// Contract Intelligence
export const getContractDashboard = () => api.get('/contracts/dashboard')
export const getContractPnl = (id) => api.get(`/contracts/${id}/pnl`)
export const getContractAlerts = () => api.get('/contracts/alerts')
export const getPriceHistory = (params = {}) => api.get('/contracts/price-history', { params })
export const getSpotSales = () => api.get('/contracts/spot-sales')

// Buyers
export const getBuyers = (params = {}) => api.get('/contracts/buyers', { params })
export const getBuyer = (id) => api.get(`/contracts/buyers/${id}`)
export const createBuyer = (data) => api.post('/contracts/buyers', data)
export const updateBuyer = (id, data) => api.put(`/contracts/buyers/${id}`, data)
