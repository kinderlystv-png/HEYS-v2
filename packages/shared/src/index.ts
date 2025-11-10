// Export all shared utilities, types, and components
export * from './database/DatabaseService';
export * from './monitoring';
export * from './security';
export * from './security/SecurityAnalyticsService';

// Shared utilities
export const formatDate = (date: Date) => date.toISOString().split('T')[0];
export const generateId = () => crypto.randomUUID();
