/**
 * Cache Manager for HEYS Reports
 * Handles caching of day and week data for performance optimization
 */

import { StructuredLogger } from '../../monitoring/logger.js';

// Initialize logger
const logger = new StructuredLogger({
  name: 'reports-cache-manager'
});

// Cache storage
const dayCache = new Map();
const weekCache = new Map();

// Cache configuration
const maxCacheSize = 200; // Maximum number of cached days
const maxWeekCacheSize = 20; // Maximum number of cached weeks

/**
 * Invalidates cache entries matching a pattern
 * @param {string} pattern - Pattern to match for cache invalidation
 */
export function invalidateCache(pattern) {
  const keysToDelete = [];
  for (const key of dayCache.keys()) {
    if (!pattern || key.includes(pattern)) {
      keysToDelete.push(key);
    }
  }
  keysToDelete.forEach(key => dayCache.delete(key));
  
  // Also clear week cache if days changed
  if (pattern) {
    weekCache.clear();
  }
  
  if (window.HEYS && window.HEYS.performance) {
    window.HEYS.performance.increment('cacheInvalidations');
  }
}

/**
 * Clears all cache (for debugging)
 */
export function clearAllCache() {
  dayCache.clear();
  weekCache.clear();
  logger.info('Reports cache completely cleared', {
    component: 'CacheManager',
    operation: 'clearAllCache'
  });
}

/**
 * Gets cached day data
 * @param {string} key - Cache key
 * @returns {any} Cached data or undefined
 */
export function getCachedDay(key) {
  return dayCache.get(key);
}

/**
 * Sets day data in cache
 * @param {string} key - Cache key
 * @param {any} data - Data to cache
 */
export function setCachedDay(key, data) {
  // Implement LRU eviction if cache is full
  if (dayCache.size >= maxCacheSize) {
    const firstKey = dayCache.keys().next().value;
    dayCache.delete(firstKey);
  }
  dayCache.set(key, data);
}

/**
 * Gets cached week data
 * @param {string} key - Cache key
 * @returns {any} Cached data or undefined
 */
export function getCachedWeek(key) {
  return weekCache.get(key);
}

/**
 * Sets week data in cache
 * @param {string} key - Cache key
 * @param {any} data - Data to cache
 */
export function setCachedWeek(key, data) {
  // Implement LRU eviction if cache is full
  if (weekCache.size >= maxWeekCacheSize) {
    const firstKey = weekCache.keys().next().value;
    weekCache.delete(firstKey);
  }
  weekCache.set(key, data);
}

/**
 * Sets up cache invalidation listeners
 */
export function setupCacheInvalidation() {
  if (window.HEYS && window.HEYS.store && typeof window.HEYS.store.watch === 'function') {
    // Watch for day data changes
    window.HEYS.store.watch('days', () => {
      invalidateCache();
    });
  }
}

// Make debugging functions globally available
if (typeof window !== 'undefined' && window.HEYS) {
  window.HEYS.clearReportsCache = clearAllCache;
  window.HEYS.debug = true;
}
