/**
 * Example usage of modern error handling components
 * This file demonstrates how to use the new error handling system
 */

import React, { useState, useEffect } from 'react';
import { 
  ErrorBoundary, 
  useErrorHandler, 
  withErrorHandler, 
  errorLogger 
} from '@heys/shared';

// Configure error logger
errorLogger.configure({
  apiEndpoint: '/api/errors',
  apiKey: process.env.REACT_APP_ERROR_API_KEY
});

// Example 1: Using ErrorBoundary component
export function App() {
  return (
    <ErrorBoundary
      fallback={<div className="error-fallback">App crashed! Please refresh.</div>}
      onError={(error, errorInfo) => {
        console.error('App error:', error);
        // Additional error handling logic
      }}
    >
      <Header />
      <MainContent />
      <Footer />
    </ErrorBoundary>
  );
}

// Example 2: Using useErrorHandler hook
export function DataLoader({ userId }: { userId: string }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const { hasError, error, captureError, resetError } = useErrorHandler([userId], {
    onError: (error, context) => {
      console.error('Data loading error:', error, context);
    }
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/users/${userId}/data`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const userData = await response.json();
      setData(userData);
    } catch (error) {
      captureError(error as Error, `Failed to load data for user ${userId}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [userId]);

  if (hasError) {
    return (
      <div className="error-container p-4 bg-red-50 border border-red-200 rounded">
        <h3 className="text-red-800 font-semibold">Ошибка загрузки данных</h3>
        <p className="text-red-600 mt-2">{error?.message}</p>
        <button 
          onClick={resetError}
          className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Попробовать снова
        </button>
      </div>
    );
  }

  if (loading) {
    return <div className="loading">Загрузка данных...</div>;
  }

  return (
    <div className="data-container">
      <h2>Данные пользователя</h2>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}

// Example 3: Using withErrorHandler HOC
const RiskyComponent = ({ data }) => {
  // This component might throw errors
  if (!data || data.length === 0) {
    throw new Error('No data provided to RiskyComponent');
  }

  return (
    <div>
      {data.map((item, index) => (
        <div key={index}>{item.name}</div>
      ))}
    </div>
  );
};

export const SafeRiskyComponent = withErrorHandler(
  RiskyComponent,
  <div className="fallback">Failed to load component data</div>
);

// Example 4: Global error setup
export function setupGlobalErrorHandling() {
  // Handle uncaught errors
  window.addEventListener('error', (event) => {
    errorLogger.logError(event.error, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      source: 'window.error'
    });
  });

  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    errorLogger.logError(
      new Error(`Unhandled Promise Rejection: ${event.reason}`),
      {
        reason: event.reason,
        source: 'unhandledrejection'
      }
    );
  });

  // Example: Custom error boundaries for different sections
  const ErrorBoundaryWithLogging = ({ children, section }) => (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        errorLogger.logError(error, {
          ...errorInfo,
          section,
          timestamp: new Date().toISOString()
        });
      }}
      fallback={
        <div className="section-error">
          <h3>Ошибка в секции: {section}</h3>
          <p>Пожалуйста, перезагрузите страницу или обратитесь в поддержку.</p>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );

  return ErrorBoundaryWithLogging;
}

// Example 5: Error monitoring dashboard
export function ErrorMonitoringDashboard() {
  const [logs, setLogs] = useState([]);
  
  useEffect(() => {
    // Load error logs
    const errorLogs = errorLogger.getLogs();
    const persistedLogs = errorLogger.getPersistedLogs();
    
    setLogs([...errorLogs, ...persistedLogs]);
  }, []);

  const clearAllLogs = () => {
    errorLogger.clearLogs();
    setLogs([]);
  };

  return (
    <div className="error-dashboard p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Мониторинг ошибок</h2>
        <button 
          onClick={clearAllLogs}
          className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
        >
          Очистить логи
        </button>
      </div>
      
      <div className="space-y-4">
        {logs.length === 0 ? (
          <p className="text-gray-500">Ошибок не обнаружено 🎉</p>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="bg-gray-50 p-4 rounded border">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-red-600">
                  {log.error.name}: {log.error.message}
                </h3>
                <span className="text-sm text-gray-500">
                  {new Date(log.timestamp).toLocaleString()}
                </span>
              </div>
              
              <div className="text-sm text-gray-600 space-y-1">
                <p><strong>URL:</strong> {log.url}</p>
                <p><strong>User ID:</strong> {log.userId || 'Неизвестен'}</p>
                <p><strong>Session:</strong> {log.sessionId}</p>
              </div>
              
              {log.error.stack && (
                <details className="mt-3">
                  <summary className="cursor-pointer font-medium">
                    Stack trace
                  </summary>
                  <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto">
                    {log.error.stack}
                  </pre>
                </details>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Helper components referenced in examples
function Header() {
  return <header>HEYS EAP 3.0</header>;
}

function MainContent() {
  return <main>Main application content</main>;
}

function Footer() {
  return <footer>© 2025 HEYS</footer>;
}
