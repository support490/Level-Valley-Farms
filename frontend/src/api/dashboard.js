import api from './client'

export const getDashboardStats = () => api.get('/dashboard/stats')
export const getRecentActivity = () => api.get('/dashboard/recent-activity')
export const getAlerts = () => api.get('/dashboard/alerts')
export const globalSearch = (q) => api.get('/dashboard/search', { params: { q } })
