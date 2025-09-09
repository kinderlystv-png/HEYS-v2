// filepath: packages/web/src/components/dashboard/navigation/BreadcrumbNav.tsx

/**
 * HEYS EAP 3.0 - Breadcrumb Navigation Component
 * 
 * Purpose: Hierarchical navigation breadcrumbs with dynamic path resolution
 * Features: Auto-generation from routes, custom breadcrumbs, permission-aware
 */

'use client'

import { usePermissions } from '@heys/auth'
import React from 'react'

interface BreadcrumbItem {
  id: string
  label: string
  href?: string
  icon?: React.ReactNode
  permission?: string
  disabled?: boolean
}

interface BreadcrumbNavProps {
  items?: BreadcrumbItem[]
  separator?: React.ReactNode
  className?: string
  maxItems?: number
  showHome?: boolean
  onItemClick?: (item: BreadcrumbItem) => void
}

/**
 * Default separator component
 */
function DefaultSeparator(): React.ReactElement {
  return (
    <svg
      className="h-4 w-4 text-gray-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5l7 7-7 7"
      />
    </svg>
  )
}

/**
 * Home icon component
 */
function HomeIcon(): React.ReactElement {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
      />
    </svg>
  )
}

/**
 * Ellipsis component for collapsed items
 */
function EllipsisItem({ onClick }: { onClick?: () => void }): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center px-2 py-1 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors duration-200"
      type="button"
      aria-label="Show collapsed breadcrumb items"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
      </svg>
    </button>
  )
}

/**
 * Individual breadcrumb item component
 */
interface BreadcrumbItemComponentProps {
  item: BreadcrumbItem
  isLast?: boolean
  separator?: React.ReactNode
  onItemClick?: (item: BreadcrumbItem) => void
}

function BreadcrumbItemComponent({
  item,
  isLast = false,
  separator,
  onItemClick
}: BreadcrumbItemComponentProps): React.ReactElement {
  const { hasPermission } = usePermissions()

  // Check permission if required
  if (item.permission && !hasPermission(item.permission)) {
    return <></>
  }

  const handleClick = (e: React.MouseEvent) => {
    if (item.disabled || isLast || !item.href) {
      e.preventDefault()
      return
    }

    if (onItemClick) {
      e.preventDefault()
      onItemClick(item)
    }
  }

  const baseClasses = `
    inline-flex items-center space-x-1 text-sm font-medium transition-colors duration-200
    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 rounded-md px-1 py-1
  `

  const colorClasses = isLast
    ? 'text-gray-900 cursor-default'
    : item.disabled
    ? 'text-gray-400 cursor-not-allowed'
    : 'text-gray-600 hover:text-gray-900 cursor-pointer'

  const Element = item.href && !item.disabled && !isLast ? 'a' : 'span'

  return (
    <li className="flex items-center space-x-2">
      <Element
        {...(item.href && !item.disabled && !isLast ? { href: item.href } : {})}
        onClick={handleClick}
        className={`${baseClasses} ${colorClasses}`}
      >
        {item.icon && (
          <span className="flex-shrink-0">
            {item.icon}
          </span>
        )}
        <span>{item.label}</span>
      </Element>

      {!isLast && (
        <span className="flex-shrink-0">
          {separator || <DefaultSeparator />}
        </span>
      )}
    </li>
  )
}

/**
 * Function to generate breadcrumbs from current path
 */
function generateBreadcrumbsFromPath(pathname: string): BreadcrumbItem[] {
  const segments = pathname.split('/').filter(Boolean)
  const breadcrumbs: BreadcrumbItem[] = []

  // Add home
  breadcrumbs.push({
    id: 'home',
    label: 'Home',
    href: '/',
    icon: <HomeIcon />
  })

  // Build breadcrumbs from path segments
  let currentPath = ''
  segments.forEach((segment, index) => {
    currentPath += `/${segment}`
    
    // Format segment label
    const label = segment
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')

    breadcrumbs.push({
      id: `segment-${index}`,
      label,
      href: currentPath
    })
  })

  return breadcrumbs
}

/**
 * Hook to manage breadcrumb state and expansion
 */
function useBreadcrumbCollapse(items: BreadcrumbItem[], maxItems: number) {
  const [showAll, setShowAll] = React.useState(false)

  const shouldCollapse = items.length > maxItems
  const visibleItems = React.useMemo(() => {
    if (!shouldCollapse || showAll) {
      return items
    }

    // Show first item, ellipsis, and last few items
    const firstItem = items[0]
    const lastItems = items.slice(-(maxItems - 2))
    
    return [firstItem, ...lastItems]
  }, [items, shouldCollapse, showAll, maxItems])

  const hiddenCount = items.length - visibleItems.length
  const toggleShowAll = () => setShowAll(!showAll)

  return {
    visibleItems,
    hiddenCount,
    shouldCollapse,
    showAll,
    toggleShowAll
  }
}

/**
 * Main breadcrumb navigation component
 */
export function BreadcrumbNav({
  items,
  separator,
  className = '',
  maxItems = 5,
  showHome = true,
  onItemClick
}: BreadcrumbNavProps): React.ReactElement {
  const { isLoading } = usePermissions()

  // Use provided items or generate from current path
  const breadcrumbItems = React.useMemo(() => {
    if (items) {
      return showHome ? items : items.filter(item => item.id !== 'home')
    }

    // Fallback to generating from current path (in real app, would use router)
    const defaultItems = generateBreadcrumbsFromPath('/dashboard/users/manage')
    return showHome ? defaultItems : defaultItems.filter(item => item.id !== 'home')
  }, [items, showHome])

  const {
    visibleItems,
    hiddenCount,
    shouldCollapse,
    showAll,
    toggleShowAll
  } = useBreadcrumbCollapse(breadcrumbItems, maxItems)

  if (isLoading) {
    return (
      <nav className={`flex ${className}`} aria-label="Breadcrumb">
        <ol className="flex items-center space-x-2">
          {[1, 2, 3].map(i => (
            <li key={i} className="flex items-center space-x-2">
              <div className="animate-pulse">
                <div className="h-4 w-16 bg-gray-200 rounded"></div>
              </div>
              {i < 3 && <DefaultSeparator />}
            </li>
          ))}
        </ol>
      </nav>
    )
  }

  if (breadcrumbItems.length === 0) {
    return <></>
  }

  return (
    <nav className={`flex ${className}`} aria-label="Breadcrumb">
      <ol className="flex items-center space-x-2">
        {/* First item */}
        {visibleItems.length > 0 && (
          <BreadcrumbItemComponent
            item={visibleItems[0]}
            separator={separator}
            onItemClick={onItemClick}
          />
        )}

        {/* Ellipsis for collapsed items */}
        {shouldCollapse && !showAll && hiddenCount > 0 && (
          <li className="flex items-center space-x-2">
            <EllipsisItem onClick={toggleShowAll} />
            <span className="flex-shrink-0">
              {separator || <DefaultSeparator />}
            </span>
          </li>
        )}

        {/* Remaining items */}
        {visibleItems.slice(1).map((item, index) => (
          <BreadcrumbItemComponent
            key={item.id}
            item={item}
            isLast={index === visibleItems.length - 2}
            separator={separator}
            onItemClick={onItemClick}
          />
        ))}
      </ol>

      {/* Collapse toggle for long breadcrumbs */}
      {shouldCollapse && showAll && (
        <button
          onClick={toggleShowAll}
          className="ml-4 text-xs text-gray-500 hover:text-gray-700 transition-colors duration-200"
          type="button"
        >
          Show less
        </button>
      )}
    </nav>
  )
}

/**
 * Utility function to create breadcrumb items
 */
export function createBreadcrumbItem(
  id: string,
  label: string,
  href?: string,
  options?: Partial<BreadcrumbItem>
): BreadcrumbItem {
  return {
    id,
    label,
    href,
    ...options
  }
}

/**
 * Pre-built breadcrumb configurations for common pages
 */
export const commonBreadcrumbs = {
  dashboard: [
    createBreadcrumbItem('home', 'Home', '/', { icon: <HomeIcon /> }),
    createBreadcrumbItem('dashboard', 'Dashboard', '/dashboard')
  ],
  
  userManagement: [
    createBreadcrumbItem('home', 'Home', '/', { icon: <HomeIcon /> }),
    createBreadcrumbItem('dashboard', 'Dashboard', '/dashboard'),
    createBreadcrumbItem('users', 'User Management', '/dashboard/users')
  ],
  
  userProfile: (userId: string, userName: string) => [
    createBreadcrumbItem('home', 'Home', '/', { icon: <HomeIcon /> }),
    createBreadcrumbItem('dashboard', 'Dashboard', '/dashboard'),
    createBreadcrumbItem('users', 'User Management', '/dashboard/users'),
    createBreadcrumbItem('user-profile', userName, `/dashboard/users/${userId}`)
  ],
  
  systemSettings: [
    createBreadcrumbItem('home', 'Home', '/', { icon: <HomeIcon /> }),
    createBreadcrumbItem('dashboard', 'Dashboard', '/dashboard'),
    createBreadcrumbItem('system', 'System', '/dashboard/system'),
    createBreadcrumbItem('settings', 'Settings', '/dashboard/system/settings')
  ]
}

export default BreadcrumbNav
