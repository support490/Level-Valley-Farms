import api from './client'

// Drivers
export const getDrivers = (params = {}) => api.get('/logistics/drivers', { params })
export const getDriver = (id) => api.get(`/logistics/drivers/${id}`)
export const createDriver = (data) => api.post('/logistics/drivers', data)
export const updateDriver = (id, data) => api.put(`/logistics/drivers/${id}`, data)

// Carriers
export const getCarriers = (params = {}) => api.get('/logistics/carriers', { params })
export const getCarrier = (id) => api.get(`/logistics/carriers/${id}`)
export const createCarrier = (data) => api.post('/logistics/carriers', data)
export const updateCarrier = (id, data) => api.put(`/logistics/carriers/${id}`, data)

// Pickup Jobs
export const getPickups = (params = {}) => api.get('/logistics/pickups', { params })
export const getPickup = (id) => api.get(`/logistics/pickups/${id}`)
export const createPickup = (data) => api.post('/logistics/pickups', data)
export const completePickup = (id, items) => api.post(`/logistics/pickups/${id}/complete`, items)
export const cancelPickup = (id) => api.post(`/logistics/pickups/${id}/cancel`)
export const getPickupsCalendar = (startDate, endDate) =>
  api.get('/logistics/pickups/calendar', { params: { start_date: startDate, end_date: endDate } })

// Shipments
export const getShipments = (params = {}) => api.get('/logistics/shipments', { params })
export const getShipment = (id) => api.get(`/logistics/shipments/${id}`)
export const createShipment = (data) => api.post('/logistics/shipments', data)
export const updateShipmentStatus = (id, status) => api.put(`/logistics/shipments/${id}/status`, { status })
export const confirmDelivery = (id, data) => api.post(`/logistics/shipments/${id}/confirm-delivery`, data)
export const downloadBolPdf = (id) => api.get(`/logistics/shipments/${id}/bol-pdf`, { responseType: 'blob' })
export const getBolPdfUrl = (id) => `/api/logistics/shipments/${id}/bol-pdf`

// Egg Returns
export const getReturns = (params = {}) => api.get('/logistics/returns', { params })
export const getReturn = (id) => api.get(`/logistics/returns/${id}`)
export const createReturn = (data) => api.post('/logistics/returns', data)
