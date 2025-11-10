// heys_error_boundary_v1.ts — Error Boundary для React (TypeScript version)

import React from 'react';
import { getGlobalLogger } from '../monitoring/structured-logger';
import type { ErrorBoundaryProps, HEYSGlobal } from './types/heys';

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
  readonly errorName: string;
  readonly errorMessage: string;
  readonly errorStack?: string;
  readonly errorInfo: React.ErrorInfo;
  readonly timestamp: number;
  readonly userAgent: string;
  readonly url: string;
  readonly sessionId: string;
  readonly retryCount: number;
  readonly component?: string;
  readonly metadata?: Record<string, unknown>;
}

interface ErrorLogContext {
  readonly retryCount?: number;
  readonly component?: string;
  readonly metadata?: Record<string, unknown>;
}

// Global declarations
declare global {
  interface Window {
    HEYS: HEYSGlobal;
    React: typeof React;
  }
}

const runtimeWindow =
  typeof window !== 'undefined' ? (window as Window & typeof globalThis) : undefined;

if (runtimeWindow) {
  (function (global: Window & typeof globalThis): void {
    const logger = getGlobalLogger().child({ component: 'HEYS Error Boundary v1' });

    const React = global.React;
    if (!React) {
      logger.warn('React is not available for ErrorBoundary');
      return;
    }

    const HEYS = (global.HEYS = global.HEYS || ({} as HEYSGlobal));

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    function serializeError(error: Error): Record<string, unknown> {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    function logError(error: Error, errorInfo?: React.ErrorInfo, context?: ErrorLogContext): void {
      const retryCount = context?.retryCount ?? 0;
      const component = context?.component ?? 'ErrorBoundary';
      const errorInfoValue = errorInfo ?? { componentStack: 'Not available' };
      const errorReport: ErrorReport = {
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack ?? 'No stack trace available',
        errorInfo: errorInfoValue,
        timestamp: Date.now(),
        userAgent: global.navigator?.userAgent ?? 'unknown',
        url: global.location?.href ?? 'unknown',
        sessionId,
        retryCount,
        component,
        metadata: context?.metadata,
      };

      logger.error('Captured boundary error', {
        operation: 'componentDidCatch',
        metadata: {
          errorReport,
        },
      });

      if (HEYS.analytics) {
        try {
          HEYS.analytics.trackError('ComponentError', {
            errorName: error.name,
            errorMessage: error.message,
            componentStack: errorInfoValue.componentStack,
            retryCount,
          });
        } catch (analyticsError) {
          logger.warn('Analytics error tracking failed', {
            metadata: { analyticsError: serializeError(analyticsError as Error) },
          });
        }
      }

      if (HEYS.performance) {
        try {
          HEYS.performance.increment('errors.boundary');
        } catch (performanceError) {
          logger.warn('Performance counter increment failed', {
            metadata: { performanceError: serializeError(performanceError as Error) },
          });
        }
      }

      try {
        const storage = global.localStorage;
        if (!storage) {
          return;
        }

        const recentErrorsRaw = storage.getItem('heys_recent_errors');
        const recentErrors: ErrorReport[] = recentErrorsRaw ? JSON.parse(recentErrorsRaw) : [];
        recentErrors.push(errorReport);

        if (recentErrors.length > 10) {
          recentErrors.splice(0, recentErrors.length - 10);
        }

        storage.setItem('heys_recent_errors', JSON.stringify(recentErrors));
      } catch (storageError) {
        logger.warn('Could not store error report', {
          metadata: { storageError: serializeError(storageError as Error) },
        });
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
            logger.error('Error in custom error handler', {
              metadata: {
                handlerError: serializeError(handlerError as Error),
              },
            });
          }
        }

        logError(error, errorInfo, {
          retryCount: this.state.retryCount,
          component: 'ErrorBoundary',
        });
      }

      handleRetry = (): void => {
        const newRetryCount = this.state.retryCount + 1;

        // Limit retry attempts
        if (newRetryCount > 3) {
          logger.warn('Maximum retry attempts reached', {
            metadata: { retryCount: newRetryCount },
          });
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
              '🚨 Произошла ошибка',
            ),

            React.createElement(
              'p',
              null,
              'Извините, что-то пошло не так. Мы зафиксировали эту ошибку и работаем над её исправлением.',
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
                'Техническая информация',
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
                    `Component: ${errorInfo.componentStack?.split('\n')[1]?.trim() || 'Unknown'}`,
                  ),
                React.createElement('div', null, `Retry Count: ${retryCount}`),
              ),
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
                  `Попробовать снова ${retryCount > 0 ? `(${retryCount}/3)` : ''}`,
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
                'Перезагрузить страницу',
              ),

              React.createElement(
                'button',
                {
                  onClick: () => {
                    const clipboard = global.navigator?.clipboard;
                    if (clipboard) {
                      const errorText = `Error ID: ${errorId}\nError: ${error?.name}: ${error?.message}\nURL: ${global.location?.href ?? 'unknown'}\nTime: ${new Date().toISOString()}`;
                      clipboard
                        .writeText(errorText)
                        .then(() => {
                          global.alert?.('Информация об ошибке скопирована в буфер обмена');
                        })
                        .catch((clipboardError) => {
                          logger.warn('Clipboard write failed', {
                            metadata: { clipboardError: serializeError(clipboardError as Error) },
                          });
                        });
                    } else {
                      logger.warn('Clipboard API is not available for copying error details');
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
                'Скопировать ошибку',
              ),
            ),
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
            `${message}: ${error.message}`,
          ),
      });
    };

    // HOC for wrapping components with error boundary
    function withErrorBoundary<P extends object>(
      Component: React.ComponentType<P>,
      fallbackComponent?: React.ComponentType<{ error: Error }>,
    ): React.ComponentType<P> {
      const WrappedComponent: React.FC<P> = (props) => {
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
    global.addEventListener('error', (event) => {
      const globalError = new Error(event.message);
      logError(globalError, undefined, {
        component: 'globalErrorHandler',
        metadata: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          type: 'global',
        },
      });
    });

    global.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
      logError(reason, undefined, {
        component: 'globalUnhandledRejection',
        metadata: { type: 'unhandledPromise' },
      });
    });

    HEYS.ErrorBoundary = ErrorBoundary;
    (HEYS as Record<string, unknown>).SimpleErrorBoundary = SimpleErrorBoundary;
    (HEYS as Record<string, unknown>).withErrorBoundary = withErrorBoundary;
    (HEYS as Record<string, unknown>).ErrorReporting = ErrorReporting;
    HEYS.logError = logError;

    logger.info('🛡️ HEYS Error Boundary v1 (TypeScript) загружен');
  })(runtimeWindow);
} else {
  getGlobalLogger().info('HEYS Error Boundary v1 skipped: window is undefined');
}
