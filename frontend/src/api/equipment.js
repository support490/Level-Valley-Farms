import api from './client'

// CRUD
export const getEquipment = (params = {}) => api.get('/equipment', { params })
export const createEquipment = (data) => api.post('/equipment', data)
export const getEquipmentById = (id) => api.get(`/equipment/${id}`)
export const updateEquipment = (id, data) => api.put(`/equipment/${id}`, data)

// Hook / Unhook / Park
export const hookTrailer = (truckId, trailerId) => api.post(`/equipment/${truckId}/hook`, { trailer_id: trailerId })
export const unhookTrailer = (truckId, barnId = null) => api.post(`/equipment/${truckId}/unhook`, { barn_id: barnId })
export const parkTrailer = (trailerId, barnId = null) => api.post(`/equipment/${trailerId}/park`, { barn_id: barnId })

// Trucks with trailers (for dropdowns)
export const getTrucksWithTrailers = () => api.get('/equipment/trucks-with-trailers')
