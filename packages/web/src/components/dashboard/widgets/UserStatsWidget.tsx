// filepath: packages/web/src/components/dashboard/widgets/UserStatsWidget.tsx

/**
 * HEYS EAP 3.0 - User Statistics Widget
 * 
 * Purpose: Display user activity statistics and engagement metrics
 * Features: Real-time stats, activity trends, user behavior insights
 */

'use client'

import React, { useState, useEffect } from 'react'
import { useAuth, usePermissions } from '@heys/auth'

interface UserStatsWidgetProps {
  className?: string
  period?: 'day' | 'week' | 'month'
  showTrends?: boolean
}

interface UserStats {
  totalUsers: number
  activeUsers: number
  newUsers: number
  userGrowth: number
  averageSessionTime: number
  topActions: Array<{
    action: string
    count: number
    percentage: number
  }>
  roleDistribution: Array<{
    role: string
    count: number
    percentage: number
  }>
}

interface ActivityMetric {
  label: string
  value: string | number
  change: number
  trend: 'up' | 'down' | 'stable'
  icon: React.ReactNode
  color: string
}

/**
 * Mock data generator for user statistics
 * In production, this would come from your analytics service
 */
function generateMockStats(period: string): UserStats {
  const multiplier = period === 'day' ? 1 : period === 'week' ? 7 : 30
  
  return {
    totalUsers: 1247 * multiplier,
    activeUsers: Math.floor(892 * multiplier * 0.7),
    newUsers: Math.floor(23 * multiplier),
    userGrowth: 12.5,
    averageSessionTime: 24.3,
    topActions: [
      { action: 'Dashboard View', count: 2456 * multiplier, percentage: 34.5 },
      { action: 'Profile Update', count: 1832 * multiplier, percentage: 25.7 },
      { action: 'Content Creation', count: 1245 * multiplier, percentage: 17.4 },
      { action: 'User Management', count: 834 * multiplier, percentage: 11.7 },
      { action: 'Reports Access', count: 567 * multiplier, percentage: 10.7 }
    ],
    roleDistribution: [
      { role: 'Users', count: 987 * multiplier, percentage: 79.2 },
      { role: 'Moderators', count: 156 * multiplier, percentage: 12.5 },
      { role: 'Managers', count: 78 * multiplier, percentage: 6.3 },
      { role: 'Admins', count: 26 * multiplier, percentage: 2.0 }
    ]
  }
}

/**
 * Activity metric card component
 */
interface MetricCardProps {
  metric: ActivityMetric
  size?: 'sm' | 'md'
}

function MetricCard({ metric, size = 'md' }: MetricCardProps): React.ReactElement {
  const cardClasses = size === 'sm' ? 'p-3' : 'p-4'
  const iconClasses = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'
  
  const getTrendIcon = (trend: string) => {
    if (trend === 'up') {
      return (
        <svg className="h-3 w-3 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17l9.2-9.2M17 17V7H7" />
        </svg>
      )
    }
    if (trend === 'down') {
      return (
        <svg className="h-3 w-3 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 7l-9.2 9.2M7 7v10h10" />
        </svg>
      )
    }
    return (
      <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
      </svg>
    )
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-lg ${cardClasses}`}>
      <div className="flex items-center justify-between">
        <div className={`text-${metric.color}-600`}>
          <div className={iconClasses}>
            {metric.icon}
          </div>
        </div>
        <div className="flex items-center space-x-1">
          {getTrendIcon(metric.trend)}
          <span className={`text-xs font-medium ${
            metric.trend === 'up' ? 'text-green-600' : 
            metric.trend === 'down' ? 'text-red-600' : 
            'text-gray-500'
          }`}>
            {metric.change > 0 ? '+' : ''}{metric.change}%
          </span>
        </div>
      </div>
      
      <div className="mt-2">
        <p className="text-xs text-gray-500">{metric.label}</p>
        <p className={`font-semibold ${size === 'sm' ? 'text-lg' : 'text-2xl'} text-gray-900`}>
          {metric.value}
        </p>
      </div>
    </div>
  )
}

/**
 * Progress bar component for role distribution
 */
interface ProgressBarProps {
  label: string
  value: number
  percentage: number
  color: string
}

function ProgressBar({ label, value, percentage, color }: ProgressBarProps): React.ReactElement {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center space-x-3 flex-1">
        <span className="text-sm font-medium text-gray-900 w-20">{label}</span>
        <div className="flex-1 bg-gray-200 rounded-full h-2">
          <div
            className={`bg-${color}-500 h-2 rounded-full transition-all duration-500`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
      <span className="text-sm text-gray-600 ml-3">{value}</span>
    </div>
  )
}

/**
 * Main user stats widget component
 */
export function UserStatsWidget({
  className = '',
  period = 'week',
  showTrends = true
}: UserStatsWidgetProps): React.ReactElement {
  const { user } = useAuth()
  const { hasPermission, isLoading: permissionsLoading } = usePermissions()
  
  const [stats, setStats] = useState<UserStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedPeriod, setSelectedPeriod] = useState(period)

  // Check if user has permission to view user statistics
  const canViewStats = hasPermission('users:read') || hasPermission('dashboard:read')

  // Load statistics data
  useEffect(() => {
    if (!canViewStats || permissionsLoading) return

    const loadStats = async () => {
      setIsLoading(true)
      try {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1000))
        const mockStats = generateMockStats(selectedPeriod)
        setStats(mockStats)
      } catch (error) {
        console.error('Failed to load user stats:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadStats()
  }, [selectedPeriod, canViewStats, permissionsLoading])

  // Activity metrics configuration
  const activityMetrics: ActivityMetric[] = stats ? [
    {
      label: 'Total Users',
      value: stats.totalUsers.toLocaleString(),
      change: stats.userGrowth,
      trend: stats.userGrowth > 0 ? 'up' : stats.userGrowth < 0 ? 'down' : 'stable',
      color: 'blue',
      icon: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
        </svg>
      )
    },
    {
      label: 'Active Users',
      value: stats.activeUsers.toLocaleString(),
      change: 8.2,
      trend: 'up',
      color: 'green',
      icon: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      )
    },
    {
      label: 'New Users',
      value: stats.newUsers.toLocaleString(),
      change: 15.3,
      trend: 'up',
      color: 'purple',
      icon: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
      )
    },
    {
      label: 'Avg. Session',
      value: `${stats.averageSessionTime}min`,
      change: -2.1,
      trend: 'down',
      color: 'orange',
      icon: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    }
  ] : []

  if (permissionsLoading || !canViewStats) {
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
            You need user management permissions to view statistics
          </p>
        </div>
      </div>
    )
  }

  if (isLoading || !stats) {
    return (
      <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
          <div className="grid grid-cols-2 gap-4 mb-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-gray-200 rounded-lg h-20"></div>
            ))}
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-3 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
      {/* Header with period selector */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-medium text-gray-900">User Statistics</h3>
        <select
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value as typeof period)}
          className="text-sm border border-gray-300 rounded-md px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="day">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
        </select>
      </div>

      {/* Activity metrics grid */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {activityMetrics.map((metric, index) => (
          <MetricCard key={index} metric={metric} size="sm" />
        ))}
      </div>

      {/* Role distribution */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Role Distribution</h4>
        <div className="space-y-1">
          {stats.roleDistribution.map((role, index) => (
            <ProgressBar
              key={role.role}
              label={role.role}
              value={role.count}
              percentage={role.percentage}
              color={['blue', 'green', 'orange', 'red'][index % 4]}
            />
          ))}
        </div>
      </div>

      {/* Top actions */}
      {showTrends && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">Popular Actions</h4>
          <div className="space-y-2">
            {stats.topActions.slice(0, 3).map((action, index) => (
              <div key={action.action} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{action.action}</span>
                <div className="flex items-center space-x-2">
                  <span className="text-gray-900 font-medium">{action.count.toLocaleString()}</span>
                  <span className="text-gray-500">{action.percentage}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default UserStatsWidget
