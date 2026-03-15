import api from './client'

export const getBarns = (params = {}) =>
  api.get('/barns', { params })

export const getBarn = (id) => api.get(`/barns/${id}`)
export const createBarn = (data) => api.post('/barns', data)
export const updateBarn = (id, data) => api.put(`/barns/${id}`, data)
export const deleteBarn = (id) => api.delete(`/barns/${id}`)
