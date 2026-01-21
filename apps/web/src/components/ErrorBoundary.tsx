/* eslint-disable */
import { Component, ErrorInfo, ReactNode } from 'react';

import { log } from '../lib/browser-logger';

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
    // 🆕 PWA Recovery: Уведомляем SW о критической ошибке
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'BOOT_FAILURE',
        error: { message: error.message, stack: error.stack?.slice(0, 500) }
      });
    }

    // Логируем в HEYS boot log
    const heysLog = (window as unknown as Record<string, unknown>).__heysLog as ((msg: string) => void) | undefined;
    if (heysLog) {
      heysLog('[ErrorBoundary] ' + error.message);
    }

    // Логируем в Sentry если доступен
    const sentry = (window as unknown as Record<string, unknown>).Sentry as
      | { captureException: (error: Error, context?: unknown) => void }
      | undefined;
    if (sentry?.captureException) {
      sentry.captureException(error, {
        contexts: {
          react: {
            componentStack: errorInfo.componentStack,
          },
        },
      });
    }

    // Логируем в HEYS analytics если доступен
    const heysAnalytics = ((window as unknown as Record<string, unknown>).HEYS as Record<string, unknown> | undefined)?.analytics as
      | { trackError: (type: string, message: string, meta?: Record<string, unknown>) => void }
      | undefined;
    if (heysAnalytics?.trackError) {
      heysAnalytics.trackError('react_error_boundary', error.message, {
        stack: error.stack,
        componentStack: errorInfo.componentStack,
      });
    }

    // Console error для development
    if (process.env.NODE_ENV !== 'production') {
      log.error('React Error Boundary caught an error', {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
      });
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

  // 🆕 PWA Recovery: Очистка кэша и перезагрузка
  handleClearCache = async (): Promise<void> => {
    try {
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      sessionStorage.clear();
    } catch (e) {
      console.error('Cache clear error:', e);
    }
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

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={this.handleReload}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                fontWeight: 'bold',
                color: '#fff',
                background: '#10b981',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = '#059669')}
              onMouseOut={(e) => (e.currentTarget.style.background = '#10b981')}
            >
              🔄 Обновить
            </button>
            <button
              onClick={this.handleClearCache}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                fontWeight: 'bold',
                color: '#374151',
                background: '#fff',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = '#f3f4f6';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = '#fff';
              }}
            >
              🗑️ Сбросить кэш
            </button>
            <button
              onClick={this.handleReset}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                fontWeight: 'bold',
                color: '#6b7280',
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = '#f9fafb';
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
