// Export all shared utilities, types, and components
export * from './monitoring';
export * from './security';
export * from './database/DatabaseService';
export * from './security/SecurityAnalyticsService';

// Modern error handling
export { ErrorBoundary } from './components/ErrorBoundary';
export type { ErrorBoundaryProps } from './components/ErrorBoundary';
export { 
  useErrorHandler, 
  useAsyncError, 
  withErrorHandler 
} from './hooks/useErrorHandler';
export { 
  errorLogger, 
  ErrorLogger,
  type ErrorInfo,
  type ErrorLogEntry
} from './utils/errorLogger';

// Shared utilities
export const formatDate = (date: Date) => date.toISOString().split('T')[0];
export const generateId = () => crypto.randomUUID();
