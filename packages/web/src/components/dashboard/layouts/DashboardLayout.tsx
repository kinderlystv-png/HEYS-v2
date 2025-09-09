// filepath: packages/web/src/components/dashboard/layouts/DashboardLayout.tsx

/**
 * HEYS EAP 3.0 - Modern Dashboard Layout
 * 
 * Purpose: Main dashboard layout with integrated permission system
 * Features: Responsive design, permission-based navigation, modern UI
 */

'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'

import { useAuth, usePermissions, PermissionGate } from '@heys/auth'
import { DashboardHeader } from './DashboardHeader'
import { DashboardSidebar } from './DashboardSidebar'

interface DashboardLayoutProps {
  children: React.ReactNode
  title?: string
  subtitle?: string
  showBreadcrumb?: boolean
  sidebarCollapsed?: boolean
  className?: string
}

/**
 * Main dashboard layout component with permission integration
 * 
 * Features:
 * - Responsive sidebar that collapses on mobile
 * - Permission-based navigation visibility
 * - Modern design with Tailwind CSS
 * - Real-time user state updates
 */
export function DashboardLayout({
  children,
  title = 'Dashboard',
  subtitle,
  showBreadcrumb = true,
  sidebarCollapsed = false,
  className = ''
}: DashboardLayoutProps): React.ReactElement {
  const router = useRouter()
  const { user, logout } = useAuth()
  const { hasPermission, isLoading: permissionsLoading } = usePermissions()
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(!sidebarCollapsed)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const handleLogout = async () => {
    try {
      await logout()
      router.push('/auth/login')
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen)
  }

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen)
  }

  // Show loading state while permissions are being fetched
  if (permissionsLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen bg-gray-50 ${className}`}>
      {/* Mobile menu overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-gray-600 bg-opacity-75 lg:hidden"
          onClick={toggleMobileMenu}
        />
      )}

      {/* Sidebar */}
      <DashboardSidebar
        isOpen={isSidebarOpen}
        isMobileMenuOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        onToggle={toggleSidebar}
      />

      {/* Main content */}
      <div className={`${isSidebarOpen ? 'lg:pl-64' : 'lg:pl-16'} transition-all duration-300`}>
        {/* Header */}
        <DashboardHeader
          title={title}
          subtitle={subtitle}
          showBreadcrumb={showBreadcrumb}
          user={user}
          onMenuClick={toggleMobileMenu}
          onSidebarToggle={toggleSidebar}
          onLogout={handleLogout}
          sidebarOpen={isSidebarOpen}
        />

        {/* Page content */}
        <main className="flex-1">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              {/* Permission-based content rendering */}
              <PermissionGate
                anyPermissions={['dashboard:read', 'users:read', 'content:read']}
                fallback={
                  <div className="text-center py-12">
                    <div className="mx-auto h-12 w-12 text-gray-400">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <h3 className="mt-2 text-sm font-medium text-gray-900">Access Restricted</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      You don't have permission to access this dashboard.
                    </p>
                  </div>
                }
              >
                {children}
              </PermissionGate>
            </div>
          </div>
        </main>
      </div>

      {/* Quick actions floating button (admin only) */}
      <PermissionGate permission="system:admin">
        <div className="fixed bottom-6 right-6 z-50">
          <button
            type="button"
            className="bg-blue-600 text-white rounded-full p-3 shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
            title="Admin Actions"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </button>
        </div>
      </PermissionGate>
    </div>
  )
}

/**
 * Higher-order component for pages that need dashboard layout
 */
export function withDashboardLayout<P extends object>(
  Component: React.ComponentType<P>,
  layoutProps?: Partial<DashboardLayoutProps>
) {
  return function DashboardLayoutWrappedComponent(props: P) {
    return (
      <DashboardLayout {...layoutProps}>
        <Component {...props} />
      </DashboardLayout>
    )
  }
}

export default DashboardLayout
