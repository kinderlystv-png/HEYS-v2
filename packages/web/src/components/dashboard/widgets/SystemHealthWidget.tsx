// filepath: packages/web/src/components/dashboard/widgets/SystemHealthWidget.tsx

/**
 * HEYS EAP 3.0 - System Health Widget
 * 
 * Purpose: Monitor system status, performance metrics, and health indicators
 * Features: Real-time monitoring, status indicators, performance metrics
 */

'use client'

import React, { useState, useEffect } from 'react'
import { usePermissions } from '@heys/auth'

interface SystemHealthWidgetProps {
  className?: string
  refreshInterval?: number
  showDetails?: boolean
}

interface SystemHealth {
  status: 'healthy' | 'warning' | 'critical'
  uptime: string
  responseTime: number
  activeConnections: number
  memoryUsage: number
  cpuUsage: number
  diskUsage: number
  lastUpdated: string
  services: ServiceStatus[]
  alerts: SystemAlert[]
}

interface ServiceStatus {
  name: string
  status: 'online' | 'offline' | 'degraded'
  responseTime: number
  uptime: number
  lastCheck: string
}

interface SystemAlert {
  id: string
  level: 'info' | 'warning' | 'error'
  message: string
  timestamp: string
  resolved: boolean
}

/**
 * Mock system health data generator
 */
function generateMockHealthData(): SystemHealth {
  const now = new Date()
  
  return {
    status: Math.random() > 0.8 ? 'warning' : 'healthy',
    uptime: '127d 14h 32m',
    responseTime: Math.floor(Math.random() * 50) + 15,
    activeConnections: Math.floor(Math.random() * 200) + 150,
    memoryUsage: Math.floor(Math.random() * 30) + 45,
    cpuUsage: Math.floor(Math.random() * 40) + 20,
    diskUsage: Math.floor(Math.random() * 20) + 65,
    lastUpdated: now.toISOString(),
    services: [
      {
        name: 'Database',
        status: Math.random() > 0.9 ? 'degraded' : 'online',
        responseTime: Math.floor(Math.random() * 10) + 5,
        uptime: 99.9,
        lastCheck: now.toISOString()
      },
      {
        name: 'API Server',
        status: 'online',
        responseTime: Math.floor(Math.random() * 20) + 10,
        uptime: 99.8,
        lastCheck: now.toISOString()
      },
      {
        name: 'Authentication',
        status: 'online',
        responseTime: Math.floor(Math.random() * 15) + 8,
        uptime: 99.95,
        lastCheck: now.toISOString()
      },
      {
        name: 'File Storage',
        status: Math.random() > 0.95 ? 'offline' : 'online',
        responseTime: Math.floor(Math.random() * 30) + 20,
        uptime: 99.7,
        lastCheck: now.toISOString()
      }
    ],
    alerts: [
      {
        id: '1',
        level: 'warning',
        message: 'High memory usage detected on server-02',
        timestamp: new Date(now.getTime() - 1000 * 60 * 15).toISOString(),
        resolved: false
      },
      {
        id: '2',
        level: 'info',
        message: 'Scheduled maintenance completed successfully',
        timestamp: new Date(now.getTime() - 1000 * 60 * 60 * 2).toISOString(),
        resolved: true
      }
    ]
  }
}

/**
 * Status indicator component
 */
interface StatusIndicatorProps {
  status: 'healthy' | 'warning' | 'critical' | 'online' | 'offline' | 'degraded'
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  label?: string
}

function StatusIndicator({ 
  status, 
  size = 'md', 
  showLabel = false,
  label
}: StatusIndicatorProps): React.ReactElement {
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4'
  }

  const colorClasses = {
    healthy: 'bg-green-400',
    online: 'bg-green-400',
    warning: 'bg-yellow-400',
    degraded: 'bg-yellow-400',
    critical: 'bg-red-400',
    offline: 'bg-red-400'
  }

  const textColorClasses = {
    healthy: 'text-green-700',
    online: 'text-green-700',
    warning: 'text-yellow-700',
    degraded: 'text-yellow-700',
    critical: 'text-red-700',
    offline: 'text-red-700'
  }

  return (
    <div className="flex items-center space-x-2">
      <div className={`${sizeClasses[size]} ${colorClasses[status]} rounded-full`} />
      {showLabel && (
        <span className={`text-sm font-medium ${textColorClasses[status]}`}>
          {label || status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      )}
    </div>
  )
}

/**
 * Metric bar component
 */
interface MetricBarProps {
  label: string
  value: number
  unit?: string
  maxValue?: number
  color?: string
  showValue?: boolean
}

function MetricBar({ 
  label, 
  value, 
  unit = '%', 
  maxValue = 100,
  color = 'blue',
  showValue = true 
}: MetricBarProps): React.ReactElement {
  const percentage = Math.min((value / maxValue) * 100, 100)
  
  const getColorClass = (value: number) => {
    if (value > 80) return 'bg-red-500'
    if (value > 60) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        {showValue && (
          <span className="text-sm text-gray-600">{value}{unit}</span>
        )}
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-500 ${getColorClass(percentage)}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

/**
 * Service status list component
 */
interface ServiceListProps {
  services: ServiceStatus[]
}

function ServiceList({ services }: ServiceListProps): React.ReactElement {
  return (
    <div className="space-y-3">
      {services.map((service) => (
        <div key={service.name} className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <StatusIndicator status={service.status} size="sm" />
            <span className="text-sm font-medium text-gray-900">{service.name}</span>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500">{service.responseTime}ms</div>
            <div className="text-xs text-gray-400">{service.uptime}% uptime</div>
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Alert list component
 */
interface AlertListProps {
  alerts: SystemAlert[]
  maxAlerts?: number
}

function AlertList({ alerts, maxAlerts = 3 }: AlertListProps): React.ReactElement {
  const activeAlerts = alerts.filter(alert => !alert.resolved).slice(0, maxAlerts)
  
  const getAlertIcon = (level: string) => {
    switch (level) {
      case 'error':
        return (
          <svg className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      case 'warning':
        return (
          <svg className="h-4 w-4 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        )
      default:
        return (
          <svg className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
    }
  }

  if (activeAlerts.length === 0) {
    return (
      <div className="text-center py-4 text-gray-500">
        <svg className="h-8 w-8 mx-auto mb-2 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm">No active alerts</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {activeAlerts.map((alert) => (
        <div key={alert.id} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
          {getAlertIcon(alert.level)}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-900">{alert.message}</p>
            <p className="text-xs text-gray-500 mt-1">
              {new Date(alert.timestamp).toLocaleTimeString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Main system health widget component
 */
export function SystemHealthWidget({
  className = '',
  refreshInterval = 30000,
  showDetails = true
}: SystemHealthWidgetProps): React.ReactElement {
  const { hasPermission, isLoading: permissionsLoading } = usePermissions()
  
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  // Check if user has permission to view system health
  const canViewHealth = hasPermission('system:read') || hasPermission('system:admin')

  // Load health data
  useEffect(() => {
    if (!canViewHealth || permissionsLoading) return

    const loadHealth = async () => {
      setIsLoading(true)
      try {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 800))
        const mockHealth = generateMockHealthData()
        setHealth(mockHealth)
        setLastRefresh(new Date())
      } catch (error) {
        console.error('Failed to load system health:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadHealth()

    // Set up refresh interval
    const interval = setInterval(loadHealth, refreshInterval)
    return () => clearInterval(interval)
  }, [canViewHealth, permissionsLoading, refreshInterval])

  if (permissionsLoading || !canViewHealth) {
    return (
      <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
        <div className="text-center">
          <div className="text-gray-400 mb-2">
            <svg className="h-8 w-8 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <p className="text-sm text-gray-600">Access Restricted</p>
          <p className="text-xs text-gray-500 mt-1">
            You need system administration permissions to view health status
          </p>
        </div>
      </div>
    )
  }

  if (isLoading || !health) {
    return (
      <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-3 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <h3 className="text-lg font-medium text-gray-900">System Health</h3>
          <StatusIndicator 
            status={health.status} 
            size="md" 
            showLabel 
            label={health.status}
          />
        </div>
        <div className="text-xs text-gray-500">
          Updated {lastRefresh.toLocaleTimeString()}
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="text-center">
          <p className="text-2xl font-semibold text-gray-900">{health.responseTime}ms</p>
          <p className="text-sm text-gray-500">Response Time</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-semibold text-gray-900">{health.activeConnections}</p>
          <p className="text-sm text-gray-500">Active Connections</p>
        </div>
      </div>

      {/* Performance metrics */}
      {showDetails && (
        <div className="space-y-4 mb-6">
          <MetricBar label="Memory Usage" value={health.memoryUsage} />
          <MetricBar label="CPU Usage" value={health.cpuUsage} />
          <MetricBar label="Disk Usage" value={health.diskUsage} />
        </div>
      )}

      {/* Services status */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Services</h4>
        <ServiceList services={health.services} />
      </div>

      {/* Recent alerts */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-3">Recent Alerts</h4>
        <AlertList alerts={health.alerts} />
      </div>

      {/* System info */}
      <div className="mt-6 pt-4 border-t border-gray-200 text-xs text-gray-500">
        <div className="flex items-center justify-between">
          <span>Uptime: {health.uptime}</span>
          <span>Last Check: {new Date(health.lastUpdated).toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  )
}

export default SystemHealthWidget
