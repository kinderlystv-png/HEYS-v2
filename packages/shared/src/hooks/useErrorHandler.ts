import React, { useEffect, useState, ReactNode } from 'react';

interface UseErrorHandlerOptions {
  onError?: (error: Error, errorInfo: string) => void;
  resetOnDepsChange?: boolean;
}

interface ErrorState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Hook for error handling in functional components
 * Modern alternative to class-based ErrorBoundary
 */
export function useErrorHandler(
  deps: unknown[] = [],
  options: UseErrorHandlerOptions = {}
) {
  const [errorState, setErrorState] = useState<ErrorState>({
    hasError: false,
    error: null,
  });

  const { onError, resetOnDepsChange = true } = options;

  // Reset error when dependencies change
  useEffect(() => {
    if (resetOnDepsChange && errorState.hasError) {
      setErrorState({ hasError: false, error: null });
    }
  }, deps);

  const captureError = (error: Error, context?: string) => {
    setErrorState({ hasError: true, error });
    
    const errorInfo = context || 'Error captured by useErrorHandler';
    onError?.(error, errorInfo);

    // Global error logging
    if (typeof window !== 'undefined' && window.HEYS?.logError) {
      window.HEYS.logError(error, { componentStack: errorInfo });
    }

    // Log in development
    if (process.env.NODE_ENV === 'development') {
      console.error('[useErrorHandler] Captured error:', error, errorInfo);
    }
  };

  const resetError = () => {
    setErrorState({ hasError: false, error: null });
  };

  return {
    ...errorState,
    captureError,
    resetError,
  };
}

/**
 * Hook for async operation error handling
 */
export function useAsyncError() {
  const [, setError] = useState();

  return (error: Error) => {
    setError(() => {
      throw error;
    });
  };
}

/**
 * HOC for wrapping components with error boundary functionality
 */
export function withErrorHandler<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode
) {
  return function ErrorHandledComponent(props: P) {
    const { hasError, error, captureError, resetError } = useErrorHandler();

    useEffect(() => {
      const handleError = (event: ErrorEvent) => {
        captureError(event.error, 'Global error event');
      };

      const handleRejection = (event: PromiseRejectionEvent) => {
        captureError(
          new Error(event.reason),
          'Unhandled promise rejection'
        );
      };

      window.addEventListener('error', handleError);
      window.addEventListener('unhandledrejection', handleRejection);

      return () => {
        window.removeEventListener('error', handleError);
        window.removeEventListener('unhandledrejection', handleRejection);
      };
    }, [captureError]);

    if (hasError) {
      if (fallback) {
        return React.createElement(React.Fragment, null, fallback);
      }

      return React.createElement('div', {
        className: 'error-fallback p-4 bg-red-50 border border-red-200 rounded'
      }, [
        React.createElement('h2', {
          key: 'title',
          className: 'text-red-800 font-semibold mb-2'
        }, 'Что-то пошло не так'),
        React.createElement('p', {
          key: 'message',
          className: 'text-red-600 mb-4'
        }, 'Произошла ошибка при загрузке компонента.'),
        React.createElement('button', {
          key: 'retry',
          onClick: resetError,
          className: 'bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700'
        }, 'Попробовать снова'),
        (typeof window !== 'undefined' && 
         (window.location.hostname === 'localhost' || 
          window.location.search.includes('debug=true')) && error) ?
          React.createElement('details', {
            key: 'details',
            className: 'mt-4'
          }, [
            React.createElement('summary', {
              key: 'summary',
              className: 'cursor-pointer text-red-800 font-medium'
            }, 'Детали ошибки'),
            React.createElement('pre', {
              key: 'stack',
              className: 'mt-2 text-xs bg-red-100 p-2 rounded overflow-auto'
            }, error.stack || error.toString())
          ]) : null
      ].filter(Boolean));
    }

    try {
      return React.createElement(Component, props);
    } catch (error) {
      captureError(error as Error, `Error in ${Component.displayName || Component.name}`);
      return null;
    }
  };
}

export default useErrorHandler;
