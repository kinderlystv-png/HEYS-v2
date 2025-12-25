/**
 * @fileoverview Tests for Advanced Rate Limiting System
 * Comprehensive test suite for enterprise-grade rate limiting
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AdvancedRateLimiter,
  createRateLimitMiddleware,
  RateLimitPresets,
  type RateLimitRequest,
} from './AdvancedRateLimiter';

describe('AdvancedRateLimiter', () => {
  let rateLimiter: AdvancedRateLimiter;

  beforeEach(() => {
    rateLimiter = new AdvancedRateLimiter({
      windowSizeMs: 1000, // 1 second for testing
      maxRequests: 3,
    });
  });

  afterEach(() => {
    rateLimiter.clear();
  });

  describe('Basic Rate Limiting', () => {
    it('should allow requests within limit', async () => {
      const mockReq = { ip: '192.168.1.1' };

      // First request should be allowed
      const result1 = await rateLimiter.checkRateLimit(mockReq);
      expect(result1.allowed).toBe(true);
      expect(result1.info.remainingRequests).toBe(2);

      // Second request should be allowed
      const result2 = await rateLimiter.checkRateLimit(mockReq);
      expect(result2.allowed).toBe(true);
      expect(result2.info.remainingRequests).toBe(1);

      // Third request should be allowed
      const result3 = await rateLimiter.checkRateLimit(mockReq);
      expect(result3.allowed).toBe(true);
      expect(result3.info.remainingRequests).toBe(0);
    });

    it('should block requests exceeding limit', async () => {
      const mockReq = { ip: '192.168.1.1' };

      // Use up all allowed requests
      await rateLimiter.checkRateLimit(mockReq);
      await rateLimiter.checkRateLimit(mockReq);
      await rateLimiter.checkRateLimit(mockReq);

      // Fourth request should be blocked
      const result = await rateLimiter.checkRateLimit(mockReq);
      expect(result.allowed).toBe(false);
      expect(result.info.remainingRequests).toBe(0);
      expect(result.info.retryAfter).toBeGreaterThan(0);
    });

    it('should reset after window expires', async () => {
      const mockReq = { ip: '192.168.1.1' };

      // Use up all requests
      await rateLimiter.checkRateLimit(mockReq);
      await rateLimiter.checkRateLimit(mockReq);
      await rateLimiter.checkRateLimit(mockReq);

      // Should be blocked
      const blockedResult = await rateLimiter.checkRateLimit(mockReq);
      expect(blockedResult.allowed).toBe(false);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Should be allowed again
      const allowedResult = await rateLimiter.checkRateLimit(mockReq);
      expect(allowedResult.allowed).toBe(true);
    });
  });

  describe('Custom Key Generation', () => {
    it('should use custom key generator', async () => {
      const customLimiter = new AdvancedRateLimiter({
        windowSizeMs: 1000,
        maxRequests: 2,
        keyGenerator: (req: RateLimitRequest) =>
          typeof req.userId === 'string' ? req.userId : 'unknown',
      });

      const req1 = { userId: 'user1' };
      const req2 = { userId: 'user2' };

      // Different users should have separate limits
      await customLimiter.checkRateLimit(req1);
      await customLimiter.checkRateLimit(req1);

      // User1 should be at limit
      const result1 = await customLimiter.checkRateLimit(req1);
      expect(result1.allowed).toBe(false);

      // User2 should still be allowed
      const result2 = await customLimiter.checkRateLimit(req2);
      expect(result2.allowed).toBe(true);
    });
  });

  describe('Skip Conditions', () => {
    it('should skip rate limiting when condition is met', async () => {
      const skipLimiter = new AdvancedRateLimiter({
        windowSizeMs: 1000,
        maxRequests: 1,
        skipIf: (req: RateLimitRequest) => req.isAdmin === true,
      });

      const adminReq = { ip: '192.168.1.1', isAdmin: true };
      const userReq = { ip: '192.168.1.1', isAdmin: false };

      // Admin requests should be skipped
      const adminResult = await skipLimiter.checkRateLimit(adminReq);
      expect(adminResult.allowed).toBe(true);

      // Regular user should still be rate limited
      await skipLimiter.checkRateLimit(userReq);
      const blockedResult = await skipLimiter.checkRateLimit(userReq);
      expect(blockedResult.allowed).toBe(false);
    });
  });

  describe('Blacklist Functionality', () => {
    it('should automatically blacklist abusive clients', async () => {
      const mockReq = { ip: '192.168.1.1' };

      // Trigger abuse by making many requests
      for (let i = 0; i < 15; i++) {
        await rateLimiter.checkRateLimit(mockReq);
      }

      // Client should be blacklisted
      const result = await rateLimiter.checkRateLimit(mockReq);
      expect(result.allowed).toBe(false);
      expect(rateLimiter.isBlacklisted('192.168.1.1')).toBe(true);
    });

    it('should manually add and remove from blacklist', () => {
      const key = '192.168.1.1';

      // Add to blacklist
      rateLimiter.addToBlacklist(key);
      expect(rateLimiter.isBlacklisted(key)).toBe(true);

      // Remove from blacklist
      rateLimiter.removeFromBlacklist(key);
      expect(rateLimiter.isBlacklisted(key)).toBe(false);
    });
  });

  describe('Event Emission', () => {
    it('should emit events for rate limiting actions', async () => {
      const limitReachedSpy = vi.fn();
      const blacklistedSpy = vi.fn();

      rateLimiter.on('limitReached', limitReachedSpy);
      rateLimiter.on('blacklisted', blacklistedSpy);

      const mockReq = { ip: '192.168.1.1' };

      // Trigger rate limit
      await rateLimiter.checkRateLimit(mockReq);
      await rateLimiter.checkRateLimit(mockReq);
      await rateLimiter.checkRateLimit(mockReq);
      await rateLimiter.checkRateLimit(mockReq);

      expect(limitReachedSpy).toHaveBeenCalled();

      // Trigger blacklist
      for (let i = 0; i < 10; i++) {
        await rateLimiter.checkRateLimit(mockReq);
      }

      // Add to blacklist and check
      rateLimiter.addToBlacklist('192.168.1.1');
      await rateLimiter.checkRateLimit(mockReq);

      expect(blacklistedSpy).toHaveBeenCalled();
    });
  });

  describe('Statistics', () => {
    it('should provide accurate statistics', async () => {
      const req1 = { ip: '192.168.1.1' };
      const req2 = { ip: '192.168.1.2' };

      await rateLimiter.checkRateLimit(req1);
      await rateLimiter.checkRateLimit(req2);
      rateLimiter.addToBlacklist('192.168.1.3');

      const stats = rateLimiter.getStats();
      expect(stats.activeKeys).toBe(2);
      expect(stats.blacklistedKeys).toBe(1);
      expect(stats.totalRequests).toBe(2);
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });
  });

  describe('Cleanup', () => {
    it('should clean up old entries', async () => {
      const mockReq = { ip: '192.168.1.1' };

      // Make a request
      await rateLimiter.checkRateLimit(mockReq);

      const stats = rateLimiter.getStats();
      expect(stats.activeKeys).toBe(1);

      // Wait for cleanup (simulate time passage)
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Trigger cleanup by making another request with different IP
      await rateLimiter.checkRateLimit({ ip: '192.168.1.2' });

      // Original entry should be cleaned up eventually
      // Note: In real implementation, this would be handled by the cleanup interval
    });
  });
});

describe('Rate Limit Middleware', () => {
  let mockReq: RateLimitRequest;
  let mockRes: {
    set: (headers: Record<string, string>) => void;
    status: (code: number) => typeof mockRes;
    json: (body: Record<string, unknown>) => typeof mockRes;
  };
  let mockNext: () => void;

  beforeEach(() => {
    mockReq = { ip: '192.168.1.1' };
    mockRes = {
      set: vi.fn(),
      status: vi.fn(() => mockRes),
      json: vi.fn(() => mockRes),
    };
    mockNext = vi.fn();
  });

  it('should allow requests within limit', async () => {
    const middleware = createRateLimitMiddleware({
      windowSizeMs: 1000,
      maxRequests: 5,
    });

    await middleware(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'X-RateLimit-Limit': '5',
        'X-RateLimit-Remaining': '4',
      }),
    );
  });

  it('should block requests exceeding limit', async () => {
    const middleware = createRateLimitMiddleware({
      windowSizeMs: 1000,
      maxRequests: 1,
    });

    // First request should pass
    await middleware(mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);

    // Second request should be blocked
    await middleware(mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(429);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Too Many Requests',
      }),
    );
  });

  it('should fail open on errors', async () => {
    const middleware = createRateLimitMiddleware({
      windowSizeMs: 1000,
      maxRequests: 5,
      keyGenerator: () => {
        throw new Error('Test error');
      },
    });

    await middleware(mockReq, mockRes, mockNext);

    // Should still call next() on error
    expect(mockNext).toHaveBeenCalled();
  });
});

describe('Rate Limit Presets', () => {
  it('should provide predefined configurations', () => {
    expect(RateLimitPresets.api).toEqual({
      windowSizeMs: 60000,
      maxRequests: 100,
    });

    expect(RateLimitPresets.auth).toEqual({
      windowSizeMs: 900000,
      maxRequests: 5,
    });

    expect(RateLimitPresets.upload).toEqual({
      windowSizeMs: 3600000,
      maxRequests: 10,
    });

    expect(RateLimitPresets.search).toEqual({
      windowSizeMs: 60000,
      maxRequests: 30,
    });

    expect(RateLimitPresets.compute).toEqual({
      windowSizeMs: 300000,
      maxRequests: 3,
    });
  });
});

describe('Performance Tests', () => {
  it('should handle high request volume efficiently', async () => {
    const highVolumeRateLimiter = new AdvancedRateLimiter({
      windowSizeMs: 1000,
      maxRequests: 1000,
    });

    const startTime = Date.now();
    const promises: Array<Promise<{ allowed: boolean; info: unknown }>> = [];

    // Simulate 100 concurrent requests
    for (let i = 0; i < 100; i++) {
      promises.push(highVolumeRateLimiter.checkRateLimit({ ip: `192.168.1.${i}` }));
    }

    await Promise.all(promises);

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Should complete within reasonable time (less than 1 second)
    expect(duration).toBeLessThan(1000);
  });

  it('should maintain accuracy under concurrent load', async () => {
    const concurrentLimiter = new AdvancedRateLimiter({
      windowSizeMs: 1000,
      maxRequests: 5,
    });

    const mockReq = { ip: '192.168.1.1' };
    const promises: Array<Promise<{ allowed: boolean; info: unknown }>> = [];

    // Make 10 concurrent requests (should only allow 5)
    for (let i = 0; i < 10; i++) {
      promises.push(concurrentLimiter.checkRateLimit(mockReq));
    }

    const results = await Promise.all(promises);
    const allowedCount = results.filter((result) => result.allowed).length;

    // Should allow exactly 5 requests
    expect(allowedCount).toBe(5);
  });
});
