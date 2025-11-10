#!/usr/bin/env node
/**
 * Performance Optimization Dependencies Setup
 * Устанавливает необходимые пакеты для спринта оптимизации
 */

const { execSync } = require('child_process');

console.log('📦 Setting up Performance Optimization Dependencies...\n');

const devDependencies = [
  'rollup-plugin-visualizer@5.9.2', // Bundle analyzer
  'lighthouse@11.1.0', // Performance testing
  'web-vitals@3.4.0', // Core Web Vitals measurement
  'compression-webpack-plugin@10.0.0', // Gzip compression
  'workbox-webpack-plugin@7.0.0', // Service Worker caching
];

const productionDependencies = [
  'intersection-observer@0.12.2', // Lazy loading polyfill
];

try {
  console.log('🔧 Installing dev dependencies...');
  execSync(`pnpm add -D ${devDependencies.join(' ')}`, { stdio: 'inherit' });

  console.log('\n📦 Installing production dependencies...');
  execSync(`pnpm add ${productionDependencies.join(' ')}`, { stdio: 'inherit' });

  console.log('\n✅ Dependencies installed successfully!');
  console.log('\n📋 Next steps:');
  console.log('1. Run: pnpm run build:analyze (with bundle analyzer)');
  console.log('2. Run: node scripts/performance-baseline.js');
  console.log('3. Start performance optimization tasks');
} catch (error) {
  console.error('❌ Failed to install dependencies:', error.message);
  process.exit(1);
}
