// filepath: packages/web/src/components/dashboard/layouts/DashboardSidebar.tsx

/**
 * HEYS EAP 3.0 - Dashboard Sidebar Component
 * 
 * Purpose: Navigation sidebar with permission-based menu items
 * Features: Collapsible design, role-based navigation, modern icons
 */

'use client'

import React from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { usePermissions, PermissionGate } from '@heys/auth'

interface SidebarItem {
  id: string
  label: string
  href: string
  icon: React.ReactNode
  permission?: string
  permissions?: string[]
  badge?: string
  children?: SidebarItem[]
}

interface DashboardSidebarProps {
  isOpen: boolean
  isMobileMenuOpen: boolean
  onClose: () => void
  onToggle: () => void
}

/**
 * Sidebar navigation items with permission requirements
 */
const sidebarItems: SidebarItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    href: '/dashboard',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2 2v10z" />
      </svg>
    ),
    permissions: ['dashboard:read']
  },
  {
    id: 'users',
    label: 'Users',
    href: '/dashboard/users',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
      </svg>
    ),
    permissions: ['users:read'],
    children: [
      {
        id: 'users-list',
        label: 'All Users',
        href: '/dashboard/users',
        icon: null,
        permissions: ['users:read']
      },
      {
        id: 'users-roles',
        label: 'Roles & Permissions',
        href: '/dashboard/users/roles',
        icon: null,
        permissions: ['roles:read', 'users:admin']
      }
    ]
  },
  {
    id: 'content',
    label: 'Content',
    href: '/dashboard/content',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2.5 2.5 0 00-2.5-2.5H15" />
      </svg>
    ),
    permissions: ['content:read']
  },
  {
    id: 'reports',
    label: 'Reports',
    href: '/dashboard/reports',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    permissions: ['reports:read']
  },
  {
    id: 'admin',
    label: 'Administration',
    href: '/dashboard/admin',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    permissions: ['system:admin', 'users:admin'],
    children: [
      {
        id: 'admin-system',
        label: 'System Settings',
        href: '/dashboard/admin/system',
        icon: null,
        permissions: ['system:admin']
      },
      {
        id: 'admin-audit',
        label: 'Audit Logs',
        href: '/dashboard/admin/audit',
        icon: null,
        permissions: ['audit:read']
      }
    ]
  }
]

/**
 * Individual sidebar navigation item component
 */
interface SidebarItemComponentProps {
  item: SidebarItem
  isActive: boolean
  isCollapsed: boolean
  onItemClick: () => void
}

function SidebarItemComponent({ 
  item, 
  isActive, 
  isCollapsed,
  onItemClick 
}: SidebarItemComponentProps): React.ReactElement | null {
  const router = useRouter()
  const { hasAnyPermission } = usePermissions()

  // Check if user has required permissions
  const hasPermission = !item.permissions || hasAnyPermission(item.permissions as never[])
  
  if (!hasPermission) {
    return null
  }

  const handleClick = () => {
    router.push(item.href)
    onItemClick()
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        className={`
          group flex items-center w-full px-2 py-2 text-left text-sm font-medium rounded-md transition-colors
          ${isActive
            ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-600'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }
        `}
      >
        <div className="flex-shrink-0 mr-3 h-5 w-5">
          {item.icon}
        </div>
        
        {!isCollapsed && (
          <>
            <span className="flex-1">{item.label}</span>
            {item.badge && (
              <span className="ml-3 inline-block py-0.5 px-2 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                {item.badge}
              </span>
            )}
          </>
        )}
      </button>

      {/* Submenu items */}
      {!isCollapsed && item.children && (
        <div className="mt-1 ml-6 space-y-1">
          {item.children.map((child) => (
            <SidebarItemComponent
              key={child.id}
              item={child}
              isActive={child.href === window.location.pathname}
              isCollapsed={false}
              onItemClick={onItemClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Main sidebar component
 */
export function DashboardSidebar({
  isOpen,
  isMobileMenuOpen,
  onClose,
  onToggle
}: DashboardSidebarProps): React.ReactElement {
  const pathname = usePathname()

  const sidebarClasses = `
    fixed inset-y-0 left-0 z-50 flex flex-col bg-white border-r border-gray-200 transition-all duration-300
    ${isOpen ? 'w-64' : 'w-16'}
    ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
  `

  return (
    <div className={sidebarClasses}>
      {/* Sidebar header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
        {isOpen && (
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <h1 className="text-xl font-bold text-blue-600">HEYS</h1>
            </div>
            <span className="ml-2 text-xs text-gray-500 font-medium">EAP 3.0</span>
          </div>
        )}
        
        {!isOpen && (
          <div className="flex items-center justify-center w-full">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">H</span>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {sidebarItems.map((item) => (
          <PermissionGate
            key={item.id}
            anyPermissions={item.permissions as never[]}
          >
            <SidebarItemComponent
              item={item}
              isActive={pathname === item.href}
              isCollapsed={!isOpen}
              onItemClick={onClose}
            />
          </PermissionGate>
        ))}
      </nav>

      {/* Sidebar footer */}
      <div className="border-t border-gray-200 p-4">
        {isOpen && (
          <div className="text-xs text-gray-500 text-center">
            <p>Version 3.0.0</p>
            <p className="mt-1">© 2025 HEYS</p>
          </div>
        )}
        
        {!isOpen && (
          <div className="flex justify-center">
            <div className="w-2 h-2 bg-green-400 rounded-full" title="System Online"></div>
          </div>
        )}
      </div>
    </div>
  )
}

export default DashboardSidebar
