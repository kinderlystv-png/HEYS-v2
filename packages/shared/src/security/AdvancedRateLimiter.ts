/**
 * @fileoverview Advanced Rate Limiting System
 * Enterprise-grade sliding window rate limiter with Redis support
 *
 * Features:
 * - Sliding window algorithm for precise rate limiting
 * - Redis-backed storage for distributed systems
 * - Configurable rate limits per endpoint/user
 * - Real-time monitoring and alerts
 * - Automatic blacklisting for abuse prevention
 *
 * @version 2.0.0
 * @since Phase 2 Week 2
 */

import { EventEmitter } from 'events';

import { getGlobalLogger } from '../monitoring/structured-logger';

/**
 * Rate limit configuration for different endpoints
 */
export type RateLimitRequest = Record<string, unknown> & {
  ip?: string;
  connection?: { remoteAddress?: string };
};

type RedisClient = {
  zremrangebyscore: (key: string, min: number, max: number) => Promise<number>;
  zrange: (key: string, start: number, stop: number) => Promise<string[]>;
  zadd: (key: string, score: number, member: number) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<number>;
};

export interface RateLimitConfig {
  windowSizeMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (req: RateLimitRequest) => string; // Custom key generation
  skipIf?: (req: RateLimitRequest) => boolean; // Skip rate limiting condition
  onLimitReached?: (req: RateLimitRequest, info: RateLimitInfo) => void;
}

/**
 * Information about current rate limit status
 */
export interface RateLimitInfo {
  totalRequests: number;
  remainingRequests: number;
  resetTime: Date;
  retryAfter: number;
}

/**
 * Advanced sliding window rate limiter
 * Uses Redis for distributed rate limiting across multiple instances
 */
export class AdvancedRateLimiter extends EventEmitter {
  private readonly config: Required<RateLimitConfig>;
  private readonly redisClient?: RedisClient; // Redis client instance
  private readonly requestLog: Map<string, number[]> = new Map();
  private readonly blacklist: Set<string> = new Set();

  constructor(config: RateLimitConfig, redisClient?: RedisClient) {
    super();

    this.config = {
      windowSizeMs: config.windowSizeMs,
      maxRequests: config.maxRequests,
      keyGenerator: config.keyGenerator || this.defaultKeyGenerator,
      skipIf: config.skipIf || (() => false),
      onLimitReached: config.onLimitReached || (() => {}),
    };

    this.redisClient = redisClient;

    // Cleanup old entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Default key generator using IP address
   */
  private defaultKeyGenerator(req: RateLimitRequest): string {
    return req.ip || req.connection?.remoteAddress || 'unknown';
  }

  /**
   * Check if request should be rate limited
   */
  async checkRateLimit(req: RateLimitRequest): Promise<{ allowed: boolean; info: RateLimitInfo }> {
    // Skip if condition is met
    if (this.config.skipIf(req)) {
      return {
        allowed: true,
        info: {
          totalRequests: 0,
          remainingRequests: this.config.maxRequests,
          resetTime: new Date(Date.now() + this.config.windowSizeMs),
          retryAfter: 0,
        },
      };
    }

    const key = this.config.keyGenerator(req);

    // Check blacklist
    if (this.blacklist.has(key)) {
      this.emit('blacklisted', { key, req });
      return {
        allowed: false,
        info: {
          totalRequests: this.config.maxRequests + 1,
          remainingRequests: 0,
          resetTime: new Date(Date.now() + this.config.windowSizeMs),
          retryAfter: this.config.windowSizeMs / 1000,
        },
      };
    }

    const now = Date.now();
    const windowStart = now - this.config.windowSizeMs;

    // Get request history for this key
    let requests: number[];

    if (this.redisClient) {
      requests = await this.getRequestsFromRedis(key, windowStart);
    } else {
      requests = this.getRequestsFromMemory(key, windowStart);
    }

    // Add current request
    requests.push(now);

    // Update storage
    if (this.redisClient) {
      await this.updateRedisRequests(key, requests, windowStart);
    } else {
      this.updateMemoryRequests(key, requests);
    }

    const totalRequests = requests.length;
    const remainingRequests = Math.max(0, this.config.maxRequests - totalRequests);
    const resetTime = new Date(Math.min(...requests) + this.config.windowSizeMs);

    const info: RateLimitInfo = {
      totalRequests,
      remainingRequests,
      resetTime,
      retryAfter: remainingRequests === 0 ? Math.ceil((resetTime.getTime() - now) / 1000) : 0,
    };

    const allowed = totalRequests <= this.config.maxRequests;

    if (!allowed) {
      this.config.onLimitReached(req, info);
      this.emit('limitReached', { key, req, info });

      // Check for abuse (3x over limit)
      if (totalRequests > this.config.maxRequests * 3) {
        this.blacklist.add(key);
        this.emit('abuse', { key, req, totalRequests });

        // Auto-remove from blacklist after 1 hour
        setTimeout(() => {
          this.blacklist.delete(key);
          this.emit('blacklistRemoved', { key });
        }, 3600000);
      }
    }

    return { allowed, info };
  }

  /**
   * Get requests from Redis with sliding window
   */
  private async getRequestsFromRedis(key: string, windowStart: number): Promise<number[]> {
    const redisKey = `rate_limit:${key}`;

    // Remove expired entries
    await this.redisClient!.zremrangebyscore(redisKey, 0, windowStart);

    // Get current entries
    const requests = await this.redisClient!.zrange(redisKey, 0, -1);
    return requests.map(Number);
  }

  /**
   * Update Redis with new request
   */
  private async updateRedisRequests(
    key: string,
    _requests: number[],
    _windowStart: number,
  ): Promise<void> {
    const redisKey = `rate_limit:${key}`;
    const now = Date.now();

    // Add new request with score = timestamp
    await this.redisClient!.zadd(redisKey, now, now);

    // Set expiration
    await this.redisClient!.expire(redisKey, Math.ceil(this.config.windowSizeMs / 1000));
  }

  /**
   * Get requests from memory storage
   */
  private getRequestsFromMemory(key: string, windowStart: number): number[] {
    const requests = this.requestLog.get(key) || [];
    return requests.filter((timestamp) => timestamp > windowStart);
  }

  /**
   * Update memory storage with new requests
   */
  private updateMemoryRequests(key: string, requests: number[]): void {
    this.requestLog.set(key, requests);
  }

  /**
   * Cleanup old entries from memory storage
   */
  private cleanup(): void {
    const now = Date.now();
    const cutoff = now - this.config.windowSizeMs;

    for (const [key, requests] of this.requestLog.entries()) {
      const validRequests = requests.filter((timestamp) => timestamp > cutoff);

      if (validRequests.length === 0) {
        this.requestLog.delete(key);
      } else {
        this.requestLog.set(key, validRequests);
      }
    }
  }

  /**
   * Get current statistics
   */
  getStats(): {
    activeKeys: number;
    blacklistedKeys: number;
    totalRequests: number;
    memoryUsage: number;
  } {
    let totalRequests = 0;
    for (const requests of this.requestLog.values()) {
      totalRequests += requests.length;
    }

    return {
      activeKeys: this.requestLog.size,
      blacklistedKeys: this.blacklist.size,
      totalRequests,
      memoryUsage: typeof process !== 'undefined' ? process.memoryUsage().heapUsed : 0,
    };
  }

  /**
   * Clear all rate limit data
   */
  clear(): void {
    this.requestLog.clear();
    this.blacklist.clear();
  }

  /**
   * Remove rate limit for specific key
   */
  remove(key: string): void {
    this.requestLog.delete(key);
    this.blacklist.delete(key);
  }

  /**
   * Manually add key to blacklist
   */
  addToBlacklist(key: string): void {
    this.blacklist.add(key);
    this.emit('manualBlacklist', { key });
  }

  /**
   * Remove key from blacklist
   */
  removeFromBlacklist(key: string): void {
    this.blacklist.delete(key);
    this.emit('blacklistRemoved', { key });
  }

  /**
   * Check if key is blacklisted
   */
  isBlacklisted(key: string): boolean {
    return this.blacklist.has(key);
  }
}

/**
 * Rate limiting middleware factory for Express
 */
type RateLimitResponse = {
  set: (field: Record<string, string> | string, value?: string) => void;
  status: (code: number) => { json: (body: Record<string, unknown>) => void };
};

type RateLimitNext = (error?: unknown) => void;

export function createRateLimitMiddleware(config: RateLimitConfig, redisClient?: RedisClient) {
  const logger = getGlobalLogger().child({ component: 'RateLimitMiddleware' });
  const limiter = new AdvancedRateLimiter(config, redisClient);

  return async (req: RateLimitRequest, res: RateLimitResponse, next: RateLimitNext) => {
    try {
      const { allowed, info } = await limiter.checkRateLimit(req);

      // Add rate limit headers
      res.set({
        'X-RateLimit-Limit': config.maxRequests.toString(),
        'X-RateLimit-Remaining': info.remainingRequests.toString(),
        'X-RateLimit-Reset': info.resetTime.toISOString(),
        'X-RateLimit-Window': config.windowSizeMs.toString(),
      });

      if (!allowed) {
        res.set('Retry-After', info.retryAfter.toString());
        return res.status(429).json({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
          retryAfter: info.retryAfter,
          resetTime: info.resetTime,
        });
      }

      next();
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      logger.error('Rate limiting error', { metadata: { error: normalizedError } });
      next(); // Fail open - allow request if rate limiter fails
    }
  };
}

/**
 * Predefined rate limit configurations
 */
export const RateLimitPresets = {
  // API endpoints
  api: {
    windowSizeMs: 60000, // 1 minute
    maxRequests: 100, // 100 requests per minute
  },

  // Authentication endpoints
  auth: {
    windowSizeMs: 900000, // 15 minutes
    maxRequests: 5, // 5 attempts per 15 minutes
  },

  // File upload endpoints
  upload: {
    windowSizeMs: 3600000, // 1 hour
    maxRequests: 10, // 10 uploads per hour
  },

  // Search endpoints
  search: {
    windowSizeMs: 60000, // 1 minute
    maxRequests: 30, // 30 searches per minute
  },

  // Heavy computation endpoints
  compute: {
    windowSizeMs: 300000, // 5 minutes
    maxRequests: 3, // 3 requests per 5 minutes
  },
};

export default AdvancedRateLimiter;
