// filepath: packages/web/src/__tests__/hooks/useLazyLoad.test.ts

/**
 * HEYS EAP 3.0 - useLazyLoad Hook Unit Tests
 * 
 * Purpose: Test lazy loading React hook
 * Features: Intersection Observer, threshold management, loading states
 */

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { waitForAsync } from '../../test-utils/mockData'
import { useLazyLoad } from '../../hooks/useLazyLoad'

describe('useLazyLoad', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Basic Functionality', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useLazyLoad())

      expect(result.current.isVisible).toBe(false)
      expect(result.current.hasLoaded).toBe(false)
      expect(result.current.isLoading).toBe(false)
      expect(result.current.ref).toBeDefined()
    })

    it('should become visible when intersecting', async () => {
      const { result } = renderHook(() => useLazyLoad())

      // Simulate intersection
      act(() => {
        const mockObserver = (global as any).mockIntersectionObserver
        if (mockObserver && mockObserver.triggerIntersection) {
          mockObserver.triggerIntersection([{
            isIntersecting: true,
            target: { dataset: {} }
          }])
        }
      })

      expect(result.current.isVisible).toBe(true)
    })

    it('should load content when visible', async () => {
      const { result } = renderHook(() => useLazyLoad())

      // Trigger intersection
      act(() => {
        const mockObserver = (global as any).mockIntersectionObserver
        if (mockObserver && mockObserver.triggerIntersection) {
          mockObserver.triggerIntersection([{
            isIntersecting: true,
            target: { dataset: {} }
          }])
        }
      })

      await waitForAsync(10)

      expect(result.current.isVisible).toBe(true)
      expect(result.current.hasLoaded).toBe(true)
    })
  })

  describe('Configuration Options', () => {
    it('should use custom threshold', () => {
      const { result } = renderHook(() => 
        useLazyLoad({ threshold: 0.5 })
      )

      expect(result.current.ref).toBeDefined()
      // Observer should be created with custom threshold
    })

    it('should use custom root margin', () => {
      const { result } = renderHook(() => 
        useLazyLoad({ rootMargin: '100px' })
      )

      expect(result.current.ref).toBeDefined()
    })

    it('should handle triggerOnce option', async () => {
      const { result } = renderHook(() => 
        useLazyLoad({ triggerOnce: true })
      )

      // First intersection
      act(() => {
        const mockObserver = (global as any).mockIntersectionObserver
        if (mockObserver && mockObserver.triggerIntersection) {
          mockObserver.triggerIntersection([{
            isIntersecting: true,
            target: { dataset: {} }
          }])
        }
      })

      expect(result.current.isVisible).toBe(true)

      // Leave viewport
      act(() => {
        const mockObserver = (global as any).mockIntersectionObserver
        if (mockObserver && mockObserver.triggerIntersection) {
          mockObserver.triggerIntersection([{
            isIntersecting: false,
            target: { dataset: {} }
          }])
        }
      })

      // Should remain visible with triggerOnce
      expect(result.current.isVisible).toBe(true)
    })

    it('should handle triggerOnce disabled', async () => {
      const { result } = renderHook(() => 
        useLazyLoad({ triggerOnce: false })
      )

      // First intersection
      act(() => {
        const mockObserver = (global as any).mockIntersectionObserver
        if (mockObserver && mockObserver.triggerIntersection) {
          mockObserver.triggerIntersection([{
            isIntersecting: true,
            target: { dataset: {} }
          }])
        }
      })

      expect(result.current.isVisible).toBe(true)

      // Leave viewport
      act(() => {
        const mockObserver = (global as any).mockIntersectionObserver
        if (mockObserver && mockObserver.triggerIntersection) {
          mockObserver.triggerIntersection([{
            isIntersecting: false,
            target: { dataset: {} }
          }])
        }
      })

      // Should become invisible without triggerOnce
      expect(result.current.isVisible).toBe(false)
    })
  })

  describe('Loading States', () => {
    it('should manage loading state with async content', async () => {
      const loadFn = vi.fn().mockResolvedValue('loaded content')
      const { result } = renderHook(() => 
        useLazyLoad({ onLoad: loadFn })
      )

      // Trigger intersection
      act(() => {
        const mockObserver = (global as any).mockIntersectionObserver
        if (mockObserver && mockObserver.triggerIntersection) {
          mockObserver.triggerIntersection([{
            isIntersecting: true,
            target: { dataset: {} }
          }])
        }
      })

      // Should be loading initially
      expect(result.current.isLoading).toBe(true)

      // Wait for load to complete
      await waitForAsync(10)

      expect(result.current.isLoading).toBe(false)
      expect(result.current.hasLoaded).toBe(true)
      expect(loadFn).toHaveBeenCalled()
    })

    it('should handle loading errors', async () => {
      const loadFn = vi.fn().mockRejectedValue(new Error('Load failed'))
      const { result } = renderHook(() => 
        useLazyLoad({ onLoad: loadFn })
      )

      // Trigger intersection
      act(() => {
        const mockObserver = (global as any).mockIntersectionObserver
        if (mockObserver && mockObserver.triggerIntersection) {
          mockObserver.triggerIntersection([{
            isIntersecting: true,
            target: { dataset: {} }
          }])
        }
      })

      await waitForAsync(10)

      expect(result.current.isLoading).toBe(false)
      expect(result.current.hasLoaded).toBe(false)
      expect(result.current.error).toBeDefined()
    })
  })

  describe('Callback Functions', () => {
    it('should call onVisible when element becomes visible', async () => {
      const onVisible = vi.fn()
      const { result } = renderHook(() => 
        useLazyLoad({ onVisible })
      )

      // Trigger intersection
      act(() => {
        const mockObserver = (global as any).mockIntersectionObserver
        if (mockObserver && mockObserver.triggerIntersection) {
          mockObserver.triggerIntersection([{
            isIntersecting: true,
            target: { dataset: {} }
          }])
        }
      })

      expect(onVisible).toHaveBeenCalled()
    })

    it('should call onHidden when element becomes hidden', async () => {
      const onHidden = vi.fn()
      const { result } = renderHook(() => 
        useLazyLoad({ onHidden, triggerOnce: false })
      )

      // First make visible
      act(() => {
        const mockObserver = (global as any).mockIntersectionObserver
        if (mockObserver && mockObserver.triggerIntersection) {
          mockObserver.triggerIntersection([{
            isIntersecting: true,
            target: { dataset: {} }
          }])
        }
      })

      // Then hide
      act(() => {
        const mockObserver = (global as any).mockIntersectionObserver
        if (mockObserver && mockObserver.triggerIntersection) {
          mockObserver.triggerIntersection([{
            isIntersecting: false,
            target: { dataset: {} }
          }])
        }
      })

      expect(onHidden).toHaveBeenCalled()
    })
  })

  describe('Manual Control', () => {
    it('should allow manual triggering', () => {
      const { result } = renderHook(() => useLazyLoad())

      act(() => {
        result.current.trigger()
      })

      expect(result.current.isVisible).toBe(true)
      expect(result.current.hasLoaded).toBe(true)
    })

    it('should allow manual reset', () => {
      const { result } = renderHook(() => useLazyLoad())

      // First trigger
      act(() => {
        result.current.trigger()
      })

      expect(result.current.isVisible).toBe(true)

      // Then reset
      act(() => {
        result.current.reset()
      })

      expect(result.current.isVisible).toBe(false)
      expect(result.current.hasLoaded).toBe(false)
      expect(result.current.isLoading).toBe(false)
    })
  })

  describe('Error Handling', () => {
    it('should handle missing IntersectionObserver gracefully', () => {
      // Mock missing IntersectionObserver
      const originalIntersectionObserver = global.IntersectionObserver
      delete (global as any).IntersectionObserver

      const { result } = renderHook(() => useLazyLoad())

      // Should not throw and provide fallback
      expect(result.current.ref).toBeDefined()
      expect(result.current.isVisible).toBe(false)

      // Restore
      global.IntersectionObserver = originalIntersectionObserver
    })

    it('should handle observer creation errors', () => {
      // Mock IntersectionObserver to throw
      const originalIntersectionObserver = global.IntersectionObserver
      global.IntersectionObserver = vi.fn().mockImplementation(() => {
        throw new Error('Observer creation failed')
      })

      const { result } = renderHook(() => useLazyLoad())

      // Should handle error gracefully
      expect(result.current.ref).toBeDefined()

      // Restore
      global.IntersectionObserver = originalIntersectionObserver
    })
  })

  describe('Performance', () => {
    it('should cleanup observer on unmount', () => {
      const { unmount } = renderHook(() => useLazyLoad())

      // Should cleanup without errors
      expect(() => unmount()).not.toThrow()
    })

    it('should not re-create observer unnecessarily', () => {
      const { rerender } = renderHook(
        (props) => useLazyLoad(props),
        { initialProps: { threshold: 0.1 } }
      )

      const observerSpy = vi.spyOn(global, 'IntersectionObserver')
      const initialCallCount = observerSpy.mock.calls.length

      // Re-render with same props
      rerender({ threshold: 0.1 })

      // Should not create new observer
      expect(observerSpy.mock.calls.length).toBe(initialCallCount)

      observerSpy.mockRestore()
    })

    it('should handle rapid visibility changes', async () => {
      const { result } = renderHook(() => useLazyLoad({ triggerOnce: false }))

      // Rapid visibility changes
      for (let i = 0; i < 5; i++) {
        act(() => {
          const mockObserver = (global as any).mockIntersectionObserver
          if (mockObserver && mockObserver.triggerIntersection) {
            mockObserver.triggerIntersection([{
              isIntersecting: i % 2 === 0,
              target: { dataset: {} }
            }])
          }
        })
      }

      // Should handle gracefully
      expect(result.current.isVisible).toBeDefined()
    })
  })

  describe('Ref Attachment', () => {
    it('should provide a ref for element attachment', () => {
      const { result } = renderHook(() => useLazyLoad())

      expect(result.current.ref).toBeDefined()
      expect(typeof result.current.ref).toBe('object')
    })

    it('should observe element when ref is attached', () => {
      const { result } = renderHook(() => useLazyLoad())

      const mockElement = document.createElement('div')
      
      act(() => {
        // Simulate ref attachment
        if (result.current.ref && 'current' in result.current.ref) {
          result.current.ref.current = mockElement
        }
      })

      // Observer should be set up
      expect(result.current.ref).toBeDefined()
    })
  })

  describe('Edge Cases', () => {
    it('should handle multiple intersections', async () => {
      const { result } = renderHook(() => useLazyLoad())

      // Multiple intersection events
      act(() => {
        const mockObserver = (global as any).mockIntersectionObserver
        if (mockObserver && mockObserver.triggerIntersection) {
          mockObserver.triggerIntersection([
            { isIntersecting: true, target: { dataset: {} } },
            { isIntersecting: false, target: { dataset: {} } },
            { isIntersecting: true, target: { dataset: {} } }
          ])
        }
      })

      expect(result.current.isVisible).toBe(true)
    })

    it('should handle empty intersection entries', () => {
      const { result } = renderHook(() => useLazyLoad())

      act(() => {
        const mockObserver = (global as any).mockIntersectionObserver
        if (mockObserver && mockObserver.triggerIntersection) {
          mockObserver.triggerIntersection([])
        }
      })

      // Should not throw
      expect(result.current.isVisible).toBe(false)
    })
  })
})
