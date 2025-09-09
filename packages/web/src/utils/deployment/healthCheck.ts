// filepath: packages/web/src/utils/deployment/healthCheck.ts

/**
 * HEYS EAP 3.0 - Deployment Health Check Utility
 * 
 * Purpose: System health monitoring and validation
 * Features: Service health, performance metrics, system status
 */

interface HealthCheckResult {
  status: 'healthy' | 'warning' | 'error'
  timestamp: number
  checks: {
    database: HealthCheck
    api: HealthCheck
    performance: HealthCheck
    memory: HealthCheck
    cache: HealthCheck
  }
  overall: {
    score: number
    issues: string[]
    recommendations: string[]
  }
}

interface HealthCheck {
  status: 'pass' | 'warn' | 'fail'
  responseTime?: number
  details: string
  metrics?: Record<string, number>
}

/**
 * Deployment Health Check System
 */
export class DeploymentHealthCheck {
  private timeout: number
  private retries: number
  
  constructor(options: { timeout?: number; retries?: number } = {}) {
    this.timeout = options.timeout || 5000
    this.retries = options.retries || 3
  }
  
  /**
   * Run comprehensive health check
   */
  async runHealthCheck(): Promise<HealthCheckResult> {
    console.log('🏥 Starting deployment health check...')
    
    const startTime = Date.now()
    
    // Run all health checks in parallel
    const [database, api, performance, memory, cache] = await Promise.allSettled([
      this.checkDatabase(),
      this.checkAPI(),
      this.checkPerformance(),
      this.checkMemory(),
      this.checkCache()
    ])
    
    const checks = {
      database: this.getResultValue(database),
      api: this.getResultValue(api),
      performance: this.getResultValue(performance),
      memory: this.getResultValue(memory),
      cache: this.getResultValue(cache)
    }
    
    const overall = this.calculateOverallHealth(checks)
    const status = this.determineOverallStatus(overall.score)
    
    const result: HealthCheckResult = {
      status,
      timestamp: Date.now(),
      checks,
      overall
    }
    
    console.log(`✅ Health check completed in ${Date.now() - startTime}ms`)
    this.logHealthCheckResults(result)
    
    return result
  }
  
  /**
   * Check database connectivity and performance
   */
  private async checkDatabase(): Promise<HealthCheck> {
    try {
      const startTime = Date.now()
      
      // Check Supabase connection
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      
      if (!supabaseUrl || !supabaseKey) {
        return {
          status: 'fail',
          details: 'Supabase configuration missing'
        }
      }
      
      // Simple connection test
      const response = await fetch(`${supabaseUrl}/rest/v1/`, {
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        },
        signal: AbortSignal.timeout(this.timeout)
      })
      
      const responseTime = Date.now() - startTime
      
      if (response.ok) {
        return {
          status: responseTime < 500 ? 'pass' : 'warn',
          responseTime,
          details: `Database connection successful (${responseTime}ms)`,
          metrics: {
            responseTime,
            status: response.status
          }
        }
      } else {
        return {
          status: 'fail',
          responseTime,
          details: `Database connection failed: ${response.status} ${response.statusText}`
        }
      }
    } catch (error) {
      return {
        status: 'fail',
        details: `Database check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }
  
  /**
   * Check API endpoints health
   */
  private async checkAPI(): Promise<HealthCheck> {
    try {
      const startTime = Date.now()
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4001'
      
      // Health endpoint check
      const response = await fetch(`${apiUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(this.timeout)
      })
      
      const responseTime = Date.now() - startTime
      
      if (response.ok) {
        const data = await response.json()
        
        return {
          status: responseTime < 300 ? 'pass' : 'warn',
          responseTime,
          details: `API health check passed (${responseTime}ms)`,
          metrics: {
            responseTime,
            status: response.status,
            ...data
          }
        }
      } else {
        return {
          status: 'fail',
          responseTime,
          details: `API health check failed: ${response.status}`
        }
      }
    } catch (error) {
      return {
        status: 'fail',
        details: `API check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }
  
  /**
   * Check application performance metrics
   */
  private async checkPerformance(): Promise<HealthCheck> {
    try {
      const performanceMetrics = {
        // Navigation timing
        domContentLoaded: 0,
        loadComplete: 0,
        
        // Memory usage
        usedJSHeapSize: 0,
        totalJSHeapSize: 0,
        
        // Cache performance
        cacheHitRate: 0
      }
      
      // Check navigation timing
      if (typeof window !== 'undefined' && window.performance) {
        const navigation = window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
        if (navigation) {
          performanceMetrics.domContentLoaded = navigation.domContentLoadedEventEnd - navigation.navigationStart
          performanceMetrics.loadComplete = navigation.loadEventEnd - navigation.navigationStart
        }
        
        // Check memory
        if ('memory' in window.performance) {
          const memory = (window.performance as any).memory
          performanceMetrics.usedJSHeapSize = memory.usedJSHeapSize
          performanceMetrics.totalJSHeapSize = memory.totalJSHeapSize
        }
      }
      
      // Evaluate performance
      const issues = []
      let status: 'pass' | 'warn' | 'fail' = 'pass'
      
      if (performanceMetrics.domContentLoaded > 2000) {
        issues.push('DOM content loaded > 2s')
        status = 'warn'
      }
      
      if (performanceMetrics.loadComplete > 4000) {
        issues.push('Page load complete > 4s')
        status = 'fail'
      }
      
      const memoryUsageRatio = performanceMetrics.usedJSHeapSize / performanceMetrics.totalJSHeapSize
      if (memoryUsageRatio > 0.8) {
        issues.push('High memory usage (>80%)')
        status = 'warn'
      }
      
      return {
        status,
        details: issues.length > 0 ? `Performance issues: ${issues.join(', ')}` : 'Performance metrics within acceptable range',
        metrics: performanceMetrics
      }
    } catch (error) {
      return {
        status: 'fail',
        details: `Performance check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }
  
  /**
   * Check memory usage and potential leaks
   */
  private async checkMemory(): Promise<HealthCheck> {
    try {
      if (typeof window === 'undefined' || !('performance' in window) || !('memory' in window.performance)) {
        return {
          status: 'warn',
          details: 'Memory monitoring not available'
        }
      }
      
      const memory = (window.performance as any).memory
      const usedHeap = memory.usedJSHeapSize
      const totalHeap = memory.totalJSHeapSize
      const heapLimit = memory.jsHeapSizeLimit
      
      const usageRatio = usedHeap / totalHeap
      const limitRatio = totalHeap / heapLimit
      
      let status: 'pass' | 'warn' | 'fail' = 'pass'
      const issues = []
      
      if (usageRatio > 0.8) {
        issues.push('High heap usage (>80%)')
        status = 'warn'
      }
      
      if (limitRatio > 0.9) {
        issues.push('Approaching heap limit (>90%)')
        status = 'fail'
      }
      
      if (usedHeap > 50 * 1024 * 1024) { // 50MB
        issues.push('Large heap size (>50MB)')
        status = 'warn'
      }
      
      return {
        status,
        details: issues.length > 0 ? `Memory issues: ${issues.join(', ')}` : 'Memory usage within acceptable range',
        metrics: {
          usedJSHeapSize: usedHeap,
          totalJSHeapSize: totalHeap,
          jsHeapSizeLimit: heapLimit,
          usageRatio,
          limitRatio
        }
      }
    } catch (error) {
      return {
        status: 'fail',
        details: `Memory check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }
  
  /**
   * Check cache performance and efficiency
   */
  private async checkCache(): Promise<HealthCheck> {
    try {
      // Check localStorage availability
      const hasLocalStorage = typeof window !== 'undefined' && 'localStorage' in window
      
      // Check IndexedDB availability
      const hasIndexedDB = typeof window !== 'undefined' && 'indexedDB' in window
      
      // Check service worker cache
      const hasServiceWorker = typeof window !== 'undefined' && 'serviceWorker' in navigator
      
      const features = []
      let status: 'pass' | 'warn' | 'fail' = 'pass'
      
      if (hasLocalStorage) features.push('localStorage')
      if (hasIndexedDB) features.push('IndexedDB')
      if (hasServiceWorker) features.push('ServiceWorker')
      
      if (features.length === 0) {
        status = 'fail'
      } else if (features.length < 2) {
        status = 'warn'
      }
      
      // Test localStorage performance
      let storagePerformance = 0
      if (hasLocalStorage) {
        const testKey = 'health-check-test'
        const testData = JSON.stringify({ test: 'data', timestamp: Date.now() })
        
        const startTime = Date.now()
        try {
          localStorage.setItem(testKey, testData)
          const retrieved = localStorage.getItem(testKey)
          localStorage.removeItem(testKey)
          storagePerformance = Date.now() - startTime
          
          if (!retrieved || retrieved !== testData) {
            status = 'fail'
          }
        } catch (error) {
          status = 'fail'
        }
      }
      
      return {
        status,
        details: `Cache features available: ${features.join(', ')}`,
        metrics: {
          hasLocalStorage: hasLocalStorage ? 1 : 0,
          hasIndexedDB: hasIndexedDB ? 1 : 0,
          hasServiceWorker: hasServiceWorker ? 1 : 0,
          storagePerformance,
          featuresCount: features.length
        }
      }
    } catch (error) {
      return {
        status: 'fail',
        details: `Cache check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      }
    }
  }
  
  /**
   * Calculate overall health score
   */
  private calculateOverallHealth(checks: HealthCheckResult['checks']) {
    const scores = {
      pass: 100,
      warn: 60,
      fail: 0
    }
    
    const weights = {
      database: 0.3,
      api: 0.25,
      performance: 0.2,
      memory: 0.15,
      cache: 0.1
    }
    
    let totalScore = 0
    const issues: string[] = []
    const recommendations: string[] = []
    
    Object.entries(checks).forEach(([key, check]) => {
      const weight = weights[key as keyof typeof weights]
      const score = scores[check.status]
      totalScore += score * weight
      
      if (check.status === 'fail') {
        issues.push(`${key}: ${check.details}`)
        recommendations.push(`Fix ${key} issues immediately`)
      } else if (check.status === 'warn') {
        issues.push(`${key}: ${check.details}`)
        recommendations.push(`Monitor ${key} performance`)
      }
    })
    
    // Add general recommendations
    if (totalScore < 70) {
      recommendations.push('Consider scaling resources')
      recommendations.push('Review performance optimizations')
    }
    
    return {
      score: Math.round(totalScore),
      issues,
      recommendations
    }
  }
  
  /**
   * Determine overall status from score
   */
  private determineOverallStatus(score: number): 'healthy' | 'warning' | 'error' {
    if (score >= 80) return 'healthy'
    if (score >= 60) return 'warning'
    return 'error'
  }
  
  /**
   * Extract result value from Promise.allSettled result
   */
  private getResultValue(result: PromiseSettledResult<HealthCheck>): HealthCheck {
    if (result.status === 'fulfilled') {
      return result.value
    } else {
      return {
        status: 'fail',
        details: `Check failed: ${result.reason}`
      }
    }
  }
  
  /**
   * Log health check results
   */
  private logHealthCheckResults(result: HealthCheckResult): void {
    console.log(`\n🏥 Health Check Results - Status: ${result.status.toUpperCase()}`)
    console.log(`📊 Overall Score: ${result.overall.score}/100`)
    
    Object.entries(result.checks).forEach(([key, check]) => {
      const emoji = check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : '❌'
      console.log(`${emoji} ${key}: ${check.details}`)
      
      if (check.responseTime) {
        console.log(`   Response Time: ${check.responseTime}ms`)
      }
    })
    
    if (result.overall.issues.length > 0) {
      console.log('\n⚠️ Issues Found:')
      result.overall.issues.forEach(issue => console.log(`   - ${issue}`))
    }
    
    if (result.overall.recommendations.length > 0) {
      console.log('\n💡 Recommendations:')
      result.overall.recommendations.forEach(rec => console.log(`   - ${rec}`))
    }
  }
}

/**
 * Quick health check function for deployment scripts
 */
export async function quickHealthCheck(): Promise<boolean> {
  const healthCheck = new DeploymentHealthCheck({ timeout: 3000, retries: 1 })
  const result = await healthCheck.runHealthCheck()
  
  return result.status === 'healthy' || result.status === 'warning'
}

/**
 * Export singleton instance
 */
export const deploymentHealthCheck = new DeploymentHealthCheck()

export default DeploymentHealthCheck
