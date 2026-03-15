import api from './client'

// Pickup Jobs
export const getPickups = (params = {}) => api.get('/logistics/pickups', { params })
export const getPickup = (id) => api.get(`/logistics/pickups/${id}`)
export const createPickup = (data) => api.post('/logistics/pickups', data)
export const completePickup = (id, items) => api.post(`/logistics/pickups/${id}/complete`, items)
export const cancelPickup = (id) => api.post(`/logistics/pickups/${id}/cancel`)

// Shipments
export const getShipments = (params = {}) => api.get('/logistics/shipments', { params })
export const getShipment = (id) => api.get(`/logistics/shipments/${id}`)
export const createShipment = (data) => api.post('/logistics/shipments', data)
export const updateShipmentStatus = (id, status) => api.put(`/logistics/shipments/${id}/status`, { status })
