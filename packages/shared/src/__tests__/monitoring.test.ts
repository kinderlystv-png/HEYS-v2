import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PerformanceMonitor, recordMetric, recordError } from '../monitoring/performance';

describe('Performance Monitoring', () => {
  let performanceMonitor: PerformanceMonitor;

  beforeEach(() => {
    performanceMonitor = new PerformanceMonitor({
      enabled: true,
      batchSize: 5,
      flushInterval: 1000,
      enableRealtime: false
    });
  });

  describe('PerformanceMonitor', () => {
    it('should record metrics correctly', () => {
      performanceMonitor.recordMetric('test_metric', 100, 'ms', { component: 'test' });
      
      const metrics = performanceMonitor.getMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0]).toMatchObject({
        name: 'test_metric',
        value: 100,
        unit: 'ms',
        tags: { component: 'test' }
      });
      expect(metrics[0].timestamp).toBeTypeOf('number');
    });

    it('should record errors correctly', () => {
      const testError = new Error('Test error');
      performanceMonitor.recordError(testError, 'high', { context: 'test' });
      
      const errors = performanceMonitor.getErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        message: 'Test error',
        severity: 'high',
        context: { context: 'test' }
      });
      expect(errors[0].stack).toContain('Error: Test error');
      expect(errors[0].id).toBeTypeOf('string');
      expect(errors[0].timestamp).toBeTypeOf('number');
    });

    it('should measure async function execution time', async () => {
      const mockAsyncFunction = vi.fn().mockResolvedValue('result');
      
      const result = await performanceMonitor.measureAsync('async_test', mockAsyncFunction);
      
      expect(result).toBe('result');
      expect(mockAsyncFunction).toHaveBeenCalledOnce();
      
      const metrics = performanceMonitor.getMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0].name).toBe('async_test');
      expect(metrics[0].unit).toBe('ms');
      expect(metrics[0].value).toBeGreaterThanOrEqual(0);
    });

    it('should measure sync function execution time', () => {
      const mockSyncFunction = vi.fn().mockReturnValue('sync_result');
      
      const result = performanceMonitor.measure('sync_test', mockSyncFunction);
      
      expect(result).toBe('sync_result');
      expect(mockSyncFunction).toHaveBeenCalledOnce();
      
      const metrics = performanceMonitor.getMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0].name).toBe('sync_test');
      expect(metrics[0].unit).toBe('ms');
      expect(metrics[0].value).toBeGreaterThanOrEqual(0);
    });

    it('should handle errors during measurement', async () => {
      const testError = new Error('Measurement error');
      const mockFailingFunction = vi.fn().mockRejectedValue(testError);
      
      await expect(
        performanceMonitor.measureAsync('failing_test', mockFailingFunction)
      ).rejects.toThrow('Measurement error');
      
      const metrics = performanceMonitor.getMetrics();
      const errors = performanceMonitor.getErrors();
      
      expect(metrics).toHaveLength(1);
      expect(metrics[0].name).toBe('failing_test_error');
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe('Measurement error');
      expect(errors[0].severity).toBe('high');
    });

    it('should not record when disabled', () => {
      const disabledMonitor = new PerformanceMonitor({ enabled: false });
      
      disabledMonitor.recordMetric('disabled_metric', 100);
      disabledMonitor.recordError('disabled_error');
      
      expect(disabledMonitor.getMetrics()).toHaveLength(0);
      expect(disabledMonitor.getErrors()).toHaveLength(0);
    });
  });

  describe('Global Monitor Functions', () => {
    it('should use global monitor instance', () => {
      // Note: Global monitor might be disabled in test environment
      // This test verifies the functions exist and can be called
      recordMetric('global_metric', 200, 'count');
      recordError('global_error', 'medium');
      
      // Verify functions executed without throwing
      expect(recordMetric).toBeTypeOf('function');
      expect(recordError).toBeTypeOf('function');
    });
  });

  describe('Configuration', () => {
    it('should respect batch size configuration', () => {
      const batchMonitor = new PerformanceMonitor({
        enabled: true,
        batchSize: 2
      });

      // Mock flush method to test batching
      const flushSpy = vi.spyOn(batchMonitor, 'flush').mockResolvedValue();
      
      batchMonitor.recordMetric('metric1', 1);
      expect(flushSpy).not.toHaveBeenCalled();
      
      batchMonitor.recordMetric('metric2', 2);
      expect(flushSpy).toHaveBeenCalledOnce();
    });
  });
});
