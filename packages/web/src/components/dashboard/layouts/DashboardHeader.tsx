// filepath: packages/web/src/components/dashboard/layouts/DashboardHeader.tsx

/**
 * HEYS EAP 3.0 - Dashboard Header Component
 * 
 * Purpose: Top navigation header with user menu and controls
 * Features: User profile, notifications, breadcrumbs, responsive design
 */

'use client'

import React, { useState } from 'react'
import { usePermissions, PermissionGate } from '@heys/auth'
import type { User } from '@heys/auth'

interface DashboardHeaderProps {
  title: string
  subtitle?: string
  showBreadcrumb: boolean
  user: User | null
  onMenuClick: () => void
  onSidebarToggle: () => void
  onLogout: () => void
  sidebarOpen: boolean
}

/**
 * Dashboard header with navigation and user controls
 */
export function DashboardHeader({
  title,
  subtitle,
  showBreadcrumb,
  user,
  onMenuClick,
  onSidebarToggle,
  onLogout,
  sidebarOpen
}: DashboardHeaderProps): React.ReactElement {
  const { hasPermission } = usePermissions()
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [isNotificationOpen, setIsNotificationOpen] = useState(false)

  const toggleUserMenu = () => {
    setIsUserMenuOpen(!isUserMenuOpen)
  }

  const toggleNotifications = () => {
    setIsNotificationOpen(!isNotificationOpen)
  }

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Left side - Title and navigation */}
          <div className="flex items-center">
            {/* Mobile menu button */}
            <button
              type="button"
              className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
              onClick={onMenuClick}
            >
              <span className="sr-only">Open sidebar</span>
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Desktop sidebar toggle */}
            <button
              type="button"
              className="hidden lg:block p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 ml-2"
              onClick={onSidebarToggle}
            >
              <span className="sr-only">Toggle sidebar</span>
              {sidebarOpen ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
              )}
            </button>

            {/* Title and breadcrumb */}
            <div className="ml-4">
              <div className="flex items-center">
                <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
                {subtitle && (
                  <span className="ml-2 text-sm text-gray-500">• {subtitle}</span>
                )}
              </div>
              
              {showBreadcrumb && (
                <nav className="flex mt-1" aria-label="Breadcrumb">
                  <ol className="flex items-center space-x-1 text-sm text-gray-500">
                    <li>
                      <a href="/dashboard" className="hover:text-gray-700">
                        Dashboard
                      </a>
                    </li>
                    <li>
                      <span className="mx-1">/</span>
                      <span className="text-gray-900">{title}</span>
                    </li>
                  </ol>
                </nav>
              )}
            </div>
          </div>

          {/* Right side - Notifications and user menu */}
          <div className="flex items-center space-x-4">
            {/* Notifications (admin only) */}
            <PermissionGate anyPermissions={['system:admin', 'users:admin']}>
              <div className="relative">
                <button
                  type="button"
                  className="p-2 text-gray-400 hover:text-gray-500 hover:bg-gray-100 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onClick={toggleNotifications}
                >
                  <span className="sr-only">View notifications</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {/* Notification badge */}
                  <span className="absolute top-0 right-0 block h-2 w-2 rounded-full bg-red-400"></span>
                </button>

                {/* Notifications dropdown */}
                {isNotificationOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-50">
                    <div className="py-1">
                      <div className="px-4 py-2 text-sm text-gray-700 border-b">
                        <div className="font-medium">Notifications</div>
                      </div>
                      <div className="px-4 py-3 text-sm text-gray-500">
                        No new notifications
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </PermissionGate>

            {/* Search (if user has read permissions) */}
            <PermissionGate anyPermissions={['users:read', 'content:read']}>
              <div className="hidden md:block">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    placeholder="Search..."
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>
              </div>
            </PermissionGate>

            {/* User menu */}
            <div className="relative">
              <button
                type="button"
                className="flex items-center text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={toggleUserMenu}
              >
                <span className="sr-only">Open user menu</span>
                <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center">
                  <span className="text-sm font-medium text-white">
                    {user?.email?.charAt(0).toUpperCase() || 'U'}
                  </span>
                </div>
                <span className="hidden md:block ml-2 text-sm text-gray-700">
                  {user?.email || 'User'}
                </span>
                <svg className="hidden md:block ml-1 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* User dropdown menu */}
              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-50">
                  <div className="py-1">
                    <div className="px-4 py-2 text-sm text-gray-700 border-b">
                      <div className="font-medium">{user?.email}</div>
                      <div className="text-xs text-gray-500">
                        {hasPermission('system:admin') ? 'System Administrator' : 
                         hasPermission('users:admin') ? 'Administrator' : 
                         'User'}
                      </div>
                    </div>
                    
                    <a href="/dashboard/profile" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                      Your Profile
                    </a>
                    
                    <PermissionGate permission="users:admin">
                      <a href="/dashboard/admin" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                        Admin Panel
                      </a>
                    </PermissionGate>
                    
                    <a href="/dashboard/settings" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                      Settings
                    </a>
                    
                    <div className="border-t border-gray-100">
                      <button
                        type="button"
                        onClick={onLogout}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        Sign out
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Click outside to close dropdowns */}
      {(isUserMenuOpen || isNotificationOpen) && (
        <div 
          className="fixed inset-0 z-40"
          onClick={() => {
            setIsUserMenuOpen(false)
            setIsNotificationOpen(false)
          }}
        />
      )}
    </header>
  )
}

export default DashboardHeader
