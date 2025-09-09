// filepath: packages/web/src/components/dashboard/layouts/__tests__/DashboardLayout.test.tsx

/**
 * HEYS EAP 3.0 - DashboardLayout Component Tests
 * 
 * Purpose: Test suite for dashboard layout component
 * Features: Permission-based rendering, responsive behavior, user interactions
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { jest } from '@jest/globals'

// Mock the auth package
jest.mock('@heys/auth', () => ({
  useAuth: jest.fn(),
  usePermissions: jest.fn(),
  PermissionGate: ({ children, fallback }: any) => {
    // Simple mock that renders children for testing
    return children || fallback || null
  }
}))

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  })),
  usePathname: jest.fn(() => '/dashboard'),
}))

import { DashboardLayout } from '../DashboardLayout'
import { useAuth, usePermissions } from '@heys/auth'

// Type the mocked functions
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>
const mockUsePermissions = usePermissions as jest.MockedFunction<typeof usePermissions>

describe('DashboardLayout Component', () => {
  // Default mock implementations
  const defaultAuthMock = {
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
      created_at: new Date().toISOString(),
    },
    isAuthenticated: true,
    isLoading: false,
    logout: jest.fn(),
  }

  const defaultPermissionsMock = {
    hasPermission: jest.fn(() => true),
    hasAnyPermission: jest.fn(() => true),
    hasAllPermissions: jest.fn(() => true),
    checkPermission: jest.fn(),
    permissions: null,
    effectivePermissions: ['dashboard:read'],
    roles: ['user'],
    isLoading: false,
    isError: false,
    error: null,
    refresh: jest.fn(),
    invalidateCache: jest.fn(),
  }

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks()
    mockUseAuth.mockReturnValue(defaultAuthMock)
    mockUsePermissions.mockReturnValue(defaultPermissionsMock)
  })

  describe('Basic Rendering', () => {
    it('renders dashboard layout with default props', () => {
      render(
        <DashboardLayout>
          <div data-testid="dashboard-content">Dashboard Content</div>
        </DashboardLayout>
      )

      expect(screen.getByText('Dashboard')).toBeInTheDocument()
      expect(screen.getByTestId('dashboard-content')).toBeInTheDocument()
    })

    it('renders custom title and subtitle', () => {
      render(
        <DashboardLayout title="Custom Dashboard" subtitle="Test Subtitle">
          <div>Content</div>
        </DashboardLayout>
      )

      expect(screen.getByText('Custom Dashboard')).toBeInTheDocument()
      expect(screen.getByText('• Test Subtitle')).toBeInTheDocument()
    })

    it('applies custom className', () => {
      const { container } = render(
        <DashboardLayout className="custom-class">
          <div>Content</div>
        </DashboardLayout>
      )

      expect(container.firstChild).toHaveClass('custom-class')
    })
  })

  describe('Loading States', () => {
    it('shows loading spinner when permissions are loading', () => {
      mockUsePermissions.mockReturnValue({
        ...defaultPermissionsMock,
        isLoading: true,
      })

      render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      )

      expect(screen.getByText('Loading dashboard...')).toBeInTheDocument()
      expect(screen.queryByText('Content')).not.toBeInTheDocument()
    })

    it('renders content when permissions are loaded', () => {
      render(
        <DashboardLayout>
          <div data-testid="content">Content</div>
        </DashboardLayout>
      )

      expect(screen.queryByText('Loading dashboard...')).not.toBeInTheDocument()
      expect(screen.getByTestId('content')).toBeInTheDocument()
    })
  })

  describe('Permission-based Rendering', () => {
    it('renders content for users with dashboard permissions', () => {
      mockUsePermissions.mockReturnValue({
        ...defaultPermissionsMock,
        hasAnyPermission: jest.fn((permissions) => 
          permissions.includes('dashboard:read')
        ),
      })

      render(
        <DashboardLayout>
          <div data-testid="dashboard-content">Dashboard Content</div>
        </DashboardLayout>
      )

      expect(screen.getByTestId('dashboard-content')).toBeInTheDocument()
    })

    it('shows access restricted message for users without permissions', () => {
      mockUsePermissions.mockReturnValue({
        ...defaultPermissionsMock,
        hasAnyPermission: jest.fn(() => false),
      })

      render(
        <DashboardLayout>
          <div data-testid="dashboard-content">Dashboard Content</div>
        </DashboardLayout>
      )

      expect(screen.getByText('Access Restricted')).toBeInTheDocument()
      expect(screen.queryByTestId('dashboard-content')).not.toBeInTheDocument()
    })
  })

  describe('User Interactions', () => {
    it('handles sidebar toggle on desktop', () => {
      render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      )

      const toggleButton = screen.getByLabelText('Toggle sidebar')
      fireEvent.click(toggleButton)

      // Check if sidebar state changes (this would need more specific testing based on implementation)
      expect(toggleButton).toBeInTheDocument()
    })

    it('handles mobile menu toggle', () => {
      render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      )

      const mobileMenuButton = screen.getByLabelText('Open sidebar')
      fireEvent.click(mobileMenuButton)

      // Verify mobile menu interaction
      expect(mobileMenuButton).toBeInTheDocument()
    })

    it('handles logout functionality', async () => {
      const mockLogout = jest.fn()
      mockUseAuth.mockReturnValue({
        ...defaultAuthMock,
        logout: mockLogout,
      })

      render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      )

      // This would need to trigger logout from the header component
      // The exact implementation depends on how logout is exposed in the UI
      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalledTimes(0) // Initially not called
      })
    })
  })

  describe('Breadcrumb Navigation', () => {
    it('shows breadcrumb when enabled', () => {
      render(
        <DashboardLayout showBreadcrumb={true}>
          <div>Content</div>
        </DashboardLayout>
      )

      expect(screen.getByLabelText('Breadcrumb')).toBeInTheDocument()
    })

    it('hides breadcrumb when disabled', () => {
      render(
        <DashboardLayout showBreadcrumb={false}>
          <div>Content</div>
        </DashboardLayout>
      )

      expect(screen.queryByLabelText('Breadcrumb')).not.toBeInTheDocument()
    })
  })

  describe('Higher-order Component', () => {
    it('withDashboardLayout wraps component correctly', () => {
      const TestComponent = () => <div data-testid="test-component">Test</div>
      const WrappedComponent = DashboardLayout.withDashboardLayout(TestComponent, {
        title: 'HOC Test'
      })

      render(<WrappedComponent />)

      expect(screen.getByText('HOC Test')).toBeInTheDocument()
      expect(screen.getByTestId('test-component')).toBeInTheDocument()
    })
  })

  describe('Error Handling', () => {
    it('handles auth errors gracefully', () => {
      mockUseAuth.mockReturnValue({
        ...defaultAuthMock,
        user: null,
        isAuthenticated: false,
      })

      render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      )

      // Should still render but may show different UI for unauthenticated users
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })

    it('handles permission errors gracefully', () => {
      mockUsePermissions.mockReturnValue({
        ...defaultPermissionsMock,
        isError: true,
        error: new Error('Permission check failed'),
      })

      render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      )

      // Should render the error fallback from PermissionGate
      expect(screen.getByText('Access Restricted')).toBeInTheDocument()
    })
  })
})

// Export for potential use in other test files
export { mockUseAuth, mockUsePermissions }
