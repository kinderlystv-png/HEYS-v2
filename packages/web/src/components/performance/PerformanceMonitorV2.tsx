// filepath: packages/web/src/components/performance/PerformanceMonitorV2.tsx

/**
 * HEYS EAP 3.0 - Performance Monitor Dashboard Component V2
 * 
 * Purpose: Real-time performance monitoring display
 * Features: Performance metrics, memory tracking, cache statistics
 */

'use client'

import React from 'react'

import { usePerformanceMonitor } from '../../hooks/usePerformanceMonitor'
import { useMemoryTracker } from '../../hooks/useMemoryTracker'
import { cacheManager } from '../../utils/cacheManager'

interface PerformanceMonitorProps {
  showDetails?: boolean
  autoRefresh?: boolean
  refreshInterval?: number
  className?: string
}

interface MetricCardProps {
  title: string
  value: string | number
  unit?: string
  status?: 'good' | 'warning' | 'error'
  description?: string
  trend?: 'up' | 'down' | 'stable'
}

/**
 * Metric display card component
 */
function MetricCard({ 
  title, 
  value, 
  unit = '', 
  status = 'good', 
  description,
  trend = 'stable'
}: MetricCardProps): React.ReactElement {
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'good': return 'text-green-600 bg-green-50 border-green-200'
      case 'warning': return 'text-yellow-600 bg-yellow-50 border-yellow-200'
      case 'error': return 'text-red-600 bg-red-50 border-red-200'
      default: return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const getTrendIcon = (trend: string): string => {
    switch (trend) {
      case 'up': return '↗'
      case 'down': return '↘'
      case 'stable': return '→'
      default: return '→'
    }
  }

  return (
    <div className={`p-4 rounded-lg border ${getStatusColor(status)}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-xs">{getTrendIcon(trend)}</span>
      </div>
      <div className="text-2xl font-bold mb-1">
        {value} {unit}
      </div>
      {description && (
        <p className="text-xs opacity-75">{description}</p>
      )}
    </div>
  )
}

/**
 * Performance chart component (simplified)
 */
interface PerformanceChartProps {
  data: Array<{ timestamp: number; value: number }>
  title: string
  color?: string
  height?: number
}

function PerformanceChart({ 
  data, 
  title, 
  color = '#3b82f6',
  height = 100 
}: PerformanceChartProps): React.ReactElement {
  if (data.length === 0) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg border">
        <h3 className="text-sm font-medium mb-2">{title}</h3>
        <div className="text-gray-500 text-center py-4">No data available</div>
      </div>
    )
  }

  const maxValue = Math.max(...data.map(d => d.value))
  const minValue = Math.min(...data.map(d => d.value))
  const range = maxValue - minValue || 1

  const points = data.map((point, index) => {
    const x = (index / (data.length - 1)) * 100
    const y = ((maxValue - point.value) / range) * 80 + 10
    return `${x},${y}`
  }).join(' ')

  return (
    <div className="p-4 bg-white rounded-lg border">
      <h3 className="text-sm font-medium mb-3">{title}</h3>
      <div style={{ height }}>
        <svg width="100%" height="100%" viewBox="0 0 100 100" className="overflow-visible">
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="2"
            points={points}
          />
          {data.map((point, index) => {
            const x = (index / (data.length - 1)) * 100
            const y = ((maxValue - point.value) / range) * 80 + 10
            return (
              <circle
                key={index}
                cx={x}
                cy={y}
                r="2"
                fill={color}
              />
            )
          })}
        </svg>
      </div>
      <div className="flex justify-between text-xs text-gray-500 mt-2">
        <span>Min: {minValue.toFixed(1)}</span>
        <span>Max: {maxValue.toFixed(1)}</span>
      </div>
    </div>
  )
}

/**
 * Memory usage component
 */
function MemoryUsage(): React.ReactElement {
  const {
    currentMemory,
    memoryPressure,
    formatBytes,
    warnings
  } = useMemoryTracker({ interval: 2000 })

  if (!currentMemory) {
    return (
      <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
        <p className="text-yellow-600">Memory API not available</p>
      </div>
    )
  }

  const usagePercent = (currentMemory.usedJSHeapSize / currentMemory.jsHeapSizeLimit) * 100

  const getMemoryStatus = (pressure: string): 'good' | 'warning' | 'error' => {
    switch (pressure) {
      case 'low': return 'good'
      case 'medium': return 'good'
      case 'high': return 'warning'
      case 'critical': return 'error'
      default: return 'good'
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Used Memory"
          value={formatBytes(currentMemory.usedJSHeapSize)}
          status={getMemoryStatus(memoryPressure)}
          description={`${usagePercent.toFixed(1)}% of limit`}
        />
        <MetricCard
          title="Total Memory"
          value={formatBytes(currentMemory.totalJSHeapSize)}
          description="Allocated by browser"
        />
        <MetricCard
          title="Memory Limit"
          value={formatBytes(currentMemory.jsHeapSizeLimit)}
          description="Browser memory limit"
        />
      </div>

      {warnings.length > 0 && (
        <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
          <h4 className="font-medium text-yellow-800 mb-2">Memory Warnings</h4>
          <ul className="text-sm text-yellow-700 space-y-1">
            {warnings.map((warning, index) => (
              <li key={index}>• {warning}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * Cache statistics component
 */
function CacheStatistics(): React.ReactElement {
  const [cacheStats, setCacheStats] = React.useState({
    memoryHits: 0,
    memoryMisses: 0,
    storageHits: 0,
    storageMisses: 0,
    totalSize: 0,
    entryCount: 0,
    hitRate: 0
  })

  React.useEffect(() => {
    const updateStats = () => {
      const stats = cacheManager.getStats()
      setCacheStats(stats)
    }

    updateStats()
    const interval = setInterval(updateStats, 5000)

    return () => clearInterval(interval)
  }, [])

  const totalRequests = cacheStats.memoryHits + cacheStats.memoryMisses + 
                       cacheStats.storageHits + cacheStats.storageMisses

  const formatBytes = (bytes: number): string => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    if (bytes === 0) return '0 Bytes'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Hit Rate"
          value={`${(cacheStats.hitRate * 100).toFixed(1)}`}
          unit="%"
          status={cacheStats.hitRate > 0.8 ? 'good' : cacheStats.hitRate > 0.5 ? 'warning' : 'error'}
          description={`${totalRequests} total requests`}
        />
        <MetricCard
          title="Cache Size"
          value={formatBytes(cacheStats.totalSize)}
          description={`${cacheStats.entryCount} entries`}
        />
        <MetricCard
          title="Memory Hits"
          value={cacheStats.memoryHits}
          description="Fast cache hits"
          status="good"
        />
        <MetricCard
          title="Storage Hits"
          value={cacheStats.storageHits}
          description="Persistent cache hits"
          status="good"
        />
      </div>

      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
        <h4 className="font-medium text-blue-800 mb-2">Cache Performance</h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-blue-600">Memory Cache:</span>
            <div className="text-blue-700">
              {cacheStats.memoryHits} hits, {cacheStats.memoryMisses} misses
            </div>
          </div>
          <div>
            <span className="text-blue-600">Storage Cache:</span>
            <div className="text-blue-700">
              {cacheStats.storageHits} hits, {cacheStats.storageMisses} misses
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Performance actions component
 */
function PerformanceActions(): React.ReactElement {
  const [isClearing, setIsClearing] = React.useState(false)
  const [lastAction, setLastAction] = React.useState('')

  const handleClearCache = React.useCallback(async () => {
    setIsClearing(true)
    setLastAction('Clearing cache...')
    
    try {
      await cacheManager.clear()
      setLastAction('Cache cleared successfully')
    } catch (error) {
      setLastAction('Failed to clear cache')
    } finally {
      setIsClearing(false)
      setTimeout(() => setLastAction(''), 3000)
    }
  }, [])

  const handleForceGC = React.useCallback(() => {
    setLastAction('Triggering garbage collection...')
    
    if ((window as unknown as { gc?: () => void }).gc) {
      (window as unknown as { gc?: () => void }).gc?.()
      setLastAction('Garbage collection triggered')
    } else {
      setLastAction('Garbage collection not available')
    }
    
    setTimeout(() => setLastAction(''), 3000)
  }, [])

  const handleCleanup = React.useCallback(async () => {
    setLastAction('Cleaning up expired entries...')
    
    try {
      await cacheManager.cleanup()
      setLastAction('Cleanup completed')
    } catch (error) {
      setLastAction('Cleanup failed')
    } finally {
      setTimeout(() => setLastAction(''), 3000)
    }
  }, [])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={handleClearCache}
          disabled={isClearing}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
          type="button"
        >
          {isClearing ? 'Clearing...' : 'Clear Cache'}
        </button>
        
        <button
          onClick={handleForceGC}
          className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 transition-colors duration-200"
          type="button"
        >
          Force GC
        </button>
        
        <button
          onClick={handleCleanup}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors duration-200"
          type="button"
        >
          Cleanup Expired
        </button>
      </div>

      {lastAction && (
        <div className="p-3 bg-gray-100 rounded text-sm text-gray-700">
          {lastAction}
        </div>
      )}
    </div>
  )
}

/**
 * Main Performance Monitor component
 */
export function PerformanceMonitorV2({
  showDetails = true,
  autoRefresh = true,
  refreshInterval = 5000,
  className = ''
}: PerformanceMonitorProps): React.ReactElement {
  const {
    metrics,
    isTracking,
    realTimeMetrics,
    startTracking,
    stopTracking
  } = usePerformanceMonitor({ 
    interval: 1000,
    trackCustomMetrics: true,
    enableRealTime: autoRefresh
  })

  const [activeTab, setActiveTab] = React.useState<'overview' | 'memory' | 'cache' | 'actions'>('overview')

  React.useEffect(() => {
    if (autoRefresh && !isTracking) {
      startTracking()
    }

    return () => {
      if (isTracking) {
        stopTracking()
      }
    }
  }, [autoRefresh, isTracking, startTracking, stopTracking])

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'memory', label: 'Memory' },
    { id: 'cache', label: 'Cache' },
    { id: 'actions', label: 'Actions' }
  ] as const

  return (
    <div className={`performance-monitor ${className}`}>
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900">Performance Monitor</h2>
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${
              isTracking ? 'bg-green-500' : 'bg-red-500'
            }`}></div>
            <span className="text-sm text-gray-600">
              {isTracking ? 'Monitoring' : 'Stopped'}
            </span>
          </div>
        </div>

        {/* Navigation tabs */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors duration-200 ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab content */}
      <div className="tab-content">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {realTimeMetrics && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <MetricCard
                  title="First Contentful Paint"
                  value={realTimeMetrics.fcp.toFixed(0)}
                  unit="ms"
                  status={realTimeMetrics.fcp > 3000 ? 'error' : realTimeMetrics.fcp > 1800 ? 'warning' : 'good'}
                  description="Time to first content"
                />
                <MetricCard
                  title="Largest Contentful Paint"
                  value={realTimeMetrics.lcp.toFixed(0)}
                  unit="ms"
                  status={realTimeMetrics.lcp > 4000 ? 'error' : realTimeMetrics.lcp > 2500 ? 'warning' : 'good'}
                  description="Time to main content"
                />
                <MetricCard
                  title="First Input Delay"
                  value={realTimeMetrics.fid.toFixed(0)}
                  unit="ms"
                  status={realTimeMetrics.fid > 300 ? 'error' : realTimeMetrics.fid > 100 ? 'warning' : 'good'}
                  description="Input responsiveness"
                />
                <MetricCard
                  title="Cumulative Layout Shift"
                  value={realTimeMetrics.cls.toFixed(3)}
                  status={realTimeMetrics.cls > 0.25 ? 'error' : realTimeMetrics.cls > 0.1 ? 'warning' : 'good'}
                  description="Visual stability"
                />
                <MetricCard
                  title="Time to First Byte"
                  value={realTimeMetrics.ttfb.toFixed(0)}
                  unit="ms"
                  status={realTimeMetrics.ttfb > 800 ? 'error' : realTimeMetrics.ttfb > 600 ? 'warning' : 'good'}
                  description="Server response time"
                />
              </div>
            )}

            {showDetails && metrics.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <PerformanceChart
                  data={metrics.slice(-20).map(m => ({
                    timestamp: m.timestamp,
                    value: m.customMetrics?.domNodes || 0
                  }))}
                  title="DOM Nodes Over Time"
                  color="#10b981"
                />
                <PerformanceChart
                  data={metrics.slice(-20).map(m => ({
                    timestamp: m.timestamp,
                    value: m.customMetrics?.eventListeners || 0
                  }))}
                  title="Event Listeners Over Time"
                  color="#f59e0b"
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'memory' && <MemoryUsage />}
        {activeTab === 'cache' && <CacheStatistics />}
        {activeTab === 'actions' && <PerformanceActions />}
      </div>
    </div>
  )
}

export default PerformanceMonitorV2
