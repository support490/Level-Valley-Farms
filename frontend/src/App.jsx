import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import Growers from './pages/Growers'
import Barns from './pages/Barns'
import Flocks from './pages/Flocks'
import Accounting from './pages/Accounting'
import Production from './pages/Production'
import Inventory from './pages/Inventory'
import Logistics from './pages/Logistics'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import ErrorBoundary from './components/common/ErrorBoundary'

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
            <Route path="growers" element={<ErrorBoundary><Growers /></ErrorBoundary>} />
            <Route path="barns" element={<ErrorBoundary><Barns /></ErrorBoundary>} />
            <Route path="flocks" element={<ErrorBoundary><Flocks /></ErrorBoundary>} />
            <Route path="production" element={<ErrorBoundary><Production /></ErrorBoundary>} />
            <Route path="accounting" element={<ErrorBoundary><Accounting /></ErrorBoundary>} />
            <Route path="inventory" element={<ErrorBoundary><Inventory /></ErrorBoundary>} />
            <Route path="logistics" element={<ErrorBoundary><Logistics /></ErrorBoundary>} />
            <Route path="reports" element={<ErrorBoundary><Reports /></ErrorBoundary>} />
            <Route path="settings" element={<ErrorBoundary><Settings /></ErrorBoundary>} />
          </Route>
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
