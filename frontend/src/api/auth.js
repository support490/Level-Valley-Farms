import api from './client'

export const login = (username, password) => {
  const params = new URLSearchParams()
  params.append('username', username)
  params.append('password', password)
  return api.post('/auth/login', params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
}

export const register = (data) => api.post('/auth/register', data)
export const getMe = () => api.get('/auth/me')
export const getUsers = () => api.get('/auth/users')
export const updateUser = (id, data) => api.put(`/auth/users/${id}`, data)

// Notifications
export const getNotifications = (params = {}) => api.get('/auth/notifications', { params })
export const markNotificationRead = (id) => api.post(`/auth/notifications/${id}/read`)
export const markAllNotificationsRead = () => api.post('/auth/notifications/mark-all-read')

// Activity
export const getEntityActivity = (entityType, entityId) =>
  api.get(`/auth/activity/${entityType}/${entityId}`)
