// filepath: packages/web/vite.config.production.ts

/**
 * HEYS EAP 3.0 - Production Vite Configuration
 * 
 * Purpose: Optimized Vite configuration for production builds
 * Features: Performance optimization, bundle splitting, compression
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

import { productionConfig, getBuildOptimization, getSecurityHeaders } from './src/config/production.config'

export default defineConfig({
  plugins: [
    react({
      // React optimization for production
      babel: {
        plugins: [
          // Remove React DevTools in production
          ['babel-plugin-react-remove-properties', { properties: ['data-testid'] }]
        ]
      }
    })
  ],

  // Build configuration
  build: {
    ...getBuildOptimization(productionConfig),
    
    // Advanced optimization
    cssCodeSplit: true,
    
    // Rollup-specific optimizations
    rollupOptions: {
      ...getBuildOptimization(productionConfig).rollupOptions,
      
      // External dependencies (if needed)
      external: [],
      
      // Input configuration
      input: {
        main: resolve(__dirname, 'index.html')
      },
      
      // Advanced tree shaking
      treeshake: {
        preset: 'recommended',
        moduleSideEffects: false,
        propertyReadSideEffects: false,
        tryCatchDeoptimization: false,
        unknownGlobalSideEffects: false,
        annotations: true
      }
    },
    
    // Report compressed size
    reportCompressedSize: true,
    
    // Compress using Brotli and Gzip
    write: true,
    
    // Optimize for modern browsers
    target: 'es2015',
    
    // Enable CSS minification
    cssMinify: true
  },

  // Optimization for dependencies
  optimizeDeps: {
    // Pre-bundle these dependencies
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      '@supabase/supabase-js'
    ],
    
    // Exclude from pre-bundling
    exclude: [
      '@vite/client',
      '@vite/env'
    ],
    
    // Force optimization
    force: false
  },

  // Define environment variables
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    '__DEV__': false,
    '__PROD__': true,
    
    // Performance flags
    '__ENABLE_PERFORMANCE_MONITORING__': productionConfig.monitoring.enablePerformanceTracking,
    '__ENABLE_MEMORY_PROFILING__': productionConfig.monitoring.enableMemoryProfiling,
    '__SAMPLE_RATE__': productionConfig.monitoring.sampleRate
  },

  // Server configuration for preview
  preview: {
    port: 3001,
    host: true,
    
    // Security headers
    headers: getSecurityHeaders(productionConfig),
    
    // Compression
    compress: productionConfig.performance.enableCompression,
    
    // CORS
    cors: {
      origin: productionConfig.security.trustedDomains,
      credentials: true
    }
  },

  // Resolve configuration
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@/components': resolve(__dirname, './src/components'),
      '@/hooks': resolve(__dirname, './src/hooks'),
      '@/utils': resolve(__dirname, './src/utils'),
      '@/config': resolve(__dirname, './src/config'),
      '@/types': resolve(__dirname, './src/types')
    }
  },

  // CSS configuration
  css: {
    // CSS modules
    modules: {
      localsConvention: 'camelCaseOnly',
      generateScopedName: '[name]__[local]___[hash:base64:5]'
    },
    
    // PostCSS plugins would go here
    postcss: {},
    
    // CSS preprocessing
    preprocessorOptions: {
      scss: {
        additionalData: '@import "@/styles/variables.scss";'
      }
    }
  },

  // Esbuild configuration for optimization
  esbuild: {
    // Remove console and debugger in production
    drop: productionConfig.environment === 'production' ? ['console', 'debugger'] : [],
    
    // Minify identifiers
    minifyIdentifiers: true,
    
    // Minify syntax
    minifySyntax: true,
    
    // Minify whitespace
    minifyWhitespace: true,
    
    // Legal comments
    legalComments: 'none'
  },

  // Worker configuration
  worker: {
    // Format for worker files
    format: 'es',
    
    // Rollup options for workers
    rollupOptions: {
      output: {
        entryFileNames: 'workers/[name]-[hash].js'
      }
    }
  },

  // Experimental features
  experimental: {
    // Enable render built-ins optimization
    renderBuiltUrl: (filename: string) => {
      // Custom URL generation for assets
      return `/${productionConfig.build.assetsDirectory}/${filename}`
    }
  },

  // JSON configuration
  json: {
    namedExports: true,
    stringify: false
  },

  // Environment files
  envDir: resolve(__dirname, '../../'),
  envPrefix: ['VITE_', 'HEYS_'],

  // Cache configuration
  cacheDir: resolve(__dirname, '../../node_modules/.vite'),

  // Log level for production builds
  logLevel: 'info',

  // Clear screen during builds
  clearScreen: true
})
