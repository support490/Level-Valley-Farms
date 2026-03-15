import api from './client'

export const getSettings = () => api.get('/settings/app')
export const updateSettings = (data) => api.put('/settings/app', data)
export const getAuditLog = (params = {}) => api.get('/settings/audit-log', { params })
export const getDbStats = () => api.get('/settings/db-stats')
export const exportData = () => api.get('/settings/export')
