// filepath: packages/web/src/__tests__/components/LazyWrapper.test.tsx

/**
 * HEYS EAP 3.0 - LazyWrapper Component Unit Tests
 * 
 * Purpose: Test lazy loading wrapper component
 * Features: Intersection observer integration, loading states, error handling
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { LazyWrapper } from '../../components/optimization/LazyWrapper'
import { waitForAsync } from '../../test-utils/mockData'

// Mock the useLazyLoad hook
vi.mock('../../hooks/useLazyLoad', () => ({
  useLazyLoad: vi.fn()
}))

describe('LazyWrapper', () => {
  const mockUseLazyLoad = vi.mocked(require('../../hooks/useLazyLoad').useLazyLoad)

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Default mock implementation
    mockUseLazyLoad.mockReturnValue({
      ref: { current: null },
      state: {
        isVisible: false,
        hasLoaded: false,
        isLoading: false,
        error: null
      },
      load: vi.fn(),
      reset: vi.fn()
    })
  })

  describe('Initial Render', () => {
    it('should render placeholder when not visible', () => {
      const TestComponent = () => <div>Lazy Content</div>
      
      render(
        <LazyWrapper placeholder="Loading...">
          <TestComponent />
        </LazyWrapper>
      )

      expect(screen.getByText('Loading...')).toBeInTheDocument()
      expect(screen.queryByText('Lazy Content')).not.toBeInTheDocument()
    })

    it('should render with custom placeholder component', () => {
      const TestComponent = () => <div>Lazy Content</div>
      const CustomPlaceholder = () => <div data-testid="custom-placeholder">Custom Loading</div>
      
      render(
        <LazyWrapper placeholder={<CustomPlaceholder />}>
          <TestComponent />
        </LazyWrapper>
      )

      expect(screen.getByTestId('custom-placeholder')).toBeInTheDocument()
      expect(screen.getByText('Custom Loading')).toBeInTheDocument()
    })

    it('should render default placeholder when none provided', () => {
      const TestComponent = () => <div>Lazy Content</div>
      
      render(
        <LazyWrapper>
          <TestComponent />
        </LazyWrapper>
      )

      // Should render some default loading state
      expect(screen.getByText(/loading/i)).toBeInTheDocument()
    })
  })

  describe('Visibility State', () => {
    it('should render content when visible', () => {
      mockUseLazyLoad.mockReturnValue({
        ref: { current: null },
        state: {
          isVisible: true,
          hasLoaded: true,
          isLoading: false,
          error: null
        },
        load: vi.fn(),
        reset: vi.fn()
      })

      const TestComponent = () => <div>Lazy Content</div>
      
      render(
        <LazyWrapper placeholder="Loading...">
          <TestComponent />
        </LazyWrapper>
      )

      expect(screen.getByText('Lazy Content')).toBeInTheDocument()
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })

    it('should show loading state when loading', () => {
      mockUseLazyLoad.mockReturnValue({
        ref: { current: null },
        state: {
          isVisible: true,
          hasLoaded: false,
          isLoading: true,
          error: null
        },
        load: vi.fn(),
        reset: vi.fn()
      })

      const TestComponent = () => <div>Lazy Content</div>
      
      render(
        <LazyWrapper 
          placeholder="Loading..."
          loadingComponent={<div data-testid="loading">Loading content...</div>}
        >
          <TestComponent />
        </LazyWrapper>
      )

      expect(screen.getByTestId('loading')).toBeInTheDocument()
      expect(screen.getByText('Loading content...')).toBeInTheDocument()
    })
  })

  describe('Error Handling', () => {
    it('should render error state when error occurs', () => {
      mockUseLazyLoad.mockReturnValue({
        ref: { current: null },
        state: {
          isVisible: true,
          hasLoaded: false,
          isLoading: false,
          error: new Error('Failed to load')
        },
        load: vi.fn(),
        reset: vi.fn()
      })

      const TestComponent = () => <div>Lazy Content</div>
      
      render(
        <LazyWrapper 
          placeholder="Loading..."
          errorComponent={<div data-testid="error">Failed to load content</div>}
        >
          <TestComponent />
        </LazyWrapper>
      )

      expect(screen.getByTestId('error')).toBeInTheDocument()
      expect(screen.getByText('Failed to load content')).toBeInTheDocument()
    })

    it('should render default error message when no error component provided', () => {
      mockUseLazyLoad.mockReturnValue({
        ref: { current: null },
        state: {
          isVisible: true,
          hasLoaded: false,
          isLoading: false,
          error: new Error('Failed to load')
        },
        load: vi.fn(),
        reset: vi.fn()
      })

      const TestComponent = () => <div>Lazy Content</div>
      
      render(
        <LazyWrapper placeholder="Loading...">
          <TestComponent />
        </LazyWrapper>
      )

      expect(screen.getByText(/failed to load/i)).toBeInTheDocument()
    })
  })

  describe('Lazy Load Configuration', () => {
    it('should pass configuration to useLazyLoad hook', () => {
      const config = {
        threshold: 0.5,
        rootMargin: '100px',
        triggerOnce: true
      }

      const TestComponent = () => <div>Lazy Content</div>
      
      render(
        <LazyWrapper {...config} placeholder="Loading...">
          <TestComponent />
        </LazyWrapper>
      )

      expect(mockUseLazyLoad).toHaveBeenCalledWith(expect.objectContaining(config))
    })

    it('should use default configuration when none provided', () => {
      const TestComponent = () => <div>Lazy Content</div>
      
      render(
        <LazyWrapper placeholder="Loading...">
          <TestComponent />
        </LazyWrapper>
      )

      expect(mockUseLazyLoad).toHaveBeenCalledWith(expect.objectContaining({
        threshold: expect.any(Number),
        triggerOnce: expect.any(Boolean)
      }))
    })
  })

  describe('Ref Forwarding', () => {
    it('should forward ref to lazy load hook', () => {
      const TestComponent = () => <div>Lazy Content</div>
      const mockRef = { current: null }
      
      mockUseLazyLoad.mockReturnValue({
        ref: mockRef,
        state: {
          isVisible: false,
          hasLoaded: false,
          isLoading: false,
          error: null
        },
        load: vi.fn(),
        reset: vi.fn()
      })
      
      render(
        <LazyWrapper placeholder="Loading...">
          <TestComponent />
        </LazyWrapper>
      )

      // The component should use the ref from useLazyLoad
      expect(mockUseLazyLoad).toHaveBeenCalled()
    })
  })

  describe('Children Rendering', () => {
    it('should render multiple children when loaded', () => {
      mockUseLazyLoad.mockReturnValue({
        ref: { current: null },
        state: {
          isVisible: true,
          hasLoaded: true,
          isLoading: false,
          error: null
        },
        load: vi.fn(),
        reset: vi.fn()
      })

      render(
        <LazyWrapper placeholder="Loading...">
          <div>First Child</div>
          <div>Second Child</div>
          <span>Third Child</span>
        </LazyWrapper>
      )

      expect(screen.getByText('First Child')).toBeInTheDocument()
      expect(screen.getByText('Second Child')).toBeInTheDocument()
      expect(screen.getByText('Third Child')).toBeInTheDocument()
    })

    it('should render function children when loaded', () => {
      mockUseLazyLoad.mockReturnValue({
        ref: { current: null },
        state: {
          isVisible: true,
          hasLoaded: true,
          isLoading: false,
          error: null
        },
        load: vi.fn(),
        reset: vi.fn()
      })

      render(
        <LazyWrapper placeholder="Loading...">
          {({ isVisible, hasLoaded }) => (
            <div>
              Visible: {isVisible ? 'Yes' : 'No'}, 
              Loaded: {hasLoaded ? 'Yes' : 'No'}
            </div>
          )}
        </LazyWrapper>
      )

      expect(screen.getByText(/Visible: Yes, Loaded: Yes/)).toBeInTheDocument()
    })
  })

  describe('Animation and Transitions', () => {
    it('should apply animation classes when configured', () => {
      mockUseLazyLoad.mockReturnValue({
        ref: { current: null },
        state: {
          isVisible: true,
          hasLoaded: true,
          isLoading: false,
          error: null
        },
        load: vi.fn(),
        reset: vi.fn()
      })

      const TestComponent = () => <div>Lazy Content</div>
      
      render(
        <LazyWrapper 
          placeholder="Loading..."
          animationClass="fade-in"
        >
          <TestComponent />
        </LazyWrapper>
      )

      const wrapper = screen.getByText('Lazy Content').closest('[class*="fade-in"]')
      expect(wrapper).toBeTruthy()
    })

    it('should handle transition duration', async () => {
      mockUseLazyLoad.mockReturnValue({
        ref: { current: null },
        state: {
          isVisible: true,
          hasLoaded: true,
          isLoading: false,
          error: null
        },
        load: vi.fn(),
        reset: vi.fn()
      })

      const TestComponent = () => <div>Lazy Content</div>
      
      render(
        <LazyWrapper 
          placeholder="Loading..."
          transitionDuration={300}
        >
          <TestComponent />
        </LazyWrapper>
      )

      // Content should be rendered
      expect(screen.getByText('Lazy Content')).toBeInTheDocument()
    })
  })

  describe('Performance Optimization', () => {
    it('should not re-render unnecessarily', () => {
      const renderSpy = vi.fn()
      const TestComponent = () => {
        renderSpy()
        return <div>Lazy Content</div>
      }

      const { rerender } = render(
        <LazyWrapper placeholder="Loading...">
          <TestComponent />
        </LazyWrapper>
      )

      const initialRenderCount = renderSpy.mock.calls.length

      // Re-render with same state
      rerender(
        <LazyWrapper placeholder="Loading...">
          <TestComponent />
        </LazyWrapper>
      )

      // Should not cause unnecessary child re-renders
      expect(renderSpy.mock.calls.length).toBe(initialRenderCount)
    })

    it('should memoize children when possible', () => {
      const TestComponent = React.memo(() => <div>Memoized Content</div>)
      
      mockUseLazyLoad.mockReturnValue({
        ref: { current: null },
        state: {
          isVisible: true,
          hasLoaded: true,
          isLoading: false,
          error: null
        },
        load: vi.fn(),
        reset: vi.fn()
      })

      render(
        <LazyWrapper placeholder="Loading...">
          <TestComponent />
        </LazyWrapper>
      )

      expect(screen.getByText('Memoized Content')).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should provide appropriate ARIA attributes', () => {
      const TestComponent = () => <div>Lazy Content</div>
      
      render(
        <LazyWrapper 
          placeholder="Loading..."
          aria-label="Lazy loaded section"
        >
          <TestComponent />
        </LazyWrapper>
      )

      const wrapper = screen.getByLabelText('Lazy loaded section')
      expect(wrapper).toBeInTheDocument()
    })

    it('should announce loading state to screen readers', () => {
      mockUseLazyLoad.mockReturnValue({
        ref: { current: null },
        state: {
          isVisible: true,
          hasLoaded: false,
          isLoading: true,
          error: null
        },
        load: vi.fn(),
        reset: vi.fn()
      })

      const TestComponent = () => <div>Lazy Content</div>
      
      render(
        <LazyWrapper placeholder="Loading...">
          <TestComponent />
        </LazyWrapper>
      )

      const loadingElement = screen.getByText(/loading/i)
      expect(loadingElement).toHaveAttribute('aria-live', 'polite')
    })
  })

  describe('Edge Cases', () => {
    it('should handle undefined children gracefully', () => {
      render(
        <LazyWrapper placeholder="Loading...">
          {undefined}
        </LazyWrapper>
      )

      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })

    it('should handle empty children array', () => {
      render(
        <LazyWrapper placeholder="Loading...">
          {[]}
        </LazyWrapper>
      )

      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })

    it('should handle conditional children', () => {
      mockUseLazyLoad.mockReturnValue({
        ref: { current: null },
        state: {
          isVisible: true,
          hasLoaded: true,
          isLoading: false,
          error: null
        },
        load: vi.fn(),
        reset: vi.fn()
      })

      const showContent = true
      
      render(
        <LazyWrapper placeholder="Loading...">
          {showContent && <div>Conditional Content</div>}
        </LazyWrapper>
      )

      expect(screen.getByText('Conditional Content')).toBeInTheDocument()
    })
  })
})
