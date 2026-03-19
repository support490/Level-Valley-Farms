import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Bell, Menu, X, LogOut, User } from 'lucide-react'
import Sidebar from './Sidebar'
import GlobalSearch from './GlobalSearch'
import useAuth from '../../hooks/useAuth'
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../../api/auth'

export default function Layout() {
  const { user, logout } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [notifOpen, setNotifOpen] = useState(false)

  const loadNotifications = async () => {
    try {
      const res = await getNotifications({ unread_only: false })
      setNotifications(res.data || [])
    } catch {}
  }

  useEffect(() => {
    loadNotifications()
    const interval = setInterval(loadNotifications, 60000)
    return () => clearInterval(interval)
  }, [])

  const unreadCount = notifications.filter(n => !n.is_read).length

  const handleMarkRead = async (id) => {
    await markNotificationRead(id)
    loadNotifications()
  }

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead()
    loadNotifications()
  }

  const typeColors = {
    info: 'border-lvf-accent/30 bg-lvf-accent/5',
    warning: 'border-lvf-warning/30 bg-lvf-warning/5',
    danger: 'border-lvf-danger/30 bg-lvf-danger/5',
    success: 'border-lvf-success/30 bg-lvf-success/5',
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 lg:static lg:block transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <Sidebar />
        {/* User info at bottom */}
        {user && (
          <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-lvf-border/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-lvf-accent/20 flex items-center justify-center flex-shrink-0">
                  <User size={12} className="text-lvf-accent" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{user.full_name}</p>
                  <p className="text-[10px] text-lvf-muted truncate">{user.role}</p>
                </div>
              </div>
              <button onClick={logout} className="p-1.5 rounded-lg hover:bg-white/10" title="Sign Out">
                <LogOut size={14} className="text-lvf-muted" />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-4 lg:px-6 py-3 border-b border-lvf-border/50 bg-lvf-darker/80 backdrop-blur-xl">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-white/10">
            <Menu size={20} />
          </button>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-3">
            <GlobalSearch />
            {/* Notification Bell */}
            <div className="relative">
              <button onClick={() => setNotifOpen(!notifOpen)} className="p-2 rounded-lg hover:bg-white/10 relative">
                <Bell size={18} className="text-lvf-muted" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-lvf-danger rounded-full text-[9px] font-bold flex items-center justify-center text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              {/* Notification Dropdown */}
              {notifOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 z-50 w-80 glass-card p-0 overflow-hidden">
                    <div className="flex items-center justify-between p-3 border-b border-lvf-border/30">
                      <h4 className="text-sm font-semibold">Notifications</h4>
                      {unreadCount > 0 && (
                        <button onClick={handleMarkAllRead} className="text-[10px] text-lvf-accent hover:underline">
                          Mark all read
                        </button>
                      )}
                    </div>
                    <div className="max-h-[400px] overflow-y-auto">
                      {notifications.length > 0 ? notifications.slice(0, 15).map(n => (
                        <div key={n.id}
                          className={`p-3 border-b border-lvf-border/20 cursor-pointer transition-all hover:bg-white/5 ${!n.is_read ? 'bg-lvf-accent/5' : ''}`}
                          onClick={() => handleMarkRead(n.id)}>
                          <div className="flex items-start gap-2">
                            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                              n.notification_type === 'danger' ? 'bg-lvf-danger' :
                              n.notification_type === 'warning' ? 'bg-lvf-warning' :
                              n.notification_type === 'success' ? 'bg-lvf-success' : 'bg-lvf-accent'
                            }`} />
                            <div className="min-w-0">
                              <p className={`text-xs font-medium ${!n.is_read ? 'text-lvf-text' : 'text-lvf-muted'}`}>{n.title}</p>
                              <p className="text-[10px] text-lvf-muted mt-0.5 line-clamp-2">{n.message}</p>
                            </div>
                          </div>
                        </div>
                      )) : (
                        <div className="p-6 text-center text-xs text-lvf-muted">No notifications</div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
