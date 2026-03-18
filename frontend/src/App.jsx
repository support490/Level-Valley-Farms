import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import Growers from './pages/Growers'
import Flocks from './pages/Flocks'
import FlockDetail from './pages/FlockDetail'
import Accounting from './pages/Accounting'
import Production from './pages/Production'
import Inventory from './pages/Inventory'
import WarehouseShipping from './pages/WarehouseShipping'
import Contracts from './pages/Contracts'
import Feed from './pages/Feed'
import Equipment from './pages/Equipment'
import Logistics from './pages/Logistics'
import Reports from './pages/Reports'
import Maps from './pages/Maps'
import Settings from './pages/Settings'
import Login from './pages/Login'
import ErrorBoundary from './components/common/ErrorBoundary'
import { AuthProvider } from './hooks/useAuth'
import useAuth from './hooks/useAuth'
import { ThemeProvider } from './hooks/useTheme'
import GoogleMapsProvider from './components/common/GoogleMapsProvider'

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-lvf-border border-t-lvf-accent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) {
    return <Login />
  }

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
        <Route path="growers" element={<ErrorBoundary><Growers /></ErrorBoundary>} />
        <Route path="barns" element={<Navigate to="/growers" replace />} />
        <Route path="flocks" element={<ErrorBoundary><Flocks /></ErrorBoundary>} />
        <Route path="flocks/:flockId" element={<ErrorBoundary><FlockDetail /></ErrorBoundary>} />
        <Route path="production" element={<ErrorBoundary><Production /></ErrorBoundary>} />
        <Route path="accounting" element={<ErrorBoundary><Accounting /></ErrorBoundary>} />
        <Route path="warehouse" element={<ErrorBoundary><WarehouseShipping /></ErrorBoundary>} />
        <Route path="inventory" element={<Navigate to="/warehouse" replace />} />
        <Route path="logistics" element={<Navigate to="/warehouse" replace />} />
        <Route path="contracts" element={<ErrorBoundary><Contracts /></ErrorBoundary>} />
        <Route path="feed" element={<ErrorBoundary><Feed /></ErrorBoundary>} />
        <Route path="equipment" element={<ErrorBoundary><Equipment /></ErrorBoundary>} />
        <Route path="reports" element={<ErrorBoundary><Reports /></ErrorBoundary>} />
        <Route path="maps" element={<ErrorBoundary><Maps /></ErrorBoundary>} />
        <Route path="settings" element={<ErrorBoundary><Settings /></ErrorBoundary>} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <ThemeProvider>
          <GoogleMapsProvider>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </GoogleMapsProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
