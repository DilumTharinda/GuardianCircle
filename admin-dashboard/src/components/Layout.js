import React, { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  ShieldAlert,
  Flag,
  BarChart3,
  UserCheck,
  LogOut,
  Menu,
  X,
  Shield,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Layout({ activeAlertCount = 0, flaggedReportCount = 0 }) {
  const { profile, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = [
    {
      to: '/alerts',
      label: 'Active SOS Alerts',
      icon: ShieldAlert,
      badge: activeAlertCount > 0 ? activeAlertCount : null,
      badgeType: 'danger',
    },
    {
      to: '/moderation',
      label: 'Report Moderation',
      icon: Flag,
      badge: flaggedReportCount > 0 ? flaggedReportCount : null,
      badgeType: 'warning',
    },
    {
      to: '/analytics',
      label: 'Heatmap & Analytics',
      icon: BarChart3,
    },
    {
      to: '/admins',
      label: 'Admin Roles & Audit',
      icon: UserCheck,
    },
  ];

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="app-shell">
      {sidebarOpen && <div className="sidebar-backdrop" onClick={closeSidebar} />}

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="brand">
            <div className="brand-icon">
              <Shield size={20} />
            </div>
            <div>
              <div className="brand-title">GuardianCircle</div>
              <div className="brand-subtitle">Admin &amp; Moderation</div>
            </div>
          </div>
          <button
            className="mobile-close-btn"
            onClick={closeSidebar}
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `nav-link ${isActive ? 'active' : ''}`
                }
              >
                <Icon size={18} />
                <span className="nav-label">{item.label}</span>
                {item.badge !== null && item.badge !== undefined && (
                  <span className={`nav-badge ${item.badgeType || ''}`}>
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="admin-user-card">
            <div className="admin-avatar">
              {(profile?.displayName || profile?.email || 'A')[0].toUpperCase()}
            </div>
            <div className="admin-user-info">
              <div className="admin-user-name">
                {profile?.displayName || 'Administrator'}
              </div>
              <div className="admin-user-email">{profile?.email}</div>
            </div>
          </div>
          <button className="logout-btn" onClick={logout}>
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      <div className="main-area">
        <header className="mobile-topbar">
          <button
            className="menu-toggle-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={22} />
          </button>
          <span className="topbar-title">GuardianCircle Admin</span>
        </header>

        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
