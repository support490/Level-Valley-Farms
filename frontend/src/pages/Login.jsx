import { useState } from 'react'
import { login } from '../api/auth'
import useAuth from '../hooks/useAuth'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { loginUser } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    setError('')
    setSubmitting(true)
    try {
      const res = await login(username, password)
      loginUser(res.data.access_token, res.data.user)
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-lvf-darker flex items-center justify-center p-4">
      <div className="glass-card p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-lvf-accent to-lvf-accent2 bg-clip-text text-transparent">
            Level Valley Farms
          </h1>
          <p className="text-sm text-lvf-muted mt-1">Farm Accounting System</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-lvf-danger/10 border border-lvf-danger/30 text-sm text-lvf-danger">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Username</label>
            <input className="glass-input w-full" required value={username} placeholder="admin"
              onChange={e => setUsername(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Password</label>
            <input className="glass-input w-full" type="password" required value={password} placeholder="admin"
              onChange={e => setPassword(e.target.value)} />
          </div>
          <button type="submit" disabled={submitting}
            className="glass-button-primary w-full py-3 text-center font-medium">
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
          <p className="text-center text-xs text-lvf-muted mt-4">
            Default: admin / admin
          </p>
        </form>
      </div>
    </div>
  )
}
