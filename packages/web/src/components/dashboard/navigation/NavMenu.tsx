// filepath: packages/web/src/components/dashboard/navigation/NavMenu.tsx

/**
 * HEYS EAP 3.0 - Navigation Menu Component
 * 
 * Purpose: Main navigation menu with permission-based access control
 * Features: Hierarchical navigation, permission gates, responsive design
 */

'use client'

import React, { useState } from 'react'
import { usePermissions } from '@heys/auth'

interface NavMenuItem {
  id: string
  title: string
  href?: string
  icon?: React.ReactNode
  permission?: string
  children?: NavMenuItem[]
  external?: boolean
  badge?: string
}

interface NavMenuProps {
  className?: string
  orientation?: 'vertical' | 'horizontal'
  onItemClick?: (item: NavMenuItem) => void
  activeItemId?: string
  collapsible?: boolean
}

/**
 * Navigation menu structure with permission requirements
 */
const navigationItems: NavMenuItem[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    href: '/dashboard',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2 2z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5a2 2 0 012-2h4a2 2 0 012 2v2H8V5z" />
      </svg>
    )
  },
  {
    id: 'users',
    title: 'User Management',
    permission: 'users:read',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    ),
    children: [
      {
        id: 'users-list',
        title: 'All Users',
        href: '/dashboard/users',
        permission: 'users:read'
      },
      {
        id: 'users-create',
        title: 'Add User',
        href: '/dashboard/users/create',
        permission: 'users:create'
      },
      {
        id: 'roles',
        title: 'Roles & Permissions',
        href: '/dashboard/roles',
        permission: 'roles:read'
      }
    ]
  },
  {
    id: 'content',
    title: 'Content Management',
    permission: 'content:read',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
      </svg>
    ),
    children: [
      {
        id: 'posts',
        title: 'Posts',
        href: '/dashboard/posts',
        permission: 'content:read'
      },
      {
        id: 'pages',
        title: 'Pages',
        href: '/dashboard/pages',
        permission: 'content:read'
      },
      {
        id: 'media',
        title: 'Media Library',
        href: '/dashboard/media',
        permission: 'content:read'
      }
    ]
  },
  {
    id: 'analytics',
    title: 'Analytics',
    permission: 'analytics:read',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    children: [
      {
        id: 'analytics-overview',
        title: 'Overview',
        href: '/dashboard/analytics',
        permission: 'analytics:read'
      },
      {
        id: 'analytics-reports',
        title: 'Reports',
        href: '/dashboard/analytics/reports',
        permission: 'analytics:read'
      }
    ]
  },
  {
    id: 'system',
    title: 'System',
    permission: 'system:read',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    children: [
      {
        id: 'system-settings',
        title: 'Settings',
        href: '/dashboard/system/settings',
        permission: 'system:admin'
      },
      {
        id: 'system-logs',
        title: 'System Logs',
        href: '/dashboard/system/logs',
        permission: 'system:admin'
      },
      {
        id: 'system-health',
        title: 'Health Monitor',
        href: '/dashboard/system/health',
        permission: 'system:read'
      }
    ]
  }
]

/**
 * Navigation item component
 */
interface NavMenuItemProps {
  item: NavMenuItem
  isActive?: boolean
  isExpanded?: boolean
  hasChildren?: boolean
  level?: number
  onItemClick?: (item: NavMenuItem) => void
  onToggleExpand?: (itemId: string) => void
  orientation?: 'vertical' | 'horizontal'
}

function NavMenuItemComponent({
  item,
  isActive = false,
  isExpanded = false,
  hasChildren = false,
  level = 0,
  onItemClick,
  onToggleExpand,
  orientation = 'vertical'
}: NavMenuItemProps): React.ReactElement {
  const { hasPermission } = usePermissions()
  
  // Check permission if required
  if (item.permission && !hasPermission(item.permission)) {
    return <></>
  }

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    
    if (hasChildren && onToggleExpand) {
      onToggleExpand(item.id)
    } else if (onItemClick) {
      onItemClick(item)
    }
  }

  const baseClasses = `
    flex items-center justify-between w-full px-3 py-2 text-sm font-medium rounded-md
    transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
  `
  
  const activeClasses = isActive
    ? 'bg-blue-100 text-blue-900 border-l-4 border-blue-500'
    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'

  const levelPadding = level > 0 ? `pl-${3 + level * 4}` : ''

  return (
    <div>
      <button
        onClick={handleClick}
        className={`${baseClasses} ${activeClasses} ${levelPadding}`}
        type="button"
      >
        <div className="flex items-center space-x-3">
          {item.icon && (
            <span className="flex-shrink-0">
              {item.icon}
            </span>
          )}
          <span className="flex-1 text-left">{item.title}</span>
          {item.badge && (
            <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
              {item.badge}
            </span>
          )}
        </div>
        
        {hasChildren && (
          <svg
            className={`h-4 w-4 transform transition-transform duration-200 ${
              isExpanded ? 'rotate-90' : 'rotate-0'
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}
      </button>

      {hasChildren && isExpanded && item.children && (
        <div className={`${orientation === 'vertical' ? 'ml-2 mt-1' : 'absolute z-10 mt-1 bg-white shadow-lg rounded-md'}`}>
          {item.children.map((child) => (
            <NavMenuItemComponent
              key={child.id}
              item={child}
              level={level + 1}
              onItemClick={onItemClick}
              orientation={orientation}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Search functionality for navigation
 */
interface NavSearchProps {
  onSearch: (query: string) => void
  placeholder?: string
}

function NavSearch({ onSearch, placeholder = "Search navigation..." }: NavSearchProps): React.ReactElement {
  const [query, setQuery] = useState('')

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    onSearch(value)
  }

  return (
    <div className="relative mb-4">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <input
        type="text"
        value={query}
        onChange={handleSearch}
        className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
        placeholder={placeholder}
      />
    </div>
  )
}

/**
 * Main navigation menu component
 */
export function NavMenu({
  className = '',
  orientation = 'vertical',
  onItemClick,
  activeItemId,
  collapsible = true
}: NavMenuProps): React.ReactElement {
  const { hasPermission, isLoading } = usePermissions()
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [filteredItems, setFilteredItems] = useState<NavMenuItem[]>(navigationItems)

  // Filter items based on permissions and search
  React.useEffect(() => {
    const filterItems = (items: NavMenuItem[]): NavMenuItem[] => {
      return items.filter(item => {
        // Check permission
        if (item.permission && !hasPermission(item.permission)) {
          return false
        }

        // Check search query
        if (searchQuery) {
          const matchesTitle = item.title.toLowerCase().includes(searchQuery.toLowerCase())
          const matchesChildren = item.children?.some(child => 
            child.title.toLowerCase().includes(searchQuery.toLowerCase())
          )
          return matchesTitle || matchesChildren
        }

        return true
      }).map(item => ({
        ...item,
        children: item.children ? filterItems(item.children) : undefined
      }))
    }

    if (!isLoading) {
      setFilteredItems(filterItems(navigationItems))
    }
  }, [hasPermission, isLoading, searchQuery])

  const handleToggleExpand = (itemId: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev)
      if (newSet.has(itemId)) {
        newSet.delete(itemId)
      } else {
        newSet.add(itemId)
      }
      return newSet
    })
  }

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    // Auto-expand items when searching
    if (query) {
      const allItemIds = navigationItems.map(item => item.id)
      setExpandedItems(new Set(allItemIds))
    }
  }

  if (isLoading) {
    return (
      <div className={`space-y-2 ${className}`}>
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="animate-pulse">
            <div className="h-10 bg-gray-200 rounded-md"></div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <nav className={className}>
      {/* Search */}
      <NavSearch onSearch={handleSearch} />

      {/* Navigation items */}
      <div className={`space-y-1 ${orientation === 'horizontal' ? 'flex space-x-1 space-y-0' : ''}`}>
        {filteredItems.map((item) => (
          <NavMenuItemComponent
            key={item.id}
            item={item}
            isActive={activeItemId === item.id}
            isExpanded={expandedItems.has(item.id)}
            hasChildren={!!item.children?.length}
            onItemClick={onItemClick}
            onToggleExpand={collapsible ? handleToggleExpand : undefined}
            orientation={orientation}
          />
        ))}
      </div>

      {/* No results message */}
      {searchQuery && filteredItems.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <svg className="h-8 w-8 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p className="text-sm">No navigation items found</p>
          <p className="text-xs mt-1">Try adjusting your search terms</p>
        </div>
      )}
    </nav>
  )
}

export default NavMenu
