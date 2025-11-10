/* eslint-disable */
import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * React Error Boundary для перехвата ошибок в дереве компонентов
 *
 * @example
 * <ErrorBoundary fallback={<CustomError />}>
 *   <App />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Логируем в Sentry если доступен
    if (window.Sentry) {
      window.Sentry.captureException(error, {
        contexts: {
          react: {
            componentStack: errorInfo.componentStack,
          },
        },
      });
    }

    // Логируем в HEYS analytics если доступен
    if (window.HEYS?.analytics) {
      window.HEYS.analytics.trackError('react_error_boundary', error.message, {
        stack: error.stack,
        componentStack: errorInfo.componentStack,
      });
    }

    // Console error для development
    if (process.env.NODE_ENV !== 'production') {
      console.error('React Error Boundary caught an error:', error, errorInfo);
    }

    // Custom error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    this.setState({
      errorInfo,
    });
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div
          style={{
            padding: '40px 20px',
            textAlign: 'center',
            maxWidth: '600px',
            margin: '0 auto',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>⚠️</div>
          <h2 style={{ color: '#d32f2f', marginBottom: '10px' }}>Что-то пошло не так</h2>
          <p style={{ color: '#666', marginBottom: '30px', lineHeight: '1.6' }}>
            Произошла непредвиденная ошибка. Мы уже получили уведомление и работаем над
            исправлением.
          </p>

          {process.env.NODE_ENV !== 'production' && this.state.error && (
            <details
              style={{
                marginBottom: '30px',
                padding: '20px',
                background: '#f5f5f5',
                borderRadius: '8px',
                textAlign: 'left',
              }}
            >
              <summary
                style={{
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  marginBottom: '10px',
                  color: '#d32f2f',
                }}
              >
                Детали ошибки (для разработчиков)
              </summary>
              <div style={{ fontSize: '14px', fontFamily: 'monospace' }}>
                <p>
                  <strong>Сообщение:</strong> {this.state.error.message}
                </p>
                <pre
                  style={{
                    overflow: 'auto',
                    padding: '10px',
                    background: '#fff',
                    borderRadius: '4px',
                    fontSize: '12px',
                  }}
                >
                  {this.state.error.stack}
                </pre>
                {this.state.errorInfo?.componentStack && (
                  <>
                    <p>
                      <strong>Component Stack:</strong>
                    </p>
                    <pre
                      style={{
                        overflow: 'auto',
                        padding: '10px',
                        background: '#fff',
                        borderRadius: '4px',
                        fontSize: '12px',
                      }}
                    >
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </>
                )}
              </div>
            </details>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              onClick={this.handleReload}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                fontWeight: 'bold',
                color: '#fff',
                background: '#2563eb',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = '#1d4ed8')}
              onMouseOut={(e) => (e.currentTarget.style.background = '#2563eb')}
            >
              Перезагрузить страницу
            </button>
            <button
              onClick={this.handleReset}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                fontWeight: 'bold',
                color: '#2563eb',
                background: '#fff',
                border: '2px solid #2563eb',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = '#eff6ff';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = '#fff';
              }}
            >
              Попробовать снова
            </button>
          </div>

          <p
            style={{
              marginTop: '30px',
              fontSize: '14px',
              color: '#999',
            }}
          >
            Если проблема повторяется, свяжитесь с поддержкой
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}

// Type augmentation for window.Sentry only
declare global {
  interface Window {
    Sentry?: {
      captureException: (error: Error, context?: unknown) => void;
    };
  }
}
