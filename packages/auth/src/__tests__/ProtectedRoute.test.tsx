// filepath: packages/auth/src/__tests__/ProtectedRoute.test.tsx

import React from 'react';
import { render, screen } from '@testing-library/react';
import { useRouter } from 'next/router';
import { ProtectedRoute, RequireAuth, RequireGuest } from '../components/ProtectedRoute';
import { useAuth } from '../hooks/useAuth';

// Mock dependencies
jest.mock('next/router', () => ({
  useRouter: jest.fn(),
}));

jest.mock('../hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

const mockRouter = {
  push: jest.fn(),
};

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

beforeEach(() => {
  jest.clearAllMocks();
  mockUseRouter.mockReturnValue(mockRouter as any);
});

describe('ProtectedRoute', () => {
  const TestComponent = () => <div>Protected Content</div>;

  it('should render children when user is authenticated', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      user: { id: '1', email: 'test@example.com' } as any,
      isLoading: false,
      hasPermission: jest.fn().mockReturnValue(true),
      hasRole: jest.fn().mockReturnValue(true),
    } as any);

    render(
      <ProtectedRoute requireAuth>
        <TestComponent />
      </ProtectedRoute>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('should show loading component while checking auth', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      user: null,
      isLoading: true,
      hasPermission: jest.fn(),
      hasRole: jest.fn(),
    } as any);

    render(
      <ProtectedRoute requireAuth loadingComponent={<div>Loading Auth...</div>}>
        <TestComponent />
      </ProtectedRoute>
    );

    expect(screen.getByText('Loading Auth...')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should redirect to login when user is not authenticated', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      user: null,
      isLoading: false,
      hasPermission: jest.fn(),
      hasRole: jest.fn(),
    } as any);

    render(
      <ProtectedRoute requireAuth fallbackRoute="/login">
        <TestComponent />
      </ProtectedRoute>
    );

    // Wait for async redirect
    await new Promise(resolve => setTimeout(resolve, 100));
    
    expect(mockRouter.push).toHaveBeenCalledWith('/login');
  });

  it('should check permissions when required', () => {
    const mockHasPermission = jest.fn().mockReturnValue(true);
    
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      user: { id: '1', email: 'test@example.com' } as any,
      isLoading: false,
      hasPermission: mockHasPermission,
      hasRole: jest.fn(),
    } as any);

    const testPermission = { name: 'read:posts' } as any;

    render(
      <ProtectedRoute requiredPermissions={[testPermission]}>
        <TestComponent />
      </ProtectedRoute>
    );

    expect(mockHasPermission).toHaveBeenCalledWith('read:posts');
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('should work in inverse mode for guests', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      user: null,
      isLoading: false,
      hasPermission: jest.fn(),
      hasRole: jest.fn(),
    } as any);

    render(
      <ProtectedRoute inverse>
        <TestComponent />
      </ProtectedRoute>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });
});

describe('RequireAuth', () => {
  const TestComponent = () => <div>Auth Required Content</div>;

  it('should render when authenticated', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      user: { id: '1', email: 'test@example.com' } as any,
      isLoading: false,
      hasPermission: jest.fn(),
      hasRole: jest.fn(),
    } as any);

    render(
      <RequireAuth>
        <TestComponent />
      </RequireAuth>
    );

    expect(screen.getByText('Auth Required Content')).toBeInTheDocument();
  });
});

describe('RequireGuest', () => {
  const TestComponent = () => <div>Guest Only Content</div>;

  it('should render when not authenticated', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      user: null,
      isLoading: false,
      hasPermission: jest.fn(),
      hasRole: jest.fn(),
    } as any);

    render(
      <RequireGuest>
        <TestComponent />
      </RequireGuest>
    );

    expect(screen.getByText('Guest Only Content')).toBeInTheDocument();
  });

  it('should not render when authenticated', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      user: { id: '1', email: 'test@example.com' } as any,
      isLoading: false,
      hasPermission: jest.fn(),
      hasRole: jest.fn(),
    } as any);

    render(
      <RequireGuest>
        <TestComponent />
      </RequireGuest>
    );

    expect(screen.queryByText('Guest Only Content')).not.toBeInTheDocument();
  });
});
