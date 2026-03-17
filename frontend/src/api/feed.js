import api from './client'

// Vendors
export const getVendors = (params = {}) => api.get('/feed/vendors', { params })
export const createVendor = (data) => api.post('/feed/vendors', data)
export const updateVendor = (id, data) => api.put(`/feed/vendors/${id}`, data)

// Feed Deliveries
export const getFeedDeliveries = (params = {}) => api.get('/feed/deliveries', { params })
export const createFeedDelivery = (data) => api.post('/feed/deliveries', data)
export const getFeedInventory = () => api.get('/feed/inventory')
export const getFeedConversion = () => api.get('/feed/conversion')

// Medications
export const getMedications = (params = {}) => api.get('/feed/medications', { params })
export const createMedication = (data) => api.post('/feed/medications', data)
export const updateMedication = (id, data) => api.put(`/feed/medications/${id}`, data)
export const administerMedication = (data) => api.post('/feed/medications/administer', data)
export const getMedicationAdmins = (params = {}) => api.get('/feed/medications/admins', { params })

// Purchase Orders
export const getPurchaseOrders = (params = {}) => api.get('/feed/purchase-orders', { params })
export const createPurchaseOrder = (data) => api.post('/feed/purchase-orders', data)
export const updatePOStatus = (id, status) => api.put(`/feed/purchase-orders/${id}/status`, { status })
