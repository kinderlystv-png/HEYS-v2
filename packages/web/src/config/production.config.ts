// filepath: packages/web/src/config/production.config.ts

/**
 * HEYS EAP 3.0 - Production Configuration
 * 
 * Purpose: Production environment configuration and optimization
 * Features: Environment variables, performance settings, deployment config
 */

interface ProductionConfig {
  // Environment settings
  environment: 'production' | 'staging' | 'development'
  apiUrl: string
  supabaseUrl: string
  supabaseAnonKey: string
  
  // Performance settings
  performance: {
    enableServiceWorker: boolean
    enableCompression: boolean
    enableCaching: boolean
    cacheMaxAge: number
    enableLazyLoading: boolean
    enablePreloading: boolean
    maxBundleSize: number
    chunkSizeWarningLimit: number
  }
  
  // Monitoring settings
  monitoring: {
    enableMetrics: boolean
    enableErrorTracking: boolean
    enablePerformanceTracking: boolean
    sampleRate: number
    enableMemoryProfiling: boolean
  }
  
  // Security settings
  security: {
    enableCSP: boolean
    enableHSTS: boolean
    enableXFrameOptions: boolean
    enableContentTypeOptions: boolean
    trustedDomains: string[]
  }
  
  // Build optimization
  build: {
    enableTreeShaking: boolean
    enableMinification: boolean
    enableSourceMaps: boolean
    enableBundleAnalysis: boolean
    outputDirectory: string
    assetsDirectory: string
  }
}

/**
 * Get production configuration based on environment
 */
export function getProductionConfig(): ProductionConfig {
  const environment = (process.env.NODE_ENV || 'development') as ProductionConfig['environment']
  
  // Base configuration
  const baseConfig: ProductionConfig = {
    environment,
    apiUrl: process.env.VITE_API_URL || 'http://localhost:4001',
    supabaseUrl: process.env.VITE_SUPABASE_URL || '',
    supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY || '',
    
    performance: {
      enableServiceWorker: true,
      enableCompression: true,
      enableCaching: true,
      cacheMaxAge: 31536000, // 1 year
      enableLazyLoading: true,
      enablePreloading: true,
      maxBundleSize: 244000, // 244KB
      chunkSizeWarningLimit: 500000 // 500KB
    },
    
    monitoring: {
      enableMetrics: true,
      enableErrorTracking: true,
      enablePerformanceTracking: true,
      sampleRate: 1.0, // 100% sampling in production
      enableMemoryProfiling: false // Disabled in production for performance
    },
    
    security: {
      enableCSP: true,
      enableHSTS: true,
      enableXFrameOptions: true,
      enableContentTypeOptions: true,
      trustedDomains: ['localhost', 'heys.app', '*.heys.app']
    },
    
    build: {
      enableTreeShaking: true,
      enableMinification: true,
      enableSourceMaps: false, // Disabled in production
      enableBundleAnalysis: false,
      outputDirectory: 'dist',
      assetsDirectory: 'assets'
    }
  }
  
  // Environment-specific overrides
  switch (environment) {
    case 'production':
      return {
        ...baseConfig,
        monitoring: {
          ...baseConfig.monitoring,
          sampleRate: 0.1, // 10% sampling in production
          enableMemoryProfiling: false
        },
        build: {
          ...baseConfig.build,
          enableSourceMaps: false,
          enableBundleAnalysis: false
        }
      }
      
    case 'staging':
      return {
        ...baseConfig,
        monitoring: {
          ...baseConfig.monitoring,
          sampleRate: 0.5, // 50% sampling in staging
          enableMemoryProfiling: true
        },
        build: {
          ...baseConfig.build,
          enableSourceMaps: true,
          enableBundleAnalysis: true
        }
      }
      
    case 'development':
      return {
        ...baseConfig,
        performance: {
          ...baseConfig.performance,
          enableCompression: false,
          enableServiceWorker: false
        },
        monitoring: {
          ...baseConfig.monitoring,
          sampleRate: 1.0,
          enableMemoryProfiling: true
        },
        security: {
          ...baseConfig.security,
          enableCSP: false,
          enableHSTS: false
        },
        build: {
          ...baseConfig.build,
          enableMinification: false,
          enableSourceMaps: true,
          enableBundleAnalysis: true
        }
      }
      
    default:
      return baseConfig
  }
}

/**
 * Validate production configuration
 */
export function validateProductionConfig(config: ProductionConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  // Required environment variables
  if (!config.supabaseUrl) {
    errors.push('VITE_SUPABASE_URL is required')
  }
  
  if (!config.supabaseAnonKey) {
    errors.push('VITE_SUPABASE_ANON_KEY is required')
  }
  
  // Performance validations
  if (config.performance.maxBundleSize < 100000) {
    errors.push('maxBundleSize should be at least 100KB')
  }
  
  if (config.performance.cacheMaxAge < 3600) {
    errors.push('cacheMaxAge should be at least 1 hour')
  }
  
  // Monitoring validations
  if (config.monitoring.sampleRate < 0 || config.monitoring.sampleRate > 1) {
    errors.push('sampleRate should be between 0 and 1')
  }
  
  // Security validations
  if (config.security.trustedDomains.length === 0) {
    errors.push('At least one trusted domain is required')
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Get security headers for production
 */
export function getSecurityHeaders(config: ProductionConfig): Record<string, string> {
  const headers: Record<string, string> = {}
  
  if (config.security.enableCSP) {
    headers['Content-Security-Policy'] = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      `frame-ancestors ${config.security.trustedDomains.join(' ')}`
    ].join('; ')
  }
  
  if (config.security.enableHSTS) {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
  }
  
  if (config.security.enableXFrameOptions) {
    headers['X-Frame-Options'] = 'SAMEORIGIN'
  }
  
  if (config.security.enableContentTypeOptions) {
    headers['X-Content-Type-Options'] = 'nosniff'
  }
  
  // Additional security headers
  headers['X-XSS-Protection'] = '1; mode=block'
  headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
  headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
  
  return headers
}

/**
 * Get build optimization settings
 */
export function getBuildOptimization(config: ProductionConfig) {
  return {
    // Rollup options for Vite
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor libraries (stable, cached separately)
          vendor: ['react', 'react-dom', 'react/jsx-runtime'],
          
          // UI and shared components
          ui: ['@heys/ui', '@heys/shared'],
          
          // Core business logic
          core: ['@heys/core'],
          
          // Storage and data
          storage: ['@supabase/supabase-js'],
          
          // Utilities
          utils: ['zod', 'date-fns']
        },
        
        // Optimize chunk file names
        entryFileNames: `${config.build.assetsDirectory}/[name]-[hash].js`,
        chunkFileNames: `${config.build.assetsDirectory}/[name]-[hash].js`,
        assetFileNames: `${config.build.assetsDirectory}/[name]-[hash].[ext]`
      }
    },
    
    // Minification settings
    minify: config.build.enableMinification ? 'terser' : false,
    terserOptions: config.build.enableMinification ? {
      compress: {
        drop_console: config.environment === 'production',
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug']
      },
      mangle: {
        safari10: true
      },
      format: {
        comments: false
      }
    } : undefined,
    
    // Source maps
    sourcemap: config.build.enableSourceMaps,
    
    // Output directory
    outDir: config.build.outputDirectory,
    
    // Asset size warnings
    chunkSizeWarningLimit: config.performance.chunkSizeWarningLimit,
    
    // Tree shaking
    treeshake: config.build.enableTreeShaking ? {
      preset: 'recommended',
      moduleSideEffects: false,
      propertyReadSideEffects: false,
      unknownGlobalSideEffects: false
    } : false
  }
}

// Export singleton instance
export const productionConfig = getProductionConfig()

// Validate configuration on module load
const validation = validateProductionConfig(productionConfig)
if (!validation.valid) {
  console.warn('Production configuration validation failed:', validation.errors)
}

export default productionConfig
