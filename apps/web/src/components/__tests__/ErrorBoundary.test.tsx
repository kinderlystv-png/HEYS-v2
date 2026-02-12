import { render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from '../ErrorBoundary';

// Mock component that throws error
const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>No error</div>;
};

describe('ErrorBoundary', () => {
  // Suppress console.error for cleaner test output
  const originalError = console.error;
  beforeAll(() => {
    console.error = vi.fn();
  });
  afterAll(() => {
    console.error = originalError;
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('No error')).toBeTruthy();
  });

  it('renders error UI when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/Что-то пошло не так/i)).toBeTruthy();
    expect(screen.getByText(/Обновить/i)).toBeTruthy();
  });

  it('renders custom fallback when provided', () => {
    const fallback = <div>Custom Error UI</div>;

    render(
      <ErrorBoundary fallback={fallback}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Custom Error UI')).toBeTruthy();
  });

  it('calls onError callback when error occurs', () => {
    const onError = vi.fn();

    render(
      <ErrorBoundary onError={onError}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it('logs to Sentry when available', () => {
    const captureException = vi.fn();
    window.Sentry = { captureException };

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(captureException).toHaveBeenCalled();
    expect(captureException.mock.calls[0][0]).toBeInstanceOf(Error);

    delete window.Sentry;
  });

  it('logs to HEYS analytics when available', () => {
    const trackError = vi.fn();
    window.HEYS = { analytics: { trackError } };

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(trackError).toHaveBeenCalledWith(
      'react_error_boundary',
      'Test error',
      expect.any(Object),
    );

    delete window.HEYS;
  });
});
