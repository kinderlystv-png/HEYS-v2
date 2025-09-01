import { vi, expect, beforeEach, afterEach } from 'vitest';
import React, { type ComponentProps, type ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react';

/**
 * Test utilities and common mocks for HEYS testing
 */

// Mock functions
export const createMockFunction = () => vi.fn();

// Common test data generators
export const generateTestUser = (overrides = {}) => ({
  id: 'test-user-1',
  email: 'test@example.com',
  name: 'Test User',
  createdAt: new Date().toISOString(),
  ...overrides,
});

export const generateTestData = (count: number, generator: (index: number) => any) => {
  return Array.from({ length: count }, (_, index) => generator(index));
};

// Performance testing helpers
export const measureRenderTime = (renderFn: () => void) => {
  const start = performance.now();
  renderFn();
  const end = performance.now();
  return end - start;
};

// Mock local storage
export const mockLocalStorage = () => {
  const storage: Record<string, string> = {};
  
  return {
    getItem: vi.fn((key: string) => storage[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      storage[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete storage[key];
    }),
    clear: vi.fn(() => {
      Object.keys(storage).forEach(key => delete storage[key]);
    }),
  };
};

// Mock fetch
export const mockFetch = (response: any = {}, status = 200) => {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(JSON.stringify(response)),
  });
};

// Custom render with providers
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  withRouter?: boolean;
  withTheme?: boolean;
  initialState?: any;
}

export const customRender = (
  ui: ReactElement,
  options: CustomRenderOptions = {}
) => {
  const { withRouter = false, withTheme = false, initialState = {}, ...renderOptions } = options;

  // This is a placeholder - in real implementation, wrap with actual providers
  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    return children as ReactElement;
  };

  if (withRouter) {
    // Would wrap with Router provider
  }

  if (withTheme) {
    // Would wrap with Theme provider
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
};

// Async test helpers
export const waitForAsyncOperation = async (operation: () => Promise<void>, timeout = 5000) => {
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    try {
      await operation();
      return;
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  
  throw new Error(`Operation timed out after ${timeout}ms`);
};

// Component prop extraction utility
export const getComponentProps = <T extends React.ComponentType<any>>(
  Component: T
): ComponentProps<T> => {
  // This is a TypeScript utility for extracting component props
  return {} as ComponentProps<T>;
};

// Common assertion helpers
export const expectElementToBeVisible = (element: HTMLElement) => {
  expect(element).toBeInTheDocument();
  expect(element).toBeVisible();
};

export const expectElementToHaveAccessibleName = (element: HTMLElement, name: string) => {
  expect(element).toHaveAccessibleName(name);
};

// Mock environment variables
export const mockEnvironment = (env: Record<string, string>) => {
  const original = process.env;
  
  beforeEach(() => {
    process.env = { ...original, ...env };
  });
  
  afterEach(() => {
    process.env = original;
  });
};

// Browser API mocks
export const mockBrowserAPIs = () => {
  // Mock window.location
  const mockLocation = {
    href: 'http://localhost:3000',
    origin: 'http://localhost:3000',
    pathname: '/',
    search: '',
    hash: '',
  };
  
  Object.defineProperty(window, 'location', {
    value: mockLocation,
    writable: true,
  });

  // Mock window.matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // Mock ResizeObserver
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));

  // Mock IntersectionObserver
  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
};

export * from '@testing-library/react';
export { vi } from 'vitest';
