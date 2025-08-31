// heys_error_boundary_v1.ts — Error Boundary для React (TypeScript version)

import React from 'react';
import type { HEYSGlobal, ErrorBoundaryProps } from './types/heys';

// Error Boundary State
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  errorId: string | null;
  retryCount: number;
}

// Error reporting interface
interface ErrorReport {
  error: Error;
  errorInfo: React.ErrorInfo;
  timestamp: number;
  userAgent: string;
  url: string;
  userId?: string;
  sessionId: string;
  retryCount: number;
}

// Global declarations
declare global {
  interface Window {
    HEYS: HEYSGlobal;
    React: typeof React;
  }
}

// Module implementation
(function (global: Window & typeof globalThis): void {
  const React = global.React;
  if (!React) {
    console.warn('React is not available for ErrorBoundary');
    return;
  }

  const HEYS = (global.HEYS = global.HEYS || ({} as HEYSGlobal));

  // Session ID for error tracking
  const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

  // Error logging function
  function logError(error: Error, errorInfo?: React.ErrorInfo, additionalData?: any): void {
    try {
      const errorReport: ErrorReport = {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack || 'No stack trace available',
        } as Error,
        errorInfo: errorInfo || { componentStack: 'Not available' },
        timestamp: Date.now(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        sessionId,
        retryCount: additionalData?.retryCount || 0,
      };

      // Log to console
      console.group('🚨 HEYS Error Report');
      console.error('Error:', error);
      if (errorInfo) {
        console.error('Component Stack:', errorInfo.componentStack);
      }
      console.error('Additional Info:', additionalData);
      console.error('Full Report:', errorReport);
      console.groupEnd();

      // Track with analytics if available
      if (HEYS.analytics) {
        HEYS.analytics.trackError('ComponentError', {
          errorName: error.name,
          errorMessage: error.message,
          componentStack: errorInfo?.componentStack,
          retryCount: additionalData?.retryCount || 0,
        });
      }

      // Track with performance monitor if available
      if (HEYS.performance) {
        HEYS.performance.increment('errors.boundary');
      }

      // Store error for potential reporting
      try {
        const recentErrors = JSON.parse(localStorage.getItem('heys_recent_errors') || '[]');
        recentErrors.push({
          ...errorReport,
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
          },
        });

        // Keep only last 10 errors
        if (recentErrors.length > 10) {
          recentErrors.splice(0, recentErrors.length - 10);
        }

        localStorage.setItem('heys_recent_errors', JSON.stringify(recentErrors));
      } catch (storageError) {
        console.warn('Could not store error report:', storageError);
      }
    } catch (loggingError) {
      console.error('Error in error logging:', loggingError);
    }
  }

  // Enhanced Error Boundary Component
  class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    private retryTimeout: number | null = null;

    constructor(props: ErrorBoundaryProps) {
      super(props);
      this.state = {
        hasError: false,
        error: null,
        errorInfo: null,
        errorId: null,
        retryCount: 0,
      };
    }

    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
      const errorId = 'error_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

      return {
        hasError: true,
        error,
        errorId,
      };
    }

    override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
      this.setState({ errorInfo });

      // Call custom error handler if provided
      if (this.props.onError) {
        try {
          this.props.onError(error, errorInfo);
        } catch (handlerError) {
          console.error('Error in custom error handler:', handlerError);
        }
      }

      // Log the error
      logError(error, errorInfo, {
        retryCount: this.state.retryCount,
        component: 'ErrorBoundary',
        props: this.props,
      });
    }

    handleRetry = (): void => {
      const newRetryCount = this.state.retryCount + 1;

      // Limit retry attempts
      if (newRetryCount > 3) {
        console.warn('Maximum retry attempts reached');
        return;
      }

      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        errorId: null,
        retryCount: newRetryCount,
      });

      // Auto-retry after delay for first few attempts
      if (newRetryCount <= 2) {
        this.retryTimeout = window.setTimeout(() => {
          // Additional cleanup or state reset if needed
        }, 1000);
      }
    };

    handleReload = (): void => {
      window.location.reload();
    };

    override componentWillUnmount(): void {
      if (this.retryTimeout) {
        clearTimeout(this.retryTimeout);
      }
    }

    override render(): React.ReactNode {
      if (this.state.hasError) {
        const { error, errorInfo, errorId, retryCount } = this.state;

        // Use custom fallback if provided
        if (this.props.fallback) {
          const FallbackComponent = this.props.fallback;
          return React.createElement(FallbackComponent, { error: error! });
        }

        // Default error UI
        return React.createElement(
          'div',
          {
            className: 'error-boundary',
            style: {
              padding: '20px',
              margin: '20px',
              border: '2px solid #ff6b6b',
              borderRadius: '8px',
              backgroundColor: '#ffe0e0',
              color: '#721c24',
              fontFamily: 'Arial, sans-serif',
            },
          },
          React.createElement(
            'h2',
            {
              style: { color: '#d63031', marginTop: 0 },
            },
            '🚨 Произошла ошибка'
          ),

          React.createElement(
            'p',
            null,
            'Извините, что-то пошло не так. Мы зафиксировали эту ошибку и работаем над её исправлением.'
          ),

          React.createElement(
            'details',
            {
              style: { marginTop: '15px', marginBottom: '15px' },
            },
            React.createElement(
              'summary',
              {
                style: { cursor: 'pointer', fontWeight: 'bold' },
              },
              'Техническая информация'
            ),
            React.createElement(
              'div',
              {
                style: {
                  marginTop: '10px',
                  padding: '10px',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                },
              },
              React.createElement('div', null, `Error ID: ${errorId}`),
              React.createElement('div', null, `Error: ${error?.name}: ${error?.message}`),
              errorInfo &&
                React.createElement(
                  'div',
                  null,
                  `Component: ${errorInfo.componentStack?.split('\n')[1]?.trim() || 'Unknown'}`
                ),
              React.createElement('div', null, `Retry Count: ${retryCount}`)
            )
          ),

          React.createElement(
            'div',
            {
              style: { display: 'flex', gap: '10px', flexWrap: 'wrap' },
            },
            retryCount < 3 &&
              React.createElement(
                'button',
                {
                  onClick: this.handleRetry,
                  style: {
                    padding: '8px 16px',
                    backgroundColor: '#74b9ff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  },
                },
                `Попробовать снова ${retryCount > 0 ? `(${retryCount}/3)` : ''}`
              ),

            React.createElement(
              'button',
              {
                onClick: this.handleReload,
                style: {
                  padding: '8px 16px',
                  backgroundColor: '#fd79a8',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                },
              },
              'Перезагрузить страницу'
            ),

            React.createElement(
              'button',
              {
                onClick: () => {
                  if (navigator.clipboard) {
                    const errorText = `Error ID: ${errorId}\nError: ${error?.name}: ${error?.message}\nURL: ${window.location.href}\nTime: ${new Date().toISOString()}`;
                    navigator.clipboard.writeText(errorText).then(() => {
                      alert('Информация об ошибке скопирована в буфер обмена');
                    });
                  }
                },
                style: {
                  padding: '8px 16px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                },
              },
              'Скопировать ошибку'
            )
          )
        );
      }

      return this.props.children;
    }
  }

  // Simple Error Boundary for minimal use cases
  const SimpleErrorBoundary: React.FC<{ children: React.ReactNode; message?: string }> = ({
    children,
    message = 'Произошла ошибка',
  }) => {
    return React.createElement(ErrorBoundary, {
      children,
      fallback: ({ error }) =>
        React.createElement(
          'div',
          {
            style: {
              padding: '10px',
              backgroundColor: '#ffebee',
              border: '1px solid #ffcdd2',
              borderRadius: '4px',
              color: '#c62828',
            },
          },
          `${message}: ${error.message}`
        ),
    });
  };

  // HOC for wrapping components with error boundary
  function withErrorBoundary<P extends object>(
    Component: React.ComponentType<P>,
    fallbackComponent?: React.ComponentType<{ error: Error }>
  ): React.ComponentType<P> {
    const WrappedComponent: React.FC<P> = props => {
      return React.createElement(ErrorBoundary, {
        fallback: fallbackComponent,
        children: React.createElement(Component, props),
      });
    };

    WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
    return WrappedComponent;
  }

  // Error reporting utilities
  const ErrorReporting = {
    getRecentErrors: (): ErrorReport[] => {
      try {
        return JSON.parse(localStorage.getItem('heys_recent_errors') || '[]');
      } catch (e) {
        return [];
      }
    },

    clearErrors: (): void => {
      try {
        localStorage.removeItem('heys_recent_errors');
      } catch (e) {
        console.warn('Could not clear error storage:', e);
      }
    },

    reportError: (error: Error, context?: string): void => {
      logError(error, undefined, { context, manual: true });
    },
  };

  // Global error handler for unhandled errors
  window.addEventListener('error', event => {
    logError(new Error(event.message), undefined, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      type: 'global',
    });
  });

  // Global handler for unhandled promise rejections
  window.addEventListener('unhandledrejection', event => {
    const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    logError(error, undefined, { type: 'unhandledPromise' });
  });

  // Assign to HEYS global
  HEYS.ErrorBoundary = ErrorBoundary;
  (HEYS as any).SimpleErrorBoundary = SimpleErrorBoundary;
  (HEYS as any).withErrorBoundary = withErrorBoundary;
  (HEYS as any).ErrorReporting = ErrorReporting;
  HEYS.logError = logError;

  console.log('🛡️ HEYS Error Boundary v1 (TypeScript) загружен');
})(window);
