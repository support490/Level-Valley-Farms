import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Warehouse, Bird, Building2,
  Receipt, Egg, BarChart3, Settings, TrendingUp, Truck
} from 'lucide-react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/growers', icon: Building2, label: 'Farm Management' },
  { to: '/flocks', icon: Bird, label: 'Flocks' },
  { to: '/production', icon: TrendingUp, label: 'Production' },
  { to: '/accounting', icon: Receipt, label: 'Accounting' },
  { to: '/inventory', icon: Egg, label: 'Egg Inventory' },
  { to: '/logistics', icon: Truck, label: 'Logistics' },
  { to: '/reports', icon: BarChart3, label: 'Reports' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export default function Sidebar() {
  return (
    <aside className="glass-sidebar w-64 flex flex-col">
      <div className="p-6 border-b border-lvf-border">
        <h1 className="text-xl font-bold bg-gradient-to-r from-lvf-accent to-lvf-accent2 bg-clip-text text-transparent">
          Level Valley Farms
        </h1>
        <p className="text-xs text-lvf-muted mt-1">Farm Accounting System</p>
      </div>
      <nav className="flex-1 py-4 px-3 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
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
    </aside>
  )
}
