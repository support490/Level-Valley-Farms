import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Warehouse, Bird, Building2,
  Receipt, Egg, BarChart3, Settings, TrendingUp, Truck, FileText, Wheat,
  Sun, Moon, Container,
} from 'lucide-react'
import useTheme from '../../hooks/useTheme'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/growers', icon: Building2, label: 'Farm Management' },
  { to: '/flocks', icon: Bird, label: 'Flocks' },
  { to: '/production', icon: TrendingUp, label: 'Production' },
  { to: '/accounting', icon: Receipt, label: 'Accounting' },
  { to: '/inventory', icon: Egg, label: 'Egg Inventory' },
  { to: '/contracts', icon: FileText, label: 'Contracts' },
  { to: '/feed', icon: Wheat, label: 'Feed & Inputs' },
  { to: '/equipment', icon: Container, label: 'Equipment' },
  { to: '/logistics', icon: Truck, label: 'Logistics' },
  { to: '/reports', icon: BarChart3, label: 'Reports' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export default function Sidebar() {
  const { theme, toggleTheme } = useTheme()

  return (
    <aside className="glass-sidebar w-64 flex flex-col">
      <div className="p-6 border-b border-lvf-border">
        <h1 className="text-xl font-bold bg-gradient-to-r from-lvf-accent to-lvf-accent2 bg-clip-text text-transparent">
          Level Valley Farms
        </h1>
        <p className="text-xs text-lvf-muted mt-1">Farm Accounting System</p>
      </div>
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-lvf-accent/15 text-lvf-accent border border-lvf-accent/20'
                  : 'text-lvf-muted hover:text-lvf-text hover:bg-white/5'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="px-3 pb-14 border-t border-lvf-border/30 pt-3">
        <button onClick={toggleTheme}
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-lvf-muted hover:text-lvf-text hover:bg-white/5 transition-all w-full">
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </button>
      </div>
    </aside>
  )
}
