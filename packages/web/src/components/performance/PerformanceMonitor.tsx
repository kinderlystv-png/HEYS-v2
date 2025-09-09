// filepath: packages/web/src/components/performance/PerformanceMonitor.tsx

/**
 * HEYS EAP 3.0 - Performance Monitor Component
 * 
 * Purpose: Visual performance monitoring dashboard for real-time metrics
 * Features: Real-time charts, performance scores, bundle analysis, recommendations
 */

'use client'

import { usePermissions } from '@heys/auth'
import React, { useState, useEffect } from 'react'

import { useRealTimePerformance, usePerformanceMonitor } from '../../hooks/usePerformanceMonitor'

interface PerformanceMonitorProps {
  className?: string
  showDetails?: boolean
  refreshInterval?: number
  autoRefresh?: boolean
}

interface PerformanceScore {
  overall: number
  bundle: number
  runtime: number
  network: number
}

interface MetricDisplayProps {
  label: string
  value: number | string
  unit?: string
  status?: 'good' | 'warning' | 'poor'
  description?: string
}

/**
 * Metric display component
 */
function MetricDisplay({ 
  label, 
  value, 
  unit = '', 
  status = 'good',
  description 
}: MetricDisplayProps): React.ReactElement {
  const statusColors = {
    good: 'text-green-600 bg-green-50 border-green-200',
    warning: 'text-yellow-600 bg-yellow-50 border-yellow-200',
    poor: 'text-red-600 bg-red-50 border-red-200'
  }

  const statusIcons = {
    good: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    warning: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
    ),
    poor: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  }

  return (
    <div className={`p-4 border rounded-lg ${statusColors[status]}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {statusIcons[status]}
          <span className="font-medium">{label}</span>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold">
            {typeof value === 'number' ? value.toFixed(1) : value}{unit}
          </div>
        </div>
      </div>
      {description && (
        <p className="text-sm mt-2 opacity-80">{description}</p>
      )}
    </div>
  )
}

/**
 * Performance score gauge component
 */
interface PerformanceGaugeProps {
  score: number
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}

function PerformanceGauge({ 
  score, 
  size = 'md', 
  showLabel = true 
}: PerformanceGaugeProps): React.ReactElement {
  const sizeClasses = {
    sm: 'w-16 h-16',
    md: 'w-24 h-24',
    lg: 'w-32 h-32'
  }

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-500'
    if (score >= 70) return 'text-yellow-500'
    return 'text-red-500'
  }

  const getScoreStatus = (score: number) => {
    if (score >= 90) return 'Excellent'
    if (score >= 70) return 'Good'
    if (score >= 50) return 'Fair'
    return 'Poor'
  }

  const circumference = 2 * Math.PI * 45 // radius = 45
  const strokeDasharray = `${(score / 100) * circumference} ${circumference}`

  return (
    <div className="flex flex-col items-center space-y-2">
      <div className={`relative ${sizeClasses[size]}`}>
        <svg className="transform -rotate-90 w-full h-full" viewBox="0 0 100 100">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r="45"
            stroke="currentColor"
            strokeWidth="8"
            fill="none"
            className="text-gray-200"
          />
          {/* Progress circle */}
          <circle
            cx="50"
            cy="50"
            r="45"
            stroke="currentColor"
            strokeWidth="8"
            fill="none"
            strokeDasharray={strokeDasharray}
            strokeLinecap="round"
            className={getScoreColor(score)}
            style={{
              transition: 'stroke-dasharray 0.5s ease-in-out'
            }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-lg font-bold ${getScoreColor(score)}`}>
            {Math.round(score)}
          </span>
        </div>
      </div>
      {showLabel && (
        <div className="text-center">
          <div className="text-sm font-medium">{getScoreStatus(score)}</div>
          <div className="text-xs text-gray-500">Performance</div>
        </div>
      )}
    </div>
  )
}

/**
 * Recommendations list component
 */
interface RecommendationsProps {
  recommendations: string[]
  maxShow?: number
}

function Recommendations({ 
  recommendations, 
  maxShow = 5 
}: RecommendationsProps): React.ReactElement {
  const [showAll, setShowAll] = useState(false)
  const displayRecommendations = showAll 
    ? recommendations 
    : recommendations.slice(0, maxShow)

  if (recommendations.length === 0) {
    return (
      <div className="text-center py-4 text-green-600">
        <svg className="h-8 w-8 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm font-medium">No performance issues detected</p>
        <p className="text-xs">Your application is performing well!</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {displayRecommendations.map((recommendation, index) => (
        <div key={index} className="flex items-start space-x-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <svg className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-blue-800">{recommendation}</p>
          </div>
        </div>
      ))}
      
      {recommendations.length > maxShow && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full text-sm text-blue-600 hover:text-blue-800 font-medium"
          type="button"
        >
          {showAll ? 'Show Less' : `Show ${recommendations.length - maxShow} More`}
        </button>
      )}
    </div>
  )
}

/**
 * Bundle size visualization component
 */
interface BundleSizeVisualizationProps {
  totalSize: number
  chunkCount: number
}

function BundleSizeVisualization({ 
  totalSize, 
  chunkCount 
}: BundleSizeVisualizationProps): React.ReactElement {
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getSizeStatus = (bytes: number): 'good' | 'warning' | 'poor' => {
    if (bytes < 512 * 1024) return 'good'      // < 512KB
    if (bytes < 1024 * 1024) return 'warning'  // < 1MB
    return 'poor'                               // >= 1MB
  }

  const getChunkStatus = (count: number): 'good' | 'warning' | 'poor' => {
    if (count <= 10) return 'good'
    if (count <= 20) return 'warning'
    return 'poor'
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <MetricDisplay
        label="Bundle Size"
        value={formatBytes(totalSize)}
        status={getSizeStatus(totalSize)}
        description="Total JavaScript bundle size"
      />
      <MetricDisplay
        label="Chunks"
        value={chunkCount}
        status={getChunkStatus(chunkCount)}
        description="Number of JavaScript chunks"
      />
    </div>
  )
}

/**
 * Main performance monitor component
 */
export function PerformanceMonitor({
  className = '',
  showDetails = true,
  refreshInterval = 5000,
  autoRefresh = true
}: PerformanceMonitorProps): React.ReactElement {
  const { hasPermission, isLoading: permissionsLoading } = usePermissions()
  
  const performanceData = useRealTimePerformance(autoRefresh ? refreshInterval : undefined)
  const { 
    metrics, 
    getBundleAnalysis, 
    isMonitoring 
  } = usePerformanceMonitor({ 
    componentName: 'PerformanceMonitor',
    autoInit: true 
  })

  const [bundleAnalysis, setBundleAnalysis] = useState<ReturnType<typeof getBundleAnalysis>>(null)

  // Check if user has permission to view performance data
  const canViewPerformance = hasPermission('system:read') || hasPermission('admin:performance')

  // Update bundle analysis
  useEffect(() => {
    if (isMonitoring) {
      const analysis = getBundleAnalysis()
      setBundleAnalysis(analysis)
    }
  }, [isMonitoring, getBundleAnalysis])

  if (permissionsLoading || !canViewPerformance) {
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
            You need system administration permissions to view performance data
          </p>
        </div>
      </div>
    )
  }

  if (!isMonitoring) {
    return (
      <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
        <div className="text-center">
          <div className="text-gray-400 mb-2">
            <svg className="h-8 w-8 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-sm text-gray-600">Performance monitoring not available</p>
          <p className="text-xs text-gray-500 mt-1">
            Performance monitoring is only available in supported browsers
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">Performance Monitor</h3>
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              Live
            </span>
            {autoRefresh && (
              <span className="text-xs text-gray-500">
                Updates every {refreshInterval / 1000}s
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Performance Score */}
        <div className="text-center">
          <PerformanceGauge score={performanceData.score} size="lg" />
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <MetricDisplay
            label="Average Render Time"
            value={metrics.averageRenderTime}
            unit="ms"
            status={metrics.averageRenderTime < 50 ? 'good' : metrics.averageRenderTime < 100 ? 'warning' : 'poor'}
            description="Component render performance"
          />
          <MetricDisplay
            label="Render Count"
            value={metrics.renderCount}
            status="good"
            description="Total component renders"
          />
          <MetricDisplay
            label="Interactions"
            value={metrics.interactionCount}
            status="good"
            description="User interaction events"
          />
        </div>

        {/* Bundle Analysis */}
        {showDetails && bundleAnalysis && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">Bundle Analysis</h4>
            <BundleSizeVisualization
              totalSize={bundleAnalysis.totalSize}
              chunkCount={bundleAnalysis.chunkCount}
            />
          </div>
        )}

        {/* Performance Recommendations */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">
            Recommendations ({performanceData.recommendations.length})
          </h4>
          <Recommendations recommendations={performanceData.recommendations} />
        </div>

        {/* Additional Details */}
        {showDetails && (
          <div className="pt-4 border-t border-gray-200">
            <details className="group">
              <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                <span className="group-open:hidden">Show Technical Details</span>
                <span className="hidden group-open:inline">Hide Technical Details</span>
              </summary>
              <div className="mt-3 space-y-2 text-xs text-gray-600">
                <div className="grid grid-cols-2 gap-4">
                  <div>Bundle Size: {performanceData.bundleSize > 0 ? (performanceData.bundleSize / 1024).toFixed(1) + ' KB' : 'N/A'}</div>
                  <div>Render Performance: {performanceData.renderPerformance.toFixed(1)}ms</div>
                </div>
                <div>
                  Browser: {typeof navigator !== 'undefined' ? navigator.userAgent.split(' ')[0] : 'Unknown'}
                </div>
                <div>
                  Monitoring Status: {isMonitoring ? 'Active' : 'Inactive'}
                </div>
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  )
}

export default PerformanceMonitor
