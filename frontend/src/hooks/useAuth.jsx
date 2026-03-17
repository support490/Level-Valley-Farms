import { createContext, useContext, useState, useEffect } from 'react'
import api from '../api/client'
import { getMe } from '../api/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('lvf_token')
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
      getMe().then(res => {
        setUser(res.data)
        setLoading(false)
      }).catch(() => {
        localStorage.removeItem('lvf_token')
        delete api.defaults.headers.common['Authorization']
        setLoading(false)
      })
    } else {
      setLoading(false)
    }
  }, [])

  const loginUser = (token, userData) => {
    localStorage.setItem('lvf_token', token)
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`
    setUser(userData)
  }

  const logout = () => {
    localStorage.removeItem('lvf_token')
    delete api.defaults.headers.common['Authorization']
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, loginUser, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export default function useAuth() {
  return useContext(AuthContext)
}
