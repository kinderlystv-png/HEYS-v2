/**
 * HEYS Reports Cache System
 * Centralized export for cache management functionality
 */

export {
  invalidateCache,
  clearAllCache,
  getCachedDay,
  setCachedDay,
  getCachedWeek,
  setCachedWeek,
  setupCacheInvalidation
} from './cache-manager.js';
