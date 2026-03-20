import api from './client'

export const getSettings = () => api.get('/settings/app')
export const updateSettings = (data) => api.put('/settings/app', data)
export const getAuditLog = (params = {}) => api.get('/settings/audit-log', { params })
export const getDbStats = () => api.get('/settings/db-stats')
export const exportData = () => api.get('/settings/export')
export const downloadBackup = () => api.get('/settings/backup', { responseType: 'blob' })
export const importCsv = (file, entityType) => {
  const formData = new FormData()
  formData.append('file', file)
  return api.post(`/settings/import/csv?entity_type=${entityType}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

// Company Logo
export const uploadLogo = (file) => {
  const formData = new FormData()
  formData.append('file', file)
  return api.post('/settings/logo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}
export const getLogoUrl = () => '/api/settings/logo'
