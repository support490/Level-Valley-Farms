import api from './client'

export const getEggGrades = () => api.get('/inventory/grades')
export const createEggGrade = (data) => api.post('/inventory/grades', data)
export const deleteEggGrade = (id) => api.delete(`/inventory/grades/${id}`)

export const addInventory = (data) => api.post('/inventory/eggs', data)
export const getInventory = (params = {}) => api.get('/inventory/eggs', { params })
export const getInventorySummary = () => api.get('/inventory/eggs/summary')
export const getInventoryByFlock = () => api.get('/inventory/eggs/by-flock')
export const getInventoryAging = (maxDays = 7) => api.get('/inventory/eggs/aging', { params: { max_age_days: maxDays } })
export const getInventoryValue = () => api.get('/inventory/eggs/value')
export const getInventoryAlerts = () => api.get('/inventory/alerts')

export const getBarnInventory = () => api.get('/inventory/barn-inventory')

export const recordSale = (data) => api.post('/inventory/sales', data)
export const getSales = (params = {}) => api.get('/inventory/sales', { params })
